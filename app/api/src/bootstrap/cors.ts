import type { Hono } from 'hono';
import { apiCors } from '../core/cors';

export function applyCors(app: Hono): void {
  app.use('*', apiCors);
}
