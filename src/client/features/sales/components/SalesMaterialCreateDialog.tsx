import { PERSONA_CATEGORIES, personaGender, type PersonaCategory, personaGroupToDimensions } from '../model/salesPersonaClassification';
import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { runSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import { extractVideoMetadataFromFile } from '@client/shared/media/mediaHelper';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import { createSalesMaterial, createSalesSound, type EditableSalesMaterial } from '../api/salesMaterials';
import { uploadSalesCustomAsset } from '../api/salesProduction';
import { DEPTH_ACTION_LABELS, depthFileError, isActionVideo, seedanceVideoDurationError, type DepthActionKind } from '../model/salesActionMedia';
import {
  cleanActionTags, mergeGroupTag, SCENE_SPACE_LABELS,
  type SalesSceneSpace,
} from '../model/salesMaterialCatalog';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';
import { SalesMaterialUploadField } from './SalesMaterialUploadField';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import '../salesAssetDialog.css';

const LABELS = {
  persona: '人物',
  scene: '场景',
  action: '动作',
  sound: '声音',
} as const;

interface Props {
  type: EditableSalesMaterial | 'sound';
  defaultName?: string;
  defaultPersonaGroup?: PersonaCategory;
  defaultSceneSpace?: SalesSceneSpace;
  defaultActionCategoryId?: string;
  defaultSoundType?: 'voice' | 'bgm';
  defaultVoiceGroup?: PersonaCategory;
  actionCategories?: readonly ScriptTaxonomyItem[];
  onCreateActionCategory?: (name: string) => Promise<ScriptTaxonomyItem | null>;
  onClose: () => void;
  onCreated: () => void;
}

export function SalesMaterialCreateDialog({
  type,
  defaultName = '',
  defaultPersonaGroup = 'female',
  defaultSceneSpace = 'indoor',
  defaultActionCategoryId = '',
  defaultSoundType = 'voice',
  defaultVoiceGroup = 'female',
  actionCategories = [],
  onCreateActionCategory,
  onClose,
  onCreated,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [personaGroup, setPersonaGroup] = useState<PersonaCategory>(defaultPersonaGroup);
  const [sceneSpace, setSceneSpace] = useState<SalesSceneSpace>(defaultSceneSpace);
  const [actionCategoryId, setActionCategoryId] = useState(defaultActionCategoryId);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [soundType, setSoundType] = useState<'voice' | 'bgm'>(defaultSoundType);
  const [voiceGroup, setVoiceGroup] = useState<PersonaCategory>(defaultVoiceGroup);
  const [voiceId, setVoiceId] = useState('');
  const [bpm, setBpm] = useState(100);
  const [mediaType, setMediaType] = useState<DepthActionKind>('depth-video');
  const [primary, setPrimary] = useState<File | null>(null);
  const [face, setFace] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const selectionRef = useRef(0);
  const requiresPrimary = type !== 'sound' || soundType === 'bgm';

  useEffect(() => {
    dialogRef.current?.showModal();
    return () => { abortRef.current?.abort(); selectionRef.current += 1; };
  }, []);

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

  const selectPrimary = async (selected: File | null) => {
    const selection = ++selectionRef.current;
    setPrimary(null); setError(''); setChecking(false);
    if (!selected) return;
    if (type === 'action' && isActionVideo(mediaType)) {
      const fileError = depthFileError(selected, true);
      if (fileError) { setError(fileError); return; }
      setChecking(true);
      try {
        const metadata = await extractVideoMetadataFromFile(selected);
        if (selection !== selectionRef.current) return;
        const durationError = seedanceVideoDurationError(metadata.duration);
        if (durationError) { setError(durationError); return; }
      } catch { /* Metadata is best effort, as in the existing upload flow. */ }
      finally { if (selection === selectionRef.current) setChecking(false); }
    }
    if (selection === selectionRef.current) setPrimary(selected);
  };

  const save = async () => {
    if (pending || checking || !name.trim()) return;
    if (requiresPrimary && !primary) { setError('请先上传文件'); return; }
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true); setError('');
    try {
      if (type === 'sound') {
        const audioUrl = primary ? await uploadSalesCustomAsset(primary, 'assets', controller.signal) : '';
        if (controller.signal.aborted) return;
        const tagList = tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
        await createSalesSound({
          soundType,
          name: name.trim(),
          title: name.trim(),
          description: description.trim(),
          promptText: description.trim(),
          voiceGroup: soundType === 'voice' ? voiceGroup : undefined,
          voiceId: soundType === 'voice' ? voiceId.trim() : undefined,
          gender: soundType === 'voice' ? personaGender(voiceGroup) : undefined,
          audioUrl,
          tags: tagList,
          moodTags: tagList,
          bpm,
        }, controller.signal);
        if (!controller.signal.aborted) onCreated();
        return;
      }

      const image = primary ? await uploadSalesCustomAsset(primary, 'assets', controller.signal) : '';
      const faceImage = face ? await uploadSalesCustomAsset(face, 'assets', controller.signal) : image;
      if (image) void runSeedancePrecheck([{ url: image, mediaType: type === 'action' ? mediaType : 'image' }, ...(faceImage && faceImage !== image ? [{ url: faceImage, mediaType: 'image' as const }] : [])]);
      if (controller.signal.aborted) return;

      const finalTags = type === 'persona'
        ? mergeGroupTag(tags, PERSONA_CATEGORIES[personaGroup], Object.values(PERSONA_CATEGORIES))
        : type === 'scene'
          ? mergeGroupTag(tags, SCENE_SPACE_LABELS[sceneSpace], ['室内', '户外'])
          : cleanActionTags(tags).join('，');

      const finalName = name.trim() || (type === 'action' ? (defaultName || '1') : '');

      await createSalesMaterial(type, {
        title: finalName,
        name: finalName,
        description: description.trim(),
        tags: finalTags,
        ...(type === 'persona' ? { dimensions: personaGroupToDimensions(undefined, personaGroup) } : {}),
        ...(type === 'scene' ? { spatialType: sceneSpace === 'outdoor' ? 'outdoor' : 'indoor_room' } : {}),
        action: type === 'action' ? description.trim() : undefined,
        shotType: type === 'action' ? '' : undefined,
        camera: type === 'action' ? '' : undefined,
        coverUrl: image,
        avatarUrl: faceImage,
        ...(type === 'action' ? {
          mediaType,
          mediaUrl: image,
          sourceUrl: '',
          coverUrl: isActionVideo(mediaType) ? '' : image,
          productCategoryIds: actionCategoryId ? [actionCategoryId] : [],
        } : {}),
        sourceImages: [...new Set([image, faceImage].filter(Boolean))],
      }, controller.signal);
      if (!controller.signal.aborted) onCreated();
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : '保存失败，请重试');
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="sales-material-dialog sales-asset-dialog" aria-labelledby="sales-create-material-title" onCancel={(e) => { e.preventDefault(); if (!pending) onClose(); }}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
        <header className="sales-asset-header">
          <h2 id="sales-create-material-title">新增{LABELS[type]}资产</h2>
          <button type="button" aria-label="关闭新增素材" disabled={pending} onClick={onClose} className={salesGhostButtonClass}><X size={18} /></button>
        </header>
        <div className="sales-asset-content">
          {type === 'sound' && <div className="sales-asset-fields">
            <div className="sales-dialog-field">
              <span>声音类型</span>
              <div className="sales-segment-group" role="group" aria-label="新增声音类型">
                <button type="button" disabled={pending} aria-pressed={soundType === 'voice'} onClick={() => { if (soundType !== 'voice') { setSoundType('voice'); void selectPrimary(null); } }} className={`sales-segment-item ${salesFocusClass}`}>人声</button>
                <button type="button" disabled={pending} aria-pressed={soundType === 'bgm'} onClick={() => { if (soundType !== 'bgm') { setSoundType('bgm'); void selectPrimary(null); } }} className={`sales-segment-item ${salesFocusClass}`}>BGM</button>
              </div>
            </div>
            {soundType === 'voice' && <div className="sales-dialog-field sales-asset-select-field"><span>人声细分</span>
              <SalesLibrarySelect label="人声细分" value={voiceGroup} disabled={pending} onChange={(value) => setVoiceGroup(value as PersonaCategory)}
                options={Object.entries(PERSONA_CATEGORIES).map(([value, label]) => ({ value, label }))} />
            </div>}
          </div>}
          {type === 'action' && <div className="sales-dialog-field sales-asset-select-field"><span>动作媒体类型</span>
            <SalesLibrarySelect label="动作媒体类型" value={mediaType} disabled={pending} onChange={(value) => { setMediaType(value as DepthActionKind); void selectPrimary(null); }}
              options={Object.entries(DEPTH_ACTION_LABELS).map(([value, label]) => ({ value, label }))} />
          </div>}
          <div className={type === 'persona' ? 'sales-asset-fields' : undefined}>
            <SalesMaterialUploadField
              key={`${type}-${mediaType}-${soundType}`}
              file={primary}
              onChange={(file) => { void selectPrimary(file); }}
              kind={type === 'sound' ? 'audio' : type === 'action' && isActionVideo(mediaType) ? 'video' : 'image'}
              accept={type === 'action' && isActionVideo(mediaType) ? 'video/mp4,video/webm,video/quicktime,.m4v' : type === 'sound' ? 'audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac' : 'image/*'}
              required={requiresPrimary}
              disabled={pending}
              label={type === 'persona' ? '上传全身参考图' : type === 'scene' ? '上传场景参考图' : type === 'action' ? `上传${DEPTH_ACTION_LABELS[mediaType]}` : soundType === 'bgm' ? '上传 BGM 音频文件' : '上传人声试听样本'}
              hint={type === 'sound' ? soundType === 'voice' ? '建议上传清晰人声，单个不超过 32 MiB；超过 15 秒会自动保留前 15 秒，原文件保留。' : 'MP3、WAV、M4A 等音频格式' : type === 'action' && isActionVideo(mediaType) ? 'MP4、WebM、MOV、M4V · 2–30 秒 · 最大 35MB' : '上传已有参考图片'}
            />
            {type === 'persona' && <SalesMaterialUploadField file={face} onChange={setFace} kind="image" accept="image/*" disabled={pending} label="上传人脸参考图" hint="清晰的面部近景" />}
          </div>
          {checking && <p role="status" className="sales-material-notice">正在读取视频信息…</p>}
          <div className="sales-asset-fields">
            <label className={type === 'sound' && soundType === 'voice' ? 'sales-asset-field-wide' : undefined}>
              资产名称 <span className="sales-asset-required">*</span>
              <input autoFocus required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={salesInputClass} disabled={pending}
                placeholder={type === 'action' ? '默认按 1、2、3 序号命名' : type === 'sound' ? (soundType === 'bgm' ? '例如：轻快都市街拍 BGM' : '例如：元气女声口播') : `给${LABELS[type]}起个名字`} />
            </label>
            {type === 'persona' && <div className="sales-dialog-field sales-asset-select-field"><span>人物分类</span>
              <SalesLibrarySelect label="人物分类" value={personaGroup} disabled={pending} onChange={(value) => setPersonaGroup(value as PersonaCategory)}
                options={Object.entries(PERSONA_CATEGORIES).map(([value, label]) => ({ value, label }))} />
            </div>}
            {type === 'scene' && <div className="sales-dialog-field sales-asset-select-field"><span>空间分类</span>
              <SalesLibrarySelect label="空间分类" value={sceneSpace} disabled={pending} onChange={(value) => setSceneSpace(value as SalesSceneSpace)}
                options={Object.entries(SCENE_SPACE_LABELS).map(([value, label]) => ({ value, label }))} />
            </div>}
            {type === 'sound' && soundType === 'bgm' && <label>节奏速度（BPM）
              <input type="number" min={40} max={220} value={bpm} onChange={(e) => setBpm(Number(e.target.value) || 100)} className={salesInputClass} disabled={pending} />
            </label>}
            {type === 'sound' && soundType === 'voice' && <label className="sales-asset-field-wide">合成音色编号（选填）
              <input aria-label="合成音色编号" maxLength={200} value={voiceId} onChange={(event) => setVoiceId(event.target.value)} placeholder="填写语音服务商提供的音色编号" className={salesInputClass} disabled={pending} />
              <small>用于合成口播音色参考或旁白。只上传声音样本时可留空用于口播参考，留空不代表 TTS 已克隆该样本；没有样本且留空时沿用默认合成音色。</small>
            </label>}
            {type === 'action' && (
              <div className="sales-dialog-field sales-asset-select-field">
                <div className="flex items-center justify-between gap-2">
                  <span>商品类目</span>
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
                      placeholder="输入商品类目名称，如：女装穿搭"
                      aria-label="新商品类目名称"
                      className={salesInputClass}
                    />
                    <button type="button" disabled={!newCategoryName.trim() || pending || categoryBusy} onClick={submitNewCategory} aria-label="确认新建商品类目" className={salesGhostButtonClass}>
                      <Check size={12} aria-hidden />
                    </button>
                    <button type="button" disabled={categoryBusy} onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} aria-label="取消新建商品类目" className={salesGhostButtonClass}>
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <SalesLibrarySelect label="动作所属商品类目" value={actionCategoryId} disabled={pending} onChange={setActionCategoryId} searchable
                    options={[
                      { value: '', label: '未分类（通用动作）' },
                      ...(actionCategoryId && !actionCategories.some((cat) => cat.id === actionCategoryId) ? [{ value: actionCategoryId, label: '所选分类未读取' }] : []),
                      ...actionCategories.map((cat) => ({ value: cat.id, label: cat.name })),
                    ]} />
                )}
              </div>
            )}
          </div>
          {type !== 'action' && <>
            <label>
              {type === 'sound' ? (soundType === 'voice' ? '音色风格或试听文案说明' : '配乐情绪与适用场景说明') : '特征与使用说明'}
              <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} className={salesInputClass} disabled={pending} />
            </label>
            <label>标签
              <input value={tags} maxLength={300} placeholder="选填，用逗号分隔" onChange={(e) => setTags(e.target.value)} className={salesInputClass} disabled={pending} />
            </label>
          </>}
          {error && <p role="alert" className="sales-material-error">{error}</p>}
        </div>
        <footer className="sales-asset-footer">
          <div>
            <button type="button" disabled={pending} onClick={onClose} className={salesGhostButtonClass}>取消</button>
            <button type="submit" disabled={pending || checking || !name.trim() || (requiresPrimary && !primary)} className={`sales-collect-primary ${salesFocusClass}`}>
              {pending && <Loader2 size={14} className="animate-spin" />}{pending ? '保存中…' : '保存资产'}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
