import { WeeklyProgressionReport } from './progressionService';

export interface PlannedSession {
  dayOfWeek: 'Segunda-feira' | 'Terça-feira' | 'Quarta-feira' | 'Quinta-feira' | 'Sexta-feira' | 'Sábado' | 'Domingo';
  sessionType: 'Rodagem Leve (Z1/Z2)' | 'Intervalado / Tiros (Z4/Z5)' | 'Ritmo de Prova / Limiar (Z3)' | 'Longão (Z2)' | 'Mobilidade & Core' | 'Educativos & Pliometria' | 'Força Específica' | 'Descanso Total';
  targetDistanceKm?: number;
  targetPaceZone?: string;
  description: string;
  videoSearchTerm: string; // Termo pronto para buscar no YouTube
}

export interface NextWeekPlan {
  recommendedVolumeKm: number;
  strategy: 'AUMENTO_GRADUAL' | 'MANUTENCAO' | 'REGENERACAO_FORCADA';
  rationale: string;
  sessions: PlannedSession[];
}

export class TrainingPlanService {
  public static generateNextWeekPlan(report: WeeklyProgressionReport): NextWeekPlan {
    let targetVolume = report.currentWeekKm;
    let strategy: NextWeekPlan['strategy'] = 'MANUTENCAO';
    let rationale = '';

    // 1. Definição da Estratégia com base no ACWR e Variação de Volume
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

    // 2. Divisão do Volume Semanal nas Corridas (Mantendo sua proporção original)
    const easyRunKm = Number((targetVolume * 0.30).toFixed(2));   // Terça
    const qualityRunKm = Number((targetVolume * 0.25).toFixed(2)); // Quinta
    const longRunKm = Number((targetVolume * 0.45).toFixed(2));    // Sábado

    // 3. Montagem da Matriz Completa de 7 Dias (Preenchendo os dias livres)
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
        targetPaceZone: '6:30 - 7:30 min/km',
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
        targetPaceZone: strategy === 'REGENERACAO_FORCADA' ? '6:30 - 7:30 min/km' : '5:00 - 5:45 min/km',
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
        targetPaceZone: '6:30 - 7:15 min/km',
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