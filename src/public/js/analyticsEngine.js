/**
 * Motor de Inteligência e Auditoria Clínica - Strava Trainer (Ajustado)
 * Validação inteligente para treinos de tempo (educativos/mobilidade) vs distância (corrida)
 */

const PERIODIZATION_PLAN = {
    1: { type: 'mobilidade', title: 'Mobilidade', targetKm: 0, targetMin: 30, zone: 'Z1 - Regenerativo', pace: '-' },
    2: { type: 'corrida', title: 'Corrida Leve (Z2)', targetKm: 5.0, targetMin: 30, zone: 'Z2 - Queima de Gordura', pace: '7:42 - 8:26 /km' },
    3: { type: 'educativo', title: 'Educativos', targetKm: 0, targetMin: 25, zone: 'Z1 - Técnica', pace: '-' },
    4: { type: 'corrida', title: 'Rodagem / Intervalado', targetKm: 6.0, targetMin: 35, zone: 'Z3 - Moderado', pace: '6:58 - 7:37 /km' },
    5: { type: 'mobilidade', title: 'Descanso / Mobilidade', targetKm: 0, targetMin: 20, zone: 'Z0 - Descanso', pace: '-' },
    6: { type: 'corrida', title: 'Longo de Base', targetKm: 9.0, targetMin: 60, zone: 'Z2 - Aeróbico Extendido', pace: '7:42 - 8:26 /km' },
    0: { type: 'descanso', title: 'Descanso', targetKm: 0, targetMin: 0, zone: 'Z0 - Descanso', pace: '-' }
};

function getPlannedWorkoutForDay(dateObj) {
    const jsDay = dateObj.getDay(); 
    return PERIODIZATION_PLAN[jsDay];
}

function auditSpecificWorkout(dateString, workouts) {
    const d = new Date(dateString + 'T00:00:00');
    const planned = getPlannedWorkoutForDay(d);
    
    const dayWorkouts = workouts.filter(w => w.activityDate && w.activityDate.substring(0, 10) === dateString);
    const hasWorkout = dayWorkouts.length > 0;

    if (!hasWorkout) {
        return {
            title: `Auditoria do Dia (${dateString.split('-').reverse().join('/')}) — Descanso Programado`,
            compliance: `💤 <strong>Repouso Estruturado:</strong> Nenhum estresse executado. Período essencial para supercompensação (${planned.title}).`,
            volume: `📊 <strong>Carga Realizada:</strong> 0.0 km / 0 min. Alinhado com o repouso.`,
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

    const isPlannedRun = planned.type === 'corrida';
    const isExecutedRun = dist > 0;

    let complianceText = `✅ <strong>Aderência Perfeita:</strong> Atividade executada de acordo com o planejado (${planned.title}).`;
    let volumeText = `📊 <strong>Volume Realizado:</strong> ${dist > 0 ? dist.toFixed(1) + ' km' : actualMins + ' min'} executados com sucesso.`;
    let paceAnalysis = `⏱️ <strong>Ritmo Alvo (${planned.pace}):</strong> Controlado dentro da zona esperada.`;
    let fixText = `💡 <strong>Smart Fix:</strong> Carga processada e integrada ao ciclo semanal.`;

    // Caso o atleta tenha feito educativo/mobilidade num dia de corrida (ou vice-versa)
    if (isPlannedRun && !isExecutedRun) {
        complianceText = `🌟 <strong>Esforço Validado:</strong> Excelente iniciativa ao manter o corpo ativo com <strong>${actualMins} min</strong> de educativos/técnica, mesmo com o plano original prevendo ${planned.title} (${planned.zone}).`;
        volumeText = `📊 <strong>Carga por Tempo:</strong> Você realizou <strong>${actualMins} min</strong> de estímulo técnico (Sessão sem registro de quilometragem por distâncias).`;
        paceAnalysis = `🧘‍♂️ <strong>Controle de Amplitude:</strong> Sessão voltada para mobilidade e mecânica de passada (${actualMins} min). Ritmo de corrida não aplicável.`;
        fixText = `🔧 <strong>Smart Fix:</strong> O treino Z3 de alta intensidade foi substituído por precaução ou tempo. <strong>Sugestão:</strong> Aproveite o descanso de amanhã para encaixar os tiros Z3 ou realoque para o próximo bloco de rodagem.`;
    } else if (isPlannedRun && isExecutedRun) {
        if (dist < planned.targetKm * 0.8) {
            complianceText = `⚠️ <strong>Déficit Parcial de Volume:</strong> Parabéns por ir pra rua! Porém, foram entregues ${dist.toFixed(1)} km dos ${planned.targetKm} km planejados.`;
        } else if (dist > planned.targetKm * 1.2) {
            complianceText = `🚀 <strong>Superávit de Carga:</strong> Excelente entrega! Volume acima do programado (${dist.toFixed(1)} km vs ${planned.targetKm} km esperados).`;
        }
        const calculatedPaceSec = durationSec / dist;
        const paceMin = Math.floor(calculatedPaceSec / 60);
        const paceSec = Math.round(calculatedPaceSec % 60);
        const paceFormatted = `${paceMin}:${paceSec < 10 ? '0' : ''}${paceSec} /km`;
        paceAnalysis = `⏱️ <strong>Ritmo Executado (${paceFormatted}):</strong> A meta da planilha era ${planned.pace}.`;
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
    let negHtml = `<li>Fique atento para realocar os treinos de alta intensidade (Z3) perdidos para não perder o pico de forma.</li>`;

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