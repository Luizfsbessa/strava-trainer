import { WeeklyProgressionReport } from './progressionService';

export interface PlannedSession {
  dayOfWeek: 'Segunda-feira' | 'Terça-feira' | 'Quarta-feira' | 'Quinta-feira' | 'Sexta-feira' | 'Sábado' | 'Domingo';
  sessionType: 'Rodagem Leve (Z1/Z2)' | 'Intervalado / Tiros (Z4/Z5)' | 'Ritmo de Prova / Limiar (Z3)' | 'Longão (Z2)' | 'Mobilidade & Core' | 'Educativos & Pliometria' | 'Força Específica' | 'Descanso Total';
  targetDistanceKm?: number;
  targetPaceZone?: string;
  description: string;
  videoSearchTerm: string;
}

export interface NextWeekPlan {
  recommendedVolumeKm: number;
  strategy: 'AUMENTO_GRADUAL' | 'MANUTENCAO' | 'REGENERACAO_FORCADA';
  rationale: string;
  sessions: PlannedSession[];
}

export interface UserPaceSettings {
  targetPaceZ2Min?: string;
  targetPaceZ2Max?: string;
  targetPaceZ4Min?: string;
  targetPaceZ4Max?: string;
}

export class TrainingPlanService {
  public static generateNextWeekPlan(
    report: WeeklyProgressionReport,
    userPaceSettings?: UserPaceSettings
  ): NextWeekPlan {
    let targetVolume = report.currentWeekKm;
    let strategy: NextWeekPlan['strategy'] = 'MANUTENCAO';
    let rationale = '';

    // Define os limites dinâmicos com fallback para os valores ajustados ao seu histórico
    const z2Min = userPaceSettings?.targetPaceZ2Min || '7:00';
    const z2Max = userPaceSettings?.targetPaceZ2Max || '7:35';
    const z4Min = userPaceSettings?.targetPaceZ4Min || '5:45';
    const z4Max = userPaceSettings?.targetPaceZ4Max || '6:30';

    const z2ZoneFormatted = `${z2Min} - ${z2Max} min/km`;
    const z4ZoneFormatted = `${z4Min} - ${z4Max} min/km`;

    // 1. Definição da Estratégia
    if (report.status === 'ALERTA_OVERTRAINING' || report.acwrRatio > 1.4) {
      strategy = 'REGENERACAO_FORCADA';
      targetVolume = Number((report.currentWeekKm * 0.75).toFixed(2));
      rationale = 'Sua carga recente está elevada (risco de fadiga/lesão). A próxima semana será de regeneração para permitir supercompensação.';
    } else if (report.status === 'ATENCAO_VOLUME') {
      strategy = 'MANUTENCAO';
      targetVolume = Number((report.currentWeekKm * 1.0).toFixed(2));
      rationale = 'O volume da última semana subiu rápido. Recomendamos consolidar essa quilometragem sem aumentos por enquanto.';
    } else {
      strategy = 'AUMENTO_GRADUAL';
      targetVolume = Number((report.currentWeekKm * 1.08).toFixed(2));
      rationale = 'Sua relação de carga (ACWR) está na Zona Doce. Aumentaremos o volume em ~8% para manter a evolução aeróbica.';
    }

    // 2. Divisão do Volume Semanal
    const easyRunKm = Number((targetVolume * 0.30).toFixed(2));
    const qualityRunKm = Number((targetVolume * 0.25).toFixed(2));
    const longRunKm = Number((targetVolume * 0.45).toFixed(2));

    // 3. Montagem das Sessões
    const sessions: PlannedSession[] = [
      {
        dayOfWeek: 'Segunda-feira',
        sessionType: 'Mobilidade & Core',
        description: 'Foco em soltura de quadril, mobilidade de tornozelo e estabilização de core para resetar a musculatura.',
        videoSearchTerm: 'mobilidade de quadril e tornozelo para corredores'
      },
      {
        dayOfWeek: 'Terça-feira',
        sessionType: 'Rodagem Leve (Z1/Z2)',
        targetDistanceKm: easyRunKm,
        targetPaceZone: z2ZoneFormatted,
        description: 'Corrida em ritmo confortável para promover recuperação ativa e acumular base aeróbica.',
        videoSearchTerm: 'rodagem leve zona 2 corrida técnica'
      },
      {
        dayOfWeek: 'Quarta-feira',
        sessionType: 'Educativos & Pliometria',
        description: 'Trabalho estritamente técnico (A-skip, B-skip, educativos de sola) para eficiência mecânica.',
        videoSearchTerm: 'educativos de corrida a-skip b-skip'
      },
      {
        dayOfWeek: 'Quinta-feira',
        sessionType: strategy === 'REGENERACAO_FORCADA' ? 'Rodagem Leve (Z1/Z2)' : 'Intervalado / Tiros (Z4/Z5)',
        targetDistanceKm: qualityRunKm,
        targetPaceZone: strategy === 'REGENERACAO_FORCADA' ? z2ZoneFormatted : z4ZoneFormatted,
        description: strategy === 'REGENERACAO_FORCADA' 
          ? 'Troca de treino de tiro por rodagem leve devido ao pico de carga.' 
          : 'Aquecimento (1km) + Tiros de 400m/800m no ritmo alvo com descanso ativo.',
        videoSearchTerm: strategy === 'REGENERACAO_FORCADA' ? 'rodagem regenerativa' : 'treino intervalado de tiros 400m corrida'
      },
      {
        dayOfWeek: 'Sexta-feira',
        sessionType: 'Força Específica',
        description: 'Musculação focada em cadeia posterior, glúteos e trabalho excêntrico de joelho para prevenção de lesões.',
        videoSearchTerm: 'fortalecimento muscular para corredores prevencao de lesao'
      },
      {
        dayOfWeek: 'Sábado',
        sessionType: 'Longão (Z2)',
        targetDistanceKm: longRunKm,
        targetPaceZone: z2ZoneFormatted,
        description: 'Treino de resistência em ritmo constante. Mantenha a frequência cardíaca controlada.',
        videoSearchTerm: 'longão de corrida estratégia de pacing'
      },
      {
        dayOfWeek: 'Domingo',
        sessionType: 'Descanso Total',
        description: 'Janela de recuperação absoluta obrigatória para assimilação de carga e prevenção de overtraining.',
        videoSearchTerm: 'descanso e recuperacao ativa na corrida'
      }
    ];

    return {
      recommendedVolumeKm: targetVolume,
      strategy,
      rationale,
      sessions,
    };
  }
}