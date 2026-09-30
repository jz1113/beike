import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Edit3, ShieldAlert, Sparkles, User } from 'lucide-react';
import type { BrandKitProfile } from '@shared/domain/products/brandKitModels';

interface Props {
  formData: BrandKitProfile;
  setFormData: Dispatch<SetStateAction<BrandKitProfile>>;
  onSave: (event: FormEvent) => void;
  onCancel: () => void;
}

export default function BrandKitEditor({ formData, setFormData, onSave, onCancel }: Props) {
  return (
  <form onSubmit={onSave} className="space-y-5">
    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
      <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
        <Edit3 className="w-4 h-4 text-red-500" /> 编辑品牌资产
      </h4>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
        >
          取消
        </button>
        <button
          type="submit"
          className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-sm cursor-pointer"
        >
          保存配置
        </button>
      </div>
    </div>

    {/* 基础信息 */}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          品牌资产名称
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={e => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-red-500 focus:outline-none"
          placeholder="如: 数码科技 · 极简冷灰"
          required
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          分类标签 / 品类
        </label>
        <input
          type="text"
          value={formData.badge || ''}
          onChange={e => setFormData({ ...formData, badge: e.target.value })}
          className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-red-500 focus:outline-none"
          placeholder="如: 3C数码 / 美妆护肤"
        />
      </div>
    </div>

    {/* 品牌视觉基调 */}
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-500" /> 品牌视觉基调 (Brand Tone)
      </label>
      <textarea
        rows={2}
        value={formData.brandTone}
        onChange={e => setFormData({ ...formData, brandTone: e.target.value })}
        className="soft-textarea w-full px-3 py-2 text-xs"
        placeholder="如: 现代极简商务科技风，硬朗细腻光泽，冷暖光影对比，高端克制美学"
      />
    </div>

    {/* 专属虚拟模特 DNA */}
    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
      <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
        <User className="w-3.5 h-3.5 text-indigo-500" /> 专属虚拟模特 DNA (锁定人物一致性)
      </h5>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">年龄与群体</label>
          <input
            type="text"
            value={formData.modelDna?.ageGroup || ''}
            onChange={e => setFormData({
              ...formData,
              modelDna: { ...formData.modelDna!, ageGroup: e.target.value }
            })}
            className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-slate-200"
            placeholder="如: 25~28岁东亚干练职场人"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">面容五官特征</label>
          <input
            type="text"
            value={formData.modelDna?.ethnicity || ''}
            onChange={e => setFormData({
              ...formData,
              modelDna: { ...formData.modelDna!, ethnicity: e.target.value }
            })}
            className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-slate-200"
            placeholder="如: 自然清秀东亚面孔，高鼻梁"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">发型发色</label>
          <input
            type="text"
            value={formData.modelDna?.hairStyle || ''}
            onChange={e => setFormData({
              ...formData,
              modelDna: { ...formData.modelDna!, hairStyle: e.target.value }
            })}
            className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-slate-200"
            placeholder="如: 黑色及肩内扣短发"
          />
        </div>
        <div>
          <label className="block text-[11px] text-slate-500 mb-1">妆容与穿搭体系</label>
          <input
            type="text"
            value={formData.modelDna?.makeupAndOutfit || ''}
            onChange={e => setFormData({
              ...formData,
              modelDna: { ...formData.modelDna!, makeupAndOutfit: e.target.value }
            })}
            className="w-full px-2.5 py-1.5 text-xs bg-white rounded-lg border border-slate-200"
            placeholder="如: 清爽通透职场淡妆，浅灰色修身西装"
          />
        </div>
      </div>
    </div>

    {/* 全局避坑负向规约 */}
    <div>
      <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-red-500" /> 全局避坑规约 (用逗号分隔)
      </label>
      <input
        type="text"
        value={formData.negativeRules?.join('、') || ''}
        onChange={e => setFormData({
          ...formData,
          negativeRules: e.target.value.split(/[，,、]/).map(s => s.trim()).filter(Boolean)
        })}
        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-red-500 focus:outline-none"
        placeholder="如: 严禁塑料反光感、严禁暗角、严禁假人假脸"
      />
    </div>
  </form>
  );
}
