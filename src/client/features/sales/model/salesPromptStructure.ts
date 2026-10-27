export interface SalesPromptSection { title: string; body: string }

/** Older prompts put every heading on one line. Structure them without changing the saved text. */
export function salesPromptSections(prompt: string): SalesPromptSection[] {
  const headings = [...prompt.matchAll(/【([^】\r\n]{1,48})】|^[ \t]*#{1,6}[ \t]+([^\r\n]+)/gm)];
  if (!headings.length) return prompt.trim() ? [{ title: '视频要求', body: prompt.trim() }] : [];
  const sections: SalesPromptSection[] = [];
  const intro = prompt.slice(0, headings[0].index).trim();
  if (intro) sections.push({ title: '视频要求', body: intro });
  headings.forEach((heading, index) => {
    sections.push({ title: (heading[1] || heading[2]).trim(), body: prompt.slice(heading.index + heading[0].length, headings[index + 1]?.index).trim() });
  });
  return sections;
}

/** Break dense prose at sentence boundaries; references and dialogue stay intact. */
export function salesPromptParagraphs(body: string): string[] {
  return body.split(/\r?\n+/).flatMap((line) => {
    const sentences = line.match(/[^。！？]+[。！？]?[”」』]?|[。！？]+/g) || [];
    const paragraphs: string[] = [];
    let current = '';
    for (const sentence of sentences) {
      if (current.length >= 140) { paragraphs.push(current); current = ''; }
      current += sentence;
    }
    if (current.trim()) paragraphs.push(current);
    return paragraphs;
  });
}
