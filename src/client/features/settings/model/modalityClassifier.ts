import { isAvatarDriverModel } from '@shared/domain/models/avatarDrivers';
import { isLegacyOrDiscontinuedModel } from '@shared/domain/models/modelParsing';
import type { ModalityKind } from './modalityModelTypes';

export type ModelClass = ModalityKind | 'asr' | 'embedding' | 'realtime' | 'code' | 'unknown';

const GATEWAY_PREFIX = /^(?:fal-ai\/|openai\/|net-|aws-|bedrock-|vertex-|azure-)/i;

/** 去掉网关前缀、统一分隔符，并去掉日期快照，让不同服务商的同一模型落到同一条规则。 */
export function normalizeModelId(raw: string): string {
  let id = raw.toLowerCase().trim().replace(/\[[^\]]*\]/g, '').replace(/\s+/g, '-');
  while (GATEWAY_PREFIX.test(id)) id = id.replace(GATEWAY_PREFIX, '');
  id = id.replace(/[/_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  id = id.replace(/-?202[3-9]-[01]\d-[0-3]\d(?=-|$)/g, '');
  id = id.replace(/-?202[3-9][01]\d[0-3]\d(?=-|$)/g, '');
  return id.replace(/-+/g, '-').replace(/^-|-$/g, '');
}

interface ClassRule {
  cls: ModelClass;
  test: (id: string) => boolean;
}

const RULES: ClassRule[] = [
  {
    cls: 'embedding',
    test: (id) => /(embedding|\bembed\b|rerank|bge-|text-search|similarity|moderation|clip-vit|deepl|docmee|tokenizer)/.test(id),
  },
  {
    cls: 'asr',
    test: (id) => /(whisper|sensevoice|paraformer|conformer|transcribe|diarize|\basr\b)/.test(id),
  },
  {
    cls: 'realtime',
    test: (id) => /(realtime|native-audio|live-preview|deep-research|computer-use)/.test(id),
  },
  {
    cls: 'three_d',
    test: (id) => /(3d|\bmesh\b|tripo|hunyuan-3d|rodin|meshy|point-e|shap-e)/.test(id),
  },
  {
    cls: 'music',
    test: (id) => /(music|suno|\budio\b|song|melody|chirp|stable-audio|sound-effect|soundeffect|audio-effect|audioldm)/.test(id),
  },
  {
    cls: 'voice',
    test: (id) => /(tts|\bvoice\b|speech|cosyvoice|seed-tts|chattts|fish-speech|fish-audio|f5-tts|\bt2a\b|avatar-voice|eleven-(?:multilingual|v\d|turbo|flash|voice)|minimax-speech|volc-tts|azure-speech|sambert|edge-tts)/.test(id),
  },
  {
    cls: 'avatar',
    test: (id) => isAvatarDriverModel(id),
  },
  {
    cls: 'video',
    test: (id) =>
      /(video|sora|\bveo|runway|\bluma\b|dream-machine|seedance|\bvidu|pika|hailuo|minimax-h3|\bh3\b|i2v|t2v|s2v|wan-video|wanx.*video|cogvideox|cogvideo|hunyuan-video|skyreels|pixverse|ltx|liveportrait|emo-v\d|animate-anyone|avatar-generate|higgsfield|topaz.*video|video-upscale|omni-flash-\d+s|\bray2\b|\bray-2\b|aleph|heygen|wan[\d.]*-animate|\bvace\b)/.test(id)
      || /(?:^|[^a-z0-9])gen-?[234](?:[^a-z0-9]|$)/.test(id)
      || (/(kling|keling)/.test(id) && !/(image|img|kolors|try-on|lip|avatar|ident)/.test(id)),
  },
  {
    cls: 'image',
    test: (id) => /(image|\bimg\b|mj-|dall-?e|dalle|gpt-image|stable-diffusion|sdxl|sd-?3(?:\.5)?|midjourney|niji|\bmj\b|recraft|ideogram|banana|seedream|seededit|jimeng|wanx|\bimagen\b|kolors|flux|z-image|cogview|hunyuan-image|hunyuan-dit|kling-image|t2i|i2i|try-on|playground)/.test(id),
  },
  {
    cls: 'code',
    test: (id) => /(codex|\bcoder\b|starcoder|code-llama|codestral|\bcode\b)/.test(id),
  },
  {
    cls: 'unknown',
    test: (id) => /(search-api|search-preview|\bstudy\b|\bminimal\b)/.test(id),
  },
];

function isChat(id: string): boolean {
  if (/(?:gpt-4o.*audio|qwen.*audio.*chat|qwen2-audio|gemini.*audio)/.test(id)) return true;
  if (/(vision|\bvl\b|vlm|visual|multimodal|understanding)/.test(id)) return true;
  return [
    /(^|[^a-z0-9])(gpt-4o|gpt-4-turbo|gpt-4\.5|gpt-4\.1|gpt-5|gpt-6|chatgpt-4o|\bo1\b|\bo3\b|\bo4\b)/,
    /(gemini|gemma-[2-9])/,
    /(claude-[3-9]|claude-opus|claude-sonnet|claude-haiku|claude-fable)/,
    /(grok-vision|grok-[2-9])/,
    /(qwen-max|qwen-plus|qwen-turbo|qwen2\.5|qwen2|qwen3|qwen-omni|qwen.*vl|qwq)/,
    /(doubao-pro|doubao-lite|doubao-1[.-]5|doubao-.*vision|doubao-seed)/,
    /(glm-4|glm-4v|glm-4\.5|glm-5|cogagent)/,
    /(deepseek-chat|deepseek-v\d|deepseek-r1|deepseek-reasoner|deepseek-vl)/,
    /(kimi-k1\.5|kimi-k2|kimi-k3|kimi-latest|moonshot-v1)/,
    /(hunyuan-pro|hunyuan-standard|hunyuan-.*vision|hunyuan-lite|hunyuan-(?:turbos?|t1|large))/,
    /(abab6\.5|abab7|minimax-(?:m\d|text))/,
    /(mimo|xiaomi)/,
    /(yi-lightning|yi-large|yi-vision|01\.ai|01ai|yi-34b)/,
    /(ernie|wenxin)/,
    /(baichuan)/,
    /(step-1v|step-2|step-1|stepfun)/,
    /(sensenova|sensechat|internvl|internlm)/,
    /(pixtral|mistral-|magistral|mixtral)/,
    /(llama-|phi-\d|command-r|command-a|jamba|nova-(?:pro|lite|micro|premier|canvas)|spark-\d|\bsonar\b|perplexity)/,
    /(^|-)(instruct|chat)(-|$)/,
    /\d+(?:\.\d+)?b\b/,
  ].some((pattern) => pattern.test(id));
}

/** 每个模型只归属一个类别。规则按顺序匹配，先命中的类别生效。 */
export function classifyModel(rawId: string): ModelClass {
  const id = normalizeModelId(rawId);
  if (!id || isLegacyOrDiscontinuedModel(rawId) || isLegacyOrDiscontinuedModel(id)) return 'unknown';
  for (const rule of RULES) {
    if (rule.test(id)) return rule.cls;
  }
  return isChat(id) ? 'chat' : 'unknown';
}
