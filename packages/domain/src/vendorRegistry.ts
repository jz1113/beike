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

export const VENDORS: VendorMeta[] = [
  {
    id: 'openai',
    name: 'OpenAI (GPT / Sora)',
    shortLabel: 'O',
    iconBg: 'bg-emerald-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.startsWith('gpt') || lower.includes('openai') || lower.startsWith('sora');
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
    name: 'Google (Gemini / Veo / Banana)',
    shortLabel: 'G',
    iconBg: 'bg-blue-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('gemini') || lower.includes('veo') || lower.includes('banana') || lower.includes('omni_flash') || lower.includes('google');
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
    name: '字节跳动 (Seedream / Seedance)',
    shortLabel: '字',
    iconBg: 'bg-blue-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('seedream') || lower.includes('seedance') || lower.includes('doubao') || lower.includes('bytedance');
    }
  },
  {
    id: 'alibaba',
    name: '阿里巴巴 (通义千问 / 万相)',
    shortLabel: '阿',
    iconBg: 'bg-orange-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('qwen') || isAlibabaWanModel(lower) || lower.includes('z-image') || lower.includes('tongyi') || lower.includes('dashscope');
    }
  },
  {
    id: 'flux',
    name: 'Black Forest Labs (Flux)',
    shortLabel: 'F',
    iconBg: 'bg-zinc-800',
    iconColor: 'text-white',
    matcher: (id) => id.toLowerCase().includes('flux') || id.toLowerCase().includes('bfl')
  },
  {
    id: 'midjourney',
    name: 'Midjourney',
    shortLabel: 'M',
    iconBg: 'bg-indigo-700',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('midjourney') || lower.includes('mj_') || /^mjv?\d/.test(lower);
    }
  },
  {
    id: 'kuaishou',
    name: '快手 (可灵 Kling)',
    shortLabel: '快',
    iconBg: 'bg-red-500',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('kling') || lower.includes('keling') || lower.includes('kuaishou');
    }
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi)',
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
    name: 'MiniMax',
    shortLabel: 'M',
    iconBg: 'bg-rose-600',
    iconColor: 'text-white',
    matcher: (id) => {
      const lower = id.toLowerCase();
      return lower.includes('minimax') || lower.includes('hailuo');
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
    name: '其他厂商',
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
