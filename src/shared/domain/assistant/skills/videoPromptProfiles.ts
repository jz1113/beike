/** Host adapters select relevant, unchanged upstream chapters; they do not author replacement Skills. */
export interface VideoPromptProfile {
  skillId:string;
  title?:string;
  icon?:string;
  guide?:string;
  sections?:string[];
}

export const videoPromptProfiles:Record<string,VideoPromptProfile>={
  'veo3.1':{skillId:'scenario-veo',sections:['## The soundstage is in the prompt','## Prompt one continuous shot']},
  'veo3.1-fast':{skillId:'scenario-veo',sections:['## The soundstage is in the prompt','## Prompt one continuous shot']},
  'omni_flash-10s':{skillId:'gemini-omni-flash-api',sections:['## Prompting Gemini Omni Flash']},
  'kling-video-v3':{skillId:'kling-3-prompting'},
  'kling-video-v3-omni':{skillId:'kling-3-prompting'},
  'kling-video-v2-6':{skillId:'scenario-kling',sections:['## Audio is a per-member switch','## Worked example: two-shot character clip from a still','## Common mistakes']},
  'kling-video-v2-5-turbo':{skillId:'ai-video-prompt-writer',title:'可灵通用提示词 · 社区',icon:'kling-video-v2-5-turbo',guide:'models/kling.md'},
  'sora-2':{skillId:'ai-video-prompt-writer',title:'Sora 2 提示词 · 社区',icon:'sora-2',guide:'models/sora-2.md'},
  'sora-2-pro':{skillId:'ai-video-prompt-writer',title:'Sora 2 提示词 · 社区',icon:'sora-2-pro',guide:'models/sora-2.md'},
  'grok-imagine-video-1.5':{skillId:'scenario-grok-imagine-video',sections:['## First frame or references','## Sound is prompted, not switched']},
  'viduq3':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq3-mix':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq3-turbo':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq3-pro':{skillId:'scenario-vidu',sections:['## Two prompt shapes']},
  'viduq4-preview':{skillId:'ai-video-prompt-writer',title:'Vidu 通用提示词 · 社区',icon:'viduq4-preview',guide:'models/vidu.md'},
};

/** Keep a selected heading and its child headings verbatim, stopping at the next peer section. */
export function videoPromptSections(prompt:string,headings?:string[]):string {
  if(!headings)return prompt;
  const lines=prompt.split('\n');
  return headings.map(heading=>{
    const start=lines.findIndex(line=>line.trim()===heading),level=heading.match(/^#+/)?.[0].length || 0;
    if(start<0)throw new Error(`上游 Skill 缺少提示词章节：${heading}`);
    let end=start+1;
    while(end<lines.length){const next=lines[end].match(/^(#+) /);if(next && next[1].length<=level)break;end++;}
    return lines.slice(start,end).join('\n').trim();
  }).join('\n\n');
}
