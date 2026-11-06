import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { nativeCommerceTitles, type NativeCommerceKind } from '../../model/nativeCommerceProjects';

const descriptions: Record<NativeCommerceKind, string> = {
  sales: '用商品图制作分镜、首帧和视频，可另加旁白。',
  workshop: '生成商品场景图和发布文案。',
  poster: '用商品图和准确标题制作封面。',
};

export function CanvasCreateDialog({ legacySalesEntry, onClose, onCreate }: {
  legacySalesEntry?: boolean;
  onClose: () => void;
  onCreate: (kind?: NativeCommerceKind) => void;
}) {
  const dialog = useModalDialog(true, onClose);
  const option = 'grid gap-1 rounded-lg border border-slate-200 px-3 py-2 text-left hover:bg-slate-100 dark:border-white/15 dark:hover:bg-white/10';
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label="新建画布" tabIndex={-1}
      className="grid max-h-[85dvh] w-full max-w-md gap-3 overflow-y-auto rounded-2xl bg-white p-4 text-sm text-slate-900 shadow-xl dark:bg-[#202023] dark:text-stone-200">
      <h2 className="text-base font-semibold">新建画布</h2>
      {legacySalesEntry && <p>电商视频已迁入画布。选择「商品短片」开始，或取消后从项目库打开已有画布。</p>}
      <div className="grid gap-2">
        {(Object.keys(nativeCommerceTitles) as NativeCommerceKind[]).map(kind =>
          <button key={kind} type="button" className={option} onClick={() => onCreate(kind)}>
            <strong>{nativeCommerceTitles[kind]}</strong>
            <span>{descriptions[kind]}</span>
          </button>
        )}
        <button type="button" className={option} onClick={() => onCreate()}>空白画布</button>
      </div>
      <button type="button" className="justify-self-end rounded-lg px-3 py-2 hover:bg-slate-100 dark:hover:bg-white/10" onClick={onClose}>取消</button>
    </div>
  </div>;
}
