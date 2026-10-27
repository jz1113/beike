import type { SalesImageRef, VideoSalesScript } from '@shared/domain/sales';
import type { VideoSalesStudioState } from '../model/salesStudioDraft';
import { salesProductProfile } from '../model/salesProductProfile';
import { SalesScriptOutline } from './salesPlanning';
import { SalesVideoMaterials } from './SalesVideoMaterials';

/** All creative stages share the same product, outline and material tray. */
export function SalesResultSidebar({ script, productImages, state }: { script: VideoSalesScript; productImages: SalesImageRef[]; state?: VideoSalesStudioState }) {
  const profile = state ? salesProductProfile({ ...state, images: productImages, isCollected: state.collectionSource !== undefined || state.detailsMissing !== undefined || state.fromCache !== undefined }) : null;
  return <div className="sales-workflow-sidebar">
    {state && <header className="sales-sidebar-identity">
      <h2 title={state.productName} className="line-clamp-2 text-sm font-semibold leading-6">{state.productName || '当前商品'}</h2>
      <dl aria-label="商品与视频参数" className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
        <div title={profile?.sku || '未确认'} className="sales-sidebar-pill min-w-0 flex-1"><dt>SKU</dt><dd className="truncate">{profile?.sku || '未确认'}</dd></div>
        <div className="sales-sidebar-pill shrink-0"><dt>目标时长</dt><dd>{state.targetDuration}s</dd></div>
        <div className="sales-sidebar-pill shrink-0"><dt>画面比例</dt><dd>{state.aspectRatio}</dd></div>
      </dl>
    </header>}
    <div className="sales-sidebar-outline"><SalesScriptOutline script={script} productImages={productImages} showPlannedAssets={false} timeline /></div>
    <SalesVideoMaterials script={script} productImages={productImages} />
  </div>;
}
