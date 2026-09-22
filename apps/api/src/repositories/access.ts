/** Routes and services import `db` from here. Only this layer talks to Prisma. */
export { prisma as db, checkpointDatabase } from './db';
export type { PrismaClient } from './db';
