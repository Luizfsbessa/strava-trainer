import { Router } from 'express';
import prisma from '../config/prisma';
import { UserService, UserProfileInput } from '../services/userService';

const router = Router();

// POST: Salvar ou Atualizar o Perfil Antropométrico (Calculado dinamicamente pelos treinos)
router.post('/profile', async (req, res) => {
  try {
    const data: UserProfileInput = req.body;
    
    if (!data.age || !data.weightKg || !data.heightCm || !data.gender) {
      return res.status(400).json({ error: 'Preencha idade, peso, altura e gênero obrigatórios.' });
    }

    // Chama o cálculo dinâmico cruzando com os dados do banco
    const calculatedMetrics = await UserService.calculateMetricsDynamic(data);

   // Salva no banco (armazenando o nível de atividade calculado dinamicamente)
    const userProfile = await (prisma as any).userProfile.upsert({
      where: { id: 'main-user' },
      update: {
        age: data.age,
        gender: data.gender,
        weightKg: data.weightKg,
        heightCm: data.heightCm,
        activityLevel: calculatedMetrics.calculatedActivityLevel,
        goal: data.goal,
        dailyCalorieTarget: calculatedMetrics.recommendedCalories,
      },
      create: {
        id: 'main-user',
        age: data.age,
        gender: data.gender,
        weightKg: data.weightKg,
        heightCm: data.heightCm,
        activityLevel: calculatedMetrics.calculatedActivityLevel,
        goal: data.goal,
        dailyCalorieTarget: calculatedMetrics.recommendedCalories,
      },
    });

    return res.status(200).json({
      message: 'Perfil atualizado e calorias calibradas com base nos seus treinos reais!',
      profile: userProfile,
      metrics: calculatedMetrics,
    });
  } catch (error: any) {
    console.error('Erro ao salvar perfil:', error);
    return res.status(500).json({ error: 'Erro interno ao processar dados de perfil.' });
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

export default router;