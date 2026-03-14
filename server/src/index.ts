import express from 'express';
import cors from 'cors';
import { env } from './config/env.js';
import prisma from './db/prisma.js';


const app = express();


app.use(cors({ origin: env.CLIENT_URL }));
app.use(express.json());


app.get('/health', async (_req, res) => {
  const userCount = await prisma.user.count();
  res.json({ status: 'ok', timestamp: new Date(), userCount });
});

app.listen(env.PORT, () => {
  console.log(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
});
