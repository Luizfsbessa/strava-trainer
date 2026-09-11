import { Router, Request, Response } from 'express';
import { StravaService } from '../services/stravaService';
import { TrainingPlanService } from '../services/trainingPlanService';

const router = Router();

// Endpoint 1: Redireciona o usuário para o Login do Strava
router.get('/auth/strava', (req: Request, res: Response) => {
  const scope = 'read,activity:read_all';
  const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=${scope}`;
  
  res.redirect(stravaAuthUrl);
});

// Endpoint 2: Callback do OAuth (Trata o retorno do Strava)
router.get('/auth/strava/callback', async (req: Request, res: Response) => {
  const { code } = req.query;

  try {
    const tokenData = await StravaService.exchangeCodeForToken(code as string);
    const accessToken = tokenData.access_token;

    // Pega as corridas mais recentes do usuário
    const runs = await StravaService.getAthleteRuns(accessToken);

    // Gera o plano de treino customizado
    const plan = TrainingPlanService.generateWeeklyPlan(runs);

    res.json({
      status: "Autenticado com sucesso!",
      atleta: {
        id: tokenData.athlete.id,
        nome: `${tokenData.athlete.firstname} ${tokenData.athlete.lastname}`,
      },
      plano_de_treino: plan
    });

  } catch (error: any) {
    res.status(500).json({ error: 'Erro no fluxo Strava', details: error.message });
  }
});

// Endpoint 3: Webhook do Strava (Validação e Recebimento de novas atividades)
router.get('/webhook/strava', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.STRAVA_VERIFY_TOKEN) {
    return res.status(200).json({ 'hub.challenge': challenge });
  }
  return res.sendStatus(403);
});

router.post('/webhook/strava', (req: Request, res: Response) => {
  console.log(' Nova atividade ou evento recebido no Strava:', req.body);
  // Aqui acionamos o recálculo do plano caso req.body.object_type === 'activity'
  res.status(200).send('EVENT_RECEIVED');
});

export default router;