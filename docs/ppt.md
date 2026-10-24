# PPT 工作室

## 创作流程

工作室按“创作 → 大纲 → 页面编排 → 演播室”组织。先确定主题和内容，再检查大纲、调整逐页信息，最后生成或修改页面。内容接口分别为 `POST /api/generate/ppt-outline`、`ppt-detail`、`ppt-slide`、`ppt-narration`（后三者使用相同 `/api/generate/` 前缀）。

默认 `layout` 模式使用结构化页面元素；`visual` 模式以整页视觉图为主。页面文字、图片和排版应在对应模式中核对，导出方式决定哪些内容仍可编辑。

## 导出边界

布局模式提供“导出可编辑 PPTX”，使用 PptxGenJS 写入宽屏页面，标题、要点等文本元素可编辑，图片作为图片对象保留。它不会把一张已经合成的图片自动拆成可编辑文字。

视觉模式的图片型 PPTX 将页面图铺满幻灯片；图中文字仍属于图片。图片 ZIP 导出当前页面素材，SVG 会转为 1920×1080 位图，不能一概保证所有页面都是 4K。

导出前检查每页图片是否已经生成并能加载。图片型 PPTX 对缺图使用兜底画面，ZIP 可能跳过缺图，因此成功下载文件不代表每页素材完整。旁白接口和导出组件的存在也不代表每种导出入口都已在当前界面开放。

## 保存与排障

当前 PPT 状态由前端 store 管理，未实现完整的跨刷新项目恢复；“历史”抽屉展示当前页面列表，不是服务端项目历史库。刷新或离开前应导出需要保留的成果。

入口为 `src/client/features/ppt/PptStudio.tsx`，状态见 `store/usePptStore.ts`，可编辑导出见 `model/pptEditableExport.ts`，图片型 PPTX 和 ZIP 见 `model/pptExportEngine.ts`，路径均相对于 `src/client/features/ppt/`。模型配置见[接入索引](models.md)。
