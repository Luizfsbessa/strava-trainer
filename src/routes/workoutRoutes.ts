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

// 1. ROTAS ESPECÍFICAS PRIMEIRO (Evita conflito com o Express)

// GET: Retorna o relatório de análise e progressão semanal
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

// GET: Retorna o plano de treino recomendado para a próxima semana
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

// GET: Retorna as voltas/tiros (laps) de uma atividade específica do Strava
router.get('/strava/laps/:activityId', async (req, res) => {
  try {
    const { activityId } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Token do Strava não fornecido no Header.' });
    }

    const accessToken = authHeader.replace('Bearer ', '');
    const laps = await StravaService.getActivityLaps(accessToken, activityId);

    return res.json(laps);
  } catch (error: any) {
    console.error(`ERRO NO GET /strava/laps/${req.params.activityId}:`, error);
    return res.status(500).json({ error: 'Erro ao buscar voltas do Strava.' });
  }
});

// POST: Upload em Lote de arquivos GPX
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

      const newWorkout = await prisma.workout.create({
        data: {
          title: gpxData.nome_atividade || 'Corrida importada',
          distanceKm: Number(gpxData.distancia_km || 0),
          durationMinutes: Number(gpxData.duracao_minutos || 0),
          pace: String(gpxData.pace_medio || '00:00'),
          elevationMeters: Number(gpxData.elevacao_ganho_m || 0),
          activityDate: gpxData.data && !isNaN(new Date(gpxData.data).getTime()) 
            ? new Date(gpxData.data) 
            : new Date(),
        },
      });

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


// 2. ROTAS RAIZ POR ÚLTIMO

// GET: Retorna o histórico de treinos salvos no banco
router.get('/', async (req, res) => {
  try {
    const workouts = await prisma.workout.findMany({
      orderBy: { activityDate: 'desc' },
    });
    return res.json(workouts);
  } catch (error: any) {
    console.error('ERRO NO GET /:', error);
    return res.status(500).json({ error: error.message || 'Erro ao buscar treinos.' });
  }
});

// POST: Cadastro manual de treino direto pelo front-end
router.post('/', async (req, res) => {
  try {
    const { distanceKm, durationMinutes, activityDate, type, pace, elevationMeters, title } = req.body;

    if (distanceKm === undefined || durationMinutes === undefined || !activityDate) {
      return res.status(400).json({ error: 'Campos obrigatórios ausentes: distanceKm, durationMinutes ou activityDate.' });
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

// DELETE: Remove uma atividade pelo ID
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.workout.delete({
      where: { id },
    });

    return res.status(200).json({ message: 'Atividade excluída com sucesso!' });
  } catch (error: any) {
    console.error('ERRO NO DELETE /:id:', error);
    return res.status(500).json({ error: error.message || 'Erro ao excluir atividade.' });
  }
});

export default router;