import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import authRouter from './routes/auth.js';

const app = express();

app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.use('/api/auth', authRouter);

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});