import { useState, useRef, useEffect, type RefObject } from 'react';
import {
  UploadCloud,
  FolderArchive,
  Link2,
  Sparkles,
  ChevronRight,
  Info,
  Check,
} from 'lucide-react';

export interface PromptPresetItem {
  id: string;
  category: string;
  title: string;
  prompt: string;
}

export const DEFAULT_PROMPT_PRESETS: PromptPresetItem[] = [
  {
    id: 'preset-film',
    category: '电影质感',
    title: '35mm 胶片电影光影',
    prompt: '电影级景深，35mm柯达胶片色彩，柔和晨光逆光漫射，细腻颗粒感，超高清8k，情绪氛围感大片。',
  },
  {
    id: 'preset-product',
    category: '电商商拍',
    title: '极简静物摄影光',
    prompt: '高端商用静物摄影，工作室布光，干净米白色磨砂背景，柔和微阴影，极简主义构图，顶级质感。',
  },
  {
    id: 'preset-portrait',
    category: '人像特写',
    title: '时尚大片高级肖像',
    prompt: '高端时尚杂志封面风格，面部立体轮廓光，自然发丝细节，清透妆容，微表情抓拍，大师级肖像。',
  },
  {
    id: 'preset-cyberpunk',
    category: '科幻未来',
    title: '赛博霓虹街头夜景',
    prompt: '未来科技都市夜景，湿漉漉的街道倒影，蓝紫渐变霓虹灯光晕，体积雾光束，电影级运镜氛围。',
  },
  {
    id: 'preset-macro',
    category: '自然微距',
    title: '微距晨露光斑',
    prompt: '超微距特写，透明晨露折射花瓣纹理，唯美梦幻光斑，大光圈虚化，超清显微细节，生机盎然。',
  },
];

interface PromptBarUploadMenuProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
  onTriggerLocalUpload: () => void;
  onOpenAssetLibrary: () => void;
  onSubmitVideoUrl?: (url: string) => void;
  onSelectPresetPrompt: (prompt: string) => void;
  isUp?: boolean;
}

export default function PromptBarUploadMenu({
  isOpen,
  onClose,
  triggerRef,
  onTriggerLocalUpload,
  onOpenAssetLibrary,
  onSubmitVideoUrl,
  onSelectPresetPrompt,
  isUp = true,
}: PromptBarUploadMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showPresetsSubmenu, setShowPresetsSubmenu] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [videoUrlText, setVideoUrlText] = useState('');
  const [copiedPresetId, setCopiedPresetId] = useState<string | null>(null);

  // 点击外部自动关闭
  useEffect(() => {
    if (!isOpen) {
      setShowPresetsSubmenu(false);
      setShowUrlInput(false);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const handleApplyPreset = (item: PromptPresetItem) => {
    onSelectPresetPrompt(item.prompt);
    setCopiedPresetId(item.id);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleConfirmUrl = () => {
    if (videoUrlText.trim() && onSubmitVideoUrl) {
      onSubmitVideoUrl(videoUrlText.trim());
      setVideoUrlText('');
      setShowUrlInput(false);
      onClose();
    }
  };

  return (
    <div
      ref={menuRef}
      className={`absolute left-0 ${
        isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
      } w-52 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.12)] p-1.5 z-50 animate-fade-in text-left select-none`}
    >
      {/* 1. 本地上传 */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onTriggerLocalUpload();
        }}
        className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 flex items-center gap-2.5 transition-colors cursor-pointer group"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-600 transition-colors shrink-0" />
        <UploadCloud className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
        <span>本地上传</span>
      </button>

      {/* 2. 资产库 */}
      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenAssetLibrary();
        }}
        className="w-full px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:text-slate-950 hover:bg-slate-100/80 flex items-center gap-2.5 transition-colors cursor-pointer group"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-600 transition-colors shrink-0" />
        <FolderArchive className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
        <span>资产库</span>
      </button>

      {/* 3. 视频链接上传 */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowUrlInput(!showUrlInput)}
          className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer group ${
            showUrlInput
              ? 'bg-slate-100/90 text-slate-950'
              : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-600 transition-colors shrink-0" />
            <Link2 className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700" />
            <span>视频链接上传</span>
          </div>
          <span title="支持粘贴直链 MP4 或主流短视频链接进行智能解析引用">
            <Info className="w-3.5 h-3.5 text-slate-400 hover:text-slate-600 transition-colors" />
          </span>
        </button>

        {showUrlInput && (
          <div className="p-2 mt-1 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1.5 animate-fade-in">
            <input
              type="url"
              placeholder="粘贴视频 URL 链接..."
              value={videoUrlText}
              onChange={(e) => setVideoUrlText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConfirmUrl();
                if (e.key === 'Escape') setShowUrlInput(false);
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              autoFocus
            />
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => setShowUrlInput(false)}
                className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 rounded cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmUrl}
                disabled={!videoUrlText.trim()}
                className="px-2.5 py-1 text-[11px] font-medium bg-slate-900 text-white rounded-md hover:bg-black disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
              >
                导入
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. 预设提示词 > */}
      <div
        className="relative"
        onMouseEnter={() => setShowPresetsSubmenu(true)}
        onMouseLeave={() => setShowPresetsSubmenu(false)}
      >
        <button
          type="button"
          onClick={() => setShowPresetsSubmenu(!showPresetsSubmenu)}
          className={`w-full px-3 py-2 rounded-xl text-xs font-medium flex items-center justify-between transition-colors cursor-pointer group ${
            showPresetsSubmenu
              ? 'bg-slate-100/90 text-slate-950'
              : 'text-slate-700 hover:text-slate-950 hover:bg-slate-100/80'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-slate-600 transition-colors shrink-0" />
            <Sparkles className="w-3.5 h-3.5 text-amber-500 group-hover:text-amber-600" />
            <span>预设提示词</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600" />
        </button>

        {/* 二级菜单 */}
        {showPresetsSubmenu && (
          <div
            className={`absolute left-full top-0 ml-1.5 w-64 rounded-2xl bg-white border border-slate-200/90 shadow-[0_16px_40px_rgba(0,0,0,0.14)] p-1.5 z-50 animate-fade-in text-left`}
          >
            <div className="px-2.5 py-1 text-[10.5px] font-semibold text-slate-400 border-b border-slate-100/80 pb-1 mb-1">
              精选爆款提示词模版
            </div>
            <div className="space-y-0.5 max-h-60 overflow-y-auto">
              {DEFAULT_PROMPT_PRESETS.map((item) => {
                const isCopied = copiedPresetId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleApplyPreset(item)}
                    className="w-full px-2.5 py-1.5 rounded-xl text-xs flex flex-col text-left hover:bg-slate-50 transition-colors cursor-pointer group/item"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800 group-hover/item:text-slate-950">
                        {item.title}
                      </span>
                      {isCopied ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <span className="text-[10px] text-slate-400 font-normal">
                          {item.category}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 line-clamp-1 mt-0.5 font-normal">
                      {item.prompt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
