import { AnalyticsService } from './analyticsService';

export interface WorkoutInput {
  distanceKm: number;
  durationMinutes: number;
  pace: string;
  elevationMeters: number;
  activityDate: Date;
}

export interface WeeklyProgressionReport {
  currentWeekKm: number;
  previousWeekKm: number;
  volumeChangePercentage: number;
  acuteLoad: number;
  chronicLoad: number;
  acwrRatio: number;
  status: 'DESCANSO_RECOMENDADO' | 'ZONA_OTIMA' | 'ATENCAO_VOLUME' | 'ALERTA_OVERTRAINING';
  feedbackMessage: string;
  personalRecords: {
    pr5k: { date: Date; durationMinutes: number; pace: string } | null;
    pr10k: { date: Date; durationMinutes: number; pace: string } | null;
  };
}

export class ProgressionService {
  private static getStartOfWeek(d: Date): Date {
    const date = new Date(d);
    date.setUTCHours(0, 0, 0, 0);
    const day = date.getUTCDay();
    const diffToMonday = day === 0 ? 6 : day - 1;
    date.setUTCDate(date.getUTCDate() - diffToMonday);
    return date;
  }

  // Extrator dinâmico de Recordes Pessoais por faixa de distância
  private static findPersonalRecords(workouts: WorkoutInput[]) {
    const findBestByDistance = (targetKm: number, tolerance: number) => {
      const matches = workouts.filter(w => Math.abs(w.distanceKm - targetKm) <= tolerance);
      if (matches.length === 0) return null;

      const best = matches.reduce((min, current) => 
        current.durationMinutes < min.durationMinutes ? current : min
      );

      return {
        date: best.activityDate,
        durationMinutes: best.durationMinutes,
        pace: best.pace,
      };
    };

    return {
      pr5k: findBestByDistance(5, 0.3),
      pr10k: findBestByDistance(10, 0.5),
    };
  }

  // Motor de auditoria ajustado para tolerar a progressão sustentável de ~5%
  public static auditWorkoutExecution(plannedType: string, executedVolume: number, plannedVolume?: number) {
    if (plannedType === 'Descanso Total' && executedVolume > 0) {
      return {
        complianceLabel: 'Divergência no Treino',
        message: 'Realocação detectada: Atividade executada em dia planejado para descanso. Sistema sincronizado com o Smart Fix.'
      };
    }

    // Ajustado para acionar alerta se passar de 5-8% do volume esperado da sessão
    if (plannedVolume && executedVolume > plannedVolume * 1.08) {
      return {
        complianceLabel: 'Divergência no Treino',
        message: `Superávit de Carga: Volume acima do programado (${executedVolume} km vs ${plannedVolume} km esperados).`
      };
    }

    return {
      complianceLabel: 'Aderência Perfeita',
      message: 'Atividade executada de acordo com o planejado.'
    };
  }

  public static calculateProgression(workouts: WorkoutInput[]): WeeklyProgressionReport {
    if (!workouts || workouts.length === 0) {
      return {
        currentWeekKm: 0,
        previousWeekKm: 0,
        volumeChangePercentage: 0,
        acuteLoad: 0,
        chronicLoad: 0,
        acwrRatio: 1,
        status: 'ZONA_OTIMA',
        feedbackMessage: 'Nenhum treino registrado ainda.',
        personalRecords: { pr5k: null, pr10k: null },
      };
    }

    const sortedWorkouts = [...workouts].sort(
      (a, b) => new Date(b.activityDate).getTime() - new Date(a.activityDate).getTime()
    );

    const latestWorkoutDate = new Date(sortedWorkouts[0].activityDate);
    const currentWeekStart = this.getStartOfWeek(latestWorkoutDate);

    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setDate(previousWeekStart.getDate() - 7);

    const chronicStart = new Date(currentWeekStart);
    chronicStart.setDate(chronicStart.getDate() - 21);

    let currentWeekKm = 0;
    let previousWeekKm = 0;
    let acuteLoadSum = 0;
    let chronicLoadSum = 0;

    sortedWorkouts.forEach((w) => {
      const workoutDate = new Date(w.activityDate);
      const analytics = AnalyticsService.analyzeWorkout(
        w.distanceKm,
        w.durationMinutes,
        w.pace,
        w.elevationMeters
      );

      if (workoutDate >= currentWeekStart) {
        currentWeekKm += w.distanceKm;
        acuteLoadSum += analytics.trainingLoadScore;
      } else if (workoutDate >= previousWeekStart && workoutDate < currentWeekStart) {
        previousWeekKm += w.distanceKm;
      }

      if (workoutDate >= chronicStart) {
        chronicLoadSum += analytics.trainingLoadScore;
      }
    });

    const volumeChangePercentage = previousWeekKm > 0
      ? Number((((currentWeekKm - previousWeekKm) / previousWeekKm) * 100).toFixed(1))
      : 0;

    const chronicLoadAverage = Number((chronicLoadSum / 4).toFixed(1));
    const acwrRatio = chronicLoadAverage > 0
      ? Number((acuteLoadSum / chronicLoadAverage).toFixed(2))
      : 1.0;

    let status: WeeklyProgressionReport['status'] = 'ZONA_OTIMA';
    let feedbackMessage = 'Volume e carga equilibrados. Ritmo de evolução sustentável de 5%!';

    // Limiares ajustados para a progressão conservadora/saudável
    if (acwrRatio > 1.4 || volumeChangePercentage > 15) {
      status = 'ALERTA_OVERTRAINING';
      feedbackMessage = 'Atenção! O volume ou a carga subiram acima da meta sustentável de 5-8%. Risco de sobrecarga nos tendões. Considere um deload.';
    } else if (volumeChangePercentage > 6 || acwrRatio > 1.2) {
      status = 'ATENCAO_VOLUME';
      feedbackMessage = 'Ritmo ligeiramente acima do ideal de 5%. Mantenha os próximos treinos focados em zonas leves (Z2).';
    } else if (acwrRatio < 0.8 && previousWeekKm > 0) {
      status = 'DESCANSO_RECOMENDADO';
      feedbackMessage = 'Carga abaixo da média recente. Perfeito para absorção ou aplicação de microciclo de intensidade.';
    }

    const personalRecords = this.findPersonalRecords(workouts);

    return {
      currentWeekKm: Number(currentWeekKm.toFixed(2)),
      previousWeekKm: Number(previousWeekKm.toFixed(2)),
      volumeChangePercentage,
      acuteLoad: acuteLoadSum,
      chronicLoad: chronicLoadAverage,
      acwrRatio,
      status,
      feedbackMessage,
      personalRecords,
    };
  }
}