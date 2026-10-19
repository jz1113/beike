import { z } from 'zod';

export const ImageTemplateCallSchema = z.object({
  method: z.string().optional(),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
});

export const ImageTemplatePollSchema = z.object({
  url: z.string().min(1),
  statusPath: z.string().optional(),
  imageUrlPath: z.string().optional(),
  successValues: z.array(z.string()).optional(),
  failureValues: z.array(z.string()).optional(),
  errorPath: z.string().optional(),
});

export const ImageRequestTemplateSchema = z.object({
  submit: ImageTemplateCallSchema,
  result: z.object({
    imageUrlPath: z.string().optional(),
    taskIdPath: z.string().optional(),
  }),
  poll: ImageTemplatePollSchema.optional(),
});

export type ImageRequestTemplate = z.infer<typeof ImageRequestTemplateSchema>;
