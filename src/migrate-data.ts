import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import path from 'path';

// 1. Conecta no SQLite local para ler os dados atuais
const sqlitePath = path.join(__dirname, '../prisma/dev.db');
const sqlite = new Database(sqlitePath, { readonly: true });

// 2. Instancia o Prisma (ele vai usar a DATABASE_URL que estiver ativa no seu .env)
const prisma = new PrismaClient();

async function migrateData() {
  try {
    console.log('🔄 Lendo dados do SQLite local...');
    
    // Pega todos os registros da tabela workout (ajuste o nome da tabela se for diferente no SQLite)
    const workouts = sqlite.prepare('SELECT * FROM Workout').all() as any[];
    console.log(`📦 Encontrados ${workouts.length} treinos no banco local.`);

    if (workouts.length === 0) {
      console.log('⚠️ Nenhum dado encontrado para migrar.');
      return;
    }

    console.log('🚀 Enviando dados para o Neon Postgres...');

    for (const w of workouts) {
      await prisma.workout.create({
        data: {
          id: w.id,
          title: w.title,
          type: w.type,
          distanceKm: w.distanceKm,
          durationMinutes: w.durationMinutes,
          pace: w.pace,
          elevationMeters: w.elevationMeters,
          activityDate: new Date(w.activityDate),
          createdAt: w.createdAt ? new Date(w.createdAt) : undefined,
        },
      });
    }

    console.log('✅ Migração concluída com sucesso!');
  } catch (error) {
    console.error('❌ Erro durante a migração:', error);
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

migrateData();