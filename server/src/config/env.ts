import {z} from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    PORT: z.string().default('3001'),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
    JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
    CLIENT_URL: z.string().url('CLIENT_URL must be a valid URL'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if(!parsed.success){
    console.error('Invalid environment variables ');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = parsed.data
