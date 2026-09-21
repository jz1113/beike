/**
 * 贝壳云图 · 全局统一矢量图标库 (Shared SVG Icons)
 * 集中管理项目中所有自定义业务与系统矢量图标组件
 */

// 1. 画布类图标 (Canvas Icons)
export { CanvasDrawingIcon } from './canvas/CanvasDrawingIcon';
export { CanvasVideoIcon } from './canvas/CanvasVideoIcon';
export { CanvasMaterialIcon } from './canvas/CanvasMaterialIcon';
export { LightingIcon, MultiAngleIcon } from './canvas/CanvasToolIcons';
export { CanvasUploadIcon, CanvasAssetFolderIcon } from './canvas/CanvasSidebarIcons';

// 2. 生成模式图标 (Generation Mode Icons)
export {
  ImageGenModeIcon,
  VideoGenModeIcon,
  DepthImageModeIcon,
  DepthVideoModeIcon,
} from './modes/GenModeIcons';
export type { GenModeIconProps } from './modes/GenModeIcons';

// 3. 电商平台与品牌图标 (Brand & Platform Icons)
export {
  GrassWorkshopIcon,
  JdIcon,
  OneBoundLogo,
  ApiaLogo,
  QiyunLogo,
  ComflyLogo,
  CollectorHubIcon,
  TaobaoIcon,
  ShellTechLogo,
  VisionPulseLogo,
  ProductVaultIcon,
  PromptVaultIcon,
  ModelSettingsIcon,
  AIExtractIcon,
  WorkflowNextIcon,
  StudioConsoleIcon,
  StudioEmptyLens,
  MannequinFittingIcon,
  SuperResolution4KIcon,
  DepthVideoIcon,
} from './brands/BrandIcons';

// 4. 操作与动作图标 (Card & Action Icons)
export { ReEditIcon, RegenerateIcon } from './actions/ActionIcons';

// 5. 导航与侧边栏图标 (Navigation Icons)
export { NavHomeIcon, NavGenerateIcon } from './nav/NavIcons';
export type { NavIconProps } from './nav/NavIcons';

// 6. AI 助手图标 (Assistant Icons)
export { AssistantSkillIcon, AssistantSkillCardIcon } from './assistant/AssistantIcons';
export type { AssistantSkillIconProps } from './assistant/AssistantIcons';
