'use client';
import type { MediaAttachment } from '@/store/useAppStore';
import { cleanPromptText } from '@/lib/drawing';
import type { ParsedShotItem } from '@/features/assistant/BatchPromptModal';

/** 从大模型返回的内容中智能解析出多张分镜提示词 (支持多图与人物模特一致性参考) */
export function extractShotsFromMessage(content: string, attachments: MediaAttachment[] = []): ParsedShotItem[] {
  if (!content) return [];
  
  // 🌟 辅助函数：根据标题/序号智能绑定对应的参考图列表 (支持商品图+人物模特双图)
  const getRefImagesForShot = (titleStr: string, promptStr: string, shotIndex: number): string[] => {
    if (!attachments || attachments.length === 0) return [];
    const combined = `${titleStr} ${promptStr}`;
    const matchedImgs: string[] = [];
    
    // 检测 @图片1, @图片2, {{Mixed 1}}, {{Mixed 2}} 等多模态占位符
    const mixedMatches = Array.from(combined.matchAll(/(?:\{\{\s*(?:Mixed|Image|图)?\s*(\d+)\s*\}\}|@(?:图片|insp_)?(\d+))/gi));
    mixedMatches.forEach(m => {
      const idx = parseInt(m[1] || m[2], 10) - 1;
      if (attachments[idx]?.url && !matchedImgs.includes(attachments[idx].url)) {
        matchedImgs.push(attachments[idx].url);
      }
    });

    // 检测是否明确提到了 图1/图2/图3 或 第一张/第二张/第三张 或 分镜一/分镜二/分镜三...
    const picMatches = Array.from(combined.matchAll(/(?:图|图片|素材|参考图|第|分镜)\s*([123456789\d]|一|二|三|四|五|六)/g));
    picMatches.forEach(m => {
      let picNum = parseInt(m[1], 10);
      if (isNaN(picNum)) {
        const cnMap: Record<string, number> = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };
        picNum = cnMap[m[1]] || 1;
      }
      const picIndex = picNum - 1;
      if (picIndex >= 0 && picIndex < attachments.length && attachments[picIndex]?.url) {
        if (!matchedImgs.includes(attachments[picIndex].url)) {
          matchedImgs.push(attachments[picIndex].url);
        }
      }
    });

    if (matchedImgs.length > 0) {
      return matchedImgs;
    }
    
    // 如果会话中有多张参考图（如商品图 + 人物模特一致性图），默认同时绑定前 2 张图，确保人物与商品同时一致！
    if (attachments.length >= 2) {
      return attachments.slice(0, 2).map(a => a.url);
    }
    
    return attachments[shotIndex]?.url ? [attachments[shotIndex].url] : (attachments[0]?.url ? [attachments[0].url] : []);
  };

  // 🌟 通路 1: 扫描所有代码块 (高优先级，支持 text/prompt/markdown/空标签代码块)
  const codeBlockRegex = /```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/gi;
  const directCodeShots: ParsedShotItem[] = [];
  let cbMatch: RegExpExecArray | null;

  while ((cbMatch = codeBlockRegex.exec(content)) !== null) {
    const rawCode = cbMatch[1].trim();
    const cleaned = cleanPromptText(rawCode);
    const isTrash = /复制给\s*(?:GPT|大模型|AI)|祝你数据长虹|推荐发布顺序/i.test(cleaned);
    if (cleaned.length > 10 && !isTrash) {
      // 🌟 从代码块向上倒序查找最近的一行分镜标题 (精准杜绝光圈快门参数 2.2、2.8 及开篇引导语)
      const textBefore = content.slice(Math.max(0, cbMatch.index - 400), cbMatch.index);
      const linesBefore = textBefore.trim().split('\n').map(l => l.trim()).filter(Boolean).reverse();
      
      let title = '';
      for (const line of linesBefore) {
        // 精准匹配以 📸 / 第X张 / 分镜X / 图X / 封面 / 场景 等开头的分镜主标题行
        const headingMatch = line.match(/^(?:#{1,4}\s*)?(?:[▍▎▏•\-\*]+|\*\*|【)?\s*(?:📸\s*)?(?:第\s*[\d一二三四五六七八九十]+\s*(?:张|分镜|画面|镜头|个)|分镜\s*[\d一二三四五六七八九十\.]+|Shot\s*\d+|图\s*\d+|封面|外观|细节|功能|实测|场景|特写|总结|穿搭)[：:\s\S]*/i);
        // 排除光圈/快门/ISO参数行 (如 2.2，1/125s 或 2.8，1/160s)
        if (headingMatch && !/^\d+[\.、]\d+/.test(line.replace(/^[#*•\-\s【▍▎▏|｜`]+/, ''))) {
          title = line.replace(/^[#*•\-\s【▍▎▏|｜`]+|[#*•\-\s】|｜`]+$/g, '').slice(0, 48);
          break;
        }
      }

      if (!title) {
        const explicitLine = linesBefore.find(l => /(?:第\s*[\d一二三四五六七八九十]+\s*张|📸|分镜\s*\d+)/.test(l));
        if (explicitLine && !/^\d+[\.、]\d+/.test(explicitLine.replace(/^[#*•\-\s【▍▎▏|｜`]+/, ''))) {
          title = explicitLine.replace(/^[#*•\-\s【▍▎▏|｜`]+|[#*•\-\s】|｜`]+$/g, '').slice(0, 48);
        } else {
          title = `📸 第 ${directCodeShots.length + 1} 张分镜`;
        }
      }

      const arMatch = rawCode.match(/--ar\s+([0-9:]+)/);
      const aspectRatio = arMatch ? arMatch[1] : '3:4';
      const refImages = getRefImagesForShot(title, cleaned, directCodeShots.length);

      directCodeShots.push({
        id: `cb_shot_${directCodeShots.length}_${Date.now()}`,
        title,
        prompt: cleaned,
        aspectRatio,
        refImage: refImages[0] || undefined,
        refImages: refImages
      });
    }
  }

  if (directCodeShots.length >= 1) {
    return directCodeShots;
  }

  // 🌟 通路 2: 全面 Markdown Section 多级拆解
  const splitRegex = /(?=(?:#{1,4}\s*(?:📸\s*)?|(?:\*\*|【)|(?:^|\n)\s*[▍▎▏•\-*]?\s*)(?:第\s*\d+\s*张|分镜\s*[\d一二三四五六七八九十]+|图\s*\d+|画面\s*\d+|方案\s*\d+|镜头\s*\d+|Shot\s*\d+|\d+[\.、]\s*|封面|配图|外观|细节|功能|实测|场景|特写|对比|包装))/m;
  const rawSections = content.split(splitRegex);
  const sections = rawSections.length > 1 ? rawSections : [content];
  const sectionShots: ParsedShotItem[] = [];

  sections.forEach((sec, idx) => {
    // 过滤纯说明类段落
    if (
      /^(?:推荐发布顺序|配套小红书标题|发布小建议|排版建议|注意事项清单|操作指南|祝你数据长虹)/i.test(sec.trim()) &&
      !/提示词|Prompt|--ar|```/i.test(sec)
    ) {
      return;
    }

    // 提取代码块中提示词
    const codeMatch = sec.match(/```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/);
    // 提取引用块中提示词
    const quoteMatch = sec.match(/>\s*([^\n]+(?:\n>[^\n]+)*)/);
    // 提取冒号后的提示词
    const colonMatch = sec.match(/(?:(?:DALL-E(?:\s*3)?|Midjourney|MJ|SD|生图|绘图|核心|英文|中文)?\s*(?:提示词|Prompt)|画面描述|视觉呈现|生图指令|文生图)\s*[：:]\s*(?:>)?\s*([\s\S]+?)(?=\n\n\S|\n#{1,4}|\n▍|$)|\b(Prompt\s*[:：]\s*[\s\S]+)/i);

    let promptText = '';
    if (codeMatch) {
      promptText = codeMatch[1].trim();
    } else if (quoteMatch) {
      promptText = quoteMatch[1].replace(/\n>\s*/g, ' ').trim();
    } else if (colonMatch) {
      promptText = (colonMatch[1] || colonMatch[2] || '').replace(/^Prompt\s*[:：]\s*/i, '').trim();
    }

    if (!promptText && (sec.includes('--ar') || sec.includes('realistic') || sec.includes('photography') || sec.includes('画面展示') || sec.includes('以用户提供的'))) {
      const lineMatch = sec.split('\n').find(l => l.includes('--ar') || l.includes('realistic') || l.includes('photography') || l.includes('高清') || l.includes('摄影') || l.includes('画面展示') || l.includes('以用户提供的'));
      if (lineMatch) {
        promptText = lineMatch.replace(/^[>\s*•\-▍▎▏]+/, '').trim();
      }
    }

    const cleanedPrompt = cleanPromptText(promptText);
    const isConversationalTrash = /复制给\s*(?:GPT|大模型|AI)|祝你数据长虹|推荐发布顺序/i.test(cleanedPrompt);

    if (cleanedPrompt && cleanedPrompt.length > 10 && !isConversationalTrash) {
      const linesInSec = sec.trim().split('\n').map(l => l.trim()).filter(Boolean);
      let title = '';
      for (const line of linesInSec) {
        const headingMatch = line.match(/^(?:#{1,4}\s*)?(?:[▍▎▏•\-\*]+|\*\*|【)?\s*(?:📸\s*)?(?:第\s*[\d一二三四五六七八九十]+\s*(?:张|分镜|画面|镜头|个)|分镜\s*[\d一二三四五六七八九十\.]+|Shot\s*\d+|图\s*\d+|封面|外观|细节|功能|实测|场景|特写|总结|穿搭)[：:\s\S]*/i);
        if (headingMatch && !/^\d+[\.、]\d+/.test(line.replace(/^[#*•\-\s【▍▎▏|｜`]+/, ''))) {
          title = line.replace(/^[#*•\-\s【▍▎▏|｜`]+|[#*•\-\s】|｜`]+$/g, '').slice(0, 48);
          break;
        }
      }
      if (!title) {
        title = `📸 分镜 ${sectionShots.length + 1}`;
      }

      const arMatch = promptText.match(/--ar\s+([0-9:]+)/);
      const aspectRatio = arMatch ? arMatch[1] : '3:4';
      const refImages = getRefImagesForShot(title, cleanedPrompt, sectionShots.length);

      sectionShots.push({
        id: `shot_${idx}_${sectionShots.length}_${Date.now()}`,
        title: title,
        prompt: cleanedPrompt,
        aspectRatio: aspectRatio,
        refImage: refImages[0] || undefined,
        refImages: refImages
      });
    }
  });

  if (sectionShots.length > 0) {
    return sectionShots;
  }

  // 🌟 通路 3: 提取所有 `> ...` 引用块
  const allQuotes = content.match(/>\s*([^\n]+(?:\n>[^\n]+)*)/g);
  if (allQuotes && allQuotes.length > 0) {
    const quoteShots: ParsedShotItem[] = [];
    allQuotes.forEach((q, qIdx) => {
      const text = cleanPromptText(q.replace(/^>\s*/, '').replace(/\n>\s*/g, ' '));
      const isTrash = /复制给\s*(?:GPT|大模型|AI)|祝你数据长虹|推荐发布顺序/i.test(text);
      if (text.length > 10 && !isTrash) {
        const arMatch = text.match(/--ar\s+([0-9:]+)/);
        const refImages = getRefImagesForShot(`图${qIdx + 1}`, text, qIdx);
        quoteShots.push({
          id: `quote_shot_${qIdx}_${Date.now()}`,
          title: `📸 第 ${qIdx + 1} 张分镜`,
          prompt: text,
          aspectRatio: arMatch ? arMatch[1] : '3:4',
          refImage: refImages[0] || undefined,
          refImages: refImages
        });
      }
    });
    if (quoteShots.length > 0) {
      return quoteShots;
    }
  }

  return [];
}

