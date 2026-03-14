import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const prisma = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error'] : ['error']
});

export default prisma