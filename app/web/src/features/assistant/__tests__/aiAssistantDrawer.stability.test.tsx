// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AIAssistantDrawer from '../AIAssistantDrawer';
import { useAppStore } from '@/store/useAppStore';

describe('AIAssistantDrawer 稳定性与防无限循环测试', () => {
  beforeEach(() => {
    cleanup();
    useAppStore.setState({
      isAssistantOpen: true,
      assistantInputDraft: '',
      assistantSessions: [
        {
          id: 'test-session-1',
          title: '测试会话',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          messages: [],
        },
      ],
      currentAssistantSessionId: 'test-session-1',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('初始存在草稿时挂载，安全渲染，绝不触发 Maximum update depth exceeded 死循环', () => {
    // 模拟从外部（如画板或历史）带入初始草稿
    useAppStore.setState({ assistantInputDraft: '针对这件衣服生成穿搭建议' });

    let errorOccurred = false;
    try {
      render(<AIAssistantDrawer />);
    } catch (err: any) {
      errorOccurred = true;
      console.error(err);
    }

    expect(errorOccurred).toBe(false);
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeInTheDocument();
    expect(textarea.value).toBe('针对这件衣服生成穿搭建议');
  });

  it('外部动态注入新草稿时，单向安全同步并更新输入框内容', () => {
    render(<AIAssistantDrawer />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('');

    act(() => {
      useAppStore.getState().setAssistantInputDraft('外部注入的新提示词');
    });

    expect(textarea.value).toBe('外部注入的新提示词');
    expect(useAppStore.getState().assistantInputDraft).toBe('外部注入的新提示词');
  });

  it('用户在输入框打字输入时，正确同步到全局 store 的 assistantInputDraft', () => {
    render(<AIAssistantDrawer />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    
    fireEvent.change(textarea, { target: { value: '用户正在输入的文本' } });

    expect(textarea.value).toBe('用户正在输入的文本');
    expect(useAppStore.getState().assistantInputDraft).toBe('用户正在输入的文本');
  });
  it('一条任务仅显示一张折叠卡，状态更新后显示实际引用数，输入区不显示模式素材控件', () => {
    const task = { mode: 'plan' as const, goal: '测试重复任务卡', deliverable: 'storyboard' as const,
      referenceScope: 'sample' as const, totalReferences: 44, references: [], status: 'running' as const, stage: '准备上下文' };
    useAppStore.getState().addAssistantMessage('test-session-1', { id: 'task-msg', role: 'assistant', content: '', timestamp: Date.now(), task });
    render(<AIAssistantDrawer />);
    expect(screen.getAllByTestId('assistant-task-card')).toHaveLength(1);
    expect(screen.queryByText('测试重复任务卡')).toBeNull();
    act(() => useAppStore.getState().updateAssistantMessage('test-session-1', 'task-msg', { task: {
      ...task, references: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, label: `素材${i + 1}`, url: `https://test.invalid/${i}.jpg` })), stage: '参考版式并撰写逐页方案',
    } }));
    expect(screen.getByText('6 张参考')).toBeInTheDocument();
    expect(screen.queryByText('准备上下文')).toBeNull();
    expect(screen.queryByLabelText('任务模式')).toBeNull();
    expect(screen.queryByLabelText('素材引用范围')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /图文方案 先规划/ }));
    expect(screen.getByText(/本轮引用 6 \/ 44 张/)).toBeInTheDocument();
  });

});
