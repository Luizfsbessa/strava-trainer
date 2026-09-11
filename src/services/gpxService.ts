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

    // Cálculo manual seguro da distância usando Haversine caso o parser venha zerado
    let calculatedDistanceMeters = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (p1.lat && p1.lon && p2.lat && p2.lon) {
        calculatedDistanceMeters += GpxService.haversineDistance(p1.lat, p1.lon, p2.lat, p2.lon);
      }
    }

    const distanceMeters = (typeof track.distance === 'number' && track.distance > 0) 
      ? track.distance 
      : calculatedDistanceMeters;

    const distanceKm = distanceMeters > 0 ? Number((distanceMeters / 1000).toFixed(2)) : 0;

    let durationSeconds = 0;
    const pointsWithTime = points.filter((p) => p.time);
    
    if (pointsWithTime.length > 1) {
      const startTime = new Date(pointsWithTime[0].time).getTime();
      const endTime = new Date(pointsWithTime[pointsWithTime.length - 1].time).getTime();
      durationSeconds = Math.max(0, Math.round((endTime - startTime) / 1000));
    }

    const durationMinutes = Number((durationSeconds / 60).toFixed(1));

    let paceMinPerKm = '00:00';
    if (distanceKm > 0 && durationSeconds > 0) {
      const totalSecondsPerKm = durationSeconds / distanceKm;
      const paceMinutes = Math.floor(totalSecondsPerKm / 60);
      const paceSeconds = Math.round(totalSecondsPerKm % 60);
      paceMinPerKm = `${paceMinutes}:${paceSeconds < 10 ? '0' : ''}${paceSeconds}`;
    }

    const rawTime = (pointsWithTime.length > 0 ? pointsWithTime[0].time : null) || (track as any).time;
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
      pace_medio: paceMinPerKm, // Removido o ' min/km' extra para salvar limpo se necessário
      elevacao_ganho_m: Math.round(typeof track.elevation?.pos === 'number' ? track.elevation.pos : 0),
      data: activityDate,
    };
  }

  // Fórmula de Haversine para calcular distância real em metros entre duas coordenadas GPS
  private static haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Raio da Terra em metros
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