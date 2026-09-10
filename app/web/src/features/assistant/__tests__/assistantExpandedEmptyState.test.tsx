// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AssistantMessageList from '../AssistantMessageList';

vi.mock('@/lib/apiClient', () => ({
  proxyMediaUrl: (url: string) => url,
}));

vi.mock('@/shared/ui/ParticleText', () => ({
  default: ({ text }: { text: string }) => <div data-testid="particle-text">{text}</div>,
}));

describe('AssistantMessageList 空状态自适应放大响应测试', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  const baseProps = {
    messages: [],
    activeSuggestionChips: [],
    currentSessionMessages: [],
    isSendingCurrent: false,
    sendingSessionId: null,
    copiedMsgId: null,
    messagesEndRef: { current: null },
    textareaRef: { current: null },
    setInputContent: vi.fn(),
    resolveAssistantMediaSrc: (url?: string | null) => url || '',
    handleSendMessage: vi.fn(),
    handleStopGeneration: vi.fn(),
    handleCopyText: vi.fn(),
    showToast: vi.fn(),
    setChatPreview: vi.fn(),
    addAssistantAttachment: vi.fn(),
    setProductData: vi.fn(),
    setStep: vi.fn(),
    setCurrentView: vi.fn(),
    setIsAssistantOpen: vi.fn(),
  };

  it('未放大状态下 (isExpanded=false)，空状态展示居中标题与双路径操作', () => {
    const { container } = render(
      <AssistantMessageList {...baseProps} isExpanded={false} />
    );

    const emptyContainer = container.querySelector('.max-w-md');
    expect(emptyContainer).toBeInTheDocument();
    expect(emptyContainer).not.toHaveClass('max-w-2xl');

    expect(screen.getByText('和Agent聊聊你的想法')).toBeInTheDocument();
    expect(screen.getByText('从已有素材开始')).toBeInTheDocument();
    expect(screen.getByText('上传参考图')).toBeInTheDocument();
    expect(screen.getByText('和Agent聊聊')).toBeInTheDocument();
    expect(screen.getByText('搜一搜站内灵感')).toBeInTheDocument();
  });

  it('放大状态下 (isExpanded=true)，空状态容器展开至宽屏舒展布局', () => {
    const { container } = render(
      <AssistantMessageList {...baseProps} isExpanded={true} />
    );

    const expandedContainer = container.querySelector('.max-w-2xl');
    expect(expandedContainer).toBeInTheDocument();

    // 验证新标题与路径选项依然正常显示且结构完整
    expect(screen.getByText('和Agent聊聊你的想法')).toBeInTheDocument();
    expect(screen.getByText('从已有素材开始')).toBeInTheDocument();
    expect(screen.getByText('上传参考图')).toBeInTheDocument();
  });
});
