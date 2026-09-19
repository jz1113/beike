import type { Context } from 'hono';
import type { z } from 'zod';
import { jsonResponse } from './http';
import { parseJsonBody } from './validate';
import { AppError, errorResponse } from './errors';

type RouteHandler<T> = (input: T, req: Request, c: Context) => Promise<Response> | Response;

export function defineRoute<TSchema extends z.ZodTypeAny>(options: {
  schema?: TSchema;
  handler: RouteHandler<TSchema extends z.ZodTypeAny ? z.output<TSchema> : unknown>;
}) {
  return async (c: Context) => {
    try {
      const req = c.req.raw;
      if (!options.schema) return await options.handler(undefined as never, req, c);
      const raw = await req.json().catch(() => null);
      const parsed = parseJsonBody(raw, options.schema);
      if (!parsed.success) return jsonResponse({ success: false, error: parsed.error }, 400);
      return await options.handler(parsed.data, req, c);
    } catch (error) {
      if (error instanceof AppError) return errorResponse(error);
      return errorResponse(error);
    }
  };
}

export function adaptRequest(handler: (req: Request) => Promise<Response> | Response) {
  return (c: Context) => handler(c.req.raw);
}
