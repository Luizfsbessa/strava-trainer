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
      { tier: 1, target: 10, name: 'Caminhante Iniciante', icon: '👟', xp: 100 },
      { tier: 2, target: 50, name: 'Trote Constante', icon: '🏃‍♂️', xp: 250 },
      { tier: 3, target: 150, name: 'Corredor de Elite', icon: '⚡', xp: 500 },
      { tier: 4, target: 300, name: 'Modo Queniano', icon: '🔥', xp: 1000 }
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
      { tier: 3, target: 25, name: 'Hábito de Aço', icon: '🛡️', xp: 500 },
      { tier: 4, target: 50, name: 'Inabalável', icon: '👑', xp: 1000 }
    ]
  }
];

router.get('/status', async (req, res) => {
  try {
    // 1. Busca todos os treinos registrados no banco de dados
    const workouts = await prisma.workout.findMany();

    // 2. Calcula total rodado e quantidade de treinos
    let totalKm = 0;
    let totalRuns = workouts.length;

    workouts.forEach((w: any) => {
      const dist = parseFloat(w.distanceKm || w.distance || 0);
      totalKm += dist;
    });

    // 3. Cálculo dinâmico de XP
    // Cada km rodado = 10 XP | Cada treino realizado = 50 XP
    const totalXp = Math.round(totalKm * 10) + (totalRuns * 50);

    // Nível atual (a cada 500 XP sobe de nível)
    const level = Math.floor(totalXp / 500) + 1;
    const xpInCurrentLevel = totalXp % 500;
    const xpForNextLevel = 500;

    // 4. Mapeamento dinâmico das badges baseado nos treinos do banco
    const badges = BADGE_CONFIGS.map(config => {
      let currentValue = 0;

      if (config.category === 'DISTANCE') {
        currentValue = parseFloat(totalKm.toFixed(1));
      } else if (config.category === 'STREAK') {
        currentValue = totalRuns;
      } else {
        currentValue = 0; // Categoria WEIGHT
      }

      // Descobre qual o patamar (tier) atual que o usuário atingiu
      const activeTier = config.tiers.slice().reverse().find(t => currentValue >= t.target) || null;
      const nextTier = config.tiers.find(t => currentValue < t.target) || null;

      return {
        id: config.code,
        title: config.title,
        currentValue: currentValue,
        isUnlocked: activeTier !== null,
        activeTier: activeTier,
        nextTier: nextTier
      };
    });

    return res.json({
      progress: {
        level,
        xpInCurrentLevel,
        xpForNextLevel,
        totalXp
      },
      badges
    });

  } catch (error) {
    console.error('Erro ao buscar status de gamificação:', error);
    return res.status(500).json({ error: 'Erro interno ao carregar gamificação' });
  }
});

export default router;