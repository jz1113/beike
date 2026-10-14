import React, { useState, useEffect, useMemo, useRef } from 'react';
import PromptActionBar, { type SubjectItem } from '@client/shared/prompt-bar';
import { useAppStore } from '@client/store';
import type { CanvasSubject } from '../../model/types';

export interface CanvasPromptDockProps {
  onSubmit?: (prompt: string, refImage?: string, mode?: string, tasks?: any[]) => void;
  disabled?: boolean;
  subjects?: CanvasSubject[];
  mentionTrigger?: { name: string; url: string; timestamp: number; type?: 'image' | 'video'; attachOnly?: boolean } | null;
  'data-testid'?: string;
}

/**
 * 🌟 画板底部输入控制舱 (完全复用与对齐主页功能框设计，杜绝私自魔改功能)
 * 具备画布常态胶囊条折叠与点击聚焦自适应展开能力，严格与主页功能框保持一致
 */
export const CanvasPromptDock: React.FC<CanvasPromptDockProps> = ({ onSubmit, subjects = [], mentionTrigger, 'data-testid': testId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  // 将画板中的素材主体映射为 PromptActionBar 支持的主体格式
  const extraSubjects = useMemo<SubjectItem[]>(() => {
    return subjects.map((s) => ({
      id: s.id,
      name: s.name,
      tag: s.name,
      url: s.url,
      count: 1,
    }));
  }, [subjects]);

  // 响应外部节点快捷主体引用触发（例如点击节点上方的 @引用 按钮）
  useEffect(() => {
    if (mentionTrigger) {
      const appStore = useAppStore.getState();
      const currentPrompt = appStore.quickPrompt || '';
      const mentionText = `@${mentionTrigger.name} `;
      const nextPrompt = currentPrompt.includes(mentionText)
        ? currentPrompt
        : currentPrompt
        ? `${currentPrompt} ${mentionText}`
        : mentionText;
      if (!mentionTrigger.attachOnly) appStore.setQuickPrompt(nextPrompt);
      if (mentionTrigger.type === 'video') {
        appStore.setQuickGenMode('video');
        appStore.setQuickVideoRefMode('omni');
      }

      if (mentionTrigger.url) {
        if (!appStore.quickRefImages.includes(mentionTrigger.url)) appStore.addQuickRefImage(mentionTrigger.url);
      }
      setIsExpanded(true);
      const frame = requestAnimationFrame(() => dockRef.current?.querySelector<HTMLElement>('[contenteditable="true"], textarea')?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [mentionTrigger]);

  const handleSubmitSuccess = (info: { prompt: string; refImages: string[]; mode: string; tasks?: any[] }) => {
    onSubmit?.(info.prompt, info.refImages[0], info.mode, info.tasks);
  };

  return (
    <div
      ref={dockRef}
      data-testid={testId}
      className={`w-full mx-auto pointer-events-auto min-w-0 transition-all duration-300 ease-out select-none ${
        isExpanded ? 'max-w-3xl xl:max-w-4xl' : 'max-w-[560px] 2xl:max-w-[620px]'
      }`}
    >
      <PromptActionBar
        dropdownPlacement="up"
        collapsible={true}
        onExpandChange={setIsExpanded}
        onSubmitSuccess={handleSubmitSuccess}
        extraSubjects={extraSubjects}
      />
    </div>
  );
};

export default CanvasPromptDock;
