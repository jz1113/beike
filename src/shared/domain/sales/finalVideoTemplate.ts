import type { SalesBeatVoiceMode } from './scriptTemplate';

export function selectSalesTemplateVoice(template: string, mode: SalesBeatVoiceMode): string {
  const label = { speech: '有口播', none: '无口播', voiceover: '后期旁白' }[mode];
  return template.replace(/^【仅(有口播|无口播|后期旁白)】([^\r\n]*)(\r?\n|$)/gm,
    (_, voice: string, line: string, newline: string) => voice === label ? line + newline : '');
}
