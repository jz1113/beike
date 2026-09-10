export interface DecomposedLayer {
  url: string; name: string; zIndex: number; width: number; height: number;
  bounds?: [number, number, number, number];
  placement?: 'separate';
}
export function parseDecomposedLayers(value: unknown): DecomposedLayer[] {
  let data = (value as {data?: unknown})?.data;
  if (data && !Array.isArray(data) && typeof data === 'object') data = (data as {data?:unknown}).data;
  if (!Array.isArray(data) || data.length < 2 || data.length > 17) throw new Error('接口未返回底图和独立图层，请确认网关支持图层拆分');
  // Gateways may return standard image results without native layer coordinates.
  const separate = data.every(item => item && item.z_index === undefined && item.bounding_box === undefined);
  const result = data.map((item, index): DecomposedLayer => {
    if (!item || typeof item !== 'object') throw new Error('图层响应无效');
    if (separate) {
      const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
      if (typeof url !== 'string' || !/^(https?:\/\/|data:image\/png;base64,)/.test(url)) throw new Error('图层图片地址无效');
      const size = typeof item.size === 'string' ? item.size.match(/^(\d+)x(\d+)$/) : null;
      return {url, name:item.name || `图层 ${index + 1}`, zIndex:index, width:size ? +size[1] : 0, height:size ? +size[2] : 0, placement:'separate'};
    }
    const size = typeof item.size === 'string' ? item.size.match(/^(\d+)x(\d+)$/) : null;
    const url = item.url || (item.b64_json ? `data:image/png;base64,${item.b64_json}` : '');
    const bounds = item.bounding_box?.absolute;
    if (!size || !Number.isInteger(item.z_index) || item.z_index < 0 || !/^(https?:\/\/|data:image\/png;base64,)/.test(url)) throw new Error('图层响应缺少有效的图片、尺寸或叠放顺序');
    if (item.z_index > 0 && (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite) || bounds[2] <= bounds[0] || bounds[3] <= bounds[1])) throw new Error('图层响应缺少有效位置坐标');
    if (+size[1] <= 0 || +size[2] <= 0) throw new Error('图层尺寸无效');
    return {url, name: item.name || (item.z_index === 0 ? '底图' : `图层 ${item.z_index}`), zIndex:item.z_index, width:+size[1], height:+size[2], ...(bounds ? {bounds} : {})};
  }).sort((a,b) => a.zIndex-b.zIndex);
  if (result[0].zIndex !== 0 || new Set(result.map(layer => layer.zIndex)).size !== result.length) throw new Error('图层缺少底图或叠放顺序重复');
  return result;
}
