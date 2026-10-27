import { ArrowRight, ChevronDown, FolderOpen, Layers, Settings2 } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import type { DeconstructQueueApi } from '../../hooks/useDeconstructQueue';
import { DeconstructCategoryPicker } from './DeconstructCategoryPicker';

export function DeconstructImportSettings({ queueApi, disabled }: { queueApi: DeconstructQueueApi; disabled: boolean }) {
  const {
    targetCategory, setTargetCategory, targetSubcategory, setTargetSubcategory, productCategories, targetSelectionInvalid,
    selectedVisionModel, setSelectedVisionModel, multimodalModels, queueConcurrency, handleQueueConcurrencyChange,
  } = queueApi;

  return (
    <aside className="deconstruct-import-settings" aria-label="归档与分析设置">
      <details className="deconstruct-settings-disclosure" open>
        <summary><Settings2 size={15} /><span>归档与分析</span><ChevronDown size={15} /></summary>
        <div className="deconstruct-settings-body">
          <div className="deconstruct-settings-section">
            <h3><FolderOpen size={14} />归档位置</h3>
            <DeconstructCategoryPicker value={targetCategory} onChange={setTargetCategory} subcategory={targetSubcategory}
              onSubcategoryChange={setTargetSubcategory} categories={productCategories} disabled={disabled} />
            {targetSelectionInvalid && (
              <p className="deconstruct-settings-error" role="alert">归档位置已失效，请重新选择。
                <button type="button" onClick={() => setTargetCategory(targetCategory)}>清除失效选择</button>
              </p>
            )}
          </div>
          <div className="deconstruct-settings-section">
            <h3><Layers size={14} />视觉分析</h3>
            <div className="deconstruct-setting-field">
              <span>分析模型</span>
              <ConfiguredModelPicker ariaLabel="反推视觉模型" options={multimodalModels} value={selectedVisionModel}
                onChange={setSelectedVisionModel} disabled={disabled} modalityKind="chat" isUp className="deconstruct-setting-select" />
            </div>
            <fieldset className="deconstruct-concurrency" disabled={disabled}>
              <legend>同时处理的图组</legend>
              <div>
                {[1, 2, 4, 8].map(value => (
                  <label key={value}>
                    <input type="radio" name="deconstruct-concurrency" aria-label={`同时处理 ${value} 组`} value={value}
                      checked={queueConcurrency === value} onChange={() => handleQueueConcurrencyChange(value)} />
                    <span>{value}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="deconstruct-grouping-guide">
            <div className="deconstruct-grouping-visual" aria-hidden="true"><span /><span /><span /><span /><ArrowRight size={13} /><Layers size={19} /></div>
            <strong>4 张图片，1 组创作参考</strong>
            <p>自动整理图组，反推画面与提示词，<br />沉淀到你的素材库。</p>
          </div>
        </div>
      </details>
    </aside>
  );
}
