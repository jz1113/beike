export interface VendorMeta {
  id: string;
  name: string;
  shortLabel: string;
  iconBg: string;
  iconColor: string;
  matcher: (modelId: string, ownedBy?: string) => boolean;
}

function isAlibabaWanModel(lower: string): boolean {
  return (
    lower.includes('wanx') ||
    lower.includes('wan2') ||
    lower.includes('wan-') ||
    /^wan[\d.-]/.test(lower) ||
    lower.startsWith('wan')
  );
}

const OWNED_BY_VENDOR: Record<string, string> = {
  alibaba: 'alibaba',
  dashscope: 'alibaba',
  tongyi: 'alibaba',
  vidu: 'vidu',
  shengshu: 'vidu',
};

// 30+ 知名大模型厂商精准归类规则
export const VENDORS: VendorMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI (GPT / DALL-E / Sora / Voice)',
    shortLabel: 'O',
    iconBg: 'bg-emerald-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.startsWith('gpt') || lower.includes('openai') || lower.includes('net-gpt') || lower.startsWith('o1') || lower.startsWith('o3') || lower.startsWith('o4') ||
             lower.startsWith('chatgpt') || lower.startsWith('dall-e') || lower.startsWith('dall') || lower.startsWith('text-embedding') ||
             lower.includes('whisper') || lower.startsWith('tts') || lower.startsWith('sora') || lower.includes('advanced-voice') || lower.includes('avatar-');
    }
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    shortLabel: 'A',
    iconBg: 'bg-amber-700',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('claude') || id.toLowerCase().includes('anthropic')
  },
  {
    id: 'google',
    name: 'Google (Gemini / Veo / Imagen / Banana)',
    shortLabel: 'G',
    iconBg: 'bg-blue-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('gemini') || lower.includes('gemma') || lower.includes('imagen') || lower.includes('veo') || lower.includes('palm') || lower.includes('google') || lower.includes('banana') || lower.includes('nanobanana');
    }
  },
  {
    id: 'mistral',
    name: 'Mistral AI (Mistral / Mixtral / Pixtral)',
    shortLabel: 'M',
    iconBg: 'bg-amber-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('mistral') || lower.includes('mixtral') || lower.includes('pixtral') || lower.includes('codestral') || lower.includes('ministral');
    }
  },
  {
    id: 'deepseek',
    name: '深度求索 (DeepSeek)',
    shortLabel: '深',
    iconBg: 'bg-blue-600',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('deepseek')
  },
  {
    id: 'bytedance',
    name: '字节跳动 (Seedream / 即梦 / 豆包)',
    shortLabel: '字',
    iconBg: 'bg-blue-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('seedream') || lower.includes('seedance') || lower.includes('doubao') || lower.includes('bytedance') || lower.includes('jimeng') || lower.includes('volc') || lower.includes('skylark');
    }
  },
  {
    id: 'alibaba',
    name: '阿里巴巴 (通义千问 / 万相 / Animate Anyone)',
    shortLabel: '阿',
    iconBg: 'bg-orange-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('qwen') || isAlibabaWanModel(lower) || lower.includes('tongyi') || lower.includes('dashscope') || lower.includes('animate-anyone') || lower.includes('alibaba') || lower.includes('aliyun');
    }
  },
  {
    id: 'flux',
    name: 'Black Forest Labs (Flux)',
    shortLabel: 'F',
    iconBg: 'bg-zinc-800',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('flux') || lower.includes('black-forest') || lower.includes('bfl');
    }
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    shortLabel: 'M',
    iconBg: 'bg-indigo-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('midjourney') || lower.includes('mj_') || lower.includes('niji');
    }
  },
  {
    id: 'kuaishou',
    name: '快手 (可灵 Kling / 可图 Kolors)',
    shortLabel: '快',
    iconBg: 'bg-red-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('kling') || lower.includes('kolors') || lower.includes('kwai') || lower.includes('keling');
    }
  },
  {
    id: 'zhipu',
    name: '智谱 AI (GLM / CogView / CogVideo)',
    shortLabel: '智',
    iconBg: 'bg-blue-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('glm') || lower.includes('cogview') || lower.includes('cogvideo') || lower.includes('chatglm') || lower.includes('zhipu');
    }
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi / Moonshot)',
    shortLabel: '月',
    iconBg: 'bg-emerald-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('moonshot') || lower.includes('kimi');
    }
  },
  {
    id: 'minimax',
    name: 'MiniMax (海螺 / abab)',
    shortLabel: 'M',
    iconBg: 'bg-rose-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('minimax') || lower.includes('abab') || lower.includes('hailuo');
    }
  },
  {
    id: 'runway',
    name: 'Runway (Gen-2 / Gen-3 Alpha)',
    shortLabel: 'R',
    iconBg: 'bg-violet-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('runway') || lower.includes('gen-2') || lower.includes('gen-3') || lower.includes('gen2') || lower.includes('gen3');
    }
  },
  {
    id: 'luma',
    name: 'Luma AI (Dream Machine / Photon)',
    shortLabel: 'L',
    iconBg: 'bg-rose-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('luma') || lower.includes('dream-machine') || lower.includes('photon');
    }
  },
  {
    id: 'pika',
    name: 'Pika (Pika 2.0 / Effects)',
    shortLabel: 'P',
    iconBg: 'bg-amber-500',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('pika')
  },
  {
    id: 'ideogram',
    name: 'Ideogram (Ideogram 2.0)',
    shortLabel: 'I',
    iconBg: 'bg-teal-600',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('ideogram')
  },
  {
    id: 'stability',
    name: 'Stability AI (SD / SDXL / Cascade)',
    shortLabel: 'S',
    iconBg: 'bg-purple-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('stable-diffusion') || lower.includes('sdxl') || lower.includes('sd-') || lower.includes('sd3') || lower.includes('stability') || lower.includes('cascade');
    }
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    shortLabel: 'X',
    iconBg: 'bg-black',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('grok') || id.toLowerCase().includes('xai')
  },
  {
    id: 'meta',
    name: 'Meta (Llama)',
    shortLabel: 'L',
    iconBg: 'bg-sky-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('llama') || lower.includes('meta-') || lower.includes('meta/');
    }
  },
  {
    id: 'baai',
    name: '北京智源 (BAAI / BGE)',
    shortLabel: '智',
    iconBg: 'bg-cyan-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('baai') || lower.includes('bge');
    }
  },
  {
    id: 'tencent',
    name: '腾讯 (混元 Hunyuan)',
    shortLabel: '腾',
    iconBg: 'bg-blue-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('hunyuan') || lower.includes('tencent');
    }
  },
  {
    id: 'baidu',
    name: '百度 (文心一言 / Ernie)',
    shortLabel: '百',
    iconBg: 'bg-blue-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('baidu') || lower.includes('ernie') || lower.includes('wenxin');
    }
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 (Stepfun / Step)',
    shortLabel: '阶',
    iconBg: 'bg-purple-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('stepfun') || lower.includes('step-');
    }
  },
  {
    id: 'yi',
    name: '零一万物 (01.AI / Yi)',
    shortLabel: '零',
    iconBg: 'bg-emerald-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('01.ai') || lower.includes('01ai') || lower.startsWith('yi-') || lower.includes('yi-large') || lower.includes('yi-medium') || lower.includes('yi-vision');
    }
  },
  {
    id: 'sensenova',
    name: '商汤科技 (SenseNova / 日日新)',
    shortLabel: '商',
    iconBg: 'bg-blue-800',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('sensenova') || lower.includes('sense-') || lower.includes('商汤');
    }
  },
  {
    id: 'baichuan',
    name: '百川智能 (Baichuan)',
    shortLabel: '川',
    iconBg: 'bg-orange-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('baichuan') || lower.includes('百川');
    }
  },
  {
    id: 'recraft',
    name: 'Recraft AI',
    shortLabel: 'R',
    iconBg: 'bg-pink-600',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('recraft')
  },
  {
    id: 'suno',
    name: 'Suno (AI 音乐)',
    shortLabel: 'S',
    iconBg: 'bg-zinc-900',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('suno')
  },
  {
    id: 'viggle',
    name: 'Viggle AI (动作迁移)',
    shortLabel: 'V',
    iconBg: 'bg-emerald-500',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('viggle')
  },
  {
    id: 'tripo',
    name: 'Tripo 3D',
    shortLabel: 'T',
    iconBg: 'bg-indigo-600',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('tripo')
  },
  {
    id: 'vidu',
    name: '生数科技 (Vidu)',
    shortLabel: 'V',
    iconBg: 'bg-violet-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('vidu') || lower.includes('shengshu');
    }
  },
  {
    id: 'other',
    name: '其他厂商 / 社区开源模型',
    shortLabel: '社',
    iconBg: 'bg-slate-700',
    iconColor: 'text-white',
    matcher: () => true
  }
];

export function identifyVendor(modelId: string, ownedBy?: string): VendorMeta {
  for (const v of VENDORS) {
    if (v.id === 'other') continue;
    if (v.matcher(modelId, ownedBy)) {
      return v;
    }
  }

  if (ownedBy) {
    const vendorId = OWNED_BY_VENDOR[ownedBy.toLowerCase()];
    if (vendorId) {
      const vendor = VENDORS.find(v => v.id === vendorId);
      if (vendor) return vendor;
    }
  }

  return VENDORS.find(v => v.id === 'other')!;
}
