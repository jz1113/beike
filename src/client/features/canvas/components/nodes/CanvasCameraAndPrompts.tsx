import { listSelectableModels } from '@shared/domain/models/modelCatalog';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Aperture, Camera, ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import type { CanvasCinemaConfig } from '../../model/types';

export type ModelChannelTab = 'api' | 'fal';

export const MODEL_CHANNEL_TABS: Array<{ id: ModelChannelTab; label: string }> = [
  { id: 'api', label: 'API' },
  { id: 'fal', label: 'Fal' },
];

export interface ImagePickerModelItem {
  id: string;
  name: string;
  modelId?: string;
  upstreamId?: string;
  channel?: ModelChannelTab;
  provider?: string;
}

export const BUILTIN_IMAGE_PICKER_MODELS: ImagePickerModelItem[] = listSelectableModels('image')
  .map(model => ({ id: model.id, modelId: model.id, name: model.name, channel: 'api' }));

export const BUILTIN_VIDEO_PICKER_MODELS: ImagePickerModelItem[] = listSelectableModels('video')
  .map(model => ({ id: model.id, modelId: model.id, name: model.name, channel: model.adapter === 'fal-omni' ? 'fal' : 'api' }));

export function resolveImagePickerModels(
  models: ImagePickerModelItem[],
  tab: ModelChannelTab,
): ImagePickerModelItem[] {
  const seen = new Set<string>();
  const merged: ImagePickerModelItem[] = [];
  for (const item of models) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.filter(model => {
    const onFal = model.channel === 'fal' || /(?:^|[\s/.-])fal(?:$|[\s/.-])/i.test(
      [model.id, model.name, model.modelId, model.provider].filter(Boolean).join(' '),
    );
    return tab === 'fal' ? onFal : !onFal;
  });
}

export interface CinemaDeviceOption {
  id: string;
  name: string;
  image: string;
  prompt: string;
  category?: string;
}

export const CAMERA_BODIES: CinemaDeviceOption[] = [
  { id: 'arri-alexa-35', name: '阿莱 Alexa 35', image: '/cinema/arri-alexa-35-hW6-4chH.webp', prompt: 'shot on Arri Alexa 35, legendary color science, organic highlights' },
  { id: 'arricam-lt', name: 'Arricam LT', image: '/cinema/arricam-lt-DEzXr_FR.webp', prompt: 'shot on Arricam LT, 35mm movie film, authentic cinema texture' },
  { id: 'arriflex-435', name: '阿莱 435', image: '/cinema/arriflex-435-DqI5jc3N.webp', prompt: 'shot on Arriflex 435, high-speed cinematography, sharp grain' },
  { id: 'imax-keighley', name: 'IMAX Keighley', image: '/cinema/imax-keighley-Cu9FJnlP.webp', prompt: 'shot on IMAX Keighley camera, ultra-large format, extreme immersion' },
  { id: 'panavision-dxl2', name: '潘那维申 DXL2', image: '/cinema/panavision-dxl2-nu2CVKjg .webp', prompt: 'shot on Panavision Millennium DXL2, 8K large format, cinematic depth' },
  { id: 'red-v-raptor', name: 'RED 猛禽', image: '/cinema/red-v-raptor-DOT1sij6.webp', prompt: 'shot on Red V-Raptor, 8K raw texture, high dynamic range' },
  { id: 'sony-venice', name: '索尼 威尼斯', image: '/cinema/sony-venice-BgicSddP.webp', prompt: 'shot on Sony Venice, filmic skin tones, rich shadow detail' },
  { id: 'imax-film', name: 'IMAX 胶片机', image: '/cinema/IMAX Film Camera.webp', prompt: 'shot on 70mm IMAX film camera, massive scale, detailed grain' },
  { id: 'arriflex-16sr', name: '阿莱 16SR', image: '/cinema/Arriflex 16SR.webp', prompt: 'shot on 16mm Arriflex 16SR, vintage film grain, 16mm look' },
  { id: 'arri-alexa-65', name: '阿莱 Alexa 65', image: '/cinema/Alexa 65.webp', prompt: 'shot on Arri Alexa 65, crystal clear optics, high dynamic range, stunning highlights roll-off, professional color grading, 8K resolution' },
];

export const CAMERA_LENSES: CinemaDeviceOption[] = [
  { id: 'lensbaby', name: 'Lensbaby', image: '/cinema/Lensbaby.webp', prompt: 'Lensbaby lens, selective focus, dreamy blur, creative tilt-shift' },
  { id: 'hawk-v-lite', name: 'Hawk V-Lite', image: '/cinema/Hawk V-Lite.webp', prompt: 'Hawk V-Lite anamorphic lens, blue streak flares, oval bokeh, cinematic widescreen' },
  { id: 'hawk-class-x', name: 'Hawk Class X', image: '/cinema/hawk-class-x-CD3GvtF4.webp', prompt: 'Hawk Class X anamorphic lens, vintage anamorphic character, soft flares' },
  { id: 'laowa-macro', name: '老蛙 宏观', image: '/cinema/Laowa Macro.webp', prompt: 'Laowa Macro lens, extreme close-up detail, razor-sharp focus' },
  { id: 'canon-k35', name: '佳能 K-35', image: '/cinema/canon-k35-BhokCUBz.webp', prompt: 'vintage Canon K-35 lens, soft flares, 70s cinematic glow, warm highlights' },
  { id: 'jdc-xtal', name: 'JDC 变形镜头', image: '/cinema/JDC Xtal Xpress.webp', prompt: 'JDC Xtal Xpress anamorphic, vintage anamorphic texture, artistic flares' },
  { id: 'arri-signature', name: '阿莱 签名定焦', image: '/cinema/arri-signature-prime-ZwjUyRcz.webp', prompt: 'ARRI Signature Prime lens, natural bokeh, creamy fall-off, cinema-grade clarity' },
  { id: 'cooke-s4', name: '库克 S4', image: '/cinema/cooke-s4-BKM_5Nte.webp', prompt: '"Cooke Look", warm skin tones, smooth organic texture' },
  { id: 'cooke-sf-18x', name: '库克 SF 18x', image: '/cinema/cooke-sf-18x-BegGlnlc.webp', prompt: 'Cooke SF 18x zoom lens, cinematic zoom character, smooth focus breathing' },
  { id: 'cooke-speed-panchro', name: '库克 Speed Panchro', image: '/cinema/cooke-speed-panchro-jWogQ6i5.webp', prompt: 'Cooke Speed Panchro vintage lens, classic Hollywood look, soft bokeh' },
  { id: 'petzval', name: '佩兹瓦尔', image: '/cinema/Petzval.webp', prompt: 'Petzval lens, swirly bokeh, sharp center focus' },
  { id: 'helios', name: '八羽怪', image: '/cinema/helios-CWg35ubk.webp', prompt: 'Helios 44-2 lens, distinctive swirly bokeh, vintage character' },
  { id: 'zeiss-ultra', name: '蔡司 Ultra Prime', image: '/cinema/zeiss-ultra-prime-DdBHzrBr.webp', prompt: 'Zeiss Ultra Prime lens, high contrast, clinical sharpness' },
  { id: 'panavision-c', name: '潘那维申 C系列', image: '/cinema/panavision-c-series-LLl1Xpct.webp', prompt: 'Panavision C-Series anamorphic, classic blue flares' },
  { id: 'panavision-primo', name: '潘那维申 Primo', image: '/cinema/panavision-primo-Cui4J6lP.webp', prompt: 'Panavision Primo lens, high color saturation, iconic sharpness' },
];

export const CAMERA_FOCAL_LENGTHS: CinemaDeviceOption[] = [
  { id: '8', name: '8mm', category: '超广角', image: '', prompt: '8mm focal length, ultra-wide angle, expansive perspective' },
  { id: '14', name: '14mm', category: '超广角', image: '', prompt: '14mm focal length, ultra-wide angle, expansive perspective' },
  { id: '24', name: '24mm', category: '叙事广角', image: '', prompt: '24mm focal length, wide angle, storytelling environment' },
  { id: '35', name: '35mm', category: '叙事广角', image: '', prompt: '35mm focal length, wide angle, storytelling environment' },
  { id: '50', name: '50mm', category: '标准镜头', image: '', prompt: '50mm focal length, standard lens, human eye perspective' },
  { id: '85', name: '85mm', category: '肖像长焦', image: '', prompt: '85mm focal length, telephoto, shallow depth of field, creamy bokeh' },
  { id: '135', name: '135mm', category: '肖像长焦', image: '', prompt: '135mm focal length, telephoto, shallow depth of field, creamy bokeh' },
];

export const CAMERA_APERTURES: CinemaDeviceOption[] = [
  { id: 'f1.4', name: 'f/1.4', image: '/cinema/f1_4-DoQLC9Jc.webp', prompt: 'f/1.4 aperture, extremely shallow depth of field, creamy bokeh, subject isolation, dreamy background blur' },
  { id: 'f4', name: 'f/4', image: '/cinema/f4-Or-YmP2I.webp', prompt: 'f/4 aperture, balanced depth of field, moderate bokeh, natural subject separation' },
  { id: 'f11', name: 'f/11', image: '/cinema/f-11.webp', prompt: 'f/11 aperture, deep depth of field, sharp foreground and background, landscape clarity' },
];

export function hasActiveCinemaConfig(config?: CanvasCinemaConfig | null): boolean {
  if (!config) return false;
  return Boolean(config.cameraId || config.lensId || config.focalLengthId || config.apertureId);
}

export function buildCinemaPrompt(config?: CanvasCinemaConfig | null): string {
  if (!config) return '';
  const parts: string[] = [];
  if (config.cameraId) {
    const cam = CAMERA_BODIES.find((item) => item.id === config.cameraId);
    if (cam) parts.push(cam.prompt);
  }
  if (config.lensId) {
    const lens = CAMERA_LENSES.find((item) => item.id === config.lensId);
    if (lens) parts.push(lens.prompt);
  }
  if (config.focalLengthId) {
    const focal = CAMERA_FOCAL_LENGTHS.find((item) => item.id === config.focalLengthId);
    if (focal) parts.push(focal.prompt);
  }
  if (config.apertureId) {
    const aperture = CAMERA_APERTURES.find((item) => item.id === config.apertureId);
    if (aperture) parts.push(aperture.prompt);
  }
  return parts.join(', ');
}

function CinemaDialColumn({
  label,
  options,
  value,
  onChange,
  isFocal,
  placeholderKind,
}: {
  label: string;
  options: CinemaDeviceOption[];
  value: string | null | undefined;
  onChange: (nextId: string | null) => void;
  isFocal?: boolean;
  placeholderKind: 'camera' | 'aperture' | 'focal';
}) {
  const idx = value ? options.findIndex((item) => item.id === value) : -1;
  const currItem = idx >= 0 ? options[idx] : null;
  const prevItem = idx >= 0 ? options[(idx - 1 + options.length) % options.length] : null;
  const nextItem = idx >= 0 ? options[(idx + 1) % options.length] : null;
  const step = (delta: number) => {
    const nextIdx = idx < 0 ? 0 : (idx + delta + options.length) % options.length;
    onChange(options[nextIdx]?.id ?? null);
  };

  return (
    <div
      className="qiaodoumayi-camera-column"
      onWheel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (Math.abs(event.deltaY) >= 0.5) step(event.deltaY > 0 ? 1 : -1);
      }}
    >
      <div className="qiaodoumayi-camera-ghost qiaodoumayi-camera-ghost-previous" aria-hidden="true">
        {prevItem ? (
          isFocal ? (
            <span className="qiaodoumayi-camera-focal">
              <strong>{prevItem.name}</strong>
            </span>
          ) : (
            <img src={prevItem.image} alt="" className="qiaodoumayi-camera-image" />
          )
        ) : null}
      </div>

      <div className="qiaodoumayi-camera-current">
        <button
          type="button"
          className="qiaodoumayi-camera-step"
          aria-label={`上一${label}`}
          onClick={() => step(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="qiaodoumayi-camera-preview"
          aria-label={`${label}：${currItem ? currItem.name : '未选择'}，点击切换下一项`}
          onClick={() => step(1)}
        >
          {currItem ? (
            isFocal ? (
              <span className="qiaodoumayi-camera-focal">
                <strong>{currItem.name}</strong>
              </span>
            ) : (
              <img src={currItem.image} alt={currItem.name} className="qiaodoumayi-camera-image" />
            )
          ) : placeholderKind === 'camera' ? (
            <Camera className="qiaodoumayi-camera-placeholder" aria-hidden="true" />
          ) : placeholderKind === 'focal' ? (
            <span className="qiaodoumayi-camera-focal">
              <strong>—</strong>
            </span>
          ) : (
            <Aperture className="qiaodoumayi-camera-placeholder" aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          className="qiaodoumayi-camera-step"
          aria-label={`下一${label}`}
          onClick={() => step(1)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div className="qiaodoumayi-camera-ghost qiaodoumayi-camera-ghost-next" aria-hidden="true">
        {nextItem ? (
          isFocal ? (
            <span className="qiaodoumayi-camera-focal">
              <strong>{nextItem.name}</strong>
            </span>
          ) : (
            <img src={nextItem.image} alt="" className="qiaodoumayi-camera-image" />
          )
        ) : null}
      </div>

      <span className="qiaodoumayi-camera-value" title={currItem?.name || ''}>
        {currItem ? currItem.name : '—'}
      </span>
    </div>
  );
}

export function CanvasCameraControl({
  value,
  onChange,
}: {
  value?: CanvasCinemaConfig | null;
  onChange: (next: CanvasCinemaConfig | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<CanvasCinemaConfig>(() => ({
    cameraId: value?.cameraId ?? null,
    lensId: value?.lensId ?? null,
    focalLengthId: value?.focalLengthId ?? null,
    apertureId: value?.apertureId ?? null,
  }));
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 16, top: 16 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const isActive = hasActiveCinemaConfig(value);
  const hasDraft = hasActiveCinemaConfig(draft);
  const isDirty =
    (draft.cameraId ?? null) !== (value?.cameraId ?? null) ||
    (draft.lensId ?? null) !== (value?.lensId ?? null) ||
    (draft.focalLengthId ?? null) !== (value?.focalLengthId ?? null) ||
    (draft.apertureId ?? null) !== (value?.apertureId ?? null);

  useEffect(() => {
    if (!open) return;
    setDraft({
      cameraId: value?.cameraId ?? null,
      lensId: value?.lensId ?? null,
      focalLengthId: value?.focalLengthId ?? null,
      apertureId: value?.apertureId ?? null,
    });
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const panelW = Math.min(600, window.innerWidth - 24);
      const panelH = 253;
      const left = Math.max(12, Math.min(rect.left + rect.width / 2 - panelW / 2, window.innerWidth - panelW - 12));
      const top = rect.top - panelH - 12 >= 12 ? rect.top - panelH - 10 : Math.min(window.innerHeight - panelH - 12, rect.bottom + 10);
      setPos({ left, top });
    };
    updatePosition();
    const handleOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside, true);
    document.addEventListener('keydown', handleKey, true);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside, true);
      document.removeEventListener('keydown', handleKey, true);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, value]);

  return (
    <div className="relative shrink-0" data-gen-inline-director-bar="true">
      <button
        ref={triggerRef}
        type="button"
        aria-label="摄影机控制"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        title="摄影机控制"
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className={`relative flex h-7 w-7 items-center justify-center rounded-lg transition-colors cursor-pointer ${
          open || isActive
            ? 'bg-white/[0.12] text-white'
            : 'text-zinc-500 hover:bg-black/5 hover:text-zinc-800 dark:text-white/75 dark:hover:bg-white/[0.08] dark:hover:text-white'
        }`}
      >
        <Camera size={15} strokeWidth={1.75} className="shrink-0 opacity-90" />
        {isActive && <span className="pointer-events-none absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-sky-400" />}
      </button>

      {open &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            id={dialogId}
            role="dialog"
            aria-label="摄影机控制"
            data-qiaodoumayi-camera-panel="true"
            data-theme="dark"
            style={{
              position: 'fixed',
              left: pos.left,
              top: pos.top,
              width: 'min(600px, calc(100vw - 24px))',
              height: 253,
              zIndex: 10020,
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="qiaodoumayi-camera-header">
              <span>摄影机控制</span>
              <div className="qiaodoumayi-camera-actions">
                <button
                  type="button"
                  disabled={!isActive && !hasDraft}
                  onClick={() => {
                    const cleared: CanvasCinemaConfig = { cameraId: null, lensId: null, focalLengthId: null, apertureId: null };
                    setDraft(cleared);
                    onChange(undefined);
                    setOpen(false);
                  }}
                  className="qiaodoumayi-camera-clear"
                >
                  清除
                </button>
                <button
                  type="button"
                  disabled={!isDirty && !hasDraft}
                  onClick={() => {
                    onChange(hasActiveCinemaConfig(draft) ? draft : undefined);
                    setOpen(false);
                  }}
                  className="qiaodoumayi-camera-save"
                >
                  保存
                </button>
              </div>
            </div>

            <div className="qiaodoumayi-camera-grid">
              <CinemaDialColumn
                label="相机"
                options={CAMERA_BODIES}
                value={draft.cameraId}
                placeholderKind="camera"
                onChange={(cameraId) => setDraft((prev) => ({ ...prev, cameraId }))}
              />
              <CinemaDialColumn
                label="镜头"
                options={CAMERA_LENSES}
                value={draft.lensId}
                placeholderKind="aperture"
                onChange={(lensId) => setDraft((prev) => ({ ...prev, lensId }))}
              />
              <CinemaDialColumn
                label="焦距"
                options={CAMERA_FOCAL_LENGTHS}
                value={draft.focalLengthId}
                placeholderKind="focal"
                onChange={(focalLengthId) => setDraft((prev) => ({ ...prev, focalLengthId }))}
                isFocal
              />
              <CinemaDialColumn
                label="光圈"
                options={CAMERA_APERTURES}
                value={draft.apertureId}
                placeholderKind="aperture"
                onChange={(apertureId) => setDraft((prev) => ({ ...prev, apertureId }))}
              />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export interface CanvasPromptTemplateItem {
  id: string;
  name: string;
  prompt: string;
  custom?: boolean;
}

const CUSTOM_PROMPT_STORAGE_KEY = 'qiaodoumayi_prompt_library';

export const DEFAULT_PROMPT_TEMPLATES: CanvasPromptTemplateItem[] = [
  {
    id: 'frame-minus-5s-default',
    name: '画面推演 - 5秒前',
    prompt: `基于参考图的画面内容与物理逻辑，反推 5 秒前的同一机位画面：给出动作的起因状态（或即将发生的动作前半段），人物姿态与情绪比现状更早一阶段，场景一致、光线按时间合理倒推；不得改变人物身份与服装；不得出现不合理穿帮；不得出现文字与水印。只输出这一帧画面。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'frame-plus-3s-default',
    name: '画面推演 - 3秒后',
    prompt: `基于参考图的画面内容与物理逻辑，推演并生成 3 秒后的同一机位/同一景别画面：人物动作与表情自然延续（含惯性、速度、力的作用），场景与光线保持不变或按物理逻辑合理变化（如扬尘、水花、光斑移动）；不得改变人物外貌与服装；不得出现时间倒流式矛盾；不得出现文字与水印。只输出这一帧画面。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'blocking-storyboard-default',
    name: '调度故事板',
    prompt: `根据需求描述，输出 4–6 个中文调度分镜（手绘草图感）：每格标注 机位（俯拍/平视/仰视）、走位箭头、运动轨迹、主体动作与关键道具；画面为简洁线稿/淡彩示意，不追求精细渲染，重点表达调度与镜头关系；同一人物/场景在全部格子中保持一致；格内允许简洁中文标注（机位/动作/走位）。\n\n需求：{剧情描述}`,
  },
  {
    id: 'narrative-storyboard-default',
    name: '故事板',
    prompt: `根据需求描述整理为 4–8 个连续分镜（每格一个镜头），输出为规整网格长图：每格包含 景别(远/全/中/近/特写) + 机位/视角 + 主体动作 + 光影氛围；叙事节奏符合 10–15 秒内可演完的剧情；主角形象一致、场景连续、运动方向连贯；格内不得出现文字（除必要的对白气泡，可留白）；整体风格统一。\n\n需求：{剧情描述}\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'scene-3view-default',
    name: '场景三视图',
    prompt: `以参考图的同一场景为准，生成白底（或纯色）三视角视图（正面中心线 / 左前 45° / 右前 45°），三视角必须是同一空间结构、同一光源方向、同一时间与天候，建筑比例与材质一致；空场景、无人物；不得出现镜像、复制、透视畸变；不得出现文字与水印。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'character-3view-default',
    name: '角色三视图',
    prompt: `高质量专业角色设定图，纯白色纯净背景，中性摄影棚灯光，平光布光，平视镜头。布局：左侧为正面面部头部特写（占画面宽度 1/3，胸部以上、五官清晰）；右侧并列三格为全身正面视图 / 全身侧面视图 / 全身背面视图（各占 1/3），三格间用淡灰色(#E2E2E2) 2px 细线分割。角色：{主体}。要求：三视图服装、发型、体型、配色完全一致；全身完整不裁切、无遮挡；不得出现道具/武器/手持物；不得出现复杂动作与夸张表情；不得出现背景物体（纯白）；不得出现其他角色；不得出现文字、水印、标签、UI 元素。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'product-setting-sheet-default',
    name: '产品设定图',
    prompt: `名称：{产品名}，{品类}。\n\n描述：{尺寸/材质/结构/接口/底座…}。\n\n特征：{磨损/反光/细节}。\n\n构图规范：高质量写实道具多角度展示图，横向构图，以 2 行 3 列的干净网格整齐排版，展示道具的六个极正视角。纯白色纯净背景，专业产品影棚摄影，标准六视图参考。六视图包括（必须是道具六视图）：绝对正前方视图、绝对正后方视图、绝对左侧视图、绝对右侧视图、绝对正上方俯拍视图、绝对正下方仰拍视图。所有视图必须是同一件道具，材质、颜色、比例、结构完全一致。使用超长焦镜头或移轴镜头效果，将透视变形降到最低，物体所有本该平行的边缘在画面中保持平行，接近正交投影。每个视图都像在专业产品影棚中用三脚架精密校准拍摄，构图绝对端正，物体在每个格子中居中，无任何倾斜、旋转或透视畸变。画面不得出现任何人物、角色、人群、人影；不得出现手、脚、人脸、场景、建筑、自然景观；无其他道具；必须无文字、无水印、无 logo、无 UI 元素，不要任何剧情事件；保持道具本体清晰、完整轮廓、所有角度的材质与结构一致。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'scene-setting-sheet-default',
    name: '场景设定图',
    prompt: `名称：{场景名}，{类型}。\n\n描述：{室内/室外}，{尺度}，{长宽高}。\n\n前背景：{背景层}；{前景层}；{最高处/核心物}。\n\n氛围：{氛围词}。\n\n构图规范：高质量专业场景设定图，横向构图，以 2 行 2 列的干净网格四等分整齐排版，每个格子都是独立的 16:9 横向画面，展示同一场景的四个大全景视角（1 为正面中心线大全景视图，镜头正对场景中心轴，构图严格居中，画面同时包含顶面与底面，尽量展示完整空间层次、更多环境细节和深景深；2 以 1 的中心线为参考，摄像机移动到场景左前方 45 度位置的大全景视图，镜头仍对准场景核心区域；3 以 1 的中心线为参考，摄像机移动到场景右前方 45 度位置的大全景视图；4 为镜头在室内最深处向外拍摄的正中心全景图）。四个视角必须是同一地点、同一时间、同一天气、同一光源、同一空间结构和同一美术风格。环境清晰，细节丰富，景深较深，光影自然，专业摄影，超清画质。不得出现任何人物（空场景参考图，必须空无一人），也不得出现人群、背影、剪影、人脸、手脚、人物倒影、阴影、照片人物、屏幕人物、镜中人物、剧情事件、人物活动；不得让四个视角表现成四个不同场景；不得改变建筑结构、空间比例、主体位置、材质、色彩、天气、时间段或光源方向；画面构图不得倾斜、透视畸变、广角畸变、变形、扭曲；不得出现鱼眼视角、斜角、极端俯视、极端仰视；正面视图必须居中、对称、中心线构图；禁止模糊、低画质；禁止景深太浅；不得出现文字、水印、签名、边框、标签、UI元素。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'character-setting-sheet-default',
    name: '角色设定图',
    prompt: `名称：{角色名}。\n\n描述：{性别/年龄/身高/体型/发型/肤色/脸型…}\n\n服装：{上衣}/{下装}/{鞋}/{帽}，{饰品}。\n\n特征：{特征}。\n\n构图规范：高质量专业角色设定图，横向构图，纯白色纯净背景，中性摄影棚灯光，平光布光；布局结构（必须是角色四视图）：正面面部头部特写（占图片水平 1/3 的空间）+ [全身正面视图 + 全身左侧面视图 + 全身背面视图]（占图片水平剩余的 2/3 的空间，并列排列），四个视图中间用淡灰色(#E2E2E2)的 2px 细线分割，无任何道具或背景物体。光影：中性摄影棚灯光，柔和的前侧光，清晰的轮廓定义，自然的肤色，面部清晰服装可辨识，平视镜头，完整全身，无裁剪。不得出现任何道具/武器/食物/饮料/手持物（角色必须空手）；不得出现复杂动作、情绪表情、面部遮挡；不得出现环境背景（仅白色）；不得出现其他角色；确保所有视图中的面部特征、发型、体型和服装保持一致；不得出现文字、水印、标签、UI元素；无背景场景，无过度风格化，纯 Naive 样貌。\n\n[视觉风格：{视觉风格}]`,
  },
  {
    id: 'annotation-edit-default',
    name: '按标注修改',
    prompt: `You are editing an image from annotation markup. One or more reference images include the clean original and/or a screenshot with arrows, boxes, circles, and written notes showing the requested changes.\n\nApply every visible annotation instruction literally (arrows point to the region to change; text labels describe what to do). Preserve the original subject, composition, aspect ratio, identity, style, lighting, and background unless an annotation explicitly asks to change them.\n\nOutput ONLY a clean final bitmap with the edits applied. Do NOT render annotation artifacts: no red/colored arrows, boxes, circles, underlines, handwritten labels, callouts, selection outlines, resize handles, toolbars, cursors, or UI chrome.`,
  },
  {
    id: 'canvas-default',
    name: '画板提示词',
    prompt: `Analyze the strokes and features of this sketch. Interpret the user's drawing intent and any visible text, then generate a high-quality image that transforms this rough draft into a fully realized concept. [IMPORTANT: Strictly follow the pose, composition, and layout of the provided reference image. The reference image contains the primary structure. Maintain the visual elements from the input image with high fidelity.]`,
  },
  {
    id: 'cinematic-scene-identity-board-default',
    name: '电影级场景身份板',
    prompt: `创建一张艺术性的 16:9 场景身份板。\n[空间主体]: @参考图像\n中性柔和的米白/暖灰美术画册版面作为承载多视角画面的画布。无水印、无 logo、无杂乱边框。\n设计方向:\n不要做标准的场景参考表或分镜表,创建一张电影般的「空间身份板」,感觉像高端动画工作室的场景美术研究与艺术设定集版面的结合。布局应不对称、优雅且视觉上令人难忘。使用大片留白、多样化的画幅比例和有意的不平衡。避免网格、目录式排布、等距小图阵列和重复的机位陈列。\n重要布局规则:\n不要重叠任何机位画面。每个视角之间必须有清晰的分隔和呼吸空间。保持所有机位、景别、细节研究在视觉上彼此独立。\n主要构图:\n放置一个大型「英雄建立镜头」(大远景全景空间),略微偏离中心作为视觉锚点。围绕它,以干净的间距排列较小的辅助机位研究:高空俯视/鸟瞰、反打镜头、低角度仰拍、过肩/主观视角、侧拍纵深、人视点中景、关键区域中景、局部材质特写。\n空间锁定:\n在所有视角中保持严格的空间一致性:相同建筑结构、相同材质与表面、相同光线方向与光质、相同色调、相同关键地标与道具、相同时代设定、相同空气与氛围。8k 分辨率,超写实,极致材质细节。`,
  },
  {
    id: 'cinematic-character-identity-board-default',
    name: '电影级角色身份板',
    prompt: `创建一张艺术性的16:9角色身份板。\n[主体]: @参考图像\n纯白色/柔和的米白色背景。无环境、无道具、无标志、无水印。\n设计方向:\n不要创建标准的角色参考表，创建一张电影般的身份板，感觉像是高端动画工作室的角色研究与艺术书布局的结合。布局应不对称、优雅且视觉上令人难忘。使用大片留白、多样化的图像比例和有意的不平衡。\n重要布局规则:\n不要重叠任何角色图像。每个视角必须有清晰的分离和呼吸空间。无裁剪面部、无隐藏肢体、无堆叠人物、无合并姿势。\n主要构图:\n放置一个大型英雄全身视角，略微偏离中心作为视觉锚点。围绕它，以干净的间距排列较小的辅助研究：中性全身视角、背面视角、侧面视角、坐姿、倾斜姿势、蹲姿、俯视身体角度、仰视身体角度、富有表现力的肖像研究。\n身份锁定:\n在所有视角中保持严格的身份一致性:相同面部、相同面部比例、相同发型、相同服装、相同身体比例、相同姿势语言、相同视觉个性。8k分辨率，超写实，极致逼真的皮肤纹理，毛孔。`,
  },
  {
    id: 'character-sheet-default',
    name: '角色板',
    prompt: `(strictly mimic source image art style:1.5), (same visual style:1.4), score_9, score_8_up, masterpiece, best quality, (character sheet:1.4), (reference sheet:1.3), (consistent art style:1.3), matching visual style,\n[Structure & General Annotations]: multiple views, full body central figure, clean background, (heavy annotation:1.4), (text labels with arrows:1.3), handwriting, data readout,\n[SPECIAL CHARACTER DESCRIPTION AREA]: (prominent character profile text box:1.6), (dedicated biography section:1.5), large descriptive text block, [在此处填写特殊角色说明，例如：姓名、种族、背景故事等],\n[Clothing Breakdown]: (clothing breakdown:1.5), (outfit decomposition:1.4), garment analysis, (floating apparel:1.3), displaying outerwear, displaying upper body garment, displaying lower body garment,\n[Footwear Focus]: (detailed footwear display:1.5), (floating shoes:1.4), shoe design breakdown, focus on shoes,\n[Inventory & Details]: (inventory knolling:1.2), open container, personal accessories, organized items display, expression panels`,
  },
  {
    id: 'storyboard-default',
    name: '分镜版',
    prompt: `you are a veteran Hollywood storyboard artist with years of experience. You have the ability to accurately analyze character features and scene characteristics based on images. Provide me with the most suitable camera angles and storyboards. Strictly base this on the uploaded character and scene images, while maintaining a consistent visual style.\n\nMANDATORY LAYOUT: Create a precise 3x3 GRID containing exactly 9 distinct panels.\n- The output image MUST be a single image divided into a 3 (rows) by 3 (columns) matrix.\n- Each panel must be completely separated by a thin, distinct, solid black line.\n- DO NOT create a collage. DO NOT overlap images.\nSubject Content: "[在此处填充你对故事的描述]"\nStyling Instructions:\n- Each panel shows the SAME subject/scene from a DIFFERENT angle (e.g., Front, Side, Back, Action, Close-up).\n- Maintain perfect consistency of the character/object across all panels.\n- Cinematic lighting, high fidelity, 8k resolution.\nNegative Constraints: No text, no captions, no UI elements, no watermarks, no broken grid lines.`,
  },
  {
    id: 'moodboard-default',
    name: '情绪板',
    prompt: `# Directive: Create a "Rich Narrative Mood Board" (8-Grid Layout)\n\nAct as a Senior Art Director. Synthesize the reference images and story into a single, cohesive, high-density Visual Mood Board using an 8-Panel Asymmetrical Grid Layout:\n- Panel 1 (The World): Wide cinematic establishing shot of the environment.\n- Panel 2 (The Protagonist): Portrait close-up focusing on micro-expressions.\n- Panel 3 (The Metaphor): Abstract symbolic object representing the core theme.\n- Panel 4 (The Palette): Graphical Color Palette Strip showcasing 5 extracted colors.\n- Panel 5 (The Texture): Extreme macro close-up of a material surface.\n- Panel 6 (The Motion): Motion-blurred or long-exposure shot representing time/rhythm.\n- Panel 7 (The Detail): Focused shot of a key prop or accessory.\n- Panel 8 (Artistic Interpretation): Surreal or editorial vibe image capturing the soul of the narrative.\nComposition Style: High-end Editorial / Magazine Layout with clean thin white borders and unified lighting.`,
  },
  {
    id: 'product-retouch-default',
    name: '精修产品',
    prompt: `将主体置于纯白无缝背景中，利用3D渲染级光影重塑其初始材质(如高级皮革的哑光纹理、塑料组件的镜面反光)。一键抹除所有物理磨损、泥土污渍与岁月痕迹，恢复至全新出厂状态。强化立体光感与阴影过渡，提升整体商业精致度，直出符合顶配电商主图的标准图像。`,
  },
  {
    id: 'clutter-removal-default',
    name: '杂物消失',
    prompt: `精准提取目标产品并无缝置入新场景。强制启用全局光照(GI)计算，完美吸收环境双光源(如冷蓝光与暖橙光)形成立体反射。真实演算玻璃材质的透光率与折射率，并在承接面上投射带有液体色彩的物理焦散阴影(Caustics)，彻底消除边缘抠图感，实现电影级空间光影融合。`,
  },
  {
    id: 'product-composite-default',
    name: '产品融图',
    prompt: `精准提取目标产品并无缝置入新场景。强制启用全局光照(GI)计算，完美吸收环境双光源(如冷蓝光与暖橙光)形成立体反射。真实演算玻璃材质的透光率与折射率，并在承接面上投射带有液体色彩的物理焦散阴影(Caustics)，彻底消除边缘抠图感，实现电影级空间光影融合。`,
  },
  {
    id: 'style-replication-default',
    name: '风格复刻',
    prompt: `提取参考图的环境特效与空间深度遮挡Mask(蒙版)。将目标产品完美替换入特效中心，强制保留原始流体/烟雾对主体的前景遮挡关系。重构产品表面光线折射模型，使其100%匹配新场景的复杂环境光(如金属反光、丝绸漫反射)，实现特效与实物的像素级物理融合。`,
  },
  {
    id: 'product-to-lineart-default',
    name: '产品转线稿',
    prompt: `智能提取目标物体的空间透视与三维轮廓，一键转化为极具机械美感的工业设计黑白概念线稿。精准勾勒复杂的空气动力学边缘、机械传动部件与装配接缝。在背景自动生成专业的流体力学辅助线、透视网格及尺寸标注排版。采用精准的马克笔触与轻微的灰阶排线表现截面体积，呈现顶级工业设计师的手绘蓝图质感。`,
  },
  {
    id: 'blur-to-hd-default',
    name: '糊图变高清',
    prompt: `智能识别并彻底抹除画面中的破坏性杂物及其投射的混乱阴影。激活AI像素级重建算法，深度解析并完美延展被遮挡的复杂背景(如高难度几何印花、编织纹理等)。强制对齐全局光照逻辑，无缝重连断裂的环境光影(如百叶窗投影)，确保填补区域与原始画面在纹理、透视与光照上达成100%的物理级统一，拒绝任何PS涂抹痕迹`,
  },
  {
    id: 'gpt-denoise-default',
    name: 'GPT噪点消除',
    prompt: `请基于上传的图片进行整体修复与画质优化，不要重新生成画面。严格保留原图的排版、主体内容、人物/物体、动作、场景关系、构图和分镜顺序，不要改变故事内容，不要随意增删元素。重点优化：1. 去除画面脏感、灰感、噪点、颗粒感、压缩痕迹、杂乱纹理、模糊边缘和低质量伪影；2. 提升整体清晰度、细节干净度和画面通透感；3. 优化色彩，让颜色更纯净、更协调、更有层次；4. 统一画面的视觉风格；5. 只做优化和统一，不要重构场景，不要添加文字、logo、水印。100% pure CG, Unreal Engine 5 cinematic cutscene, Octane render quality, 8K ultra-detailed, ray tracing, global illumination, MetaHuman high quality digital humans.`,
  },
  {
    id: 'upscale-default',
    name: '高清放大',
    prompt: `请对参考图片进行无损高清放大（Upscale）。请严格保持原图的构图、色彩、光影和所有细节元素不变，不要进行任何创造性的重绘或添加新内容。仅专注于提升分辨率、锐化边缘（Sharpening）和去除噪点（Denoising），实现像素级的高清修复。Best quality, 8k, masterpiece, highres, ultra detailed, sharp focus, image restoration, upscale, faithful to original.`,
  },
  {
    id: 'grid-default',
    name: '九宫格分镜脚本',
    prompt: `基于我上传的这张参考图，生成一张九宫格（3x3 grid）布局的分镜脚本。请严格保持角色与参考图一致（Keep character strictly consistent），但在9个格子中展示该角色不同的动作、表情和拍摄角度（如正面、侧面、背面、特写等）。要求风格高度统一，形成一张完整的角色动态表（Character Sheet）。`,
  },
  {
    id: 'builtin_md_10',
    name: '360全景图',
    prompt: `生成一个720度的全景VR图，左右边缘100%像素级无缝衔接，可无限循环拼接；上下极点(南北极)自然过渡，无明显断层或拉伸，场景一致性，以及场景的逻辑性，封闭场景需要有门\n\nNegative prompt:\nseam, visible seam, hard seam, broken panorama, discontinuous edge, mismatched left and right edges, distorted poles, stretched ceiling, stretched floor, warped horizon, inconsistent scene logic, impossible space, no exit in closed room, text, letters, labels, watermark, logo, blurry, low quality`,
  },
  {
    id: 'builtin_md_9',
    name: '6种基础表情胸像',
    prompt: `Character expression reference sheet in 2x3 grid layout, six basic expressions of the same character: top row from left to right: calm neutral expression, gentle smile, joyful laugh; bottom row from left to right: sad tearful expression, angry stern expression, surprised astonished expression. All six expressions are chest-up close-up portraits of the same character, shoulder-up framing, extreme facial detail clarity, realistic skin texture preserved, light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, identical character styling, hairstyle, makeup and accessories across all six panels, only facial expression changes, professional character expression sheet style, clean edges, absolutely no visible numbers, text, labels, frame counters, corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_8',
    name: '角色设定参考表',
    prompt: `Character reference sheet, left-right split layout: left one-third area is chest-up close-up front view portrait (shoulder-up framing, extreme facial detail clarity, gentle natural expression, realistic skin texture with visible pores); right two-thirds area is three full-body views in horizontal row, from left to right: full-body front standing pose, full-body side profile view, full-body back view. Consistent front-top-side lighting across all panels, light warm gray background color F0EDE8, identical character design, costume, hairstyle and accessories across all panels, professional character design sheet style, clean edges, accurate proportions, absolutely no visible numbers, text, labels, frame counters, corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_7',
    name: '电影级光影校正',
    prompt: `Cinematic lighting comparison sheet, 6 panels showing the same [主体/场景] under different lighting conditions: top-left golden hour warm backlight, top-center overcast soft diffused light, top-right neon night city light, bottom-left harsh midday direct sun, bottom-center Rembrandt 45-degree side light with triangle shadow, bottom-right dramatic low-key chiaroscuro. Consistent composition and subject across all panels, only lighting changes, light warm gray background color F0EDE8, professional cinematography reference, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_6',
    name: '25宫格连贯分镜',
    prompt: `A 5x5 cinematic storyboard grid, 25 sequential frames showing continuous narrative flow of [主体/场景/动作], naturally divided into 9 story beats progressing through beginning, development, escalation, twist, climax, and resolution. Scene transitions conveyed purely through visual continuity and character motion, absolutely no visible numbers, text, labels, frame counters, corner marks, or annotations anywhere on the image. Consistent character and environment across all 25 frames, smooth motion continuity between adjacent frames, uniform cinematic lighting and color palette, light warm gray background color F0EDE8, varied shot progression from wide to close-up, professional film storyboard aesthetic, clean thin white grid dividers`,
  },
  {
    id: 'builtin_md_5',
    name: '产品三视图',
    prompt: `Product design reference sheet, three orthographic views in single row: front view, side view, top view. [产品详细描述]. Light warm gray background color F0EDE8, products softly blending with background with natural edge transition, studio lighting with soft shadows, technical drawing aesthetic, precise proportions, material texture visible, no perspective distortion, professional product photography, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_4',
    name: '角色脸部三视图',
    prompt: `Character face reference sheet, three views side by side in single row: left panel front view straight-on, center panel 3/4 angle view, right panel side profile view. [角色面部详细描述]. Consistent lighting from 45-degree top-side across all three views, light warm gray background color F0EDE8, neutral clean backdrop, professional character design sheet, clean linework, subtle skin texture, identical facial features maintained across all angles, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_3',
    name: '剧情推演四宫格',
    prompt: `A 4-panel storyboard sequence in 2x2 grid, showing narrative progression of [事件/场景]: top-left [阶段1描述], top-right [阶段2描述], bottom-left [阶段3描述], bottom-right [阶段4描述]. Consistent character design across all panels, coherent lighting and color palette, uniform light warm gray background color F0EDE8, cinematic composition, emotional arc from [情绪A] to [情绪B], film grain texture, clean thin white grid dividers, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_2',
    name: '多机位九宫格4K',
    prompt: `Ultra high resolution multi-camera angle reference sheet in 3x3 grid layout, 4K quality, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent cinematic lighting across all 9 frames, uniform light warm gray background color F0EDE8, professional studio photography with medium format film aesthetic, clean grid layout with thin white dividers between frames, character consistency maintained across all angles, fine organic film grain, zero digital sharpening, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image`,
  },
  {
    id: 'builtin_md_1',
    name: '多机位九宫格',
    prompt: `A multi-camera angle reference sheet in 3x3 grid layout, showing [主体] from 9 different perspectives simultaneously: top-left front view, top-center 3/4 front view, top-right side profile, middle-left low angle, middle-center eye-level straight-on, middle-right high angle, bottom-left back view, bottom-center 3/4 back view, bottom-right top-down overhead view. [主体详细描述]. Consistent lighting across all 9 frames, uniform light warm gray background color F0EDE8, subjects softly blending with background with natural edge transition, no hard edges no white halo no light bleed, professional studio photography, clean grid layout with thin white dividers between frames, character consistency maintained across all angles, absolutely no visible numbers text labels frame counters corner marks or annotations anywhere on the image`,
  },
];

function readCustomPromptTemplates(): CanvasPromptTemplateItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROMPT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.prompt === 'string')
      .map((item) => ({ id: item.id, name: item.name, prompt: item.prompt, custom: true }));
  } catch {
    return [];
  }
}

export function CanvasPromptLibrarySection({
  currentPrompt,
  onSelectTemplate,
  onClose,
}: {
  currentPrompt?: string;
  onSelectTemplate: (prompt: string, templateName: string) => void;
  onClose?: () => void;
}) {
  const [customTemplates, setCustomTemplates] = useState<CanvasPromptTemplateItem[]>(readCustomPromptTemplates);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const saveCustomTemplates = (next: CanvasPromptTemplateItem[]) => {
    setCustomTemplates(next);
    try {
      window.localStorage.setItem(CUSTOM_PROMPT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore quota errors
    }
  };

  const allTemplates = [...customTemplates, ...DEFAULT_PROMPT_TEMPLATES];

  return (
    <div
      data-prompt-library-drawer="true"
      className="mt-2.5 mb-2"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onClose?.()}
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-zinc-700 transition-colors hover:text-zinc-950 dark:text-white/90 dark:hover:text-white cursor-pointer"
        >
          <span>常用提示词库</span>
          <ChevronDown size={13} className="opacity-80" />
        </button>

        {Boolean(currentPrompt?.trim()) && (
          <div className="flex items-center gap-1.5">
            {adding ? (
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="输入词条名称"
                  className="h-6 w-28 rounded-lg border border-zinc-300 bg-white px-2 text-[11px] text-zinc-900 outline-none dark:border-white/15 dark:bg-black/40 dark:text-white"
                />
                <button
                  type="button"
                  disabled={!newName.trim() || !currentPrompt?.trim()}
                  onClick={() => {
                    const name = newName.trim();
                    const prompt = (currentPrompt || '').trim();
                    if (!name || !prompt) return;
                    const created: CanvasPromptTemplateItem = {
                      id: `custom-${Date.now()}`,
                      name,
                      prompt,
                      custom: true,
                    };
                    saveCustomTemplates([created, ...customTemplates]);
                    setNewName('');
                    setAdding(false);
                  }}
                  className="rounded-lg bg-zinc-900 px-2 py-0.5 text-[11px] font-medium text-white disabled:opacity-40 dark:bg-white dark:text-zinc-950 cursor-pointer"
                >
                  保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAdding(false);
                    setNewName('');
                  }}
                  className="rounded-lg px-1.5 py-0.5 text-[11px] text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                type="button"
                title="将当前输入框提示词保存为常用词条"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] text-zinc-500 transition-colors hover:bg-black/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200 cursor-pointer"
              >
                <Plus size={11} />
                <span>存为词条</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex max-h-[144px] flex-wrap gap-2 overflow-y-auto no-scrollbar">
        {allTemplates.map((item) => (
          <div key={item.id} className="group/chip relative inline-flex items-center">
            <button
              type="button"
              title={item.prompt}
              onClick={() => onSelectTemplate(item.prompt, item.name)}
              className="rounded-[8px] bg-zinc-100 px-2.5 py-1.5 text-[12px] font-medium leading-none text-zinc-700 transition-colors hover:bg-zinc-200 hover:text-zinc-950 dark:bg-[#2a2a2e] dark:text-white/90 dark:hover:bg-[#35353a] dark:hover:text-white cursor-pointer"
            >
              {item.name}
            </button>
            {item.custom && (
              <button
                type="button"
                aria-label={`删除词条 ${item.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  saveCustomTemplates(customTemplates.filter((entry) => entry.id !== item.id));
                }}
                className="ml-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-zinc-700 text-zinc-200 group-hover/chip:inline-flex hover:bg-rose-500 hover:text-white cursor-pointer"
              >
                <X size={10} />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
