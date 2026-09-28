import { isSeedance, isSeedance25 } from '@shared/domain/media/videoCapabilities';

export function CanvasVideoPromptGuide({ model, mode }: { model: string; mode: string }) {
  const workflow = mode === 'edit' ? '说明要编辑哪个视频、修改哪些元素，以及哪些内容必须保留。'
    : mode === 'extend' ? '说明要延长哪个视频，接着写后续动作、镜头和声音；避免重新描述整段剧情。'
    : mode === 'first_frame' || mode === 'first_last_frame' ? '图片决定起始或结束画面，文字重点描述中间发生的动作、变化和运镜。'
    : '先写主体、场景与动作，再补镜头、风格和声音；每个参考素材明确说明用途。';
  const timing = isSeedance25(model) ? '多镜头可用 0–5 秒、5–10 秒等整数时间段；安排要与所选总时长一致。'
    : isSeedance(model) ? '多镜头按“镜头一、镜头二”描述先后关系，不依赖精确秒点控制。'
    : '一个镜头聚焦一个主要动作，避免同时给出相互矛盾的运镜要求。';
  return <details className="mb-2 text-[11px] leading-relaxed text-slate-500">
    <summary className="w-fit cursor-pointer select-none text-slate-400 hover:text-slate-700">提示词写法</summary>
    <div className="mt-2 space-y-1 rounded-lg bg-slate-50 p-3"><p>{workflow}</p><p>{timing}</p>
      <p>图片与视频分别编号；用 @ 选择素材，例如“@图片1 提供人物外观，@视频1 提供动作参考”。台词注明说话人，并用引号包围。</p>
    </div>
  </details>;
}
