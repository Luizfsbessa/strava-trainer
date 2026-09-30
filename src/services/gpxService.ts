import GpxParser from 'gpxparser';

export class GpxService {
  /**
   * Processa o conteúdo de um arquivo GPX, aplicando filtro de ruído e cálculo preciso de voltas/splits.
   * @param fileBuffer Buffer do arquivo GPX enviado.
   * @param distanciaAlvoVoltaMeters Distância alvo de cada volta em metros (ex: 400 para pista, 1000 para padrão por km).
   */
  static parseGpxContent(fileBuffer: Buffer, distanciaAlvoVoltaMeters: number = 1000) {
    const gpx = new GpxParser();
    const gpxString = fileBuffer.toString('utf8');
    gpx.parse(gpxString);

    const track = gpx.tracks[0] || (gpx.routes && gpx.routes[0]);
    
    if (!track || !track.points || track.points.length === 0) {
      throw new Error('Nenhuma trilha válida encontrada no arquivo GPX.');
    }

    const points = track.points as any[];
    const validPoints = points.filter(p => p.lat && p.lon);

    let totalDistanceMeters = 0;
    let movingSeconds = 0;
    const splits: any[] = [];

    let currentSplitDist = 0;
    let currentSplitSecs = 0;
    let splitIndex = 1;
    let lastPoint: any = null;

    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i];

      if (lastPoint) {
        const dist = GpxService.haversineDistance(lastPoint.lat, lastPoint.lon, p.lat, p.lon);

        // Filtro de ruído: ignora micro-oscilações (< 0.5m) e teletransortes irreais (> 30m por segundo)
        if (dist > 0.5 && dist < 30) {
          totalDistanceMeters += dist;
          currentSplitDist += dist;

          if (lastPoint.time && p.time) {
            const t1 = new Date(lastPoint.time).getTime();
            const t2 = new Date(p.time).getTime();
            const diffSecs = (t2 - t1) / 1000;

            if (diffSecs > 0 && diffSecs < 60) {
              movingSeconds += diffSecs;
              currentSplitSecs += diffSecs;
            }
          }

          // Se completou a distância alvo da volta atual (ex: 400m ou 1000m)
          while (currentSplitDist >= distanciaAlvoVoltaMeters) {
            const lapMin = Math.floor(currentSplitSecs / 60);
            const lapSec = Math.round(currentSplitSecs % 60);
            const distanciaKmFormatada = Number((distanciaAlvoVoltaMeters / 1000).toFixed(2));

            splits.push({
              lap_index: splitIndex++,
              distance_km: distanciaKmFormatada,
              moving_time_formatted: `${lapMin < 10 ? '0' : ''}${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec}`,
              pace: `${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec} /km`
            });

            currentSplitDist -= distanciaAlvoVoltaMeters;
            // Proporção de tempo consumida para o excedente da volta
            currentSplitSecs = 0; 
          }
        }
      }
      lastPoint = p;
    }

    // Adiciona o resto final se sobrou fração significativa
    if (currentSplitDist > 20) {
      const remKm = currentSplitDist / 1000;
      const lapMin = Math.floor(currentSplitSecs / 60);
      const lapSec = Math.round(currentSplitSecs % 60);
      splits.push({
        lap_index: splitIndex,
        distance_km: Number(remKm.toFixed(2)),
        moving_time_formatted: `${lapMin < 10 ? '0' : ''}${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec}`,
        pace: `${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec} /km`
      });
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
      laps: splits 
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