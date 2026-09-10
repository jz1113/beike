// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import React from 'react';
import { InfiniteCanvasEditor } from '../components/InfiniteCanvasEditor';
import { useCanvasStore } from '../store/useCanvasStore';
import { useAppStore } from '@/store/useAppStore';

describe('InfiniteCanvasEditor Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });
  });

  afterEach(() => {
    cleanup();
  });

  it.each(['Delete', 'Backspace'])('deletes a focused upload node with %s despite its keyboard event boundary', key => {
    useCanvasStore.getState().addNode('test-canvas-proj-1', {id:'upload',type:'file',x:0,y:0,width:252,height:252});
    render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const upload = screen.getByLabelText('文件上传节点');
    fireEvent.click(upload);
    upload.focus();
    fireEvent.keyDown(upload, {key});
    expect(useCanvasStore.getState().projects[0].nodes).toHaveLength(0);
  });

  it('图片按原始比例撑开容器并修正旧的正方形节点尺寸', () => {
    useCanvasStore.getState().addNode('test-canvas-proj-1', {id:'wide',type:'image',title:'横图',imageUrl:'/wide.png',x:0,y:0,width:600,height:600});
    render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const image = screen.getByAltText('横图') as HTMLImageElement;
    Object.defineProperties(image, {naturalWidth:{value:1600},naturalHeight:{value:900},complete:{value:true}});
    fireEvent.load(image);
    expect(useCanvasStore.getState().projects[0].nodes[0].height).toBe(337.5);
    expect(image.className).toContain('h-auto');
    expect(image.parentElement?.style.height).toBe('');
  });

  it('双击空白处选择上传节点，在点击位置创建且不显示未实现功能', () => {
    render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    fireEvent.doubleClick(screen.getByTestId('canvas-viewport'), { button: 0, clientX: 320, clientY: 240 });
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    fireEvent.click(screen.getByRole('menuitem', { name: '素材上传' }));
    const node = useCanvasStore.getState().projects[0].nodes[0];
    expect(node).toMatchObject({ type: 'file', x: 320, y: 240 });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.doubleClick(screen.getByLabelText('文件上传节点'), { button: 0 });
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.doubleClick(screen.getByTestId('canvas-viewport'), { button: 0 });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('renders header with downward adjustment padding and drag attributes', () => {
    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const header = container.querySelector('header');
    expect(header).toBeDefined();
    expect(header).not.toBeNull();
    // 验证水平避让 macOS 交通灯安全边距（pl-20）与拖拽区域属性
    expect(header?.className).toContain('pl-20');
    expect(header?.getAttribute('data-tauri-drag-region')).not.toBeNull();
  });

  it('renders project title and back button', () => {
    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const header = container.querySelector('header');
    expect(header).not.toBeNull();

    const titleSpans = screen.getAllByText('未命名项目');
    expect(titleSpans.length).toBeGreaterThanOrEqual(1);

    // 验证顶栏渲染程序官方 Logo，且不再有旧的云朵图标
    const logoImg = header?.querySelector('img[src="/app_logo.png"]');
    expect(logoImg).not.toBeNull();
    const cloudIcon = header?.querySelector('.lucide-cloud');
    expect(cloudIcon).toBeNull();

    const backBtn = (header?.querySelector('button[title="返回首页"]') ||
      header?.querySelector('button[title="返回全部项目列表"]')) as HTMLElement;
    expect(backBtn).not.toBeNull();
    fireEvent.click(backBtn);
    expect(useCanvasStore.getState().activeProjectId).toBeNull();
  });

  it('allows clicking project title directly to edit and save inline', () => {
    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const header = container.querySelector('header');
    expect(header).not.toBeNull();

    // 点击标题按钮直接进入原地编辑，无需点二级菜单
    const titleBtn = header?.querySelector('button[title="点击重命名画板"]') as HTMLElement;
    expect(titleBtn).not.toBeNull();
    fireEvent.click(titleBtn);

    // 直接就地出现输入框并聚焦
    const input = screen.getByDisplayValue('未命名项目');
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: '我的创意画板' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useCanvasStore.getState().projects[0].title).toBe('我的创意画板');
  });

  it('renders dropdown menu with create new canvas and recent projects list, excluding rename option', () => {
    // 增加多个画板项目用于列表测试
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '第一个项目画板',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          nodes: [],
        },
        {
          id: 'test-canvas-proj-2',
          title: '第二个电商画板',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          nodes: [],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const header = container.querySelector('header');
    expect(header).not.toBeNull();

    // 点击下拉小箭头展开更多选项
    const menuBtn = header?.querySelector('button[title="画板选项"]') as HTMLElement;
    expect(menuBtn).not.toBeNull();
    fireEvent.click(menuBtn);

    // 验证严格删除了“重命名画布”选项
    expect(screen.queryByText('重命名画布')).toBeNull();

    // 验证包含图 2 样式的“新建画板”大按钮与“最近”分组
    expect(screen.getByText('新建画板')).toBeTruthy();
    expect(screen.getByText('最近')).toBeTruthy();

    // 验证列表中能看到其他画布项目并支持点击切换
    expect(screen.getByText('第二个电商画板')).toBeTruthy();
    fireEvent.click(screen.getByText('第二个电商画板'));
    expect(useCanvasStore.getState().activeProjectId).toBe('test-canvas-proj-2');
  });

  it('renders only local upload and import asset buttons in the left floating toolbar, excluding # and T buttons', () => {
    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    const uploadBtn = container.querySelector('button[title="本地上传"]');
    const assetBtn = container.querySelector('button[title="导入资产"]');
    expect(uploadBtn).not.toBeNull();
    expect(assetBtn).not.toBeNull();

    // 验证严格删除了 #（分镜框）和 T（文本/便签）按钮
    const frameBtn = container.querySelector('button[title*="分镜"]');
    const noteBtn = container.querySelector('button[title*="便签"]');
    const hashBtn = container.querySelector('button[title*="#"]');
    const textBtn = container.querySelector('button[title*="文本"]');
    expect(frameBtn).toBeNull();
    expect(noteBtn).toBeNull();
    expect(hashBtn).toBeNull();
    expect(textBtn).toBeNull();
  });

  it('renders centered empty state onboarding guide when nodes are empty, and hides it when nodes exist', () => {
    const { container, rerender } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 验证居中文本与卡片（主标题、副标题、两大创作路径）
    expect(within(container).getByText('这次创作想从哪里开始？')).not.toBeNull();
    expect(within(container).getByText('导入素材开启无限排版，或在下方直接向 AI 描述你的灵感')).not.toBeNull();
    expect(within(container).getByText('使用已有素材开启创作')).not.toBeNull();
    expect(within(container).queryByText('没有灵感？')).toBeNull();
    expect(within(container).queryByRole('button', { name: /和 AI 助手聊聊/ })).toBeNull();

    // 验证本地上传（侧边栏与居中引导卡片）与选择资产按钮存在
    expect(within(container).getAllByText('本地上传').length).toBeGreaterThanOrEqual(1);
    expect(within(container).getAllByText('选择资产').length).toBeGreaterThanOrEqual(1);

    // 当添加节点后，引导区应自动隐藏
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-1',
              type: 'image',
              title: '测试图片',
              x: 100,
              y: 100,
              width: 200,
              height: 200,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    rerender(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);
    expect(within(container).queryByText('这次创作想从哪里开始？')).toBeNull();
  });

  it('strictly isolates image assets in selection modal and supports multi-select confirm', () => {
    // 注入图片与视频任务
    useAppStore.setState({
      generationTasks: [
        {
          id: 'task-img-1',
          mediaType: 'image',
          resultUrl: 'https://example.com/test-pic.jpg',
          title: '测试纯图片1',
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
        } as any,
        {
          id: 'task-vid-1',
          mediaType: 'video',
          resultUrl: 'https://example.com/test-vid.mp4',
          title: '测试纯视频1',
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
        } as any,
      ],
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 点击居中引导中的“选择资产”
    const selectAssetBtn = within(container).getByText('选择资产');
    fireEvent.click(selectAssetBtn);

    // 验证弹窗出现，标题为“资产选取”，包含“所有图片”，且已按需求移除“超清”和“收藏”
    expect(screen.getByText('资产选取')).not.toBeNull();
    expect(screen.getByText('所有图片')).not.toBeNull();
    expect(screen.queryByText('超清')).toBeNull();
    expect(screen.queryByText('收藏')).toBeNull();

    // 验证严格只有图片，绝对不混入视频
    expect(screen.getByAltText('测试纯图片1')).not.toBeNull();
    expect(screen.queryByAltText('测试纯视频1')).toBeNull();

    // 验证初始状态：已选 0 张图片，确认按钮禁用
    expect(screen.getByText('已选 0 张图片')).not.toBeNull();
    const confirmBtn = screen.getByRole('button', { name: '确认' }) as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // 点击图片卡片选中
    const imgCard = screen.getByAltText('测试纯图片1').closest('div')!;
    fireEvent.click(imgCard);

    expect(screen.getByText('已选 1 张图片')).not.toBeNull();
    expect(confirmBtn.disabled).toBe(false);

    // 点击“确认”置入画布
    fireEvent.click(confirmBtn);

    // 弹窗关闭，画板中成功增加图片节点
    expect(screen.queryByText('资产选取')).toBeNull();
    const project = useCanvasStore.getState().projects.find((p) => p.id === 'test-canvas-proj-1');
    const addedNode = project?.nodes?.find((n) => n.imageUrl === 'https://example.com/test-pic.jpg');
    expect(addedNode).toBeDefined();
    expect(addedNode?.type).toBe('image');
  });

  it('strictly isolates video assets in selection modal with no image crossover', () => {
    useAppStore.setState({
      generationTasks: [
        {
          id: 'task-img-2',
          mediaType: 'image',
          resultUrl: 'https://example.com/test-pic2.jpg',
          title: '测试纯图片2',
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
        } as any,
        {
          id: 'task-vid-2',
          mediaType: 'video',
          resultUrl: 'https://example.com/test-vid2.mp4',
          title: '测试纯视频2',
          status: 'SUCCESS',
          createdAt: new Date().toISOString(),
        } as any,
      ],
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 鼠标悬停资产按钮打开二级菜单
    const assetBtn = container.querySelector('button[title="导入资产"]')!;
    fireEvent.mouseEnter(assetBtn);

    // 点击“导入视频”
    const importVideoBtn = screen.getByText('导入视频');
    fireEvent.click(importVideoBtn);

    // 验证弹窗出现，标题为“资产选取”，包含“所有视频”
    expect(screen.getByText('资产选取')).not.toBeNull();
    expect(screen.getByText('所有视频')).not.toBeNull();
    expect(screen.queryByText('所有图片')).toBeNull();

    // 验证严格只有视频资产，绝无图片资产
    expect(screen.queryByAltText('测试纯图片2')).toBeNull();
    expect(screen.getByText('已选 0 个视频')).not.toBeNull();
  });

  it('renders borderless media node with customizable title and centered play button', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-img',
              type: 'image',
              title: '130斤微胖女生穿搭',
              imageUrl: 'https://example.com/girl.jpg',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              createdAt: Date.now(),
            },
            {
              id: 'node-vid',
              type: 'video',
              title: '微胖穿搭视频展示',
              videoUrl: 'https://example.com/girl.mp4',
              x: 450,
              y: 100,
              width: 280,
              height: 480,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 验证节点标题存在且显示在上方
    expect(screen.getByText('130斤微胖女生穿搭')).not.toBeNull();
    expect(screen.getByText('微胖穿搭视频展示')).not.toBeNull();

    // 验证视频节点正中居中半透明圆形播放按钮存在
    const playBtn = container.querySelector('button[title="播放视频"]');
    expect(playBtn).not.toBeNull();

    // 验证节点上方的 @引用、智能改图等按钮已按需求删除，悬浮工具栏区分素材类型
    expect(screen.queryByText('引用')).toBeNull();
    expect(screen.queryByText('智能改图')).toBeNull();
    // 两个节点均有添加到对话
    expect(screen.getAllByText('添加到对话').length).toBe(2);
    // 仅图片节点拥有“打光”与“多角度”操作（视频节点不显示）
    expect(screen.getAllByText('打光').length).toBe(1);
    expect(screen.getAllByText('多角度').length).toBe(1);

    // 验证视频右下角无粗糙的黑底“暂停”文字方块
    expect(screen.queryByText('暂停')).toBeNull();
  });

  it('allows inline renaming of node title and updates node in store', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-rename-test',
              type: 'image',
              title: '原始素材名',
              imageUrl: 'https://example.com/pic.jpg',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 点击标题进行就地重命名
    const titleSpan = screen.getByText('原始素材名');
    fireEvent.click(titleSpan);

    // 输入新标题并保存
    const input = screen.getByDisplayValue('原始素材名');
    fireEvent.change(input, { target: { value: '李微胖女装模特' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    // 验证 store 中该节点标题成功更新为新名称
    const node = useCanvasStore.getState().projects[0].nodes[0];
    expect(node.title).toBe('李微胖女装模特');
  });

  it('ensures redundant actions like @引用 are cleanly removed from node floating toolbar', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-mention-test',
              type: 'image',
              title: '模特李微胖',
              imageUrl: 'https://example.com/pic-model.jpg',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 验证节点上方不再存在“@引用”按钮
    expect(screen.queryByTitle('将此素材引用到底部提示词输入舱')).toBeNull();
    expect(screen.queryByText('引用')).toBeNull();
  });

  it('添加到对话引用到底部输入框，保留草稿且不打开助手', () => {
    useAppStore.setState({
      isAssistantOpen: false,
      assistantAttachments: [],
      assistantInputDraft: '',
      quickPrompt: '保留我的创作描述',
      quickRefImages: [],
    });

    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-ask-assistant-test',
              type: 'image',
              title: '夏日连衣裙',
              imageUrl: 'https://example.com/dress.jpg',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 点击节点上方的“问助手”按钮
    const askBtn = screen.getByTitle('添加到画布底部输入框');
    fireEvent.click(askBtn);

    const appState = useAppStore.getState();
    expect(appState.isAssistantOpen).toBe(false);
    expect(appState.assistantAttachments).toEqual([]);
    expect(appState.assistantInputDraft).toBe('');
    expect(appState.quickPrompt).toBe('保留我的创作描述');
    expect(appState.quickRefImages).toEqual(['https://example.com/dress.jpg']);
    fireEvent.click(askBtn);
    expect(useAppStore.getState().quickRefImages).toEqual(['https://example.com/dress.jpg']);
  });

  it('smoothly drags canvas node with window events and updates node position atomically on release', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-drag-test',
              type: 'image',
              title: '一只猫',
              imageUrl: 'https://example.com/cat.jpg',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    const nodeCard = container.querySelector('.canvas-node-card') as HTMLElement;
    expect(nodeCard).not.toBeNull();
    // 验证去除了导致拖拽严重滞后的 transition-all 类名
    expect(nodeCard.className).not.toContain('transition-all');
    expect(nodeCard.style.left).toBe('100px');
    expect(nodeCard.style.top).toBe('100px');

    // 模拟按下鼠标开始拖拽
    fireEvent.mouseDown(nodeCard, { clientX: 150, clientY: 150 });

    // 模拟鼠标移动
    fireEvent(
      window,
      new MouseEvent('mousemove', {
        clientX: 250,
        clientY: 280,
      })
    );

    // 模拟松开鼠标完成拖拽
    fireEvent(
      window,
      new MouseEvent('mouseup')
    );

    // 验证节点坐标被原子化持久化更新到 store
    const updatedNode = useCanvasStore.getState().projects[0].nodes[0];
    expect(updatedNode.x).toBe(200); // 100 + (250 - 150)
    expect(updatedNode.y).toBe(230); // 100 + (280 - 150)
  });

  it('在悬浮工具栏点击打光按钮可呼出打光弹窗，提交后成功生成带有打光参数标注的衍生节点', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-cherry',
              type: 'image',
              title: '车厘子主图',
              imageUrl: 'https://example.com/cherry.png',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              content: '新鲜采摘',
              status: 'idle',
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 1. 点击节点将其选中
    const nodeCard = container.querySelector('.canvas-node-card') as HTMLElement;
    expect(nodeCard).not.toBeNull();
    fireEvent.click(nodeCard);

    // 2. 悬浮工具栏应出现「打光」按钮
    const lightingBtn = screen.getByRole('button', { name: '打光' });
    expect(lightingBtn).not.toBeNull();

    // 3. 点击「打光」按钮打开弹窗
    fireEvent.click(lightingBtn);
    expect(screen.getByText('打光效果')).toBeDefined();

    // 4. 切换为顶部光并设置轮廓光
    fireEvent.click(screen.getByRole('button', { name: '顶部' }));
    const rimToggle = screen.getByRole('switch', { name: '轮廓光开关' });
    fireEvent.click(rimToggle);

    // 5. 点击提交
    const submitBtn = screen.getByTitle('应用打光效果并生成');
    fireEvent.click(submitBtn);

    // 6. 验证 store 中生成了新的衍生打光节点
    const nodes = useCanvasStore.getState().projects[0].nodes;
    expect(nodes.length).toBe(2);
    const lightingDerivedNode = nodes[1];
    expect(lightingDerivedNode.title).toContain('(打光)');
    expect(lightingDerivedNode.referenceImageUrl).toBe('https://example.com/cherry.png');
    expect(lightingDerivedNode.content).toContain('[3D打光: 主光:顶部');
    expect(lightingDerivedNode.content).toContain('轮廓光:开启');
    expect(lightingDerivedNode.content).toContain('模型:');
    expect(lightingDerivedNode.model).toBeDefined();
  });

  it('在悬浮工具栏点击多角度按钮可呼出多角度弹窗，提交后成功生成带有视角与模型标注的衍生节点', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-cherry-angle',
              type: 'image',
              title: '车厘子主图',
              imageUrl: 'https://example.com/cherry.png',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              content: '新鲜采摘',
              status: 'idle',
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 1. 点击节点将其选中
    const nodeCard = container.querySelector('.canvas-node-card') as HTMLElement;
    expect(nodeCard).not.toBeNull();
    fireEvent.click(nodeCard);

    // 2. 悬浮工具栏应出现「多角度」按钮
    const angleBtn = screen.getByRole('button', { name: '多角度' });
    expect(angleBtn).not.toBeNull();

    // 3. 点击「多角度」按钮打开弹窗
    fireEvent.click(angleBtn);
    expect(screen.getByText('多角度编辑器')).toBeDefined();

    // 4. 切换为「倾斜视角」预设
    fireEvent.click(screen.getByRole('button', { name: '倾斜视角' }));

    // 5. 点击提交
    const submitBtn = screen.getByTitle('应用多角度效果并生成');
    fireEvent.click(submitBtn);

    // 6. 验证 store 中生成了新的衍生多角度节点
    const nodes = useCanvasStore.getState().projects[0].nodes;
    expect(nodes.length).toBe(2);
    const angleDerivedNode = nodes[1];
    expect(angleDerivedNode.title).toContain('(倾斜视角)');
    expect(angleDerivedNode.referenceImageUrl).toBe('https://example.com/cherry.png');
    expect(angleDerivedNode.content).toContain('[多角度视角: 视角:倾斜视角');
    expect(angleDerivedNode.content).toContain('模型:');
    expect(angleDerivedNode.model).toBeDefined();
  });

  it.each(['Delete', 'Backspace'])('deletes only the selected canvas node with %s and protects editing and preview', (key) => {
    const store = useCanvasStore.getState();
    const projectId = 'test-canvas-proj-1';
    for (const title of ['图片一', '图片二']) {
      store.addNode(projectId, { type: 'image', title, imageUrl: 'https://example.com/image.png', x: 0, y: 0, width: 300, height: 400 });
    }
    const { container } = render(<InfiniteCanvasEditor projectId={projectId} />);
    const count = () => useCanvasStore.getState().projects[0].nodes.length;
    fireEvent.keyDown(window, { key });
    expect(count()).toBe(2);
    const card = container.querySelector('.canvas-node-card') as HTMLElement;
    fireEvent.click(card);
    fireEvent.keyDown(window, { key, ctrlKey: true });
    fireEvent.keyDown(window, { key, isComposing: true });
    expect(count()).toBe(2);

    for (const tag of ['input', 'textarea', 'div']) {
      const field = document.createElement(tag);
      if (tag === 'div') field.setAttribute('contenteditable', 'true');
      document.body.appendChild(field);
      field.focus();
      fireEvent.keyDown(field, { key });
      expect(count()).toBe(2);
      field.remove();
    }

    fireEvent.click(within(card).getByRole('button', { name: '预览素材' }));
    fireEvent.keyDown(window, { key });
    expect(count()).toBe(2);
    fireEvent.click(screen.getByTitle('关闭预览'));
    fireEvent.keyDown(window, { key });
    expect(count()).toBe(1);
    expect(useCanvasStore.getState().projects[0].nodes[0].title).toBe('图片二');
    fireEvent.keyDown(window, { key });
    expect(count()).toBe(1);
  });

  it('ensures branch create plus button on the right of selected node is completely removed', () => {
    useCanvasStore.setState({
      projects: [
        {
          id: 'test-canvas-proj-1',
          title: '未命名项目',
          updatedAt: Date.now(),
          createdAt: Date.now(),
          thumbnail: '',
          nodes: [
            {
              id: 'node-selected-test',
              type: 'image',
              title: '车厘子素材',
              imageUrl: 'https://example.com/cherry.png',
              x: 100,
              y: 100,
              width: 300,
              height: 400,
              createdAt: Date.now(),
            },
          ],
        },
      ],
      activeProjectId: 'test-canvas-proj-1',
    });

    const { container } = render(<InfiniteCanvasEditor projectId="test-canvas-proj-1" />);

    // 点击选中节点
    const nodeCard = container.querySelector('.canvas-node-card') as HTMLElement;
    expect(nodeCard).not.toBeNull();
    fireEvent.click(nodeCard);

    // 选中边框保持简洁，预览统一放在顶部工具栏
    expect(screen.queryByTitle('旋转素材')).toBeNull();
    expect(screen.queryByTitle('全屏放大查看')).toBeNull();
    expect(screen.getByRole('button', { name: '下载素材' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '预览素材' }));
    expect(screen.getByAltText('素材全屏预览').getAttribute('src')).toContain('cherry.png');
    fireEvent.click(screen.getByTitle('关闭预览'));
    expect(screen.queryByAltText('素材全屏预览')).toBeNull();
    expect(screen.queryByTitle('创建衍生分支')).toBeNull();
    // 验证节点内部没有带有加号图标的按钮
    const plusBtn = nodeCard.querySelector('button[title*="分支"]');
    expect(plusBtn).toBeNull();
  });
});
