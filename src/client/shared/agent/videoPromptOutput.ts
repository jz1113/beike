import type { VideoPromptInput } from '@shared/domain/assistant/skills/videoPromptSkills';

/** Selected 05 execution text is authoritative; only presentation may change in 07. */
export function selectedStoryboardPrompt(input:VideoPromptInput) {
 if(!input.scriptOnly||!/^【本次片段｜时长 \d+ 秒】$/m.test(input.prompt))return;
 return input.prompt.replace(/^【@?文本\d+ · 已连接文本（提取后）】[ \t]*\r?\n/gm,'').trim();
}
const promptLines=(value:string)=>value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join('\n');

/** Vendor Skills sometimes request a report; only the actual generation text crosses this boundary. */
export function videoPromptOutput(content:string,input:VideoPromptInput):string {
  let text=content.trim().replace(/^```[^\n]*\n([\s\S]*?)\n```$/, '$1').trim();
  text=text.replace(/^\s*#{1,6}\s*(?:优化后提示词|最终提示词|视频提示词)[^\n]*\n/i,'');
  text=text.split(/\n(?:#{1,6}\s*|【)(?:优化问题|相关原则|优化说明|修改说明|自检报告|分析说明|优化分析)/)[0].replace(/\n\s*---\s*$/,'').trim();
  if(!text)throw new Error('优化稿为空或没有可用正文，视频尚未提交');
  const storyboard=selectedStoryboardPrompt(input);
  if(storyboard){
    if(promptLines(text)!==promptLines(storyboard))throw new Error('07稿与05或当前素材连线有缺失或冲突。须保留开场、人物、场景、光线、唯一时间轴及素材职责；内容变更请在上游完成。');
    return text;
  }
  const constraints:string[]=[];
  if(input.scriptOnly && input.duration!==undefined)constraints.push(`视频总时长：${input.duration}秒。`);
  if(input.scriptOnly) {
    const timeline=input.prompt.match(/本地时间轴[：:]([\s\S]*?)(?=\n(?:镜头风格与表演|结束状态|声音)[：:]|$)/)?.[1]?.trim();
    if(!timeline)throw new Error('分镜缺少可执行时间轴，视频尚未提交');
    constraints.push(`本地时间轴（严格保留各段时序）：\n${timeline}`);
    const end=input.prompt.match(/(?:^|\n)结束状态[：:]([^\n]+)/)?.[1];
    if(end)constraints.push(`结束状态：${end}`);
  }
  const roles=input.prompt.match(/【素材职责】([\s\S]*?)【素材职责结束】/)?.[1]?.trim();
  if(roles)constraints.push(`素材职责：\n${roles}`);
  if(input.audio===false)constraints.push('声音：全程静音，无台词、音乐、环境声或音效。');
  else if(input.audio===true) {
    const sound=[...input.prompt.matchAll(/(?:^|\n)声音[：:]([^\n]+)/g)].map(m=>m[1]);
    if(sound.length)constraints.push(`声音：${sound.join('；')}`);
  }
  const suffix=constraints.join('\n\n');
  // Optimization and confirmation share this guard; applying it twice must not grow the prompt.
  while(suffix&&text.endsWith(suffix))text=text.slice(0,-suffix.length).trim();
  return [text,suffix].filter(Boolean).join('\n\n');
}
