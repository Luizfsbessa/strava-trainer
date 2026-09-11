import axios from 'axios';

export class StravaService {
  // 1. Troca o 'code' da autorização pelos Tokens de Acesso
  static async exchangeCodeForToken(code: string) {
    const response = await axios.post('https://www.strava.com/oauth/token', {
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
    });
    return response.data; // Retorna access_token, refresh_token e atleta
  }

  // 2. Busca o histórico de corridas do atleta
  static async getAthleteRuns(accessToken: string, perPage: number = 30) {
    const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { per_page: perPage },
    });

    // Filtra apenas atividades do tipo 'Run'
    return response.data.filter((activity: any) => activity.type === 'Run');
  }
}