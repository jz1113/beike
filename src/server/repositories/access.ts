/** Repository modules import the scoped Prisma client from here. */
export { prisma as db, checkpointDatabase } from './db';
export type { PrismaClient } from './db';
