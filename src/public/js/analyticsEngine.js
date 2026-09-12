/**
 * Motor de Inteligência e Auditoria Clínica - Strava Trainer (Dinâmico & Adaptativo)
 * Lê dinamicamente o plano gerado pelo TrainingPlanService / Banco de Dados
 */

/**
 * Mapeia o dia do JS (0-6) para o nome do dia da semana usado no plano gerado
 */
function getDayName(dateObj) {
    const days = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
    return days[dateObj.getDay()];
}

/**
 * Busca o treino planejado dinamicamente com base na lista de sessões do plano da semana
 */
function getPlannedWorkoutForDay(dateObj, plannedSessions = []) {
    const targetDayName = getDayName(dateObj);
    
    // Procura na lista de sessões vindas do backend/serviço de treino
    const foundSession = plannedSessions.find(s => s.dayOfWeek === targetDayName);
    
    if (foundSession) {
        return {
            type: foundSession.sessionType.toLowerCase().includes('corrida') || foundSession.sessionType.toLowerCase().includes('longão') ? 'corrida' : 'mobilidade',
            title: foundSession.sessionType,
            targetKm: foundSession.targetDistanceKm || 0,
            targetMin: 30, // Padrão estimado ou extraído
            zone: foundSession.targetPaceZone || 'Z1/Z2',
            pace: foundSession.targetPaceZone || '-'
        };
    }

    // Fallback caso não encontre a sessão específica
    const jsDay = dateObj.getDay();
    if (jsDay === 0) return { type: 'descanso', title: 'Descanso Total', targetKm: 0, targetMin: 0, zone: 'Z0', pace: '-' };
    return { type: 'mobilidade', title: 'Mobilidade / Atividade', targetKm: 0, targetMin: 20, zone: 'Z1', pace: '-' };
}

function auditSpecificWorkout(dateString, workouts, plannedSessions = []) {
    const d = new Date(dateString + 'T00:00:00');
    const planned = getPlannedWorkoutForDay(d, plannedSessions);
    
    const dayWorkouts = workouts.filter(w => w.activityDate && w.activityDate.substring(0, 10) === dateString);
    const hasWorkout = dayWorkouts.length > 0;

    if (!hasWorkout) {
        return {
            title: `Auditoria do Dia (${dateString.split('-').reverse().join('/')}) — ${planned.title} (Repouso)`,
            compliance: `💤 <strong>Repouso Estruturado:</strong> Nenhum estresse executado. Período planejado para: ${planned.title}.`,
            volume: `📊 <strong>Carga Realizada:</strong> 0.0 km / 0 min. Alinhado com o descanso.`,
            pace: `⚡ <strong>Esforço Cardíaco:</strong> Frequência cardíaca basal de repouso mantida.`,
            fix: `💡 <strong>Smart Fix:</strong> Mantenha a hidratação e o foco na recuperação.`
        };
    }

    const w = dayWorkouts[0];
    const dist = parseFloat(w.distanceKm || w.distance || w.distancia) || 0;
    
    let durationSec = 0;
    const durMins = parseFloat(w.durationMinutes || w.duracaoMinutos) || 0;
    if (durMins > 0) durationSec = durMins * 60;
    else durationSec = parseFloat(w.durationSeconds || w.duration || w.timeSeconds || w.tempo) || 0;
    
    const actualMins = Math.round(durationSec / 60);

    const isPlannedRun = planned.type === 'corrida' || planned.targetKm > 0;
    const isExecutedRun = dist > 0;

    let complianceText = `✅ <strong>Aderência Perfeita:</strong> Atividade executada de acordo com o planejado (${planned.title}).`;
    let volumeText = `📊 <strong>Volume Realizado:</strong> ${dist > 0 ? dist.toFixed(1) + ' km' : actualMins + ' min'} executados com sucesso.`;
    let paceAnalysis = `⏱️ <strong>Ritmo Alvo (${planned.pace}):</strong> Controlado dentro da zona esperada.`;
    let fixText = `💡 <strong>Smart Fix:</strong> Carga processada e integrada ao ciclo semanal.`;

    if (isPlannedRun && !isExecutedRun) {
        complianceText = `🌟 <strong>Esforço Validado:</strong> Excelente iniciativa ao manter o corpo ativo com <strong>${actualMins} min</strong> de estímulo, mesmo com o plano original prevendo ${planned.title}.`;
        volumeText = `📊 <strong>Carga por Tempo:</strong> Você realizou <strong>${actualMins} min</strong> de sessão técnica/alternativa.`;
        paceAnalysis = `🧘‍♂️ <strong>Controle de Carga:</strong> Sessão voltada para adaptação mecânica (${actualMins} min).`;
        fixText = `🔧 <strong>Smart Fix:</strong> O treino planejado foi adaptado. <strong>Sugestão:</strong> Monitore a fadiga para realocar o volume se necessário.`;
    } else if (isExecutedRun) {
        if (planned.targetKm > 0) {
            if (dist < planned.targetKm * 0.8) {
                complianceText = `⚠️ <strong>Déficit Parcial de Volume:</strong> Entregues ${dist.toFixed(1)} km dos ${planned.targetKm} km planejados para ${planned.title}.`;
            } else if (dist > planned.targetKm * 1.2) {
                complianceText = `🚀 <strong>Superávit de Carga:</strong> Excelente entrega! Volume acima do programado (${dist.toFixed(1)} km vs ${planned.targetKm} km esperados).`;
            }
        } else {
            complianceText = `🔥 <strong>Sessão Livre Integrada:</strong> Você executou ${dist.toFixed(1)} km em um dia originalmente programado para (${planned.title}). Carga computada com sucesso!`;
        }
        
        if (dist > 0) {
            const calculatedPaceSec = durationSec / dist;
            const paceMin = Math.floor(calculatedPaceSec / 60);
            const paceSec = Math.round(calculatedPaceSec % 60);
            const paceFormatted = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec} /km`;
            paceAnalysis = `⏱️ <strong>Ritmo Executado (${paceFormatted}):</strong> Meta da planilha: ${planned.pace}.`;
        }
    }

    return {
        title: `Auditoria Clínica: ${w.title || planned.title} vs Executado (${dateString.split('-').reverse().join('/')})`,
        compliance: complianceText,
        volume: volumeText,
        pace: paceAnalysis,
        fix: fixText
    };
}

function generateCoachVerdictEngine(workouts, lastWeekKm, acuteKm) {
    let summary = `Atleta, o ciclo semanal demonstra flexibilidade inteligente. O importante é manter a constância do movimento e ajustar os blocos de intensidade quando necessário.`;
    let posHtml = `<li>Parabéns por manter o hábito de treino ativo nos dias de ajuste.</li>`;
    let negHtml = `<li>Fique atento para realocar os treinos de alta intensidade perdidos para não perder o pico de forma.</li>`;

    if (lastWeekKm > 0) {
        posHtml += `<li>Base aeróbica sólida consolidada na semana anterior (${lastWeekKm.toFixed(1)} km).</li>`;
    }
    if (acuteKm > 30) {
        negHtml += `<li>Carga semanal em patamar elevado — respeite as janelas de recuperação.</li>`;
    } else {
        negHtml += `<li>Volume sob controle, sem sobrecarga articular excessiva.</li>`;
    }

    return { summary, posHtml, negHtml };
}