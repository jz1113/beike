/** 与 MarkdownBody 同一套排版规则，复制时只保留屏幕上能看到的文字。 */

export type InlinePiece =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'code'; text: string };

export function normalizeMarkdownSource(content: string): string {
  return (content || '')
    .replace(/\*\*(.*?):\s*\*\*/g, '**$1:**')
    .replace(/\*\*(.*?)\s*\*\*/g, '**$1**');
}

export function tokenizeInline(text: string): InlinePiece[] {
  if (!text) return [];
  const pieces: InlinePiece[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    const codeIdx = remaining.indexOf('`');
    const boldIdx1 = remaining.indexOf('**');
    const boldIdx2 = remaining.indexOf('__');

    let italicIdx = -1;
    for (let k = 0; k < remaining.length; k++) {
      if (remaining[k] === '*' && remaining[k + 1] !== '*' && (k === 0 || remaining[k - 1] !== '*')) {
        const closeK = remaining.indexOf('*', k + 1);
        if (closeK !== -1 && remaining[closeK + 1] !== '*' && remaining[closeK - 1] !== '*') {
          italicIdx = k;
          break;
        }
      }
    }

    const validIndices = [
      codeIdx !== -1 ? { type: 'code', idx: codeIdx } : null,
      boldIdx1 !== -1 ? { type: 'bold_star', idx: boldIdx1 } : null,
      boldIdx2 !== -1 ? { type: 'bold_under', idx: boldIdx2 } : null,
      italicIdx !== -1 ? { type: 'italic', idx: italicIdx } : null,
    ].filter((item): item is { type: string; idx: number } => item !== null);

    if (validIndices.length === 0) {
      pieces.push({ type: 'text', text: remaining.replace(/\*\*/g, '') });
      break;
    }

    validIndices.sort((a, b) => a.idx - b.idx);
    const earliest = validIndices[0];

    if (earliest.idx > 0) {
      pieces.push({ type: 'text', text: remaining.slice(0, earliest.idx).replace(/\*\*/g, '') });
      remaining = remaining.slice(earliest.idx);
    }

    if (earliest.type === 'code') {
      const endIdx = remaining.indexOf('`', 1);
      if (endIdx !== -1) {
        pieces.push({ type: 'code', text: remaining.slice(1, endIdx) });
        remaining = remaining.slice(endIdx + 1);
      } else {
        pieces.push({ type: 'text', text: '`' });
        remaining = remaining.slice(1);
      }
    } else if (earliest.type === 'bold_star' || earliest.type === 'bold_under') {
      const marker = earliest.type === 'bold_star' ? '**' : '__';
      const endIdx = remaining.indexOf(marker, 2);
      if (endIdx !== -1) {
        pieces.push({ type: 'bold', text: remaining.slice(2, endIdx) });
        remaining = remaining.slice(endIdx + 2);
      } else {
        pieces.push({ type: 'text', text: marker });
        remaining = remaining.slice(2);
      }
    } else {
      const endIdx = remaining.indexOf('*', 1);
      if (endIdx !== -1) {
        pieces.push({ type: 'italic', text: remaining.slice(1, endIdx) });
        remaining = remaining.slice(endIdx + 1);
      } else {
        pieces.push({ type: 'text', text: '*' });
        remaining = remaining.slice(1);
      }
    }
  }

  return pieces;
}

function inlinePlainText(text: string): string {
  return tokenizeInline(text).map(piece => piece.text).join('');
}

function isTableSeparator(str: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return false;
  const cells = trimmed.slice(1, -1).split('|');
  return cells.length > 0 && cells.every((cell) => /^[\s:-]+$/.test(cell.trim()) && cell.includes('-'));
}

function parseTableRow(str: string): string[] {
  const trimmed = str.trim();
  const withoutEnds = trimmed.startsWith('|') && trimmed.endsWith('|')
    ? trimmed.slice(1, -1)
    : trimmed;
  return withoutEnds.split('|').map((cell) => cell.trim());
}

function visibleLine(line: string): string {
  if (line.startsWith('#### ')) return inlinePlainText(line.slice(5));
  if (line.startsWith('### ')) return inlinePlainText(line.slice(4));
  if (line.startsWith('## ')) return inlinePlainText(line.slice(3));
  if (line.startsWith('# ')) return inlinePlainText(line.slice(2));
  if (line.startsWith('> ')) return inlinePlainText(line.slice(2).trim());

  const bulletMatch = line.match(/^(\s*)[*\-+•·]\s+(.*)$/);
  if (bulletMatch) return inlinePlainText(bulletMatch[2]);

  const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)$/);
  if (numMatch) return `${numMatch[2]} ${inlinePlainText(numMatch[3])}`;

  return inlinePlainText(line);
}

/** 把助手回复的 Markdown 收成和气泡里一样的纯文本，供复制后粘贴。 */
export function visibleMarkdownText(content: string): string {
  const lines = normalizeMarkdownSource(content).split('\n');
  const out: string[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  const pushCode = (incomplete: boolean) => {
    const text = incomplete ? codeBlockLines.join('\n') : codeBlockLines.join('\n').trim();
    if (text) out.push(text);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        pushCode(false);
        inCodeBlock = false;
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|') && !isTableSeparator(lines[j])) {
        rows.push(parseTableRow(lines[j]));
        j++;
      }
      i = j - 1;
      const renderRow = (cells: string[]) => cells.map(cell => inlinePlainText(cell)).join('\t');
      out.push([renderRow(headers), ...rows.map(renderRow)].join('\n'));
      continue;
    }

    if (line.trim() === '---' || line.trim() === '***' || line.trim() === '___') continue;
    if (!line.trim()) continue;
    out.push(visibleLine(line));
  }

  if (inCodeBlock && codeBlockLines.length) pushCode(true);
  return out.join('\n').trim();
}
