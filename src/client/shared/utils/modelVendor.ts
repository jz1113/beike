/**
 * 🌟 统一、精准的 AI 模型所属厂商推断函数
 * 覆盖所有主力云厂商、大模型开源机构与垂直模型，彻底修复厂商推断不准或错标
 */
export function resolveModelVendor(modelId: string = '', rawProvider?: string): string {
  const m = (modelId || '').toLowerCase().trim();

  // 1. Google (Gemini, Veo, Imagen, Nano-Banana / Banana, Gemma, PaLM)
  if (
    m.includes('gemini') || 
    m.includes('google') || 
    m.includes('veo') || 
    m.includes('omni_flash') ||
    m.includes('omni-flash') ||
    m.includes('imagen') || 
    m.includes('nano-banana') || 
    m.includes('nanobanana') || 
    m.includes('banana') || 
    m.includes('gemma') || 
    m.includes('palm')
  ) {
    return 'Google';
  }

  // 2. OpenAI (GPT 系列, DALL-E, Sora, o1, o3, o4, image2, whisper)
  if (
    m.includes('gpt') || 
    m.includes('openai') || 
    m.includes('dall-e') || 
    m.includes('dalle') || 
    m.includes('sora') || 
    m.includes('o1') || 
    m.includes('o3') || 
    m.includes('o4') || 
    m.includes('image2') || 
    m.includes('chatgpt') || 
    m.includes('whisper')
  ) {
    return 'OpenAI';
  }

  // 3. xAI (Grok, Imagine Image / Video)
  if (m.includes('grok') || m.includes('xai') || m.includes('imagine-image') || m.includes('imagine-video')) {
    return 'xAI';
  }

  // 4. Anthropic (Claude 系列)
  if (m.includes('claude') || m.includes('anthropic')) {
    return 'Anthropic';
  }

  // 5. 字节跳动 / 即梦 / 豆包 (Doubao, Seedream, Seedance, Seededit, Jimeng, Volcengine)
  if (
    m.includes('seedream') || 
    m.includes('seedance') || 
    m.includes('seededit') || 
    m.includes('doubao') || 
    m.includes('jimeng') || 
    m.includes('bytedance') || 
    m.includes('volc') || 
    m.includes('skylark')
  ) {
    return '字节即梦';
  }

  // 6. 阿里巴巴 / 阿里百炼 (Qwen 通义千问, Wan / Wanx 万相)
  if (
    m.includes('qwen') || 
    m.includes('z-image') ||
    m.includes('wanx') || 
    m.includes('wan2') || 
    m.includes('wan-') || 
    m.includes('tongyi') || 
    m.includes('alibaba') || 
    m.includes('dashscope') ||
    m.includes('bailian')
  ) {
    return '阿里百炼';
  }

  // 7. 快手 / 可灵 (Kling, Kolors)
  if (m.includes('kling') || m.includes('kolors') || m.includes('kuaishou') || m.includes('keling') || m.includes('可灵') || m.includes('可图')) {
    return '快手可灵';
  }

  // 8. MiniMax / 海螺 AI (Hailuo, abab)
  if (m.includes('minimax') || m.includes('hailuo') || m.includes('abab') || m.includes('海螺')) {
    return 'MiniMax';
  }

  // 9. DeepSeek (深度求索)
  if (m.includes('deepseek')) {
    return 'DeepSeek';
  }

  // 10. FLUX / Black Forest Labs
  if (m.includes('flux') || m.includes('bfl') || m.includes('black forest') || m.includes('schnell')) {
    return 'FLUX';
  }

  // 11. Midjourney
  if (m.includes('midjourney') || m.includes('mj') || m.includes('niji')) {
    return 'Midjourney';
  }

  // 12. 生数科技 (Vidu)
  if (m.includes('vidu') || m.includes('shengshu')) {
    return '生数科技';
  }

  // 13. 月之暗面 / Kimi (Moonshot)
  if (m.includes('kimi') || m.includes('moonshot')) {
    return '月之暗面';
  }

  // 14. 智谱 AI / GLM / CogView / CogVideoX
  if (m.includes('glm') || m.includes('cogview') || m.includes('cogvideo') || m.includes('zhipu') || m.includes('chatglm')) {
    return '智谱AI';
  }

  // 15. 百川智能 (Baichuan)
  if (m.includes('baichuan') || m.includes('百川')) {
    return '百川智能';
  }

  // 16. 零一万物 (Yi, 01.AI)
  if (m.includes('yi-') || m.includes('01.ai') || m.includes('01ai')) {
    return '零一万物';
  }

  // 17. 阶跃星辰 (Stepfun, Step)
  if (m.includes('stepfun') || m.includes('step-')) {
    return '阶跃星辰';
  }

  // 18. 商汤科技 (SenseNova)
  if (m.includes('sensenova') || m.includes('商汤')) {
    return '商汤科技';
  }

  // 19. Runway
  if (m.includes('runway') || m.includes('gen-2') || m.includes('gen-3') || m.includes('gen2') || m.includes('gen3') || m.includes('act-one')) {
    return 'Runway';
  }

  // 20. Luma AI
  if (m.includes('luma') || m.includes('dream-machine') || m.includes('photon')) {
    return 'Luma AI';
  }

  // 21. Recraft
  if (m.includes('recraft')) {
    return 'Recraft';
  }

  // 22. Ideogram
  if (m.includes('ideogram')) {
    return 'Ideogram';
  }

  // 23. Pika
  if (m.includes('pika')) {
    return 'Pika';
  }

  // 24. Meta (LLaMA)
  if (m.includes('meta') || m.includes('llama')) {
    return 'Meta';
  }

  // 25. Mistral AI
  if (m.includes('mistral') || m.includes('mixtral') || m.includes('pixtral') || m.includes('codestral')) {
    return 'Mistral AI';
  }

  // 26. Suno
  if (m.includes('suno')) {
    return 'Suno';
  }

  // 27. Topaz Labs
  if (m.includes('topaz')) {
    return 'Topaz';
  }

  // 28. ElevenLabs
  if (m.includes('eleven')) {
    return 'ElevenLabs';
  }

  // 29. Meshy 3D
  if (m.includes('meshy')) {
    return 'Meshy';
  }

  // 30. Fal.ai
  if (m.includes('fal') || m.includes('fal-ai')) {
    return 'Fal.ai';
  }

  // 31. 硅基流动 (SiliconFlow)
  if (m.includes('siliconflow') || m.includes('siliconcloud') || m.includes('silicon')) {
    return '硅基流动';
  }

  // 32. 若传入了明确的 rawProvider 且非通用网关词，则使用规范化后的 rawProvider
  if (rawProvider && rawProvider !== 'Gateway' && rawProvider !== 'Comfly 网关' && rawProvider !== 'unknown') {
    const rawLower = rawProvider.toLowerCase();
    if (rawLower.includes('google')) return 'Google';
    if (rawLower.includes('openai')) return 'OpenAI';
    if (rawLower.includes('xai')) return 'xAI';
    if (rawLower.includes('anthropic')) return 'Anthropic';
    if (rawLower.includes('byte') || rawLower.includes('doubao') || rawLower.includes('jimeng')) return '字节即梦';
    if (rawLower.includes('ali') || rawLower.includes('qwen')) return '阿里百炼';
    if (rawLower.includes('kling') || rawLower.includes('kuaishou')) return '快手可灵';
    if (rawLower.includes('minimax') || rawLower.includes('hailuo')) return 'MiniMax';
    if (rawLower.includes('deepseek')) return 'DeepSeek';
    return rawProvider;
  }

  return 'Comfly 网关';
}
