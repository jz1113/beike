import { z } from 'zod';
import { studioBgmSchema } from './salesProduction';

export const salesBgmImportBodySchema = z.object({
  title: z.string().trim().max(200).optional(),
  audioUrl: z.string().trim().min(1).max(8192).optional(),
  videoUrl: z.string().trim().min(1).max(8192).optional(),
  builtinId: z.string().trim().min(1).max(120).optional(),
  startSec: z.number().finite().min(0).max(600).optional(),
  durationSec: z.number().finite().min(1).max(600).optional(),
}).refine((input) => [input.audioUrl, input.videoUrl, input.builtinId].filter(Boolean).length === 1, {
  message: '请选择一个音频、参考视频或内置配乐来源',
});

export const salesBgmImportResponseSchema = z.object({ success: z.literal(true), bgm: studioBgmSchema });
export const salesBuiltinBgmsResponseSchema = z.object({ success: z.literal(true), bgms: z.array(studioBgmSchema) });
