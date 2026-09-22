import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Definição das Trilhas Evolutivas de Badges
const BADGE_CONFIGS = [
  {
    code: 'DISTANCE_TRAIL',
    title: 'Evolução de Rodagem',
    category: 'DISTANCE',
    tiers: [
      { tier: 1, target: 10, name: 'Caminhante Iniciante', icon: '🐢', xp: 100 },
      { tier: 2, target: 50, name: 'Trote Constante', icon: '🏃‍♂️', xp: 250 },
      { tier: 3, target: 150, name: 'Corredor de Elite', icon: '⚡', xp: 500 },
      { tier: 4, target: 300, name: 'Modo Queniano', icon: '🇰🇪', xp: 1000 }
    ]
  },
  {
    code: 'WEIGHT_LOSS_TRAIL',
    title: 'Transformação Corporal',
    category: 'WEIGHT',
    tiers: [
      { tier: 1, target: 2, name: 'Primeiro Impacto (-2kg)', icon: '🎈', xp: 150 },
      { tier: 2, target: 5, name: 'Ritmo Acelerado (-5kg)', icon: '🔥', xp: 300 },
      { tier: 3, target: 10, name: 'Nova Composição (-10kg)', icon: '💪', xp: 600 },
      { tier: 4, target: 15, name: 'Meta de Atleta', icon: '🏆', xp: 1200 }
    ]
  },
  {
    code: 'STREAK_TRAIL',
    title: 'Consistência de Treinos',
    category: 'STREAK',
    tiers: [
      { tier: 1, target: 3, name: 'Primeira Semana', icon: '🌱', xp: 100 },
      { tier: 2, target: 10, name: 'Em Inércia', icon: '🚀', xp: 250 },
      { tier: 3, target: 25, name: 'Imparável', icon: '👑', xp: 500 }
    ]
  }
];

// GET: Buscar Progresso, Nível e Badges do Usuário
router.get('/gamification/status', async (req, res) => {
  try {
    let progress = await (prisma as any).userProgress.findFirst();
    if (!progress) {
      progress = await (prisma as any).userProgress.create({
        data: { xp: 150, level: 1, streakDays: 1 }
      });
    }

    // Calcula Nível baseado no XP (a cada 500 XP sobe 1 nível)
    const currentLevel = Math.floor(progress.xp / 500) + 1;
    const xpInCurrentLevel = progress.xp % 500;
    const xpForNextLevel = 500;

    // Buscar treinos e peso para calcular o progresso real das badges
    const totalWorkouts = await (prisma as any).workout.findMany();
    const totalKm = totalWorkouts.reduce((acc: number, w: any) => acc + (w.distance || 0), 0);
    
    // Calcula perda de peso total
    const weightLogs = await (prisma as any).weightLog.findMany({ orderBy: { date: 'asc' } });
    let weightLost = 0;
    if (weightLogs.length >= 2) {
      weightLost = weightLogs[0].weight - weightLogs[weightLogs.length - 1].weight;
      if (weightLost < 0) weightLost = 0;
    }

    // Monta o status das Badges Evolutivas
    const badgesStatus = BADGE_CONFIGS.map(config => {
      let currentValue = 0;
      if (config.category === 'DISTANCE') currentValue = totalKm;
      if (config.category === 'WEIGHT') currentValue = weightLost;
      if (config.category === 'STREAK') currentValue = totalWorkouts.length;

      // Descobre qual o Tier atual alcançado
      let currentTierIndex = -1;
      for (let i = 0; i < config.tiers.length; i++) {
        if (currentValue >= config.tiers[i].target) {
          currentTierIndex = i;
        }
      }

      const activeTier = currentTierIndex >= 0 ? config.tiers[currentTierIndex] : null;
      const nextTier = config.tiers[currentTierIndex + 1] || null;

      return {
        code: config.code,
        title: config.title,
        currentValue: Number(currentValue.toFixed(1)),
        isUnlocked: currentTierIndex >= 0,
        activeTier: activeTier,
        nextTier: nextTier,
        allTiers: config.tiers
      };
    });

    return res.json({
      progress: {
        xp: progress.xp,
        level: currentLevel,
        xpInCurrentLevel,
        xpForNextLevel,
        streakDays: progress.streakDays
      },
      badges: badgesStatus
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erro ao buscar gamificação' });
  }
});

export default router;