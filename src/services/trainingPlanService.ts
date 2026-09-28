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
  cycleWeekNumber: number;
  cycleWeekName: string;
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
    const baseVolumeForCalc = report.currentWeekKm > 0 ? report.currentWeekKm : (report.previousWeekKm > 0 ? report.previousWeekKm : 24.4);
    
    let targetVolume = baseVolumeForCalc;
    let strategy: NextWeekPlan['strategy'] = 'AUMENTO_GRADUAL';
    let rationale = '';

    const z2Min = userPaceSettings?.targetPaceZ2Min || '7:00';
    const z2Max = userPaceSettings?.targetPaceZ2Max || '7:35';
    const z4Min = userPaceSettings?.targetPaceZ4Min || '5:45';
    const z4Max = userPaceSettings?.targetPaceZ4Max || '6:30';

    const z2ZoneFormatted = `${z2Min} - ${z2Max} min/km`;
    const z4ZoneFormatted = `${z4Min} - ${z4Max} min/km`;

    // 1. Identificação Dinâmica da Semana do Ciclo (Módulo de 4 semanas)
    const cycleWeekNumber = (Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000)) % 4) + 1;

    let intervalSplit = 0.20;
    let easySplit = 0.50;
    let longSplit = 0.30;
    let cycleFocusDescription = '';
    let cycleWeekName = '';

    // Sobrescrita de segurança para casos de fadiga crítica
    if (report.status === 'ALERTA_OVERTRAINING' || report.acwrRatio > 1.4) {
      strategy = 'REGENERACAO_FORCADA';
      targetVolume = Number((baseVolumeForCalc * 0.75).toFixed(2));
      rationale = 'Sua carga recente está elevada (risco de fadiga/lesão). Ativado protocolo de regeneração forçada.';
      intervalSplit = 0.10;
      easySplit = 0.60;
      longSplit = 0.30;
      cycleWeekName = 'Modo Recuperação Ativa';
      cycleFocusDescription = ' [Modo Recuperação Ativa]';
    } else {
      // Comportamento cíclico estruturado de 4 semanas
      switch (cycleWeekNumber) {
        case 1:
          targetVolume = Number((baseVolumeForCalc * 1.05).toFixed(2));
          strategy = 'AUMENTO_GRADUAL';
          intervalSplit = 0.15;
          easySplit = 0.60;
          longSplit = 0.25;
          cycleWeekName = 'Semana 1: Foco em Base e Recuperação';
          rationale = 'Semana 1 do Ciclo: Foco em construção de base aeróbica e rodagens confortáveis (Z2). Progressão de 5%.';
          break;

        case 2:
          targetVolume = Number((baseVolumeForCalc * 1.05).toFixed(2));
          strategy = 'AUMENTO_GRADUAL';
          intervalSplit = 0.20;
          easySplit = 0.50;
          longSplit = 0.30;
          cycleWeekName = 'Semana 2: Ritmo e Intervalado Moderado';
          rationale = 'Semana 2 do Ciclo: Introdução de treinos intervalados mais densos e ganho de ritmo. Progressão de 5%.';
          break;

        case 3:
          targetVolume = Number((baseVolumeForCalc * 1.05).toFixed(2));
          strategy = 'AUMENTO_GRADUAL';
          intervalSplit = 0.25;
          easySplit = 0.40;
          longSplit = 0.35;
          cycleWeekName = 'Semana 3: Pico de Carga';
          rationale = 'Semana 3 do Ciclo: Semana de maior exigência física, combinando tiros fortes e longão estendido.';
          break;

        case 4:
          targetVolume = Number((baseVolumeForCalc * 0.85).toFixed(2));
          strategy = 'MANUTENCAO';
          intervalSplit = 0.10;
          easySplit = 0.60;
          longSplit = 0.30;
          cycleWeekName = 'Semana 4: Deload / Regenerativa';
          rationale = 'Semana 4 (Deload): Redução planejada de volume para assimilação de carga, descanso tecidual e supercompensação.';
          break;
      }
    }

    // 2. Divisão do Volume baseada nos Splits Dinâmicos da Semana
    const intervalRunKm = Number((targetVolume * intervalSplit).toFixed(2));
    const easyRunKm = Number((targetVolume * easySplit).toFixed(2));
    const longRunKm = Number((targetVolume * longSplit).toFixed(2));

    // 3. Montagem das Sessões com os estímulos variáveis
    const sessions: PlannedSession[] = [
      {
        dayOfWeek: 'Segunda-feira',
        sessionType: 'Mobilidade & Core',
        description: `Mobilidade e estabilização de core.${cycleFocusDescription}`,
        videoSearchTerm: 'mobilidade de quadril e tornozelo para corredores'
      },
      {
        dayOfWeek: 'Terça-feira',
        sessionType: strategy === 'REGENERACAO_FORCADA' ? 'Rodagem Leve (Z1/Z2)' : 'Intervalado / Tiros (Z4/Z5)',
        targetDistanceKm: intervalRunKm,
        targetPaceZone: strategy === 'REGENERACAO_FORCADA' ? z2ZoneFormatted : z4ZoneFormatted,
        description: strategy === 'REGENERACAO_FORCADA' 
          ? 'Rodagem regenerativa substituta.' 
          : `Sessão intervalada focada no bloco atual (${Math.round(intervalSplit * 100)}% do volume total).`,
        videoSearchTerm: strategy === 'REGENERACAO_FORCADA' ? 'rodagem regenerativa' : 'treino intervalado de tiros 400m corrida'
      },
      {
        dayOfWeek: 'Quarta-feira',
        sessionType: 'Educativos & Pliometria',
        description: 'Trabalho técnico de passada (A-skip, B-skip) para eficiência mecânica.',
        videoSearchTerm: 'educativos de corrida a-skip b-skip'
      },
      {
        dayOfWeek: 'Quinta-feira',
        sessionType: 'Rodagem Leve (Z1/Z2)',
        targetDistanceKm: easyRunKm,
        targetPaceZone: z2ZoneFormatted,
        description: `Rodagem aeróbica confortável representando ${Math.round(easySplit * 100)}% da quilometragem semanal.`,
        videoSearchTerm: 'rodagem leve zona 2 corrida técnica'
      },      
      {
        dayOfWeek: 'Sexta-feira',
        sessionType: 'Força Específica',
        description: 'Fortalecimento de cadeia posterior e prevenção de lesões (foco em joelhos e quadris).',
        videoSearchTerm: 'fortalecimento muscular para corredores prevencao de lesao'
      },
      {
        dayOfWeek: 'Sábado',
        sessionType: 'Longão (Z2)',
        targetDistanceKm: longRunKm,
        targetPaceZone: z2ZoneFormatted,
        description: `Longão de resistência progressiva (${Math.round(longSplit * 100)}% do volume da semana).`,
        videoSearchTerm: 'longão de corrida estratégia de pacing'
      },
      {
        dayOfWeek: 'Domingo',
        sessionType: 'Descanso Total',
        description: 'Descanso absoluto para absorção biológica dos estímulos e reestruturação muscular.',
        videoSearchTerm: 'descanso e recuperacao ativa na corrida'
      }
    ];

    return {
      recommendedVolumeKm: targetVolume,
      strategy,
      rationale,
      cycleWeekNumber,
      cycleWeekName,
      sessions,
    };
  }
}