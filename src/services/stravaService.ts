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

  // 2. Busca o histórico de corridas do atleta e processa métricas usando moving_time
  static async getAthleteRuns(accessToken: string, perPage: number = 30) {
    const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { per_page: perPage },
    });

    // Filtra apenas atividades do tipo 'Run'
    const runs = response.data.filter((activity: any) => activity.type === 'Run');

    return runs.map((activity: any) => {
      // Uso estrito do moving_time (tempo ativo de movimento) em vez de elapsed_time
      const movingTimeSec = activity.moving_time || activity.elapsed_time;
      const distanceKm = activity.distance ? activity.distance / 1000 : 0;

      // Cálculo de Pace médio real (min/km)
      let paceFormatted = '0:00';
      if (distanceKm > 0 && movingTimeSec > 0) {
        const paceTotalSeconds = movingTimeSec / distanceKm;
        const paceMin = Math.floor(paceTotalSeconds / 60);
        const paceSec = Math.round(paceTotalSeconds % 60);
        paceFormatted = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec}`;
      }

      return {
        ...activity,
        // Duração em minutos considerando tempo de movimento
        moving_time_min: +(movingTimeSec / 60).toFixed(1),
        moving_time_formatted: this.formatSecondsToHMS(movingTimeSec),
        calculated_pace: `${paceFormatted} /km`
      };
    });
  }

  // 3. Busca o detalhamento de voltas (Laps / Tiros) de uma atividade específica
  static async getActivityLaps(accessToken: string, activityId: number | string) {
    try {
      const response = await axios.get(`https://www.strava.com/api/v3/activities/${activityId}/laps`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data.map((lap: any) => {
        const movingTimeSec = lap.moving_time || lap.elapsed_time;
        const distanceKm = lap.distance ? lap.distance / 1000 : 0;

        let paceFormatted = '0:00';
        if (distanceKm > 0 && movingTimeSec > 0) {
          const paceTotalSeconds = movingTimeSec / distanceKm;
          const paceMin = Math.floor(paceTotalSeconds / 60);
          const paceSec = Math.round(paceTotalSeconds % 60);
          paceFormatted = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec}`;
        }

        return {
          id: lap.id,
          lap_index: lap.lap_index,
          name: lap.name,
          distance_km: +distanceKm.toFixed(2),
          moving_time_sec: movingTimeSec,
          moving_time_formatted: this.formatSecondsToHMS(movingTimeSec),
          pace: `${paceFormatted} /km`,
          average_speed: lap.average_speed,
          total_elevation_gain: lap.total_elevation_gain
        };
      });
    } catch (error) {
      console.error(`Erro ao buscar laps da atividade ${activityId}:`, error);
      return [];
    }
  }

  // Função auxiliar para formatar segundos em HH:MM:SS ou MM:SS
  private static formatSecondsToHMS(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const pad = (num: number) => (num < 10 ? `0${num}` : `${num}`);

    if (hrs > 0) {
      return `${hrs}:${pad(mins)}:${pad(secs)}`;
    }
    return `${mins}:${pad(secs)}`;
  }
}