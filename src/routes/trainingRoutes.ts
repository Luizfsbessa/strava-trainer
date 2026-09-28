import { Router } from 'express';
import { TrainingPlanService } from '../services/trainingPlanService';
import { ProgressionService } from '../services/progressionService';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = Router();

router.post('/profile/weight', async (req, res) => {
  try {
    const { currentWeight } = req.body;
    const weightNum = parseFloat(currentWeight);
    const intelligentTarget = parseFloat((weightNum * 0.9).toFixed(1));

    let profile = await (prisma as any).profile.findFirst();
    if (!profile) {
      profile = await (prisma as any).profile.create({
        data: { currentWeight: weightNum, targetWeight: intelligentTarget, heightCm: 180, birthDate: '1987-03-12', goal: 'WEIGHT_LOSS' }
      });
    } else {
      profile = await (prisma as any).profile.update({
        where: { id: profile.id },
        data: { currentWeight: weightNum, targetWeight: intelligentTarget }
      });
    }
    return res.json({ success: true, profile });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/plan', async (req, res) => {
  try {
    const allWorkouts = await prisma.workout.findMany({
      orderBy: { activityDate: 'desc' }
    });

    let profile = await (prisma as any).profile.findFirst();
    if (!profile) {
      profile = await (prisma as any).profile.create({
        data: { currentWeight: 103, targetWeight: 92.7, heightCm: 180, birthDate: '1987-03-12', goal: 'WEIGHT_LOSS' }
      });
    }

    const birthDateObj = new Date(profile.birthDate || '1987-03-12');
    const todayDate = new Date();
    let age = todayDate.getFullYear() - birthDateObj.getFullYear();
    const m = todayDate.getMonth() - birthDateObj.getMonth();
    if (m < 0 || (m === 0 && todayDate.getDate() < birthDateObj.getDate())) {
      age--;
    }

    const report: any = await ProgressionService.calculateProgression(allWorkouts);
    const plan = TrainingPlanService.generateNextWeekPlan(report);

    const totalProposedKm = plan?.sessions?.reduce((acc: number, s: any) => {
      return acc + (s.targetDistanceKm || s.distanceKm || s.km || 0);
    }, 0) || 0;

    // Cálculo robusto da semana atual considerando UTC para evitar perda de treinos por fuso horário
    const now = new Date();
    const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = startOfWeek.getUTCDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    startOfWeek.setUTCDate(startOfWeek.getUTCDate() - diffToMonday);
    startOfWeek.setUTCHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
    endOfWeek.setUTCHours(23, 59, 59, 999);

    const currentWeekKm = allWorkouts
      .filter(w => {
        const wDate = new Date(w.activityDate);
        return wDate >= startOfWeek && wDate <= endOfWeek;
      })
      .reduce((acc, w) => acc + (w.distanceKm || 0), 0);

    // Garante que o volume recomendado respeita o relatório de progressão real ou o histórico
    const recommendedVolume = report.currentWeekKm > 0 
      ? Number((report.currentWeekKm * 1.05).toFixed(2)) 
      : (plan?.recommendedVolumeKm || totalProposedKm || 2.7);

    return res.json({
      strategy: plan?.strategy || report?.strategy || 'MANUTENCAO',
      recommendedVolumeKm: recommendedVolume,
      currentWeekKm: Number(currentWeekKm.toFixed(2)),
      rationale: plan?.rationale || report?.rationale || 'Plano gerado automaticamente com base na progressão.',
      sessions: plan?.sessions || [],
      profile: {
        currentWeight: profile.currentWeight,
        targetWeight: profile.targetWeight,
        age: age
      }
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;