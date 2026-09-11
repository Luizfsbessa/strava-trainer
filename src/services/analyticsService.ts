export interface WorkoutAnalytics {
  paceSecondsPerKm: number;
  effortZone: 'Z1 - Regenerativo' | 'Z2 - Base Aeróbica' | 'Z3 - Limiar' | 'Z4/Z5 - Velocidade';
  gradeAdjustedPace: string;
  trainingLoadScore: number;
}

export class AnalyticsService {
  // Converter string "MM:SS" em segundos com suporte a segundos >= 60
  private static paceToSeconds(paceStr: string): number {
    if (!paceStr) return 0;
    const cleanPace = paceStr.replace(' min/km', '').trim();
    const parts = cleanPace.split(':');
    if (parts.length !== 2) return 0;

    let minutes = parseInt(parts[0], 10) || 0;
    let seconds = parseInt(parts[1], 10) || 0;

    if (seconds >= 60) {
      minutes += Math.floor(seconds / 60);
      seconds = seconds % 60;
    }

    return minutes * 60 + seconds;
  }

  // Converter segundos em string "MM:SS min/km"
  private static secondsToPace(totalSeconds: number): string {
    const mins = Math.floor(totalSeconds / 60);
    const secs = Math.round(totalSeconds % 60);
    const formattedSecs = secs < 10 ? `0${secs}` : `${secs}`;
    return `${mins}:${formattedSecs} min/km`;
  }

  public static analyzeWorkout(
    distanceKm: number,
    durationMinutes: number,
    paceStr: string,
    elevationMeters: number
  ): WorkoutAnalytics {
    const paceSeconds = this.paceToSeconds(paceStr);

    // 1. Classificação por Zonas de Intensidade
    let effortZone: WorkoutAnalytics['effortZone'] = 'Z2 - Base Aeróbica';
    if (paceSeconds > 450) {
      effortZone = 'Z1 - Regenerativo';
    } else if (paceSeconds >= 375 && paceSeconds <= 450) {
      effortZone = 'Z2 - Base Aeróbica';
    } else if (paceSeconds >= 315 && paceSeconds < 375) {
      effortZone = 'Z3 - Limiar';
    } else {
      effortZone = 'Z4/Z5 - Velocidade';
    }

    // 2. Pace Ajustado por Inclinação (GAP)
    const elevationGainPerKm = distanceKm > 0 ? elevationMeters / distanceKm : 0;
    const gapPenaltySeconds = (elevationGainPerKm / 10) * 15;
    const gapSeconds = Math.max(0, paceSeconds - gapPenaltySeconds);
    const gradeAdjustedPace = this.secondsToPace(gapSeconds);

    // 3. Score de Carga de Treino (TRIMP modificado)
    const referenceZ2Pace = 390; // 6:30 min/km
    const intensityFactor = paceSeconds > 0 ? referenceZ2Pace / paceSeconds : 1;
    const trainingLoadScore = Math.round(durationMinutes * Math.pow(intensityFactor, 2));

    return {
      paceSecondsPerKm: paceSeconds,
      effortZone,
      gradeAdjustedPace,
      trainingLoadScore,
    };
  }
}