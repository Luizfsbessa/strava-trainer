import GpxParser from 'gpxparser';

export class GpxService {
  static parseGpxContent(fileBuffer: Buffer) {
    const gpxString = fileBuffer.toString('utf8');
    const gpx = new GpxParser();
    gpx.parse(gpxString);

    const track = gpx.tracks[0] || (gpx.routes && gpx.routes[0]);
    
    if (!track || !track.points || track.points.length === 0) {
      throw new Error('Nenhuma trilha válida encontrada no arquivo GPX.');
    }

    const points = track.points as any[];
    const validPoints = points.filter(p => p.lat && p.lon);

    let totalDistanceMeters = 0;
    let movingSeconds = 0;
    let lastPoint: any = null;

    for (let i = 0; i < validPoints.length; i++) {
      const p = validPoints[i];
      if (lastPoint) {
        const dist = GpxService.haversineDistance(lastPoint.lat, lastPoint.lon, p.lat, p.lon);
        
        if (lastPoint.time && p.time) {
          const t1 = new Date(lastPoint.time).getTime();
          const t2 = new Date(p.time).getTime();
          const diffSecs = (t2 - t1) / 1000;

          // AJUSTE: Considera pausa se a diferença de tempo for > 5s ou se a velocidade for irreal/muito baixa
          if (diffSecs > 0 && diffSecs <= 5) {
            const speed = dist / diffSecs; // m/s
            
            // Só acumula se a velocidade for humana para corrida (> 0.5 m/s e < 8.3 m/s)
            if (speed >= 0.5 && speed <= 8.33) {
              totalDistanceMeters += dist;
              movingSeconds += diffSecs;
            }
          }
        }
      }
      lastPoint = p;
    }

    const splits: any[] = [];

    // 1. Tenta buscar tags <lap> nativas via Regex
    const lapRegex = /<lap\b[^>]*>([\s\S]*?)<\/lap>/gi;
    let lapMatch;
    let lapIndex = 1;

    while ((lapMatch = lapRegex.exec(gpxString)) !== null) {
      const lapContent = lapMatch[1];
      const distMatch = /<distance>(.*?)<\/distance>/i.exec(lapContent);
      const durMatch = /<duration>(.*?)<\/duration>/i.exec(lapContent) || /<time>(.*?)<\/time>/i.exec(lapContent);

      const lapDistMeters = distMatch ? parseFloat(distMatch[1]) : 0;
      const lapDistKm = lapDistMeters / 1000;
      const lapSecs = durMatch ? parseFloat(durMatch[1]) : 0;

      const lapMin = Math.floor(lapSecs / 60);
      const lapSec = Math.round(lapSecs % 60);

      let lapPace = '00:00';
      if (lapDistKm > 0 && lapSecs > 0) {
        const secPerKm = lapSecs / lapDistKm;
        const pMin = Math.floor(secPerKm / 60);
        const pSec = Math.round(secPerKm % 60);
        lapPace = `${pMin}:${pSec < 10 ? '0' : ''}${pSec} /km`;
      }

      splits.push({
        lap_index: lapIndex++,
        distance_km: Number(lapDistKm.toFixed(2)),
        moving_time_formatted: `${lapMin < 10 ? '0' : ''}${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec}`,
        pace: lapPace
      });
    }

    // 2. Se não houver <lap>, verifica se o GPX possui múltiplos segmentos (<trkseg>)
    const trackAny = track as any;
    if (splits.length === 0 && trackAny.segments && trackAny.segments.length > 1) {
      trackAny.segments.forEach((segPoints: any[], segIdx: number) => {
        let segDistMeters = 0;
        let segSecs = 0;
        let segPrev: any = null;

        segPoints.forEach(p => {
          if (segPrev && segPrev.time && p.time) {
            const dist = GpxService.haversineDistance(segPrev.lat, segPrev.lon, p.lat, p.lon);
            const diff = (new Date(p.time).getTime() - new Date(segPrev.time).getTime()) / 1000;
            
            if (diff > 0 && diff <= 5) {
              const speed = dist / diff;
              if (speed >= 0.5 && speed <= 8.33) {
                segDistMeters += dist;
                segSecs += diff;
              }
            }
          }
          segPrev = p;
        });

        const segDistKm = segDistMeters / 1000;
        if (segDistKm > 0.02) {
          const lMin = Math.floor(segSecs / 60);
          const lSec = Math.round(segSecs % 60);
          let segPace = '00:00';
          if (segDistKm > 0 && segSecs > 0) {
            const secPerKm = segSecs / segDistKm;
            const pMin = Math.floor(secPerKm / 60);
            const pSec = Math.round(secPerKm % 60);
            segPace = `${pMin}:${pSec < 10 ? '0' : ''}${pSec} /km`;
          }

          splits.push({
            lap_index: segIdx + 1,
            distance_km: Number(segDistKm.toFixed(2)),
            moving_time_formatted: `${lMin < 10 ? '0' : ''}${lMin}:${lSec < 10 ? '0' : ''}${lSec}`,
            pace: segPace
          });
        }
      });
    }

    // 3. Deteta tiros/intervalos analisando pausas ou recuperações (> 10 segundos entre pontos)
    if (splits.length === 0) {
      let intervalSegments: any[] = [];
      let currentSegPoints: any[] = [];

      for (let i = 0; i < validPoints.length; i++) {
        const p = validPoints[i];
        currentSegPoints.push(p);

        if (i > 0 && validPoints[i - 1].time && p.time) {
          const diffSecs = (new Date(p.time).getTime() - new Date(validPoints[i - 1].time).getTime()) / 1000;
          if (diffSecs > 10 && currentSegPoints.length > 5) {
            intervalSegments.push([...currentSegPoints]);
            currentSegPoints = [p];
          }
        }
      }
      if (currentSegPoints.length > 0) {
        intervalSegments.push(currentSegPoints);
      }

      if (intervalSegments.length > 1) {
        intervalSegments.forEach((segPts, sIdx) => {
          let segDist = 0;
          let segSecs = 0;
          let prev: any = null;
          segPts.forEach(pt => {
            if (prev && prev.time && pt.time) {
              const d = GpxService.haversineDistance(prev.lat, prev.lon, pt.lat, pt.lon);
              const tDiff = (new Date(pt.time).getTime() - new Date(prev.time).getTime()) / 1000;
              
              if (tDiff > 0 && tDiff <= 5) {
                const spd = d / tDiff;
                if (spd >= 0.5 && spd <= 8.33) {
                  segDist += d;
                  segSecs += tDiff;
                }
              }
            }
            prev = pt;
          });

          const distKm = segDist / 1000;
          if (distKm > 0.05) {
            const m = Math.floor(segSecs / 60);
            const s = Math.round(segSecs % 60);
            let paceStr = '00:00';
            if (distKm > 0 && segSecs > 0) {
              const spk = segSecs / distKm;
              const pm = Math.floor(spk / 60);
              const ps = Math.round(spk % 60);
              paceStr = `${pm}:${ps < 10 ? '0' : ''}${ps} /km`;
            }

            splits.push({
              lap_index: sIdx + 1,
              distance_km: Number(distKm.toFixed(2)),
              moving_time_formatted: `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`,
              pace: paceStr
            });
          }
        });
      }
    }

    // 4. Fallback final por KM caso nenhum critério anterior se aplique
    if (splits.length === 0) {
      let currentSplitDist = 0;
      let currentSplitSecs = 0;
      let splitIndex = 1;
      let prevPoint: any = null;

      for (let i = 0; i < validPoints.length; i++) {
        const p = validPoints[i];
        if (prevPoint && prevPoint.time && p.time) {
          const dist = GpxService.haversineDistance(prevPoint.lat, prevPoint.lon, p.lat, p.lon);
          const diffSecs = (new Date(p.time).getTime() - new Date(prevPoint.time).getTime()) / 1000;

          if (diffSecs > 0 && diffSecs <= 5) {
            const speed = dist / diffSecs;
            if (speed >= 0.5 && speed <= 8.33) {
              currentSplitDist += dist;
              currentSplitSecs += diffSecs;

              while (currentSplitDist >= 1000) {
                const lapMin = Math.floor(currentSplitSecs / 60);
                const lapSec = Math.round(currentSplitSecs % 60);
                splits.push({
                  lap_index: splitIndex++,
                  distance_km: 1.0,
                  moving_time_formatted: `${lapMin < 10 ? '0' : ''}${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec}`,
                  pace: `${lapMin}:${lapSec < 10 ? '0' : ''}${lapSec} /km`
                });
                currentSplitDist -= 1000;
                currentSplitSecs = 0;
              }
            }
          }
        }
        prevPoint = p;
      }

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