/** Only the selected executable segment crosses into image/video generation. */
export function selectVideoCopyStoryboard(texts: string[], prompt: string) {
  const selected = Number(prompt.match(/【使用片段[：:]\s*(\d+)】/)?.[1] || 1);
  const scripts = texts.filter(value => value.includes('【全片一致性】') && value.includes('【视频片段 '));
  if (scripts.length !== 1) throw new Error('请先运行 05 分镜分析，并连接一份包含全片一致性和视频片段标记的分镜结果');
  const script = scripts[0];
  const consistency = script.match(/【全片一致性】([\s\S]*?)【全片一致性结束】/)?.[1].trim();
  const segments = [...script.matchAll(/【视频片段\s+(\d+)｜时长\s+(\d+)\s+秒】([\s\S]*?)【视频片段结束】/g)];
  const matches = segments.filter(segment => Number(segment[1]) === selected);
  if (!consistency || matches.length !== 1 || !matches[0][3].trim()) throw new Error(`分镜片段 ${selected} 缺失、重复或未完成，请检查 05 分镜结果和“使用片段”编号`);
  const segment = matches[0], duration = Number(segment[2]);
  if (duration < 4 || duration > 15) throw new Error('秘塔 H3 每个分镜片段需要 4–15 秒，请重新拆分脚本');
  const audioModes=[...consistency.matchAll(/【声音模式[：:](静音|生成声音)】/g)];
  if(audioModes.length!==1)throw new Error('请在全片一致性中明确【声音模式：静音】或【声音模式：生成声音】');
  return { prompt: `【全片一致性】\n${consistency}\n【本次生成片段 ${segment[1]}｜时长 ${duration} 秒】\n${segment[3].trim()}\n${prompt}`, duration, audio:audioModes[0][1]==='生成声音' };
}

/** Image generation needs the opening pose, not the executable motion timeline. */
export function selectVideoCopyKeyframe(texts: string[], prompt: string) {
  const selected=selectVideoCopyStoryboard(texts,prompt.match(/【使用片段[：:]\s*\d+】/)?.[0] || '【使用片段：01】');
  const consistency=selected.prompt.split('【本次生成片段')[0].trim();
  const opening=selected.prompt.match(/(?:^|\n)首帧[：:]([\s\S]*?)(?=\n(?:本地时间轴[：:]|结束状态[：:]|声音[：:]|【)|$)/)?.[1].trim();
  if(!opening)throw new Error('所选分镜缺少首帧描述，请先补充分镜首帧');
  return {...selected,prompt:`${consistency}\n【只生成一张0秒首帧】\n${opening}\n${prompt}\n只画单张完整画面，不画分镜表、宫格、拼图、连续动作或多个时刻。`};
}
