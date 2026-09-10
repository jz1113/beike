// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react';
import SettingsWorkspaceView from '../SettingsWorkspaceView';
import { useAppStore } from '@/store/useAppStore';

// Mock dependencies
vi.mock('@/lib/windowDrag', () => ({
  handleWindowDrag: vi.fn(),
  handleWindowDoubleClick: vi.fn(),
}));

vi.mock('../hooks/useSystemConfigQuery', () => ({
  useSystemConfigQuery: vi.fn(),
}));

vi.mock('../hooks/useGatewayUser', () => ({
  useGatewayUser: () => ({
    userInfo: { quotaFormatted: 34.4 },
    isConfigured: true,
    isLoading: false,
    isLowBalance: false,
    lastUpdated: '刚刚',
    error: null,
    refreshUserInfo: vi.fn(),
    saveCredentials: vi.fn(),
    clearCredentials: vi.fn(),
  }),
}));

vi.mock('../hooks/useSettingsConfig', () => ({
  useSettingsConfig: () => ({
    isGatewayEnabled: true,
    setIsGatewayEnabled: vi.fn(),
    apiKey: 'sk-test-key-123456',
    setApiKey: vi.fn(),
    baseUrl: 'https://ai.comfly.org',
    setBaseUrl: vi.fn(),
    showKey: false,
    setShowKey: vi.fn(),
    appAccessToken: '',
    setAppAccessToken: vi.fn(),
    handleSaveApiConfig: vi.fn(),
    handleTestPing: vi.fn(),
    isTesting: false,
    wanbangKey: '',
    setWanbangKey: vi.fn(),
    wanbangSecret: '',
    setWanbangSecret: vi.fn(),
    isWanbangEnabled: false,
    setIsWanbangEnabled: vi.fn(),
    handleTestWanbang: vi.fn(),
    isTestingWanbang: false,
    scraperId: '',
    setScraperId: vi.fn(),
    scraperSecret: '',
    setScraperSecret: vi.fn(),
    isApiaEnabled: false,
    setIsApiaEnabled: vi.fn(),
    qiyunAppId: '',
    setQiyunAppId: vi.fn(),
    qiyunAppKey: '',
    setQiyunAppKey: vi.fn(),
    isQiyunEnabled: false,
    setIsQiyunEnabled: vi.fn(),
    handleSaveQiyunConfig: vi.fn(),
    handleTestQiyun: vi.fn(),
    isTestingQiyun: false,
    storageEnabled: false,
    setStorageEnabled: vi.fn(),
    storageProvider: 's3',
    setStorageProvider: vi.fn(),
    storageAccountId: '',
    setStorageAccountId: vi.fn(),
    storageEndpoint: '',
    setStorageEndpoint: vi.fn(),
    storageAccessKeyId: '',
    setStorageAccessKeyId: vi.fn(),
    storageSecretAccessKey: '',
    setStorageSecretAccessKey: vi.fn(),
    showStorageSecret: false,
    setShowStorageSecret: vi.fn(),
    storageBucketName: '',
    setStorageBucketName: vi.fn(),
    storagePublicDomain: '',
    setStoragePublicDomain: vi.fn(),
    isTestingStorage: false,
    setIsTestingStorage: vi.fn(),
    isMigratingStorage: false,
    setIsMigratingStorage: vi.fn(),
    handleSaveWanbangConfig: vi.fn(),
    handleSaveScraperConfig: vi.fn(),
    handleTestScraper: vi.fn(),
    isTestingScraper: false,
    handleSaveStorageConfig: vi.fn(),
  }),
}));

vi.mock('../hooks/useCustomModels', () => ({
  useCustomModels: () => ({
    isGatewayModalOpen: false,
    setIsGatewayModalOpen: vi.fn(),
    allGatewayModels: [],
    isFetchingGateway: false,
    customModels: [],
    setCustomModels: vi.fn(),
    modelSearch: '',
    setModelSearch: vi.fn(),
    modelCapabilityFilter: 'all',
    setModelCapabilityFilter: vi.fn(),
    handleToggleCapability: vi.fn(),
    handleDeleteModel: vi.fn(),
    handleMoveModel: vi.fn(),
    handleReorderModels: vi.fn(),
    handleResetDefaultModels: vi.fn(),
    notifyModelsUpdated: vi.fn(),
    handleAddCustomModel: vi.fn(),
    handleOpenGatewayDiscovery: vi.fn(),
  }),
}));

describe('SettingsWorkspaceView (Codex-style Dedicated View)', () => {
  afterEach(cleanup);
  beforeEach(() => {
    useAppStore.setState({
      currentView: 'settings',
      previousView: 'home',
    });
  });

  it('renders Codex-style dedicated sidebar with back button, search, and group sections', () => {
    const { container } = render(<SettingsWorkspaceView />);
    const sidebar = container.querySelector('[data-settings-sidebar]') as HTMLElement;
    expect(sidebar).toBeTruthy();

    // 1. 验证存在图 2 核心控件「返回应用」
    const backBtn = within(sidebar).getByRole('button', { name: /返回应用/i });
    expect(backBtn).toBeTruthy();

    // 2. 验证搜索框
    const searchInput = within(sidebar).getByPlaceholderText('搜索设置...');
    expect(searchInput).toBeTruthy();

    // 3. 验证分组标题与导航项
    expect(within(sidebar).getByText('模型与服务')).toBeTruthy();
    expect(within(sidebar).getByText('服务接口配置')).toBeTruthy();
    expect(within(sidebar).queryByText('默认业务模型')).toBeNull();
    expect(screen.getAllByText('默认业务模型').length).toBeGreaterThan(0);
    expect(screen.queryByText('服务就绪')).toBeNull();
    expect(within(sidebar).getByText('数据与统计')).toBeTruthy();
    expect(within(sidebar).getByText('用量统计')).toBeTruthy();
    expect(within(sidebar).getByText('本地存储')).toBeTruthy();
    expect(within(sidebar).getByText('系统偏好')).toBeTruthy();
    expect(within(sidebar).getByText('外观偏好')).toBeTruthy();
    expect(within(sidebar).getByText('关于系统')).toBeTruthy();

    // 4. 验证顶栏大标题
    expect(screen.getByRole('heading', { name: '服务接口配置' })).toBeTruthy();
  });

  it('opens default model routing from the service list', () => {
    render(<SettingsWorkspaceView />);
    fireEvent.click(screen.getAllByText('默认业务模型').find((node) => node.tagName !== 'OPTION')!);
    expect(screen.getByText('默认核心大模型路由')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '服务接口配置' })).toBeTruthy();
  });

  it('triggers onBack or backFromSettings when clicking back button or pressing Escape', () => {
    const onBackMock = vi.fn();
    const { container } = render(<SettingsWorkspaceView onBack={onBackMock} />);
    const sidebar = container.querySelector('[data-settings-sidebar]') as HTMLElement;

    const backBtn = within(sidebar).getByRole('button', { name: /返回应用/i });
    fireEvent.click(backBtn);
    expect(onBackMock).toHaveBeenCalledTimes(1);

    // 键盘 Esc 触发
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBackMock).toHaveBeenCalledTimes(2);
  });

  it('filters navigation items based on search input query', () => {
    const { container } = render(<SettingsWorkspaceView />);
    const sidebar = container.querySelector('[data-settings-sidebar]') as HTMLElement;

    const searchInput = within(sidebar).getByPlaceholderText('搜索设置...');
    fireEvent.change(searchInput, { target: { value: '外观' } });

    // 外观偏好应该还在
    expect(within(sidebar).getByText('外观偏好')).toBeTruthy();
    // 与外观无关的项应该被过滤隐藏
    expect(within(sidebar).queryByText('默认业务模型')).toBeNull();
  });

  it('switches tabs and updates the stage title', () => {
    const { container } = render(<SettingsWorkspaceView />);
    const sidebar = container.querySelector('[data-settings-sidebar]') as HTMLElement;

    // 点击切换到“关于系统”
    const aboutBtn = within(sidebar).getByRole('button', { name: /关于系统/i });
    fireEvent.click(aboutBtn);

    // 顶栏大标题变为“关于系统”
    expect(screen.getByRole('heading', { name: '关于系统' })).toBeTruthy();
  });
});
