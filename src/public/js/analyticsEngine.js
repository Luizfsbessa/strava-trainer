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

    const isExecutedRun = dist > 0;

    // Cálculo do Pace Executado
    let paceFormatted = '-';
    let calculatedPaceSec = 0;
    if (isExecutedRun && durationSec > 0) {
        calculatedPaceSec = durationSec / dist;
        const paceMin = Math.floor(calculatedPaceSec / 60);
        const paceSec = Math.round(calculatedPaceSec % 60);
        paceFormatted = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec} /km`;
    }

    let complianceText = `✅ <strong>Aderência Perfeita:</strong> Atividade executada de acordo com o planejado (${planned.title}).`;
    let volumeText = `📊 <strong>Volume Realizado:</strong> ${isExecutedRun ? dist.toFixed(1) + ' km' : actualMins + ' min'} executados com sucesso.`;
    let paceAnalysis = `⏱️ <strong>Ritmo Executado (${paceFormatted}):</strong> Meta da planilha: ${planned.pace}.`;
    let fixText = `💡 <strong>Smart Fix:</strong> Carga processada e integrada ao ciclo semanal.`;

    // Auditoria rigorosa de Volume e Ritmo comparada ao planejado
    if (isExecutedRun) {
        if (planned.targetKm > 0) {
            const diffPct = ((dist - planned.targetKm) / planned.targetKm) * 100;
            if (dist < planned.targetKm * 0.8) {
                complianceText = `⚠️ <strong>Déficit de Volume:</strong> Entregues ${dist.toFixed(1)} km dos ${planned.targetKm} km planejados para ${planned.title} (${Math.abs(diffPct).toFixed(0)}% abaixo).`;
            } else if (dist > planned.targetKm * 1.2) {
                complianceText = `🚀 <strong>Superávit de Carga:</strong> Volume acima do programado (${dist.toFixed(1)} km vs ${planned.targetKm} km esperados).`;
            } else {
                complianceText = `🎯 <strong>Volume Alvo Atingido:</strong> Excelente entrega de ${dist.toFixed(1)} km alinhados à meta de ${planned.targetKm} km.`;
            }
        } else {
            complianceText = `🔥 <strong>Sessão Realizada (${planned.title}):</strong> Executados ${dist.toFixed(1)} km em dia de estímulo alternativo/livre.`;
        }

        volumeText = `📊 <strong>Volume Realizado:</strong> ${dist.toFixed(1)} km (Esperado: ${planned.targetKm > 0 ? planned.targetKm + ' km' : 'Livre/Técnico'}).`;
        
        // Crítica severa de ritmo se houver parâmetro na planilha
        if (planned.pace && planned.pace !== '-') {
            paceAnalysis = `⏱️ <strong>Ritmo Executado (${paceFormatted}):</strong> A meta rigorosa da planilha era <strong>${planned.pace}</strong>. Avalie se o esforço ficou dentro da zona (${planned.zone}).`;
        } else {
            paceAnalysis = `⏱️ <strong>Ritmo Executado (${paceFormatted}):</strong> Sessão concluída sem balizador restrito de pace na planilha.`;
        }
    } else {
        complianceText = `🌟 <strong>Sessão Alternativa:</strong> Realizados ${actualMins} min de estímulo sem registro de distância (Planejado: ${planned.title}).`;
        volumeText = `📊 <strong>Carga por Tempo:</strong> ${actualMins} min dedicados.`;
        paceAnalysis = `🧘‍♂️ <strong>Controle Mecânico:</strong> Foco em mobilidade/técnica. Ritmo de corrida não aplicável.`;
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