import { PERSONA_CATEGORIES, personaGender, type PersonaCategory, personaGroupToDimensions } from '../model/salesPersonaClassification';
import { useEffect, useRef, useState } from 'react';
import { Check, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { StudioAudioPlayer } from '@client/shared/ui/studio/StudioAudioPlayer';
import { confirmAction } from '@client/shared/utils/confirmAction';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import { deleteSalesMaterial, deleteSalesSound, updateSalesMaterial, updateSalesSound } from '../api/salesMaterials';
import { buildActionDefaultAnglePatch } from '../model/salesActionViews';
import {
  mergeGroupTag, SCENE_SPACE_LABELS,
  type SalesMaterialCard, type SalesSceneSpace,
} from '../model/salesMaterialCatalog';
import { SalesActionAngleGallery } from './SalesActionAngleGallery';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import { SalesMaterialComplianceBadge } from './SalesMaterialComplianceBadge';
import { SalesLibrarySelect } from './SalesLibrarySelect';

interface Props {
  card: SalesMaterialCard;
  images: string[];
  actionCategories?: readonly ScriptTaxonomyItem[];
  onCreateActionCategory?: (name: string) => Promise<ScriptTaxonomyItem | null>;
  onClose: () => void;
  onChanged?: (notice?: string) => void;
  onConvert?: () => void;
}

export function SalesMaterialDetailDialog({
  card,
  images,
  actionCategories = [],
  onCreateActionCategory,
  onClose,
  onChanged,
  onConvert,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [tags, setTags] = useState((card.editableTags ?? card.tags).join('，'));
  const [personaGroup, setPersonaGroup] = useState<PersonaCategory>(card.personaGroup || 'female');
  const [sceneSpace, setSceneSpace] = useState<SalesSceneSpace>(card.sceneSpace || 'indoor');
  const [voiceGroup, setVoiceGroup] = useState<PersonaCategory>(card.voiceGroup || 'female');
  const [voiceId, setVoiceId] = useState(card.voiceId || '');
  const [actionCategoryId, setActionCategoryId] = useState(card.categoryId || '');
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [selectedAngle, setSelectedAngle] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const angleEntries = card.kind === 'action' && card.angleEntries && card.angleEntries.length > 1 ? card.angleEntries : [];
  const activeAngleEntry = angleEntries.length
    ? angleEntries.find((item) => item.angle === selectedAngle) || angleEntries.find((item) => item.isDefault) || angleEntries[0]
    : null;

  const applyDefaultAngle = async () => {
    if (!activeAngleEntry || pending) return;
    setPending(true);
    setError('');
    try {
      await updateSalesMaterial('action', card.id, buildActionDefaultAnglePatch(card.dimensions, activeAngleEntry.angle, activeAngleEntry.url));
      onChanged?.(`已将「${activeAngleEntry.label}」设为默认机位封面`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换默认机位失败');
    } finally {
      setPending(false);
    }
  };

  const canManage = card.editable !== false;
  const actionCategoryName = card.kind === 'action'
    ? (actionCategories.find((cat) => cat.id === (editing ? actionCategoryId : card.categoryId))?.name || '通用动作')
    : '';
  const eyebrowSuffix = card.kind === 'action'
    ? actionCategoryName
    : card.subBadge && card.subBadge !== card.badge
      ? card.subBadge
      : '';
  const visibleTags = card.kind === 'action' ? [] : card.tags;

  const submitNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || categoryBusy || !onCreateActionCategory) return;
    setCategoryBusy(true);
    void onCreateActionCategory(trimmed).then((created) => {
      if (created) {
        setActionCategoryId(created.id);
        setNewCategoryName('');
        setAddingCategory(false);
      }
    }).finally(() => setCategoryBusy(false));
  };

  const saveEdit = async () => {
    if (pending || !title.trim()) return;
    setPending(true);
    setError('');
    try {
      const trimmedTitle = title.trim();
      const trimmedDesc = description.trim();
      if (card.kind === 'persona') {
        const nextTags = mergeGroupTag(tags, PERSONA_CATEGORIES[personaGroup], Object.values(PERSONA_CATEGORIES));
        await updateSalesMaterial('persona', card.id, {
          name: trimmedTitle,
          description: trimmedDesc,
          tags: nextTags,
          dimensions: personaGroupToDimensions(card.dimensions, personaGroup),
        });
      } else if (card.kind === 'scene') {
        const nextTags = mergeGroupTag(tags, SCENE_SPACE_LABELS[sceneSpace], ['室内', '户外']);
        await updateSalesMaterial('scene', card.id, {
          title: trimmedTitle,
          description: trimmedDesc,
          tags: nextTags,
          spatialType: sceneSpace === 'outdoor' ? 'outdoor' : 'indoor_room',
        });
      } else if (card.kind === 'action') {
        await updateSalesMaterial('action', card.id, {
          title: trimmedTitle,
          // Renaming must preserve existing multi-category assignments.
          ...(actionCategoryId !== (card.categoryId || '') ? { productCategoryIds: JSON.stringify(actionCategoryId ? [actionCategoryId] : []) } : {}),
        });
      } else if (card.kind === 'sound') {
        const tagList = tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        await updateSalesSound(card.id, {
          soundType: card.soundType || 'voice',
          name: trimmedTitle,
          title: trimmedTitle,
          description: trimmedDesc,
          promptText: trimmedDesc,
          voiceGroup: card.soundType === 'voice' ? voiceGroup : undefined,
          voiceId: card.soundType === 'voice' ? voiceId.trim() : undefined,
          gender: card.soundType === 'voice' ? personaGender(voiceGroup) : undefined,
          tags: tagList,
          moodTags: tagList,
        });
      }
      setEditing(false);
      onChanged?.(`已更新「${trimmedTitle}」`);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存修改失败');
    } finally {
      setPending(false);
    }
  };

  const handleDelete = () => {
    if (pending || !canManage) return;
    void confirmAction({
      title: `删除「${card.title}」？`,
      confirmText: '确认删除',
      description: '删除后将从当前工作区移除，已绑定该资产的槽位会自动解绑。',
    }).then(async (ok) => {
      if (!ok) return;
      setPending(true);
      setError('');
      try {
        if (card.kind === 'sound') {
          await deleteSalesSound(card.id);
        } else {
          await deleteSalesMaterial(card.kind, card.id);
        }
        onChanged?.(`已删除「${card.title}」`);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : '删除失败');
      } finally {
        setPending(false);
      }
    });
  };

  const isCompactDialog = card.kind === 'action';
  const cancelEdit = () => {
    setEditing(false);
    setTitle(card.title);
    setDescription(card.description);
    setTags((card.editableTags ?? card.tags).join('，'));
    setPersonaGroup(card.personaGroup || 'female');
    setSceneSpace(card.sceneSpace || 'indoor');
    setVoiceGroup(card.voiceGroup || 'female');
    setVoiceId(card.voiceId || '');
    setActionCategoryId(card.categoryId || '');
    setAddingCategory(false);
    setNewCategoryName('');
    setError('');
  };
  const nameField = (
    <label className="sales-material-name-field">
      {isCompactDialog ? '素材名称' : '资产名称'}
      <input autoFocus={isCompactDialog} required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} className={salesInputClass} disabled={pending} />
    </label>
  );

  return (
    <dialog
      ref={dialog}
      className={`sales-material-dialog ${isCompactDialog ? 'is-compact-action' : ''} ${isCompactDialog && editing ? 'is-action-editing' : ''}`}
      aria-labelledby={isCompactDialog && editing ? 'sales-material-edit-title' : 'sales-material-detail-title'}
      onClick={(e) => { if (e.target === e.currentTarget && !pending && !categoryBusy && !editing) onClose(); }}
      onCancel={(e) => { e.preventDefault(); if (!pending && !categoryBusy) { if (isCompactDialog && editing) cancelEdit(); else onClose(); } }}
    >
      {isCompactDialog && editing && (
        <header className="sales-material-edit-header">
          <h2 id="sales-material-edit-title">编辑动作资料</h2>
          <button type="button" aria-label="关闭编辑" disabled={pending || categoryBusy} onClick={cancelEdit} className={`sales-modal-close ${salesFocusClass}`}><X size={18} /></button>
        </header>
      )}
      <div className={`sales-material-detail-preview ${card.video || images.length > 0 ? 'has-media' : ''}`}>
        {!(isCompactDialog && editing) && <div className="sales-prod-card-head !mb-2.5 !flex-nowrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="sales-eyebrow">{card.badge}{eyebrowSuffix ? ` · ${eyebrowSuffix}` : ''}</span>
            {card.kind === 'action' && <SalesMaterialComplianceBadge url={card.video || card.image} mediaType={card.mediaType || (card.video ? 'video' : 'image')} />}
            <h2 id="sales-material-detail-title" className="truncate" title={card.title}>{card.title}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {canManage && !editing && (
              <button type="button" disabled={pending} onClick={() => { setError(''); setEditing(true); }} className={salesGhostButtonClass}>
                <Pencil size={13} />{isCompactDialog ? '编辑资料' : '编辑'}
              </button>
            )}
            {canManage && (
              <button type="button" disabled={pending || categoryBusy} onClick={handleDelete} aria-label={`删除${card.title}`} className={salesGhostButtonClass}>
                <Trash2 size={13} />删除
              </button>
            )}
            <button type="button" aria-label="关闭素材详情" disabled={pending || categoryBusy} onClick={onClose} className={salesFocusClass}><X size={18} /></button>
          </div>
        </div>}

        {card.video && (
          <div className="sales-material-detail-video my-2 flex justify-center">
            <video className="sales-result-video" aria-label={`${card.title}视频`} controls playsInline preload="metadata" src={proxyMediaUrl(card.video, { asVideo: true })} />
          </div>
        )}
        {activeAngleEntry ? (
          <SalesActionAngleGallery
            title={card.title}
            entries={angleEntries}
            activeEntry={activeAngleEntry}
            canManage={canManage}
            pending={pending}
            onSelectAngle={setSelectedAngle}
            onSetDefaultAngle={() => void applyDefaultAngle()}
          />
        ) : images.length > 0 ? (
          <div className="sales-material-detail-images">{images.map((url, i) => <img key={url} src={proxyMediaUrl(url)} alt={`${card.title}参考图 ${i + 1}`} />)}</div>
        ) : null}
        {card.audio && <StudioAudioPlayer src={proxyMediaUrl(card.audio, { asAudio: true })} label={`${card.title}试听`} className="my-3 w-full" />}
        {card.kind === 'sound' && card.soundType === 'voice' && <p className="sales-material-notice">导入人声时，超过 15 秒会自动保留前 15 秒；试听与视频生成使用同一份样本，原文件保留。</p>}
        {isCompactDialog && editing && <p className="sales-material-edit-media-type">{card.badge}</p>}
      </div>

      {editing ? (
        <form className="sales-material-detail-editor" onSubmit={(e) => { e.preventDefault(); if (!categoryBusy) void saveEdit(); }}>
          {isCompactDialog && nameField}
          {card.kind === 'persona' && (
            <div className="sales-dialog-field">
              <span>人物分类</span>
              <div className="sales-segment-group" role="group" aria-label="编辑人物分类">
                {(Object.keys(PERSONA_CATEGORIES) as PersonaCategory[]).map((id) => (
                  <button key={id} type="button" aria-pressed={personaGroup === id} onClick={() => setPersonaGroup(id)} className={`sales-segment-item ${salesFocusClass}`}>
                    {PERSONA_CATEGORIES[id]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {card.kind === 'scene' && (
            <div className="sales-dialog-field">
              <span>空间分类</span>
              <div className="sales-segment-group" role="group" aria-label="编辑场景空间分类">
                {(['outdoor', 'indoor'] as const).map((id) => (
                  <button key={id} type="button" aria-pressed={sceneSpace === id} onClick={() => setSceneSpace(id)} className={`sales-segment-item ${salesFocusClass}`}>
                    {SCENE_SPACE_LABELS[id]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {card.kind === 'action' && (
            <div className="sales-dialog-field sales-material-category-field sales-asset-select-field">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="sales-action-category">商品类目</label>
                {onCreateActionCategory && (
                  <button
                    type="button"
                    disabled={pending || categoryBusy}
                    onClick={() => { setAddingCategory((v) => !v); setNewCategoryName(''); }}
                    className={`sales-taxonomy-link-btn ${salesFocusClass}`}
                  >
                    <Plus size={11} aria-hidden />新建类目
                  </button>
                )}
              </div>
              {addingCategory && onCreateActionCategory ? (
                <div className="sales-taxonomy-inline-form">
                  <input
                    autoFocus
                    value={newCategoryName}
                    maxLength={40}
                    disabled={pending || categoryBusy}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); submitNewCategory(); }
                      if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName(''); }
                    }}
                    placeholder="输入商品类目名称"
                    aria-label="新商品类目名称"
                    className={salesInputClass}
                  />
                  <button type="button" disabled={!newCategoryName.trim() || pending || categoryBusy} onClick={submitNewCategory} aria-label="确认新建商品类目" className={salesGhostButtonClass}>
                    <Check size={12} aria-hidden />
                  </button>
                  <button type="button" disabled={categoryBusy} onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} aria-label="取消" className={salesGhostButtonClass}>
                    <X size={12} aria-hidden />
                  </button>
                </div>
              ) : (
                <SalesLibrarySelect id="sales-action-category" label="编辑动作商品类目" value={actionCategoryId}
                  disabled={pending} onChange={setActionCategoryId} searchable options={[
                    { value: '', label: '未分类（通用动作）' },
                    ...(actionCategoryId && !actionCategories.some((cat) => cat.id === actionCategoryId) ? [{ value: actionCategoryId, label: '原分类未读取' }] : []),
                    ...actionCategories.map((cat) => ({ value: cat.id, label: cat.name })),
                  ]} />
              )}
            </div>
          )}

          {card.kind === 'sound' && card.soundType === 'voice' && (
            <div className="sales-dialog-field">
              <span>人声细分</span>
              <div className="sales-segment-group" role="group" aria-label="编辑人声细分">
                {(Object.keys(PERSONA_CATEGORIES) as PersonaCategory[]).map((id) => (
                  <button key={id} type="button" aria-pressed={voiceGroup === id} onClick={() => setVoiceGroup(id)} className={`sales-segment-item ${salesFocusClass}`}>
                    {PERSONA_CATEGORIES[id]}
                  </button>
                ))}
              </div>
            </div>
          )}
          {card.kind === 'sound' && card.soundType === 'voice' && <label>合成音色编号（选填）
            <input aria-label="合成音色编号" maxLength={200} value={voiceId} onChange={(event) => setVoiceId(event.target.value)} placeholder="填写语音服务商提供的音色编号" className={salesInputClass} disabled={pending} />
            <small>用于合成口播音色参考或旁白。声音样本可单独用于口播参考；编号留空不代表 TTS 已克隆该样本。</small>
          </label>}

          {!isCompactDialog && nameField}
          {card.kind !== 'action' && (
            <>
              <label>
                说明描述
                <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={salesInputClass} disabled={pending} />
              </label>
              <label>
                标签
                <input maxLength={300} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="用逗号分隔，例如：自然光、日常、近景" className={salesInputClass} disabled={pending} />
              </label>
            </>
          )}
          {error && <p role="alert" className="sales-material-error">{error}</p>}
          <div className="sales-material-dialog-actions">
            <button type="button" disabled={pending || categoryBusy} onClick={cancelEdit} className={salesGhostButtonClass}>{isCompactDialog ? '取消' : '取消编辑'}</button>
            <button type="submit" disabled={pending || categoryBusy || !title.trim()} className={`sales-collect-primary ${salesFocusClass}`}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}保存修改
            </button>
          </div>
        </form>
      ) : (
        <>
          {card.kind === 'sound' && card.soundType === 'voice' && <p className="sales-material-detail-description">合成音色编号：{card.voiceId || '未配置'}</p>}
          {card.kind !== 'action' && card.description ? (
            <p className="sales-material-detail-description">{card.description}</p>
          ) : null}
          {visibleTags.length > 0 ? (
            <div className="sales-script-card-tags mt-3">{visibleTags.map((tag, i) => <span key={i}>{tag}</span>)}</div>
          ) : null}
          {onConvert && <div className="sales-material-dialog-actions !mt-3"><button type="button" disabled={pending} onClick={onConvert} className={salesGhostButtonClass}><Layers size={13} />转换为深度素材</button></div>}
          {error && <p role="alert" className="sales-material-error">{error}</p>}
          {!isCompactDialog && <div className="sales-material-dialog-actions !mt-3">
            <button type="button" onClick={onClose} className={salesGhostButtonClass}>返回素材库</button>
          </div>}
        </>
      )}
    </dialog>
  );
}
