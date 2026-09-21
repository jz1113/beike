import { useEffect, useRef, useState } from 'react';
import type { CanvasProject } from '../types';

export function useCanvasTitleEditing(
  currentProject: CanvasProject | undefined,
  updateProjectTitle: (id: string, title: string) => void,
) {
  const [isTitleMenuOpen, setIsTitleMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [tempTitle, setTempTitle] = useState(currentProject?.title || '未命名项目');
  const [titleError, setTitleError] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const skipTitleSaveOnBlurRef = useRef(false);

  useEffect(() => {
    if (!isEditingTitle) return;
    skipTitleSaveOnBlurRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isEditingTitle]);

  useEffect(() => {
    const isLegacyNumericTitle = Boolean(
      currentProject && !currentProject.nodes.length && /^\d+$/.test(currentProject.title.trim()),
    );
    if (!isLegacyNumericTitle) return;
    setTempTitle('未命名项目');
    setIsEditingTitle(false);
    setTitleError('');
  }, [currentProject?.draft, currentProject?.id, currentProject?.nodes.length, currentProject?.title]);

  useEffect(() => {
    if (!isTitleMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.canvas-title-menu-container')) setIsTitleMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isTitleMenuOpen]);

  const handleCancelTitleEdit = () => {
    skipTitleSaveOnBlurRef.current = true;
    const currentTitle = currentProject?.title?.trim() || '未命名项目';
    const isLegacyNumericTitle = Boolean(
      currentProject && !currentProject.nodes.length && /^\d+$/.test(currentTitle),
    );
    setTempTitle(isLegacyNumericTitle || currentProject?.draft || currentTitle === '新建画布' ? '未命名项目' : currentTitle);
    setTitleError('');
    setIsEditingTitle(false);
  };

  const handleSaveTitle = () => {
    if (!currentProject) return;
    const nextTitle = tempTitle.trim().replace(/\s+/g, ' ');
    if (!nextTitle) { setTitleError('请输入项目名称'); return; }
    if (nextTitle.length > 40) { setTitleError('项目名称最多 40 个字符'); return; }
    if (!/[A-Za-z\u4e00-\u9fff]/.test(nextTitle)) { setTitleError('项目名称需包含文字'); return; }
    updateProjectTitle(currentProject.id, nextTitle);
    setTempTitle(nextTitle);
    setTitleError('');
    setIsEditingTitle(false);
    setIsTitleMenuOpen(false);
  };

  return {
    isTitleMenuOpen, setIsTitleMenuOpen,
    isEditingTitle, setIsEditingTitle,
    tempTitle, setTempTitle,
    titleError, setTitleError,
    titleInputRef, skipTitleSaveOnBlurRef,
    handleCancelTitleEdit, handleSaveTitle,
  };
}
