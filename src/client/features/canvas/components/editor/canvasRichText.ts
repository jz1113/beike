/** Persist only editor formatting; never restore executable or externally loaded markup. */
export function cleanTextHtml(html: string) {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const output = document.createElement('div');
  const allowed = new Set(['P', 'DIV', 'BR', 'H1', 'H2', 'H3', 'STRONG', 'B', 'EM', 'I', 'UL', 'OL', 'LI', 'HR', 'SPAN', 'FONT']);
  const copy = (node: Node, parent: HTMLElement) => {
    if (node.nodeType === Node.TEXT_NODE) { parent.append(document.createTextNode(node.textContent || '')); return; }
    if (!(node instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(node.tagName)) return;
    const target = allowed.has(node.tagName) ? document.createElement(node.tagName === 'FONT' ? 'span' : node.tagName.toLowerCase()) : parent;
    if (target !== parent) {
      const color = node.style.color || node.getAttribute('color');
      if (color && CSS.supports('color', color)) target.style.color = color;
      if (node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) target.style.fontWeight = 'bold';
      if (node.style.fontStyle === 'italic') target.style.fontStyle = 'italic';
      parent.append(target);
    }
    node.childNodes.forEach(child => copy(child, target));
  };
  source.body.childNodes.forEach(child => copy(child, output));
  return output.innerHTML;
}

export function plainTextHtml(text: string) {
  const root = document.createElement('div');
  for (const line of text.split('\n')) {
    const p = document.createElement('p');
    p.textContent = line;
    if (!line) p.append(document.createElement('br'));
    root.append(p);
  }
  return root.innerHTML;
}
