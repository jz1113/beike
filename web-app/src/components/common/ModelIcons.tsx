'use client';

import React from 'react';
import ClaudeIconComp from '@lobehub/icons/es/Claude/components/Color';
import GeminiIconComp from '@lobehub/icons/es/Gemini/components/Color';
import OpenAIIconComp from '@lobehub/icons/es/OpenAI/components/Mono';
import GrokIconComp from '@lobehub/icons/es/Grok/components/Mono';
import MidjourneyIconComp from '@lobehub/icons/es/Midjourney/components/Mono';
import FluxIconComp from '@lobehub/icons/es/Flux/components/Mono';
import DoubaoIconComp from '@lobehub/icons/es/Doubao/components/Color';
import DeepSeekIconComp from '@lobehub/icons/es/DeepSeek/components/Color';
import QwenIconComp from '@lobehub/icons/es/Qwen/components/Color';
import StabilityIconComp from '@lobehub/icons/es/Stability/components/Color';
import ZhipuIconComp from '@lobehub/icons/es/Zhipu/components/Color';
import KimiIconComp from '@lobehub/icons/es/Kimi/components/Color';
import MistralIconComp from '@lobehub/icons/es/Mistral/components/Color';
import MetaIconComp from '@lobehub/icons/es/Meta/components/Color';
import KlingIconComp from '@lobehub/icons/es/Kling/components/Color';
import IdeogramIconComp from '@lobehub/icons/es/Ideogram/components/Mono';
import RunwayIconComp from '@lobehub/icons/es/Runway/components/Mono';
import LumaIconComp from '@lobehub/icons/es/Luma/components/Color';
import MinimaxIconComp from '@lobehub/icons/es/Minimax/components/Color';
import SunoIconComp from '@lobehub/icons/es/Suno/components/Mono';
import StepfunIconComp from '@lobehub/icons/es/Stepfun/components/Mono';
import YiIconComp from '@lobehub/icons/es/Yi/components/Color';
import ByteDanceIconComp from '@lobehub/icons/es/ByteDance/components/Color';
import BaiduIconComp from '@lobehub/icons/es/Baidu/components/Color';
import TencentIconComp from '@lobehub/icons/es/Tencent/components/Color';
import HunyuanIconComp from '@lobehub/icons/es/Hunyuan/components/Color';
import PerplexityIconComp from '@lobehub/icons/es/Perplexity/components/Color';
import CopilotIconComp from '@lobehub/icons/es/Copilot/components/Color';
import CohereIconComp from '@lobehub/icons/es/Cohere/components/Color';

// 动态字母徽标兜底
export function LetterBadgeIcon({ 
  name, 
  className = "w-6 h-6" 
}: { 
  name: string; 
  className?: string 
}) {
  const firstLetter = (name.replace(/[^a-zA-Z0-9]/g, '')[0] || 'A').toUpperCase();
  return (
    <div className={`${className} rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-mono font-bold text-xs shadow-2xs flex-shrink-0 select-none`}>
      {firstLetter}
    </div>
  );
}

/**
 * 包装 LobeHub 官方图标组件以自适应 className 尺寸
 */
function renderLobeIcon(Component: any, className: string = "w-6 h-6", color?: string) {
  if (!Component) return <LetterBadgeIcon name="AI" className={className} />;
  
  // 提取传入 className 包含的像素/尺寸大小 (如 w-4 => 16, w-5 => 20, w-6 => 24, w-8 => 32)
  let sizeNum = 20;
  if (className.includes('w-3.5') || className.includes('h-3.5')) sizeNum = 14;
  else if (className.includes('w-4') || className.includes('h-4')) sizeNum = 16;
  else if (className.includes('w-4.5') || className.includes('h-4.5')) sizeNum = 18;
  else if (className.includes('w-5') || className.includes('h-5')) sizeNum = 20;
  else if (className.includes('w-6') || className.includes('h-6')) sizeNum = 24;
  else if (className.includes('w-7') || className.includes('h-7')) sizeNum = 28;
  else if (className.includes('w-8') || className.includes('h-8')) sizeNum = 32;

  const styleObj = color ? { color } : undefined;

  return (
    <div className={`${className} flex items-center justify-center flex-shrink-0 text-slate-900`}>
      <Component size={sizeNum} style={styleObj} />
    </div>
  );
}

// 导出各个独立官方组件
export const OpenAIIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(OpenAIIconComp, className);
export const GeminiIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(GeminiIconComp, className);
export const ClaudeIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(ClaudeIconComp, className);
export const GrokIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(GrokIconComp, className);
export const MidjourneyIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(MidjourneyIconComp, className);
export const FluxIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(FluxIconComp, className);
export const DoubaoIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(DoubaoIconComp, className);
export const DeepSeekIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(DeepSeekIconComp, className);
export const QwenIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(QwenIconComp, className);
export const StabilityAIIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(StabilityIconComp, className);
export const ZhipuGLMIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(ZhipuIconComp, className);
export const KimiIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(KimiIconComp, className);
export const MistralIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(MistralIconComp, className);
export const MetaLlamaIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(MetaIconComp, className);
export const KlingIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(KlingIconComp, className);
export const IdeogramIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(IdeogramIconComp, className);
export const RunwayIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(RunwayIconComp, className);
export const LumaIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(LumaIconComp, className);
export const MiniMaxIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(MinimaxIconComp, className);
export const SunoIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(SunoIconComp, className);
export const StepfunIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(StepfunIconComp, className);
export const YiIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(YiIconComp, className);
export const BaiduErnieIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(BaiduIconComp, className);
export const TencentHunyuanIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(HunyuanIconComp || TencentIconComp, className);
export const PerplexityIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(PerplexityIconComp, className);
export const CopilotIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(CopilotIconComp, className);
export const CohereIcon = ({ className = "w-6 h-6" }: { className?: string }) => renderLobeIcon(CohereIconComp, className);

/**
 * 全网 AI 模型品牌 Logo 智能识别引擎 (高质感官方配色与微立体徽标)
 */
export function getModelIcon(modelId: string, className = "w-6 h-6") {
  const m = (modelId || '').toLowerCase();
  
  // 1. Anthropic Claude (Claude 3.7 / 3.5 Sonnet / Opus / Haiku)
  if (m.includes('claude') || m.includes('anthropic')) {
    return (
      <div className={`${className} rounded-xl bg-[#D97757]/12 border border-[#D97757]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <ClaudeIconComp size={16} />
      </div>
    );
  }
  // 2. Google Gemini / Gemma / Imagen / Veo
  if (m.includes('gemini') || m.includes('google') || m.includes('gemma') || m.includes('imagen') || m.includes('veo') || m.includes('palm') || m.includes('bard')) {
    return (
      <div className={`${className} rounded-xl bg-gradient-to-tr from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-indigo-200/60 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <GeminiIconComp size={16} />
      </div>
    );
  }
  // 3. OpenAI (ChatGPT / GPT-4o / GPT-5 / DALL-E / Sora / o1 / o3)
  if (m.includes('gpt') || m.includes('openai') || m.includes('o1') || m.includes('o3') || m.includes('dall') || m.includes('sora') || m.includes('text-embedding')) {
    return (
      <div className={`${className} rounded-xl bg-[#10A37F] text-white flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <OpenAIIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 4. xAI / Grok
  if (m.includes('grok') || m.includes('xai') || m.includes('aurora')) {
    return (
      <div className={`${className} rounded-xl bg-black text-white border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <GrokIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 5. DeepSeek
  if (m.includes('deepseek')) {
    return (
      <div className={`${className} rounded-xl bg-[#4D6BFE]/12 border border-[#4D6BFE]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <DeepSeekIconComp size={16} />
      </div>
    );
  }
  // 6. Midjourney
  if (m.includes('midjourney') || m.includes('mj') || m.includes('niji')) {
    return (
      <div className={`${className} rounded-xl bg-[#1A1D2D] text-white border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <MidjourneyIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 7. Black Forest Labs / FLUX
  if (m.includes('flux') || m.includes('bfl') || m.includes('black-forest') || m.includes('schnell')) {
    return (
      <div className={`${className} rounded-xl bg-[#0B0F19] text-cyan-400 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <FluxIconComp size={15} style={{ color: '#00F0FF' }} />
      </div>
    );
  }
  // 8. 字节跳动 / 豆包 / 即梦 / Seedream / Seedance
  if (m.includes('seedream') || m.includes('seedance') || m.includes('jimeng') || m.includes('doubao') || m.includes('bytedance') || m.includes('volc') || m.includes('skylark')) {
    return (
      <div className={`${className} rounded-xl bg-gradient-to-tr from-blue-500 to-cyan-400 text-white flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <DoubaoIconComp size={16} />
      </div>
    );
  }
  // 9. 阿里通义千问 Qwen / 万相 Wanx
  if (m.includes('qwen') || m.includes('tongyi') || m.includes('wanx') || m.includes('alibaba') || m.includes('aliyun')) {
    return (
      <div className={`${className} rounded-xl bg-[#615CED]/12 border border-[#615CED]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <QwenIconComp size={16} />
      </div>
    );
  }
  // 10. Stability AI / Stable Diffusion
  if (m.includes('sd-') || m.includes('sdxl') || m.includes('sd3') || m.includes('stable-diffusion') || m.includes('stability') || m.includes('cascade')) {
    return (
      <div className={`${className} rounded-xl bg-[#7C3AED]/12 border border-[#7C3AED]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <StabilityIconComp size={16} />
      </div>
    );
  }
  // 11. 智谱清言 GLM / CogView
  if (m.includes('glm') || m.includes('zhipu') || m.includes('chatglm') || m.includes('cogview') || m.includes('cogvideox')) {
    return (
      <div className={`${className} rounded-xl bg-[#3859FF]/12 border border-[#3859FF]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <ZhipuIconComp size={16} />
      </div>
    );
  }
  // 12. 月之暗面 Kimi / Moonshot
  if (m.includes('kimi') || m.includes('moonshot')) {
    return (
      <div className={`${className} rounded-xl bg-[#0B1528] border border-blue-900/40 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <KimiIconComp size={16} />
      </div>
    );
  }
  // 13. Mistral AI / Pixtral / Codestral
  if (m.includes('mistral') || m.includes('pixtral') || m.includes('codestral') || m.includes('mixtral')) {
    return (
      <div className={`${className} rounded-xl bg-[#FA5252]/12 border border-[#FA5252]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <MistralIconComp size={16} />
      </div>
    );
  }
  // 14. Meta / LLaMA
  if (m.includes('llama') || m.includes('meta') || m.includes('chameleon')) {
    return (
      <div className={`${className} rounded-xl bg-[#0081FB]/12 border border-[#0081FB]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <MetaIconComp size={16} />
      </div>
    );
  }
  // 15. 快手可灵 Kling
  if (m.includes('kling') || m.includes('kuaishou') || m.includes('keling')) {
    return (
      <div className={`${className} rounded-xl bg-gradient-to-tr from-orange-500 to-rose-500 text-white flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <KlingIconComp size={16} />
      </div>
    );
  }
  // 16. Ideogram
  if (m.includes('ideogram')) {
    return (
      <div className={`${className} rounded-xl bg-slate-900 text-white border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <IdeogramIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 17. Runway
  if (m.includes('runway') || m.includes('gen-2') || m.includes('gen-3') || m.includes('gen2') || m.includes('gen3')) {
    return (
      <div className={`${className} rounded-xl bg-slate-900 text-white border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <RunwayIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 18. Luma AI
  if (m.includes('luma') || m.includes('dream-machine') || m.includes('photon')) {
    return (
      <div className={`${className} rounded-xl bg-[#7C3AED]/12 border border-[#7C3AED]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <LumaIconComp size={16} />
      </div>
    );
  }
  // 19. MiniMax / 海螺 AI
  if (m.includes('minimax') || m.includes('hailuo') || m.includes('abab')) {
    return (
      <div className={`${className} rounded-xl bg-[#FF4D4F]/12 border border-[#FF4D4F]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <MinimaxIconComp size={16} />
      </div>
    );
  }
  // 20. Suno
  if (m.includes('suno') || m.includes('chirp')) {
    return (
      <div className={`${className} rounded-xl bg-slate-900 text-white border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <SunoIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 21. 阶跃星辰 Stepfun
  if (m.includes('stepfun') || m.includes('step-')) {
    return (
      <div className={`${className} rounded-xl bg-slate-900 text-white border border-slate-700 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <StepfunIconComp size={15} style={{ color: '#ffffff' }} />
      </div>
    );
  }
  // 22. 零一万物 Yi / 01.AI
  if (m.includes('yi-') || m.includes('01.ai') || m.includes('lingyi')) {
    return (
      <div className={`${className} rounded-xl bg-[#00D084]/12 border border-[#00D084]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <YiIconComp size={16} />
      </div>
    );
  }
  // 23. 百度文心一言 ERNIE
  if (m.includes('ernie') || m.includes('baidu') || m.includes('wenxin')) {
    return (
      <div className={`${className} rounded-xl bg-[#2932E1]/12 border border-[#2932E1]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <BaiduIconComp size={16} />
      </div>
    );
  }
  // 24. 腾讯混元 Hunyuan
  if (m.includes('hunyuan') || m.includes('tencent')) {
    return (
      <div className={`${className} rounded-xl bg-[#0052D9]/12 border border-[#0052D9]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <HunyuanIconComp size={16} />
      </div>
    );
  }
  // 25. Perplexity
  if (m.includes('perplexity') || m.includes('sonar')) {
    return (
      <div className={`${className} rounded-xl bg-[#20B2AA]/12 border border-[#20B2AA]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <PerplexityIconComp size={16} />
      </div>
    );
  }
  // 26. Copilot
  if (m.includes('copilot')) {
    return (
      <div className={`${className} rounded-xl bg-gradient-to-tr from-blue-500 to-indigo-600 text-white flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <CopilotIconComp size={16} />
      </div>
    );
  }
  // 27. Cohere / Command
  if (m.includes('cohere') || m.includes('command')) {
    return (
      <div className={`${className} rounded-xl bg-[#39594C]/12 border border-[#39594C]/25 flex items-center justify-center flex-shrink-0 shadow-2xs overflow-hidden`}>
        <CohereIconComp size={16} />
      </div>
    );
  }
  
  // 智能优雅首字母徽标兜底
  const firstLetter = (modelId.replace(/[^a-zA-Z0-9]/g, '')[0] || 'A').toUpperCase();
  return (
    <div className={`${className} rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-mono font-bold text-xs shadow-2xs flex-shrink-0 select-none`}>
      {firstLetter}
    </div>
  );
}
