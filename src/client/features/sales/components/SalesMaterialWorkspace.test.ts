import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchSalesStudioAssets } from '../api/salesProduction';
import type { SalesAssetSection } from '../model/salesWorkspace';
import { SalesMaterialWorkspace } from './SalesMaterialWorkspace';
import { SalesPersonaDialog } from './SalesPersonaDialog';
import { SalesSceneDialog } from './SalesSceneDialog';
import { SalesSoundCard } from './SalesSoundCard';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { SalesBgmImportDialog } from './SalesBgmImportDialog';
import { SalesMaterialCreateDialog } from './SalesMaterialCreateDialog';
import { AtlasHubDrawer } from './atlas/AtlasHubDrawer';
import { SalesMaterialSidebarContext } from './SalesMaterialSidebar';
import { readSalesAssetDraft } from '../model/salesAssetDraft';

const hooks = vi.hoisted(() => ({ index: 0, slots: [] as unknown[], effects: [] as Array<() => unknown> }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useCallback: (fn: unknown) => fn,
  useMemo: (fn: () => unknown) => fn(),
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useState: <T>(initial: T | (() => T)) => {
    const index = hooks.index++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
    return [hooks.slots[index], (next: T | ((previous: T) => T)) => {
      hooks.slots[index] = typeof next === 'function' ? (next as (previous: T) => T)(hooks.slots[index] as T) : next;
    }];
  },
}));
vi.mock('../api/salesProduction', () => ({ fetchSalesStudioAssets: vi.fn() }));
vi.mock('@client/shared/api/workspaceClient', () => ({ getWorkspaceSecret: () => 'test-workspace' }));
vi.mock('../model/salesAssetDraft', async (original) => ({ ...await original<typeof import('../model/salesAssetDraft')>(), readSalesAssetDraft: vi.fn() }));

type Node = ReactElement<Record<string, unknown>>;
function find(root: Node, predicate: (node: Node) => boolean): Node | undefined {
  const queue = [root];
  while (queue.length) {
    const node = queue.shift()!;
    if (predicate(node)) return node;
    Children.forEach(node.props.children as ReactElement, (child) => {
      if (isValidElement<Record<string, unknown>>(child)) queue.push(child);
    });
  }
}
function render(section: SalesAssetSection = 'persona', navigationDisabled = false) {
  hooks.index = 0; hooks.effects = [];
  return SalesMaterialWorkspace({ section, onSectionChange: vi.fn(), promptContent: null, promptsUnsaved: false, navigationDisabled });
}
function category(root: Node, label: string) {
  return find(root, (node) => node.type === 'button' && node.props.title === label)!;
}
function categoryButtons(root: Node, label = '人物分类') {
  const nav = find(root, (node) => node.type === 'nav' && node.props['aria-label'] === label)!;
  function buttons(children: ReactNode): Node[] {
    return Children.toArray(children).flatMap((child) => {
      if (!isValidElement<Record<string, unknown>>(child)) return [];
      return child.type === Fragment ? buttons(child.props.children as ReactNode) : child.type === 'button' ? [child] : [];
    });
  }
  return buttons(nav.props.children as ReactNode);
}
function replayEffects() { hooks.effects.forEach((effect) => effect()); }
function create(root: Node) {
  const button = find(root, (node) => node.type === 'button' && node.props['aria-label'] === '新增人物')!;
  (button.props.onClick as () => void)();
}

beforeEach(() => {
  hooks.index = 0; hooks.slots = []; hooks.effects = [];
  vi.resetAllMocks();
  vi.mocked(readSalesAssetDraft).mockReturnValue(null);
  vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [{ id: 'person-1', name: '已有人物', tags: '女', description: '',
    avatarUrl: '/face.jpg', faceUrl: '/face.jpg', fullBodyUrl: '/body.jpg', sourceImages: ['/face.jpg', '/body.jpg'],
    hasReferenceImage: true, source: 'persona_library' }], scenes: [], actions: [], voices: [], bgms: [] });
});

describe('asset filters and stored drafts', () => {
  it.each([
    ['persona', '新增人物', ['成年女', '成年男', '老年', '儿童']],
    ['scene', '新增场景', ['户外', '室内']],
    ['sound', '新增人声', ['成年女', '成年男', '老年', '儿童']],
    ['sound', '导入 BGM', ['BGM']],
  ] as const)('shows the add card directly in each empty %s category', async (section, label, categories) => {
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [], actions: [], voices: [], bgms: [] });
    render(section); replayEffects(); await Promise.resolve();
    for (const name of categories) {
      (category(render(section), name).props.onClick as () => void)();
      const root = render(section), scroll = find(root, (node) => node.props.className === 'sales-library-scroll')!;
      const grid = find(scroll, (node) => String(node.props.className).startsWith('sales-material-grid'))!;
      expect(find(grid, (node) => node.type === 'button' && node.props['aria-label'] === label)).toBeDefined();
      expect(find(scroll, (node) => node.props.className === 'sales-library-empty-state' || node.props.className === 'sales-asset-empty-notice')).toBeUndefined();
    }
  });
  it.each(['loading', 'error'])('does not offer creation before the initial catalog is available: %s', async (state) => {
    if (state === 'error') vi.mocked(fetchSalesStudioAssets).mockRejectedValue(new Error('读取失败'));
    render();
    if (state === 'error') { replayEffects(); await vi.waitFor(() => expect(find(render(), (node) => node.props.role === 'alert')).toBeDefined()); }
    const root = render();
    expect(find(root, (node) => node.props.className === 'sales-library-empty-state')).toBeDefined();
    expect(find(root, (node) => String(node.props.className).startsWith('sales-material-grid'))).toBeUndefined();
  });
  it('places the action category slot below its parent and only mounts it for action materials', () => {
    const root = render('script');
    const group = find(root, (node) => node.props['aria-label'] === '素材资产')!;
    const sections = Children.toArray(group.props.children as ReactElement).filter(isValidElement) as Node[];
    const actionSection = sections[1];
    const children = Children.toArray(actionSection.props.children as ReactElement) as Node[];
    expect(children[0].type).toBe('button');
    expect(children[1].props.className).toBe('sales-material-category-slot');
    const target = {} as HTMLDivElement;
    (children[1].props.ref as (element: HTMLDivElement) => void)(target);
    expect(find(render('script'), (node) => node.type === SalesMaterialSidebarContext.Provider)?.props.value).toBe(target);
    expect(find(render('persona'), (node) => node.props.className === 'sales-material-category-slot')).toBeUndefined();
  });

  it('counts searched assets and keeps the persona category when clearing search or saving', async () => {
    render(); replayEffects(); await Promise.resolve();
    expect(find(category(render(), '成年女'), (node) => node.type === 'small')?.props.children).toBe(1);
    expect(find(category(render(), '成年男'), (node) => node.type === 'small')?.props.children).toBe(0);
    (category(render(), '成年男').props.onClick as () => void)();
    expect(category(render(), '成年男').props['aria-current']).toBe('true');
    expect(find(render(), (node) => node.props.className === 'sales-material-heading-row')).toBeUndefined();
    expect(find(render(), (node) => node.props['aria-label'] === '查看已有人物详情')).toBeUndefined();
    expect(find(render(), (node) => node.props.className === 'sales-library-empty-state' || node.props.className === 'sales-asset-empty-notice')).toBeUndefined();
    (find(render(), (node) => node.type === 'input')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '找不到' } });
    expect(find(render(), (node) => node.props.className === 'sales-asset-empty-notice')).toBeDefined();
    expect(find(render(), (node) => node.props.className === 'sales-library-empty-state')).toBeUndefined();
    expect(categoryButtons(render()).every((button) => find(button, (node) => node.type === 'small')?.props.children === 0)).toBe(true);
    const clear = find(render(), (node) => node.type === 'button' && String(node.props.className).includes('sales-asset-reset'))!;
    (clear.props.onClick as () => void)();
    expect(category(render(), '成年男').props['aria-current']).toBe('true');
    expect(find(render(), (node) => node.type === 'input')?.props.value).toBe('');
    (find(render(), (node) => node.type === 'input')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value: '找不到' } });
    create(render());
    (find(render(), (node) => node.type === SalesPersonaDialog)!.props.onSaved as (message: string) => void)('已保存人物');
    expect(category(render(), '成年男').props['aria-current']).toBe('true');
    expect(category(render(), '成年女').props['aria-current']).toBeUndefined();
    expect(find(render(), (node) => node.type === 'input')?.props.value).toBe('');
    expect(find(render(), (node) => node.props['aria-label'] === '查看已有人物详情')).toBeUndefined();
    (category(render(), '成年女').props.onClick as () => void)();
    expect(find(render(), (node) => node.props['aria-label'] === '查看已有人物详情')).toBeDefined();
  });

  it.each([
    { section: 'persona' as const, parent: '人物资产', nav: '人物分类', otherNav: '场景分类', labels: ['成年女', '成年男', '老年', '儿童'] },
    { section: 'scene' as const, parent: '场景资产', nav: '场景分类', otherNav: '人物分类', labels: ['户外', '室内'] },
    { section: 'sound' as const, parent: '声音资产', nav: '声音分类', otherNav: '人物分类', labels: ['人声', 'BGM'] },
  ])('places $nav below its asset section and only shows the active section categories', ({ section, parent, nav, otherNav, labels }) => {
    const root = render(section);
    const group = find(root, (node) => node.props['aria-label'] === '素材资产')!;
    const sections = Children.toArray(group.props.children as ReactElement).filter(isValidElement) as Node[];
    const sectionNode = sections.find((node) => find(node, (child) => child.type === 'span' && child.props.children === parent));
    const children = Children.toArray(sectionNode!.props.children as ReactElement) as Node[];
    expect(children[0].type).toBe('button');
    expect(children[1].type).toBe('nav');
    expect(children[1].props['aria-label']).toBe(nav);
    expect(categoryButtons(root, nav).map((button) => button.props.title)).toEqual(labels);
    expect(category(root, labels[0]).props['aria-current']).toBe('true');
    expect(find(root, (node) => node.props['aria-label'] === otherNav)).toBeUndefined();
    expect(find(root, (node) => node.type === SalesLibrarySelect)).toBeUndefined();
    if (section === 'sound') {
      const voiceGroups = categoryButtons(root, '人声音色分类');
      expect(voiceGroups.map((button) => button.props.title)).toEqual(['成年女', '成年男', '老年', '儿童']);
      expect(category(root, '成年女').props['aria-current']).toBe('true');
    }
    expect(find(render(section === 'sound' ? 'persona' : 'sound'), (node) => node.props['aria-label'] === nav)).toBeUndefined();
  });

  it.each([
    { section: 'persona' as const, label: '成年男', createLabel: '新增人物', dialog: SalesPersonaDialog, defaultProp: 'defaultGroup', value: 'male' },
    { section: 'scene' as const, label: '室内', createLabel: '新增场景', dialog: SalesSceneDialog, defaultProp: 'defaultSpace', value: 'indoor' },
  ])('uses the selected $section category as the new asset default', async ({ section, label, createLabel, dialog, defaultProp, value }) => {
    render(section); replayEffects(); await Promise.resolve();
    (category(render(section), label).props.onClick as () => void)();
    const button = find(render(section), (node) => node.type === 'button' && node.props['aria-label'] === createLabel)!;
    (button.props.onClick as () => void)();
    expect(find(render(section), (node) => node.type === dialog)?.props[defaultProp]).toBe(value);
    if (section === 'persona') {
      (find(render(section), (node) => node.type === 'button' && Children.toArray(node.props.children as ReactNode).includes('从开源图鉴导入'))!.props.onClick as () => void)();
      expect(find(render(section), (node) => node.type === AtlasHubDrawer)?.props.defaultFaceAudience).toBe('adult_male');
    }
  });

  it.each([
    { section: 'persona' as const, nav: '人物分类' },
    { section: 'scene' as const, nav: '场景分类' },
    { section: 'sound' as const, nav: '声音分类' },
  ])('disables $nav when asset navigation is disabled', ({ section, nav }) => {
    const root = render(section, true);
    expect(categoryButtons(root, nav).every((button) => button.props.disabled === true)).toBe(true);
    if (section === 'sound') expect(categoryButtons(root, '人声音色分类').every((button) => button.props.disabled === true)).toBe(true);
  });

  it('surfaces a recoverable new draft separately from saved asset counts', () => {
    vi.mocked(readSalesAssetDraft).mockReturnValue({ fields: { name: '草稿人物' }, views: { main: '/draft.jpg' } });
    const root = render();
    expect(find(root, (node) => node.props.className === 'sales-asset-draft-resume')).toBeDefined();
    expect(find(root, (node) => node.props['aria-label'] === '查看草稿人物详情')).toBeUndefined();
    (find(root, (node) => node.type === 'button' && node.props.children === '继续编辑')!.props.onClick as () => void)();
    expect(find(render(), (node) => node.type === SalesPersonaDialog)).toBeDefined();
    expect(readSalesAssetDraft).toHaveBeenCalledWith('beike.sales.asset-draft.v1:test-workspace:persona:new');
  });

  it('does not present an untouched default form as an unfinished asset', () => {
    vi.mocked(readSalesAssetDraft).mockReturnValue({ fields: { name: '', group: 'female', voiceId: '' } });
    expect(find(render(), (node) => node.props.className === 'sales-asset-draft-resume')).toBeUndefined();
  });

  it('keeps scenes in the selected category when clearing search and saving', async () => {
    const scene = { description: '', tags: '', category: '', lighting: '', suitableCategories: [], sourceImages: [], source: 'scene_library' as const };
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [
      { ...scene, id: 'room', title: '采光客厅', spatialType: 'indoor', coverUrl: '/room.jpg' },
      { ...scene, id: 'garden', title: '花园', spatialType: 'outdoor', coverUrl: '/garden.jpg' },
    ], actions: [], voices: [], bgms: [] });
    render('scene'); replayEffects(); await Promise.resolve();
    const sceneCategory = (label: string) => category(render('scene'), label);
    expect(find(sceneCategory('室内'), (node) => node.type === 'small')?.props.children).toBe(1);
    expect(find(sceneCategory('户外'), (node) => node.type === 'small')?.props.children).toBe(1);
    expect(sceneCategory('户外').props['aria-current']).toBe('true');
    expect(find(render('scene'), (node) => node.props.className === 'sales-material-heading-row')).toBeUndefined();
    expect(find(render('scene'), (node) => node.props['aria-label'] === '查看花园详情')).toBeDefined();
    expect(find(render('scene'), (node) => node.props['aria-label'] === '查看采光客厅详情')).toBeUndefined();
    (sceneCategory('室内').props.onClick as () => void)();
    const search = (value: string) => (find(render('scene'), (node) => node.type === 'input')!.props.onChange as (event: { target: { value: string } }) => void)({ target: { value } });
    search('花园');
    expect(find(sceneCategory('户外'), (node) => node.type === 'small')?.props.children).toBe(1);
    expect(find(sceneCategory('室内'), (node) => node.type === 'small')?.props.children).toBe(0);
    const clear = find(render('scene'), (node) => node.type === 'button' && String(node.props.className).includes('sales-asset-reset'))!;
    (clear.props.onClick as () => void)();
    expect(sceneCategory('室内').props['aria-current']).toBe('true');
    expect(find(render('scene'), (node) => node.props['aria-label'] === '查看采光客厅详情')).toBeDefined();
    search('花园');
    (find(render('scene'), (node) => node.type === 'button' && node.props['aria-label'] === '新增场景')!.props.onClick as () => void)();
    const dialog = find(render('scene'), (node) => node.type === SalesSceneDialog)!;
    (dialog.props.onSaved as (message: string) => void)('场景已保存');
    expect(sceneCategory('室内').props['aria-current']).toBe('true');
    expect(find(render('scene'), (node) => node.type === 'input')?.props.value).toBe('');
    expect(find(render('scene'), (node) => node.props['aria-label'] === '查看花园详情')).toBeUndefined();
    expect(find(render('scene'), (node) => node.props['aria-label'] === '查看采光客厅详情')).toBeDefined();
  });
});

describe('scene creation card sizing', () => {
  it('follows the adjacent loaded image through category changes and falls back for a broken image', async () => {
    const scene = { description: '', tags: '', category: '', lighting: '', suitableCategories: [], sourceImages: [], source: 'scene_library' };
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], actions: [], voices: [], bgms: [], scenes: [
      { ...scene, id: 'portrait', title: '室内竖图', coverUrl: '/portrait.jpg', spatialType: 'indoor' },
      { ...scene, id: 'landscape', title: '户外横图', coverUrl: '/landscape.jpg', spatialType: 'outdoor' },
    ] });
    render('scene'); replayEffects(); await Promise.resolve();
    const frameStyle = () => find(render('scene'), (node) => String(node.props.className).includes('sales-persona-add-frame'))?.props.style;
    const image = (name: string) => find(render('scene'), (node) => node.type === 'img' && node.props.alt === name)!;
    const loaded = (name: string, width: number, height: number) => {
      (image(name).props.onLoad as (event: unknown) => void)({ currentTarget: { naturalWidth: width, naturalHeight: height } });
    };
    expect(frameStyle()).toEqual({ aspectRatio: undefined });
    loaded('户外横图', 1600, 900);
    expect(frameStyle()).toEqual({ aspectRatio: 1600 / 900 });
    (category(render('scene'), '室内').props.onClick as () => void)();
    loaded('室内竖图', 800, 1000);
    expect(frameStyle()).toEqual({ aspectRatio: 800 / 1000 });
    (category(render('scene'), '户外').props.onClick as () => void)();
    expect(frameStyle()).toEqual({ aspectRatio: 1600 / 900 });
    (category(render('scene'), '室内').props.onClick as () => void)();
    (image('室内竖图').props.onError as () => void)();
    expect(frameStyle()).toEqual({ aspectRatio: 16 / 10 });
    (find(render('scene'), (node) => node.type === 'input')!.props.onChange as (event: unknown) => void)({ target: { value: '无匹配结果' } });
    expect(frameStyle()).toEqual({ aspectRatio: undefined });
  });
});

describe('material dialog lifetime', () => {
  it('keeps a new-person dialog open when effects replay without navigation', async () => {
    render();
    replayEffects(); replayEffects(); // Initial StrictMode setup does not change the section.
    await Promise.resolve();
    create(render());
    let root = render();
    expect(find(root, (node) => node.type === SalesPersonaDialog)).toBeDefined();
    replayEffects(); // Fast Refresh preserves state but reruns effects regardless of dependencies.
    root = render();
    expect(find(root, (node) => node.type === SalesPersonaDialog)).toBeDefined();
    (find(root, (node) => node.type === SalesPersonaDialog)!.props.onClose as () => void)();
    expect(find(render(), (node) => node.type === SalesPersonaDialog)).toBeUndefined();
  });

  it('keeps an existing-person dialog open through effect replay and catalog reload', async () => {
    render(); replayEffects();
    await vi.waitFor(() => expect(find(render(), (node) => node.props['aria-label'] === '查看已有人物详情')).toBeDefined());
    (find(render(), (node) => node.props['aria-label'] === '查看已有人物详情')!.props.onClick as () => void)();
    render(); replayEffects();
    await Promise.resolve();
    expect(find(render(), (node) => node.type === SalesPersonaDialog)?.props.persona).toEqual(expect.objectContaining({ id: 'person-1' }));
  });

  it('resets dialog state on a real section change without opening a different asset dialog', async () => {
    render(); replayEffects(); await Promise.resolve();
    create(render());
    expect(find(render(), (node) => node.type === SalesPersonaDialog)).toBeDefined();
    render('scene'); replayEffects();
    expect(find(render('scene'), (node) => node.type === SalesSceneDialog)).toBeUndefined();
    render('persona'); replayEffects();
    expect(find(render('persona'), (node) => node.type === SalesPersonaDialog)).toBeUndefined();
  });
});

describe('background music library', () => {
  it('filters voices below the voice category and keeps the voice group when clearing search, saving, or changing sound types', async () => {
    const voice = { voiceId: 'voice', ttsVoice: 'voice', tags: [], sampleAudioUrl: '/voice.mp3', promptText: '', source: 'voice_library' };
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [], actions: [], voices: [
      { ...voice, id: 'female', name: '清亮女声', gender: 'female', voiceGroup: 'female' },
      { ...voice, id: 'male', name: '温暖男声', gender: 'male', voiceGroup: 'male' },
    ], bgms: [] });
    render('sound'); replayEffects(); await Promise.resolve();
    const count = (label: string) => find(category(render('sound'), label), (node) => node.type === 'small')?.props.children;
    const soundCard = (id: string) => find(render('sound'), (node) => node.type === SalesSoundCard && (node.props.card as { id: string }).id === id);
    expect(count('人声')).toBe(2);
    expect(count('成年女')).toBe(1);
    expect(count('成年男')).toBe(1);
    expect(count('老年')).toBe(0);
    expect(count('儿童')).toBe(0);
    expect(category(render('sound'), '成年女').props['aria-current']).toBe('true');
    expect(soundCard('female')).toBeDefined();
    expect(soundCard('male')).toBeUndefined();
    (category(render('sound'), '成年男').props.onClick as () => void)();
    expect(category(render('sound'), '成年男').props['aria-current']).toBe('true');
    expect(soundCard('male')).toBeDefined();
    expect(soundCard('female')).toBeUndefined();
    expect(find(render('sound'), (node) => node.type === 'button' && String(node.props.className).includes('sales-asset-reset'))).toBeUndefined();
    const search = (value: string) => (find(render('sound'), (node) => node.type === 'input')!.props.onChange as (event: unknown) => void)({ target: { value } });
    search('女声');
    expect(count('成年女')).toBe(1);
    expect(count('成年男')).toBe(0);
    expect(count('老年')).toBe(0);
    expect(count('儿童')).toBe(0);
    expect(soundCard('male')).toBeUndefined();
    (find(render('sound'), (node) => node.type === 'button' && String(node.props.className).includes('sales-asset-reset'))!.props.onClick as () => void)();
    expect(category(render('sound'), '成年男').props['aria-current']).toBe('true');
    expect(soundCard('male')).toBeDefined();
    search('女声');
    (find(render('sound'), (node) => node.type === 'button' && node.props['aria-label'] === '新增人声')!.props.onClick as () => void)();
    const dialog = find(render('sound'), (node) => node.type === SalesMaterialCreateDialog)!;
    expect(dialog.props.defaultVoiceGroup).toBe('male');
    (dialog.props.onCreated as () => void)();
    expect(category(render('sound'), '成年男').props['aria-current']).toBe('true');
    expect(find(render('sound'), (node) => node.type === 'input')?.props.value).toBe('');
    expect(soundCard('female')).toBeUndefined();
    expect(soundCard('male')).toBeDefined();
    (category(render('sound'), 'BGM').props.onClick as () => void)();
    expect(find(render('sound'), (node) => node.type === 'nav' && node.props['aria-label'] === '人声音色分类')).toBeUndefined();
    expect(find(render('sound'), (node) => node.type === SalesLibrarySelect)?.props.label).toBe('按音乐时长筛选');
    (category(render('sound'), '人声').props.onClick as () => void)();
    expect(category(render('sound'), '成年男').props['aria-current']).toBe('true');
    expect(soundCard('female')).toBeUndefined();
    expect(soundCard('male')).toBeDefined();
    render('persona'); replayEffects();
    render('sound'); replayEffects(); await Promise.resolve();
    expect(category(render('sound'), '成年女').props['aria-current']).toBe('true');
    expect(soundCard('female')).toBeDefined();
    expect(soundCard('male')).toBeUndefined();
  });

  it('keeps creation entries in their sound categories and refreshes after a partial BGM batch succeeds', async () => {
    render('sound'); replayEffects(); await Promise.resolve();
    let root = render('sound');
    expect(category(root, '人声').props['aria-current']).toBe('true');
    expect(find(root, (node) => node.type === 'button' && node.props['aria-label'] === '新增人声')).toBeDefined();
    expect(find(root, (node) => node.type === 'button' && node.props['aria-label'] === '导入 BGM')).toBeUndefined();
    (category(root, 'BGM').props.onClick as () => void)();
    root = render('sound');
    const importButton = find(root, (node) => node.type === 'button' && node.props['aria-label'] === '导入 BGM')!;
    expect(importButton).toBeDefined();
    expect(find(root, (node) => node.type === 'button' && node.props['aria-label'] === '新增人声')).toBeUndefined();
    (importButton.props.onClick as () => void)();
    const dialog = find(render('sound'), (node) => node.type === SalesBgmImportDialog)!;
    (dialog.props.onImported as (count: number) => void)(2);
    expect(category(render('sound'), 'BGM').props['aria-current']).toBe('true');
    expect(find(render('sound'), (node) => node.type === SalesBgmImportDialog)).toBeDefined();
    replayEffects(); await Promise.resolve();
    expect(fetchSalesStudioAssets).toHaveBeenCalledTimes(2);
    (dialog.props.onClose as () => void)();
    expect(find(render('sound'), (node) => node.type === SalesBgmImportDialog)).toBeUndefined();
  });

  it('shows real durations and filters short music independently of voice groups', async () => {
    vi.mocked(fetchSalesStudioAssets).mockResolvedValue({ personas: [], scenes: [], actions: [], voices: [], bgms: [
      { id: 'short', title: '短曲', description: '', moodTags: [], bpm: 100, durationSec: 12, suitableCategories: [], license: '自有', audioUrl: '/short.mp3' },
      { id: 'long', title: '长曲', description: '', moodTags: [], bpm: 100, durationSec: 45, suitableCategories: [], license: '自有', audioUrl: '/long.mp3' },
    ] });
    render('sound'); replayEffects(); await Promise.resolve();
    expect(find(render('sound'), (node) => node.type === SalesSoundCard)).toBeUndefined();
    expect(find(render('sound'), (node) => node.props.className === 'sales-material-heading-row')).toBeUndefined();
    (category(render('sound'), 'BGM').props.onClick as () => void)();
    expect(find(render('sound'), (node) => node.props.className === 'sales-material-heading-row')).toBeUndefined();
    const duration = find(render('sound'), (node) => node.type === SalesLibrarySelect && node.props.label === '按音乐时长筛选')!;
    expect(duration.props.options).toEqual(expect.arrayContaining([{ value: 'short', label: '15 秒以内', count: 1 }]));
    (duration.props.onChange as (value: string) => void)('short');
    expect(find(render('sound'), (node) => node.type === SalesSoundCard && (node.props.card as { id: string }).id === 'short')?.props.card).toEqual(expect.objectContaining({ title: '短曲', durationSec: 12 }));
    expect(find(render('sound'), (node) => node.type === SalesSoundCard && (node.props.card as { id: string }).id === 'long')).toBeUndefined();
    const clear = find(render('sound'), (node) => node.type === 'button' && String(node.props.className).includes('sales-asset-reset'))!;
    (clear.props.onClick as () => void)();
    expect(category(render('sound'), 'BGM').props['aria-current']).toBe('true');
    expect(find(render('sound'), (node) => node.type === SalesLibrarySelect && node.props.label === '按音乐时长筛选')?.props.value).toBe('all');
    expect(find(render('sound'), (node) => node.type === SalesSoundCard && (node.props.card as { id: string }).id === 'long')).toBeDefined();
    (category(render('sound'), '人声').props.onClick as () => void)();
    expect(find(render('sound'), (node) => node.type === SalesSoundCard)).toBeUndefined();
    (category(render('sound'), 'BGM').props.onClick as () => void)();
    expect(find(render('sound'), (node) => node.type === SalesLibrarySelect && node.props.label === '按音乐时长筛选')?.props.value).toBe('all');
    expect(find(render('sound'), (node) => node.type === SalesSoundCard && (node.props.card as { id: string }).id === 'long')).toBeDefined();
  });
});
