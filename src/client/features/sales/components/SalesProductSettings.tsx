import { useEffect, useRef } from 'react';
import { Link2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { SALES_PRODUCT_AUDIENCE_OPTIONS, SALES_PRODUCT_CATEGORIES, type AppearanceAudience, type VideoSalesCategory } from '@shared/domain/sales';
import { hasSalesCollection, type SalesCollectionState } from '../model/salesCollectionDraft';
import { salesFocusClass, salesGhostButtonClass, salesInputClass, salesPrimaryButtonClass } from './salesChrome';

interface Props {
  state: SalesCollectionState;
  profile: { sku: string; specification: string };
  imageUrl?: string;
  disabled: boolean;
  onChange: (patch: Partial<SalesCollectionState>) => void;
  onClose: () => void;
  onCollect?: () => void;
  onChangeLink: () => void;
  onResetProduct?: () => void;
}

export function SalesProductSettings({ state, profile, imageUrl, disabled, onChange, onClose, onCollect, onChangeLink, onResetProduct }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  const closeDialog = () => { dialog.current?.close(); onClose(); };
  const runAndClose = (action: () => void) => { closeDialog(); action(); };
  return (
    <dialog ref={dialog} className="sales-product-settings-dialog" aria-labelledby="sales-product-settings-title" aria-describedby="sales-product-settings-description" onCancel={(event) => { event.preventDefault(); closeDialog(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeDialog();
    }}>
      <header>
        <div><h2 id="sales-product-settings-title">商品设置</h2><p id="sales-product-settings-description">管理商品信息与采集来源</p></div>
        <button type="button" aria-label="关闭商品设置" title="关闭商品设置" onClick={closeDialog} className={`sales-product-settings-close ${salesFocusClass}`}><X size={16} aria-hidden /></button>
      </header>
      <div className="sales-product-settings-fields">
        <div className="sales-product-settings-identity">
          {imageUrl && <img src={proxyMediaUrl(imageUrl, { thumb: true, width: 160 })} alt="" aria-hidden />}
          <label>商品名称<textarea rows={3} value={state.productName} disabled={disabled} onChange={(event) => onChange({ productName: event.target.value })} className={salesInputClass} placeholder="填写商品名称" /></label>
        </div>
        <div className="sales-product-settings-classification">
          <label>商品分类<select aria-label="商品品类" disabled={disabled} value={state.category} onChange={(event) => onChange({ category: event.target.value as VideoSalesCategory, categorySource: 'manual' })} className={salesInputClass}>
            {SALES_PRODUCT_CATEGORIES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
          <label>适用人群<select aria-label="适用人群" disabled={disabled} value={state.audience} onChange={(event) => onChange({ audience: event.target.value as AppearanceAudience, audienceSource: 'manual' })} className={salesInputClass}>
            {SALES_PRODUCT_AUDIENCE_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select></label>
        </div>
        <details className="sales-product-settings-details">
          <summary className={salesFocusClass}>商品详情与来源</summary>
          <dl>
            {profile.sku && <><dt>SKU</dt><dd>{profile.sku}</dd></>}
            {state.brand && <><dt>品牌</dt><dd>{state.brand}</dd></>}
            {profile.specification && <><dt>规格</dt><dd>{profile.specification}</dd></>}
            {state.collectedProductUrl && <><dt>来源</dt><dd>{state.collectedProductUrl}</dd></>}
            {!profile.sku && !state.brand && !profile.specification && !state.collectedProductUrl && <><dt>来源</dt><dd>本地上传商品</dd></>}
          </dl>
        </details>
        <section className="sales-product-settings-management" aria-label="商品操作">
          <h3>商品操作</h3>
          <div className="sales-product-settings-actions">
            {onCollect && <button type="button" disabled={disabled} onClick={() => runAndClose(onCollect)} className={salesGhostButtonClass}><RefreshCw size={13} aria-hidden />更新采集</button>}
            <button type="button" disabled={disabled} onClick={() => runAndClose(onChangeLink)} className={salesGhostButtonClass}><Link2 size={13} aria-hidden />换商品链接</button>
          </div>
        </section>
      </div>
      <footer>
        {onResetProduct && <button type="button" disabled={disabled || !hasSalesCollection(state)} onClick={() => runAndClose(onResetProduct)} className={`sales-product-settings-reset ${salesFocusClass}`}><RotateCcw size={13} aria-hidden />清空当前商品</button>}
        <div className="sales-product-settings-finish"><span>修改即时生效</span><button type="button" onClick={closeDialog} className={salesPrimaryButtonClass}>完成</button></div>
      </footer>
    </dialog>
  );
}
