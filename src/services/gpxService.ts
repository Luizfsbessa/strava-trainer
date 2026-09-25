import GpxParser from 'gpxparser';

export class GpxService {
  static parseGpxContent(fileBuffer: Buffer) {
    const gpx = new GpxParser();
    const gpxString = fileBuffer.toString('utf8');
    gpx.parse(gpxString);

    const track = gpx.tracks[0] || (gpx.routes && gpx.routes[0]);
    
    if (!track || !track.points || track.points.length === 0) {
      throw new Error('Nenhuma trilha válida encontrada no arquivo GPX.');
    }

    const points = track.points as any[];

    let totalDistanceMeters = 0;
    let movingSeconds = 0;
    const validPoints = [];

    // Filtra e calcula com precisão usando Haversine e timestamps reais
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (p.lat && p.lon) {
        validPoints.push(p);
      }
    }

    for (let i = 0; i < validPoints.length - 1; i++) {
      const p1 = validPoints[i];
      const p2 = validPoints[i + 1];
      
      const dist = GpxService.haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
      totalDistanceMeters += dist;

      if (p1.time && p2.time) {
        const t1 = new Date(p1.time).getTime();
        const t2 = new Date(p2.time).getTime();
        const diffSecs = (t2 - t1) / 1000;

        // Considera apenas delta de tempo realista entre pontos (ignora pausas > 10 segundos parado)
        if (diffSecs > 0 && diffSecs < 10) {
          movingSeconds += diffSecs;
        }
      }
    }

    // Fallback caso os pontos não tenham timestamp adequado
    if (movingSeconds === 0 && validPoints.length > 1 && validPoints[0].time && validPoints[validPoints.length - 1].time) {
      const start = new Date(validPoints[0].time).getTime();
      const end = new Date(validPoints[validPoints.length - 1].time).getTime();
      movingSeconds = Math.max(0, (end - start) / 1000);
    }

    const distanceKm = totalDistanceMeters > 0 ? Number((totalDistanceMeters / 1000).toFixed(2)) : 0;
    const durationMinutes = Number((movingSeconds / 60).toFixed(1));

    let paceMinPerKm = '00:00';
    if (distanceKm > 0 && movingSeconds > 0) {
      const totalSecondsPerKm = movingSeconds / distanceKm;
      const paceMinutes = Math.floor(totalSecondsPerKm / 60);
      const paceSeconds = Math.round(totalSecondsPerKm % 60);
      paceMinPerKm = `${paceMinutes}:${paceSeconds < 10 ? '0' : ''}${paceSeconds}`;
    }

    const rawTime = (validPoints.length > 0 ? validPoints[0].time : null) || (track as any).time;
    let activityDate = new Date();
    
    if (rawTime) {
      const parsedDate = new Date(rawTime);
      if (!isNaN(parsedDate.getTime())) {
        activityDate = new Date(parsedDate.getTime() - (3 * 60 * 60 * 1000));
      }
    }

    return {
      nome_atividade: track.name || 'Corrida importada',
      distancia_km: distanceKm,
      duracao_minutos: durationMinutes,
      pace_medio: paceMinPerKm,
      elevacao_ganho_m: Math.round(typeof track.elevation?.pos === 'number' ? track.elevation.pos : 0),
      data: activityDate,
    };
  }

  private static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; 
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}