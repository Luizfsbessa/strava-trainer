import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/prisma';
import fs from 'fs';
import { GpxService } from '../services/gpxService';
import { TrainingPlanService } from '../services/trainingPlanService';
import { ProgressionService } from '../services/progressionService';
import { StravaService } from '../services/stravaService';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// Cache em memória para os laps
const gpxLapsCache = new Map<string, any[]>();

// 1. ROTAS ESPECÍFICAS PRIMEIRO

router.get('/analytics', async (req, res) => {
  try {
    const workouts = await prisma.workout.findMany({
      orderBy: { activityDate: 'desc' },
    });

    const report = ProgressionService.calculateProgression(workouts);

    return res.json({
      report,
      totalWorkoutsAnalyzed: workouts.length,
    });
  } catch (error: any) {
    console.error('ERRO NO GET /analytics:', error);
    return res.status(500).json({ error: error.message || 'Erro ao calcular análise.' });
  }
});

router.get('/training-plan', async (req, res) => {
  try {
    const workouts = await prisma.workout.findMany();
    const report = ProgressionService.calculateProgression(workouts);
    const plan = TrainingPlanService.generateNextWeekPlan(report);

    return res.json({
      currentStatus: report,
      nextWeekPlan: plan,
    });
  } catch (error: any) {
    console.error('ERRO NO GET /training-plan:', error);
    return res.status(500).json({ error: 'Erro ao gerar o plano de treino.' });
  }
});

// GET: Busca voltas (Laps / Tiros) reais
router.get('/strava/laps/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params;

    // 1. Verifica se está no cache
    if (gpxLapsCache.has(activityId)) {
      return res.json(gpxLapsCache.get(activityId));
    }

    let accessToken = req.headers.authorization?.replace('Bearer ', '') || process.env.STRAVA_ACCESS_TOKEN || '';
    
    if (!isNaN(Number(activityId))) {
      try {
        const laps = await StravaService.getActivityLaps(accessToken, activityId);
        if (laps && laps.length > 0) {
          return res.json(laps);
        }
      } catch (stravaErr) {
        console.warn('Não foi possível buscar laps diretamente do Strava:', stravaErr);
      }
    }

    const workout = await prisma.workout.findUnique({
      where: { id: activityId }
    });

    if (!workout) {
      return res.status(404).json({ error: 'Treino não encontrado.' });
    }

    // Se o treino foi importado via GPX mas o cache limpou, podemos simular os tiros reais baseados na distância e variação coerente, 
    // ou se preferir guardar o JSON no campo `type` do banco para persistir entre reboots:
    const wAny = workout as any;
    if (wAny.type && wAny.type.startsWith('[')) {
      try {
        const parsedLaps = JSON.parse(wAny.type);
        if (Array.isArray(parsedLaps) && parsedLaps.length > 0) {
          gpxLapsCache.set(activityId, parsedLaps);
          return res.json(parsedLaps);
        }
      } catch (e) {
        // ignora erro de parse se não for json
      }
    }

    // Fallback caso não tenha laps guardados
    const totalDist = Number(workout.distanceKm || 0);
    const totalSecs = Number(wAny.moving_time_sec || (workout.durationMinutes ? workout.durationMinutes * 60 : 0));

    if (totalDist <= 0 || totalSecs <= 0) {
      return res.json([]);
    }

    const avgPaceSecs = totalSecs / totalDist;
    const fullKmCount = Math.floor(totalDist);
    const remainingKm = totalDist - fullKmCount;
    const dynamicLaps = [];

    for (let i = 1; i <= fullKmCount; i++) {
      const lapMin = Math.floor(avgPaceSecs / 60);
      const lapSec = Math.round(avgPaceSecs % 60);
      const formattedTime = `${lapMin < 10 ? '0' : ''}${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec}`;

      dynamicLaps.push({
        lap_index: i,
        distance_km: 1.0,
        moving_time_formatted: formattedTime,
        pace: `${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec} /km`
      });
    }

    if (remainingKm > 0.05) {
      const remSecs = remainingKm * avgPaceSecs;
      const remMin = Math.floor(remSecs / 60);
      const remSec = Math.round(remSecs % 60);
      const formattedTime = `${remMin < 10 ? '0' : ''}${remMin}:${remSec < 10 ? '0' : ''}${remSec}`;

      const paceMin = Math.floor(avgPaceSecs / 60);
      const paceSec = Math.round(avgPaceSecs % 60);

      dynamicLaps.push({
        lap_index: fullKmCount + 1,
        distance_km: Number(remainingKm.toFixed(2)),
        moving_time_formatted: formattedTime,
        pace: `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec} /km`
      });
    }

    return res.json(dynamicLaps);

  } catch (error: any) {
    console.error(`ERRO NO GET /strava/laps/${req.params.activityId}:`, error);
    return res.status(500).json({ error: 'Erro ao buscar voltas.' });
  }
});

// POST: Upload GPX
router.post('/upload-gpx', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Nenhum arquivo GPX foi enviado.' });
    }

    const savedWorkouts = [];

    for (const file of files) {
      const fileBuffer = fs.readFileSync(file.path);
      const gpxData = GpxService.parseGpxContent(fileBuffer);

      // Persistimos o array de laps em formato JSON dentro da coluna `type` para nunca mais perder ao reiniciar o servidor!
      const lapsJsonString = gpxData.laps ? JSON.stringify(gpxData.laps) : 'run';

      const newWorkout = await prisma.workout.create({
        data: {
          title: gpxData.nome_atividade || 'Corrida importada',
          type: lapsJsonString,
          distanceKm: Number(gpxData.distancia_km || 0),
          durationMinutes: Number(gpxData.duracao_minutos || 0),
          pace: String(gpxData.pace_medio || '00:00'),
          elevationMeters: Number(gpxData.elevacao_ganho_m || 0),
          activityDate: gpxData.data && !isNaN(new Date(gpxData.data).getTime()) 
            ? new Date(gpxData.data) 
            : new Date(),
        },
      });

      if (gpxData.laps && gpxData.laps.length > 0) {
        gpxLapsCache.set(newWorkout.id, gpxData.laps);
      }

      savedWorkouts.push(newWorkout);

      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    }

    return res.status(201).json({
      message: `${savedWorkouts.length} treinos importados com sucesso!`,
      totalImported: savedWorkouts.length,
      workouts: savedWorkouts,
    });
  } catch (error: any) {
    console.error('Erro no upload em lote:', error);
    return res.status(500).json({ error: 'Falha ao processar os arquivos GPX.' });
  }
});

// 2. ROTAS RAIZ

router.get('/', async (req, res) => {
  try {
    const workouts = await prisma.workout.findMany({
      orderBy: { activityDate: 'desc' },
    });

    const formattedWorkouts = workouts.map((w: any) => {
      const dist = Number(w.distanceKm || w.distance || 0);
      const movingSecs = Number(w.moving_time_sec || (w.durationMinutes ? w.durationMinutes * 60 : 0));
      const durationMin = movingSecs / 60;

      let paceFormatted = w.pace;
      if (dist > 0 && movingSecs > 0) {
        const paceTotalSeconds = movingSecs / dist;
        const paceMin = Math.floor(paceTotalSeconds / 60);
        const paceSec = Math.round(paceTotalSeconds % 60);
        paceFormatted = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec} /km`;
      }

      // Limpa o campo type se ele contiver o JSON dos laps para não quebrar a UI principal se ela esperar uma string de tipo
      let displayType = w.type;
      if (displayType && displayType.startsWith('[')) {
        displayType = 'run';
      }

      return {
        ...w,
        type: displayType,
        moving_time_sec: movingSecs,
        durationMinutes: durationMin,
        calculatedPace: paceFormatted,
        pace: paceFormatted
      };
    });

    return res.json(formattedWorkouts);
  } catch (error: any) {
    console.error('ERRO NO GET /:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar treinos.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { distanceKm, durationMinutes, activityDate, type, pace, elevationMeters, title } = req.body;

    if (distanceKm === undefined || durationMinutes === undefined || !activityDate) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
    }

    const newWorkout = await prisma.workout.create({
      data: {
        title: title || 'Treino Manual',
        distanceKm: parseFloat(distanceKm),
        durationMinutes: parseInt(durationMinutes, 10),
        activityDate: new Date(activityDate),
        type: type || 'run',
        pace: pace || '00:00',
        elevationMeters: elevationMeters ? parseFloat(elevationMeters) : 0,
      },
    });

    return res.status(201).json({
      message: 'Treino cadastrado com sucesso!',
      workout: newWorkout,
    });
  } catch (error: any) {
    console.error('ERRO NO POST /:', error);
    return res.status(500).json({ error: error.message || 'Erro ao salvar treino manual.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.workout.delete({
      where: { id },
    });
    gpxLapsCache.delete(id);

    return res.status(200).json({ message: 'Atividade excluída com sucesso!' });
  } catch (error: any) {
    console.error('ERRO NO DELETE /:id:', error);
    return res.status(500).json({ error: error.message || 'Erro ao excluir atividade.' });
  }
});

export default router;