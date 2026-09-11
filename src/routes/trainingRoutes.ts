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

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), diffToMonday);
    startOfWeek.setHours(0, 0, 0, 0);

    // Fim da semana atual (Domingo às 23:59:59) para evitar pegar treinos futuros ou fantasmas
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const currentWeekKm = allWorkouts
      .filter(w => {
        const wDate = new Date(w.activityDate);
        const isInWeek = wDate >= startOfWeek && wDate <= endOfWeek;
        console.log(`Treino: ${w.title} | Data: ${wDate.toISOString()} | Entrou na semana? ${isInWeek} | Km: ${w.distanceKm}`);
        return isInWeek;
      })
      .reduce((acc, w) => acc + (w.distanceKm || 0), 0);

    return res.json({
      strategy: plan?.strategy || report?.strategy || 'MANUTENCAO',
      recommendedVolumeKm: plan?.recommendedVolumeKm || report?.recommendedVolumeKm || totalProposedKm || 0,
      currentWeekKm: currentWeekKm,
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