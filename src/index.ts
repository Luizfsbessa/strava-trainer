import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import trainingRoutes from './routes/trainingRoutes';
import workoutRoutes from './routes/workoutRoutes';
import userRoutes from './routes/userRoutes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir a pasta public estaticamente
app.use(express.static(path.join(__dirname, '../src/public')));

// Rotas da API
app.use('/api/trainings', trainingRoutes);
app.use('/api/workouts', workoutRoutes);
app.use('/api/user', userRoutes);

app.listen(PORT, () => {
  console.log(`🚀 Servidor backend rodando na porta ${PORT}`);
  console.log(`📁 Painel web disponível em: http://localhost:${PORT}/dashboard.html`);
});