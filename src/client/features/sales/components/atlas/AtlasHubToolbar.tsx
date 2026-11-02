import type { KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { AtlasPosesCatalog } from '@shared/contracts/salesAtlas';
import { POSE_ANGLE_FULL_LABELS, POSE_ANGLE_ORDER } from '../../model/salesActionViews';
import { salesFocusClass } from '../salesChrome';
import type { AtlasGridDensity } from './AtlasVirtualGrid';

interface Props {
  tab: 'face' | 'pose';
  pickerMode: 'import' | 'pick-persona-main';
  totalFacesCount: number;
  totalPosesCount: number;
  filteredFacesCount: number;
  filteredPosesCount: number;
  query: string;
  onQueryChange: (query: string) => void;
  density: AtlasGridDensity;
  onDensityChange: (density: AtlasGridDensity) => void;
  faceSection: string;
  onFaceSectionChange: (section: string) => void;
  faceHair: string;
  onFaceHairChange: (hair: string) => void;
  faceAudience: 'adult_female' | 'adult_male';
  onFaceAudienceChange: (audience: 'adult_female' | 'adult_male') => void;
  poseSeries: string;
  onPoseSeriesChange: (series: string) => void;
  poseCategory: string;
  onPoseCategoryChange: (category: string) => void;
  availablePoseCategories: AtlasPosesCatalog['categories'];
  preferredAngle: string;
  onPreferredAngleChange: (angle: string) => void;
  onSwitchTab: (tab: 'face' | 'pose') => void;
  disabled?: boolean;
}

function AtlasSelect({ label, value, onChange, options, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  disabled: boolean;
}) {
  return <label className="sales-atlas-select">
    <span>{label}</span>
    <select aria-label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={salesFocusClass}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>;
}

export function AtlasHubToolbar({
  tab, pickerMode, totalFacesCount, totalPosesCount, filteredFacesCount, filteredPosesCount,
  query, onQueryChange, density, onDensityChange, faceSection, onFaceSectionChange,
  faceHair, onFaceHairChange, faceAudience, onFaceAudienceChange, poseSeries, onPoseSeriesChange,
  poseCategory, onPoseCategoryChange, availablePoseCategories, preferredAngle, onPreferredAngleChange,
  onSwitchTab, disabled = false,
}: Props) {
  const tabs = pickerMode === 'import' ? ['face', 'pose'] as const : ['face'] as const;
  const handleTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const current = tabs.findIndex((value) => value === tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowRight' ? (current + 1) % tabs.length
        : event.key === 'ArrowLeft' ? (current + tabs.length - 1) % tabs.length : -1;
    if (next < 0) return;
    event.preventDefault();
    onSwitchTab(tabs[next]);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return <div className="sales-atlas-toolbar">
    <div className="sales-atlas-top-row">
      <div className="sales-atlas-tabs" role="tablist" aria-label="开源图鉴分类" onKeyDown={handleTabKey}>
        {tabs.map((value) => <button key={value} type="button" role="tab" aria-selected={tab === value}
          tabIndex={tab === value ? 0 : -1} disabled={disabled} onClick={() => onSwitchTab(value)}
          className={`sales-atlas-tab ${tab === value ? 'is-active' : ''} ${salesFocusClass}`}>
          {value === 'face' ? '人像图鉴' : '姿态图鉴'}
          <span className="sales-atlas-tab-count">{value === 'face' ? totalFacesCount : totalPosesCount}</span>
        </button>)}
      </div>
      <div className="sales-atlas-search">
        <Search size={14} aria-hidden />
        <input type="search" value={query} disabled={disabled} onChange={(event) => onQueryChange(event.target.value)}
          placeholder={tab === 'face' ? '搜索发型、造型或编号…' : '搜索动作名称或编号…'} aria-label="搜索开源图鉴" />
        {query && <button type="button" disabled={disabled} aria-label="清空图鉴搜索" onClick={() => onQueryChange('')} className={salesFocusClass}><X size={14} aria-hidden /></button>}
      </div>
    </div>
    <div className="sales-atlas-filter-row">
      <div className="sales-atlas-filter-fields">
        {tab === 'face' ? <>
          <AtlasSelect label="人像类型" value={faceSection} onChange={onFaceSectionChange} disabled={disabled} options={[
            { value: 'all', label: '全部人像' }, { value: 'face', label: '纯底正脸' }, { value: 'styling', label: '造型人像' },
          ]} />
          <AtlasSelect label="发型" value={faceHair} onChange={onFaceHairChange} disabled={disabled} options={[
            { value: 'all', label: '全部发型' }, { value: 'short', label: '短发' }, { value: 'medium', label: '中发' },
            { value: 'semilong', label: '中长发' }, { value: 'long', label: '长发' },
          ]} />
          {pickerMode === 'import' && <AtlasSelect label="导入到" value={faceAudience} disabled={disabled}
            onChange={(value) => onFaceAudienceChange(value as Props['faceAudience'])} options={[
              { value: 'adult_female', label: '成年女人物' }, { value: 'adult_male', label: '成年男人物' },
            ]} />}
        </> : <>
          <AtlasSelect label="姿态系列" value={poseSeries} onChange={onPoseSeriesChange} disabled={disabled} options={[
            { value: 'all', label: '全部系列' }, { value: 'full_std', label: '标准全身' }, { value: 'upper', label: '上半身特写' },
            { value: 'full_sexy', label: '时尚全身' }, { value: 'duo', label: '双人互动' },
          ]} />
          <AtlasSelect label="动作类别" value={poseCategory} onChange={onPoseCategoryChange} disabled={disabled}
            options={[{ value: 'all', label: '全部动作' }, ...availablePoseCategories.map((category) => ({ value: category.key, label: category.names.zh || category.key }))]} />
          <AtlasSelect label="默认机位" value={preferredAngle} onChange={onPreferredAngleChange} disabled={disabled}
            options={POSE_ANGLE_ORDER.map((angle) => ({ value: angle, label: POSE_ANGLE_FULL_LABELS[angle] }))} />
        </>}
      </div>
      <div className="sales-atlas-density" role="group" aria-label="图鉴卡片大小">
        {([{ value: 'sm', label: '紧凑' }, { value: 'md', label: '标准' }, { value: 'lg', label: '大图' }] as const).map(({ value, label }) => (
          <button key={value} type="button" disabled={disabled} aria-pressed={density === value} onClick={() => onDensityChange(value)}
            className={`${density === value ? 'is-active' : ''} ${salesFocusClass}`}>{label}</button>
        ))}
      </div>
      <span className="sales-atlas-result-count" role="status">{tab === 'face' ? `${filteredFacesCount} 张人像` : `${filteredPosesCount} 组姿态`}</span>
    </div>
  </div>;
}
