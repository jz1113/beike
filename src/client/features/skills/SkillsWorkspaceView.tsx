import { useState, useMemo, useRef } from 'react';
import { HelpCircle, SlidersHorizontal } from 'lucide-react';
import { useAppStore } from '@client/store';
import { useToast } from '@client/shared/hooks/useToast';
import { SkillsTopNav } from './components/SkillsTopNav';
import { SkillsCategoryFilter } from './components/SkillsCategoryFilter';
import { SkillsCardGrid } from './components/SkillsCardGrid';
import {
  type SkillItem,
  type SkillMainTab,
  type SkillDraftData,
  type SkillOutputGenre,
  loadSkillFavorites,
  saveSkillFavorites,
  type SkillFileNode,
  AgentCreateSkillBar,
  ManualSkillStudioModal,
  parseLocalSkillFiles,
  type GeneratedSkillResult,
  type SkillStudioPayload,
  buildSkillFromStudio,
} from '@client/shared/skills';

// 当前没有内置预设技能，数据源默认为空
const BUILTIN_SKILLS: SkillItem[] = [];

export function SkillsWorkspaceView() {
  const [activeTab, setActiveTab] = useState<SkillMainTab>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [favorites, setFavorites] = useState<Set<string>>(() => loadSkillFavorites());

  // 创建技能相关状态
  const [isAgentBarOpen, setIsAgentBarOpen] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [studioFiles, setStudioFiles] = useState<SkillFileNode[] | null>(null);
  const [studioDraft, setStudioDraft] = useState<Partial<SkillDraftData> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { message: toastMsg, show: showToast } = useToast(2500);

  const customSkills = useAppStore((s) => s.assistantCustomSkills);
  const addAssistantSkill = useAppStore((s) => s.addAssistantSkill);
  const setActiveAssistantSkillId = useAppStore((s) => s.setActiveAssistantSkillId);

  // 同步收藏状态至本地持久化
  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        showToast('已取消收藏');
      } else {
        next.add(id);
        showToast('已加入收藏');
      }
      saveSkillFavorites(next);
      return next;
    });
  };

  // 用户创建的自定义技能转换为视图规格项
  const userSkillItems: SkillItem[] = useMemo(() => {
    return (customSkills || []).map((cs) => ({
      id: cs.id,
      title: cs.displayName || cs.name,
      description: cs.description || '自定义创作技能',
      models: '平台自适应',
      category: cs.meta?.tags?.[0] || '我的',
      badge: '我的技能',
      coverUrl: cs.meta?.coverUrl,
      showcaseUrls: cs.meta?.showcaseUrls,
      tags: cs.meta?.tags,
      genres: (cs.meta?.genres || []).filter((genre): genre is SkillOutputGenre =>
        genre === '视频' || genre === '图片' || genre === '音频' || genre === '文本'),
      prompt: cs.prompt || cs.markdownDoc,
      isPublic: cs.meta?.isPublic,
      createdAt: cs.createdAt,
    }));
  }, [customSkills]);

  // 全量技能列表（内置 + 自定义）
  const allSkills = useMemo(() => {
    return [...userSkillItems, ...BUILTIN_SKILLS];
  }, [userSkillItems]);

  // 根据当前主 Tab、次级分类、搜索关键字动态过滤
  const filteredSkills = useMemo(() => {
    return allSkills.filter((skill) => {
      // 1. 主 Tab 过滤
      if (activeTab === 'my') {
        const isMySkill = userSkillItems.some((u) => u.id === skill.id) || skill.category === '我的';
        if (!isMySkill) return false;
      } else if (activeTab === 'favorite') {
        if (!favorites.has(skill.id)) return false;
      }

      // 2. 分类过滤（在全部 Tab 下生效）
      if (activeTab === 'all' && selectedCategory !== '全部') {
        if (skill.category !== selectedCategory) return false;
      }

      // 3. 关键字过滤
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTitle = skill.title.toLowerCase().includes(q);
        const matchDesc = skill.description.toLowerCase().includes(q);
        const matchModels = skill.models.toLowerCase().includes(q);
        if (!matchTitle && !matchDesc && !matchModels) return false;
      }

      return true;
    });
  }, [allSkills, activeTab, selectedCategory, searchQuery, favorites, userSkillItems]);

  const handleUseSkill = (skill: SkillItem) => {
    setActiveAssistantSkillId(skill.id);
    showToast(`已装载技能「${skill.title}」`);
  };

  // 1. 通过 Agent 创建回调
  const handleAgentSkillGenerated = (result: GeneratedSkillResult) => {
    setStudioFiles(result.files);
    setStudioDraft(result.draft);
    setIsStudioOpen(true);
  };

  // 2. 本地上传技能文件处理 (支持 .md, .zip, 文件夹)
  const handleLocalFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    try {
      showToast('正在解析技能文件与规范...');
      const parsed = await parseLocalSkillFiles(files);
      setStudioFiles(parsed.files);
      setStudioDraft(parsed.draft);
      setIsStudioOpen(true);
      showToast(parsed.warnings[0] || '已提取技能元数据并载入工作室');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '技能文件解析失败';
      showToast(msg);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 3. 手动创建技能入口
  const handleOpenManualStudio = () => {
    setStudioFiles(null);
    setStudioDraft(null);
    setIsStudioOpen(true);
  };

  // 4. 保存技能工作室结果
  const handleStudioSave = (data: SkillStudioPayload) => {
    const newSkill = buildSkillFromStudio(data);
    addAssistantSkill(newSkill);
    setActiveAssistantSkillId(newSkill.id);
    showToast(`技能「${data.title}」已保存并激活`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-transparent text-slate-900 dark:text-[#EDEDED]">
      {/* 隐藏的本地技能上传文件输入框 */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".md,.zip,.txt,text/markdown,application/zip"
        onChange={handleLocalFilesUpload}
        className="hidden"
      />

      {/* 顶部主导航栏：全部 / 我的 / 收藏 + 搜索 + 创建技能 (图1) */}
      <SkillsTopNav
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab !== 'all') setSelectedCategory('全部');
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectAgentCreate={() => setIsAgentBarOpen(true)}
        onSelectLocalUpload={() => fileInputRef.current?.click()}
        onSelectManualCreate={handleOpenManualStudio}
      />

      {/* 通过 Agent 创建输入胶囊 (对齐图2) */}
      <AgentCreateSkillBar
        isOpen={isAgentBarOpen}
        onClose={() => setIsAgentBarOpen(false)}
        onGenerated={handleAgentSkillGenerated}
        showToast={showToast}
      />

      {/* 次级分类筛选胶囊（仅在“全部”Tab下展示） */}
      {activeTab === 'all' && (
        <SkillsCategoryFilter
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
        />
      )}

      {/* 主体展示区：卡片网格 */}
      <main className="flex-1 min-h-0 overflow-y-auto">
        <SkillsCardGrid
          skills={filteredSkills}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onUseSkill={handleUseSkill}
          emptyMessage="暂无技能"
        />
      </main>

      {/* 右下角悬浮工具按钮 */}
      <div className="fixed bottom-6 right-6 z-20 flex flex-col items-center gap-2 select-none">
        <button
          type="button"
          onClick={handleOpenManualStudio}
          aria-label="快捷管理技能"
          title="技能工作室"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-[#1E1E22] text-slate-600 dark:text-slate-300 shadow-md border border-black/[0.06] dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#28282D] hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => showToast('技能中心：支持 Agent 生成、本地解析与手动编排完整技能包')}
          aria-label="帮助说明"
          title="帮助说明"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-[#1E1E22] text-slate-500 dark:text-slate-400 shadow-md border border-black/[0.06] dark:border-white/10 hover:bg-slate-50 dark:hover:bg-[#28282D] hover:text-slate-900 dark:hover:text-white transition-all cursor-pointer"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </div>

      {/* 手动技能创建工作室模态窗口 (完整复刻图3~8) */}
      <ManualSkillStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
        showToast={showToast}
        initialFiles={studioFiles}
        initialDraft={studioDraft}
        onSave={handleStudioSave}
      />

      {/* Toast 提示浮条 */}
      {toastMsg && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 rounded-full bg-slate-900/90 dark:bg-white/95 px-5 py-2 text-xs font-medium text-white dark:text-slate-900 shadow-xl backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  );
}

export default SkillsWorkspaceView;
