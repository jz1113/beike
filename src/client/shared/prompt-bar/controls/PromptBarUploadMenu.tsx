import React, { useState, useRef, useEffect, type RefObject } from 'react';
import {
  ChevronRight,
  Info,
  Search,
  Plus,
  BookOpen,
  Download,
  Upload,
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

  // 状态模式：主菜单 | 视频链接气泡 (图4)
  const [activeView, setActiveView] = useState<'main' | 'videoUrl'>('main');

  // 预设提示词二级面板状态 (图5)
  const [showPresetsSubmenu, setShowPresetsSubmenu] = useState(false);
  const [presetSearch, setPresetSearch] = useState('');
  const [customPresets, setCustomPresets] = useState<PromptPresetItem[]>([]);
  const [isCreatingPreset, setIsCreatingPreset] = useState(false);
  const [newPresetText, setNewPresetText] = useState('');

  // 视频链接输入状态 (图4)
  const [videoUrlText, setVideoUrlText] = useState('');

  // 点击外部与 ESC 按键自动关闭
  useEffect(() => {
    if (!isOpen) {
      setActiveView('main');
      setShowPresetsSubmenu(false);
      setVideoUrlText('');
      setIsCreatingPreset(false);
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

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  if (!isOpen) return null;

  const handleApplyPreset = (item: PromptPresetItem) => {
    onSelectPresetPrompt(item.prompt);
    onClose();
  };

  const handleConfirmUrl = () => {
    if (videoUrlText.trim() && onSubmitVideoUrl) {
      onSubmitVideoUrl(videoUrlText.trim());
      setVideoUrlText('');
      onClose();
    }
  };

  const handleCreateNewPreset = () => {
    if (!newPresetText.trim()) {
      setIsCreatingPreset(true);
      return;
    }
    const newItem: PromptPresetItem = {
      id: `custom-preset-${Date.now()}`,
      category: '自定义',
      title: newPresetText.slice(0, 12),
      prompt: newPresetText.trim(),
    };
    setCustomPresets((prev) => [newItem, ...prev]);
    setNewPresetText('');
    setIsCreatingPreset(false);
  };

  const filteredPresets = [...customPresets, ...DEFAULT_PROMPT_PRESETS].filter((p) =>
    presetSearch.trim()
      ? p.title.toLowerCase().includes(presetSearch.toLowerCase()) ||
        p.prompt.toLowerCase().includes(presetSearch.toLowerCase())
      : true
  );

  // 🌟 图 4：视频链接上传形式浮层
  if (activeView === 'videoUrl') {
    return (
      <div
        ref={menuRef}
        className={`absolute left-0 ${
          isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
        } w-[360px] sm:w-[400px] rounded-[22px] bg-white dark:bg-[#18191c] border border-slate-200/80 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.12)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-4 z-50 animate-fade-in text-left select-none`}
      >
        <div className="text-[13px] text-slate-700 dark:text-slate-200 pb-3 flex items-center flex-wrap gap-1">
          <span>仅支持抖音、头条、西瓜，你也可以</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onTriggerLocalUpload();
            }}
            className="text-indigo-600 hover:text-indigo-700 hover:underline font-medium cursor-pointer transition-colors"
          >
            从本地上传
          </button>
        </div>

        {/* 胶囊输入行与确认按钮 (图4) */}
        <div className="flex items-center gap-2">
          <input
            type="url"
            placeholder="请输入参考内容的链接"
            value={videoUrlText}
            onChange={(e) => setVideoUrlText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirmUrl();
              if (e.key === 'Escape') setActiveView('main');
            }}
            className="flex-1 px-4 py-2 rounded-full border border-slate-300 dark:border-white/15 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-500 dark:focus:border-white/30 focus:ring-1 focus:ring-slate-400 transition-all bg-white dark:bg-white/5"
            autoFocus
          />
          <button
            type="button"
            onClick={handleConfirmUrl}
            disabled={!videoUrlText.trim()}
            className={`px-5 py-2 rounded-full text-xs font-medium transition-all ${
              videoUrlText.trim()
                ? 'bg-slate-900 text-white hover:bg-black dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100 cursor-pointer shadow-xs'
                : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            确认
          </button>
        </div>
      </div>
    );
  }

  // 🌟 图 1、2、3、5、6：标准主菜单（已彻底移除图 6 多余的图标符号）
  return (
    <div
      ref={menuRef}
      className={`absolute left-0 ${
        isUp ? 'bottom-full mb-2 origin-bottom-left' : 'top-full mt-2 origin-top-left'
      } w-[168px] sm:w-[176px] rounded-[22px] bg-white dark:bg-[#18191c] border border-slate-200/80 dark:border-white/10 shadow-[0_16px_40px_rgba(0,0,0,0.08),0_2px_8px_rgba(0,0,0,0.04)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.45)] p-1.5 z-50 animate-fade-in text-left select-none`}
    >
      <button
        type="button"
        onClick={() => {
          onClose();
          onTriggerLocalUpload();
        }}
        className="w-full px-3 py-2 rounded-xl text-[13px] font-normal text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 flex items-center transition-colors cursor-pointer"
      >
        <span>本地上传</span>
      </button>

      <button
        type="button"
        onClick={() => {
          onClose();
          onOpenAssetLibrary();
        }}
        className="w-full px-3 py-2 rounded-xl text-[13px] font-normal text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 flex items-center transition-colors cursor-pointer"
      >
        <span>资产库</span>
      </button>

      <button
        type="button"
        onClick={() => setActiveView('videoUrl')}
        className="w-full px-3 py-2 rounded-xl text-[13px] font-normal text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 flex items-center justify-between transition-colors cursor-pointer group"
      >
        <span>视频链接上传</span>
        <span title="支持抖音、头条、西瓜视频链接解析">
          <Info className="w-4 h-4 text-slate-400 group-hover:text-slate-600 stroke-[1.8] transition-colors" />
        </span>
      </button>

      {/* 4. 预设提示词 (右侧带 > 图标，悬停/点击展现图5二级面板) */}
      <div
        className="relative"
        onMouseEnter={() => setShowPresetsSubmenu(true)}
        onMouseLeave={() => setShowPresetsSubmenu(false)}
      >
        <button
          type="button"
          onClick={() => setShowPresetsSubmenu(!showPresetsSubmenu)}
          className={`w-full px-3 py-2 rounded-xl text-[13px] font-normal flex items-center justify-between transition-colors cursor-pointer group ${
            showPresetsSubmenu
              ? 'bg-slate-50 dark:bg-white/10 text-slate-950 dark:text-white'
              : 'text-slate-800 dark:text-slate-100 hover:text-slate-950 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10'
          }`}
        >
          <span>预设提示词</span>
          <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-600 stroke-[1.8]" />
        </button>

        {/* 🌟 图 5：预设提示词二级面板 */}
        {showPresetsSubmenu && (
          <div
            className="absolute left-full top-0 ml-2 w-[340px] rounded-[24px] bg-white dark:bg-[#18191c] border border-slate-200/80 dark:border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.14)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.45)] p-4 z-50 animate-fade-in text-left flex flex-col gap-3.5"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">预设提示词</span>
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  title="导入预设"
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="导出预设"
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 次级栏：搜索预设输入框 + 新建按钮 (图5) */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="搜索预设..."
                  value={presetSearch}
                  onChange={(e) => setPresetSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:bg-white dark:focus:bg-white/10 focus:border-slate-400 dark:focus:border-white/25 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={handleCreateNewPreset}
                className="px-3.5 py-1.5 rounded-full bg-black text-white dark:bg-white dark:text-slate-900 text-xs font-medium hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors cursor-pointer flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建</span>
              </button>
            </div>

            {/* 新建预设简易录入框 */}
            {isCreatingPreset && (
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2 animate-fade-in">
                <textarea
                  placeholder="输入自定义预设提示词内容..."
                  rows={2}
                  value={newPresetText}
                  onChange={(e) => setNewPresetText(e.target.value)}
                  className="w-full p-2 text-xs bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 resize-none"
                  autoFocus
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingPreset(false);
                      setNewPresetText('');
                    }}
                    className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 rounded cursor-pointer dark:hover:text-slate-100 dark:text-slate-400"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateNewPreset}
                    disabled={!newPresetText.trim()}
                    className="px-3 py-1 text-xs font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg hover:bg-black dark:hover:bg-slate-100 disabled:opacity-40 cursor-pointer"
                  >
                    保存预设
                  </button>
                </div>
              </div>
            )}

            {/* 内容区：如果无预设展现图 5 居中书本空态，否则展现列表 */}
            {customPresets.length === 0 && !presetSearch.trim() ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-3">
                <BookOpen className="w-7 h-7 text-slate-700 dark:text-slate-200 stroke-[1.6]" />
                <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                  暂无预设，点击新建创建第一个预设
                </span>
              </div>
            ) : (
              <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5">
                {filteredPresets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleApplyPreset(item)}
                    className="w-full p-2 rounded-xl text-left hover:bg-slate-50 dark:hover:bg-white/10 transition-colors cursor-pointer group/item flex flex-col"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-100 group-hover/item:text-slate-950 dark:group-hover/item:text-white">
                        {item.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        {item.category}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 line-clamp-1 mt-0.5 font-normal dark:text-slate-400">
                      {item.prompt}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
