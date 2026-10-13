import { Router } from 'express';
import prisma from '../config/prisma';
import { UserService, UserProfileInput } from '../services/userService';

const router = Router();

// GET: Buscar histórico de ciclos de treino do banco de dados (Prisma)
router.get('/cycles', async (req, res) => {
  try {
    const cycles = await (prisma as any).userCycle.findMany({
      where: { userId: 'main-user' },
      orderBy: { startDate: 'desc' },
    });
    return res.json(cycles);
  } catch (error) {
    console.error('Erro ao buscar ciclos:', error);
    return res.status(500).json({ error: 'Erro interno ao buscar ciclos.' });
  }
});

// POST: Registrar transição/mudança de ciclo e encerrar o anterior
router.post('/cycles', async (req, res) => {
  try {
    const { goalName } = req.body;
    if (!goalName) {
      return res.status(400).json({ error: 'O nome do objetivo/ciclo é obrigatório.' });
    }

    const now = new Date();

    // 1. Encerra qualquer ciclo que esteja ativo no momento (onde endDate é null)
    await (prisma as any).userCycle.updateMany({
      where: { userId: 'main-user', endDate: null },
      data: { endDate: now },
    });

    // 2. Insere o novo ciclo ativo no banco
    const newCycle = await (prisma as any).userCycle.create({
      data: {
        userId: 'main-user',
        goalName,
        startDate: now,
        endDate: null,
      },
    });

    return res.status(201).json(newCycle);
  } catch (error) {
    console.error('Erro ao registrar novo ciclo:', error);
    return res.status(500).json({ error: 'Erro interno ao registrar novo ciclo.' });
  }
});

// POST: Salvar ou Atualizar o Perfil Antropométrico (Calculado dinamicamente pelos treinos)
// POST: Salvar ou Atualizar o Perfil Antropométrico
router.post('/profile', async (req, res) => {
  try {
    const data = req.body;
    
    if (!data.age || !data.weightKg || !data.heightCm || !data.gender) {
      return res.status(400).json({ error: 'Preencha idade, peso, altura e gênero obrigatórios.' });
    }

    const calculatedMetrics = await UserService.calculateMetricsDynamic(data);

    // Salva no banco incluindo o peso meta e a data de nascimento (se suportado pelo Prisma schema)
    const userProfile = await (prisma as any).userProfile.upsert({
      where: { id: 'main-user' },
      update: {
        age: Number(data.age),
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender,
        weightKg: Number(data.weightKg),
        targetWeight: data.targetWeight ? Number(data.targetWeight) : null, // Salva o Peso Meta
        heightCm: Number(data.heightCm),
        activityLevel: calculatedMetrics.calculatedActivityLevel,
        goal: data.goal,
        dailyCalorieTarget: calculatedMetrics.recommendedCalories,
      },
      create: {
        id: 'main-user',
        age: Number(data.age),
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        gender: data.gender,
        weightKg: Number(data.weightKg),
        targetWeight: data.targetWeight ? Number(data.targetWeight) : null, // Salva o Peso Meta
        heightCm: Number(data.heightCm),
        activityLevel: calculatedMetrics.calculatedActivityLevel,
        goal: data.goal,
        dailyCalorieTarget: calculatedMetrics.recommendedCalories,
      },
    });

    if (data.weightKg) {
      const weightValue = typeof data.weightKg === 'string' 
        ? parseFloat(String(data.weightKg).replace(',', '.')) 
        : Number(data.weightKg);

      await (prisma as any).weightLog.create({
        data: {
          weight: weightValue,
          date: new Date()
        }
      });
    }

    return res.status(200).json({
      message: 'Perfil atualizado com sucesso!',
      profile: userProfile,
      metrics: calculatedMetrics,
    });
  } catch (error: any) {
    console.error('Erro ao salvar perfil:', error);
    return res.status(500).json({ error: 'Erro interno ao processar dados de perfil.' });
  }
});

// GET: Retornar o perfil completo com peso meta e data de nascimento
// GET: Retornar o perfil e métricas
router.get('/profile', async (req, res) => {
  try {
    const userProfile = await (prisma as any).userProfile.findUnique({
      where: { id: 'main-user' },
    });

    if (!userProfile) {
      return res.status(404).json({ error: 'Perfil não configurado ainda.' });
    }

    const calculatedMetrics = await UserService.calculateMetricsDynamic({
      age: userProfile.age,
      gender: userProfile.gender as any,
      weightKg: userProfile.weightKg,
      heightCm: userProfile.heightCm,
      goal: userProfile.goal as any,
    });

    // Busca o ciclo de treino ativo para mapear o objetivo no select
    const activeCycle = await (prisma as any).userCycle.findFirst({
      where: { userId: 'main-user', endDate: null },
      orderBy: { startDate: 'desc' }
    });

    return res.json({
      profile: {
        ...userProfile,
        activeGoalName: activeCycle ? activeCycle.goalName : null
      },
      metrics: calculatedMetrics,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// GET: Retornar o perfil e métricas recalculadas dinamicamente
router.get('/profile', async (req, res) => {
  try {
    const userProfile = await (prisma as any).userProfile.findUnique({
      where: { id: 'main-user' },
    });

    if (!userProfile) {
      return res.status(404).json({ error: 'Perfil não configurado ainda.' });
    }

    const calculatedMetrics = await UserService.calculateMetricsDynamic({
      age: userProfile.age,
      gender: userProfile.gender as any,
      weightKg: userProfile.weightKg,
      heightCm: userProfile.heightCm,
      goal: userProfile.goal as any,
    });

    return res.json({
      profile: userProfile,
      metrics: calculatedMetrics,
    });
  } catch (error: any) {
    return res.status(500).json({ error: 'Erro ao buscar perfil.' });
  }
});

// GET: Buscar histórico de peso para o gráfico
router.get('/weight-history', async (req, res) => {
  try {
    const history = await (prisma as any).weightLog.findMany({
      orderBy: { date: 'asc' }
    });
    return res.json(history);
  } catch (error) {
    return res.status(500).json({ error: 'Erro ao procurar histórico de peso.' });
  }
});

export default router;