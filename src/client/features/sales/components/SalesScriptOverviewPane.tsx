import type { SalesScriptDomain, SalesScriptFormat, SalesScriptVoiceMode } from '@shared/domain/sales';
import type { ScriptTaxonomyItem, ScriptTaxonomyKind } from '@shared/contracts/salesScriptTaxonomy';
import { SalesScriptTaxonomyFields } from './SalesScriptTaxonomyFields';
import { salesInputClass } from './salesChrome';

interface Props {
  script: SalesScriptDomain;
  taxonomyItems: readonly ScriptTaxonomyItem[];
  taxonomyLoading: boolean;
  onManageTaxonomy: (kind: ScriptTaxonomyKind) => void;
  onCreateTaxonomy?: (kind: ScriptTaxonomyKind, name: string) => Promise<ScriptTaxonomyItem | null>;
  onChange: (next: SalesScriptDomain) => void;
}

export function SalesScriptOverviewPane({ script, onChange, taxonomyItems, taxonomyLoading, onManageTaxonomy, onCreateTaxonomy }: Props) {
  return (
    <aside className="sales-reviewer-left" aria-label="全局模板设定">
      <section className="sales-reviewer-card">
        <label className="sales-beat-field-label">脚本标题
          <input value={script.title} maxLength={120} onChange={(e) => onChange({ ...script, title: e.target.value })} aria-label="脚本标题" className={salesInputClass} />
        </label>

        <SalesScriptTaxonomyFields value={script.taxonomy} items={taxonomyItems} disabled={taxonomyLoading} onManage={onManageTaxonomy} onCreate={onCreateTaxonomy} onChange={(patch) => onChange({ ...script, taxonomy: { ...script.taxonomy, ...patch } })} />

        <div className="sales-script-global-options">
          <label className="sales-beat-field-label">剪辑结构
            <select aria-label="剪辑结构" value={script.visualSpec.oneTake ? 'oneTake' : 'cuts'} onChange={(e) => onChange({ ...script, visualSpec: { ...script.visualSpec, oneTake: e.target.value === 'oneTake' } })} className={salesInputClass}>
              <option value="cuts">多机位切镜头剪辑</option>
              <option value="oneTake">一镜到底（连续推拉不切镜）</option>
            </select>
          </label>
          <label className="sales-beat-field-label">声音模式
            <select aria-label="声音模式" value={script.voiceMode} onChange={(e) => {
              const voiceMode = e.target.value as SalesScriptVoiceMode;
              onChange({ ...script, voiceMode, assetSlots: { ...script.assetSlots, audio: { ...script.assetSlots.audio, voiceMode: voiceMode === 'mixed' ? 'speech' : voiceMode } } });
            }} className={salesInputClass}>
              <option value="speech">真人口播讲解</option>
              <option value="voiceover">音色库画外旁白</option>
              <option value="mixed">口播 + 旁白交替</option>
              <option value="none">纯 BGM 无口播</option>
            </select>
          </label>
          <label className="sales-beat-field-label">出镜形式
            <select aria-label="出镜形式" value={script.format} onChange={(e) => onChange({ ...script, format: e.target.value as SalesScriptFormat })} className={salesInputClass}>
              <option value="presenter">真人模特出镜</option>
              <option value="hands">手部局部演示</option>
              <option value="product">纯商品静物/特写</option>
              <option value="mixed">混合出镜</option>
            </select>
          </label>
        </div>

        <label className="sales-beat-field-label">画面风格与光线
          <textarea rows={2} value={script.visualSpec.styleSummary} onChange={(e) => onChange({ ...script, visualSpec: { ...script.visualSpec, styleSummary: e.target.value } })} placeholder="如：现代生活方式Vlog风格，自然柔和侧逆光" aria-label="画面风格与光线" className={salesInputClass} />
        </label>
      </section>
    </aside>
  );
}
