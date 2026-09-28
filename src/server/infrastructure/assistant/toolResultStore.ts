/** Turn-local output storage; exposes bounded excerpts instead of replaying large results every round. */
export class ToolResultStore {
  private values = new Map<string, string>();
  private size = 0;
  forModel(raw: string, threshold = 12_000): string {
    let text = raw;
    try {
      const parsed = JSON.parse(raw);
      // Images are delivered separately as multimodal content, never duplicated as base64 text.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && '_visualImages' in parsed) {
        delete parsed._visualImages;
        text = JSON.stringify(parsed);
      }
    } catch { /* Plain text output is valid. */ }
    if (text.length <= threshold) return text;
    if (this.size + text.length > 4_000_000) return JSON.stringify({ success: false, error: '本轮工具输出存储已满，请缩小查询范围。此结果未完整传入模型。' });
    const id = `result_${this.values.size + 1}`;
    this.values.set(id, text); this.size += text.length;
    return JSON.stringify({ storedResult: id, totalCharacters: text.length, preview: text.slice(0, Math.min(4000, Math.floor(threshold / 2))), instruction: '仅展示预览。使用 read_tool_result 按 result_id 和 offset 读取后续内容；需要全文处理时必须读取完整结果。' });
  }
  read(id: string, offset = 0, length = 4000): string {
    const value = this.values.get(id);
    if (value === undefined) return JSON.stringify({ success: false, error: '未找到本轮工具结果' });
    const start = Number.isFinite(offset) ? Math.max(0, Math.min(value.length, Math.floor(offset))) : 0;
    const size = Number.isFinite(length) ? Math.max(1, Math.min(8000, Math.floor(length))) : 4000;
    const end = Math.min(value.length, start + size);
    return JSON.stringify({ success: true, resultId: id, offset: start, nextOffset: end < value.length ? end : null, totalCharacters: value.length, excerpt: value.slice(start, end) });
  }
}
