# 🌸 贝壳云图

> **工业级电商视觉生成与 AI 买家秀解决方案**：基于 Next.js 16 (App Router) + Prisma SQLite + Zustand 构建，涵盖全渠道电商/社媒图文采编、多模态视觉大模型智能策划、多生图模型异步并发渲染与成套 SKU 打包交付。

---

## 🏗️ 架构与目录分层详解

```text
web-app/
├── package.json                       # 依赖与脚本定义
├── tsconfig.json                      # TypeScript 编译配置
├── next.config.ts                     # Next.js 运行时配置
├── eslint.config.mjs                  # ESLint 配置
├── postcss.config.mjs                 # PostCSS 插件配置
├── .env                               # 环境变量 (API 密钥与网关地址)
├── .gitignore                         # 忽略文件规则
│
├── prisma/                            # 数据持久化层
│   ├── schema.prisma                  # SQLite 数据模型 (Product, ImageTask, PromptTemplate 等)
│   └── dev.db                         # 本地轻量数据库 (防重复扣费与历史存储)
│
├── public/                            # 纯净静态资源
│   ├── app_logo.png                   # 官方主视觉徽标
│   ├── favicon.ico                    # 浏览器标签页图标
│   ├── brand/                         # 平台与合作方品牌 Logo (京东/APIA/Comfly)
│   └── inspirations/                  # 17 套真实商业 AI 买家秀案例展示图 (4K)
│
├── scripts/                           # 辅助运维脚本
│   └── generate_all_inspirations.js   # 自动化生成与校验灵感案例脚本
│
└── src/                               # 核心源码目录
    ├── app/                           # App Router 路由与后端 API 端点
    │   ├── api/                       # RESTful 服务端 API 端点矩阵
    │   │   ├── analyze/               # POST /api/analyze: 视觉大模型买家秀分镜策划
    │   │   ├── chat/                  # POST /api/chat: AI 视觉助理智能问答与意图处理
    │   │   ├── collect/               # POST /api/collect: 全渠道图文采集 (万邦/APIA)
    │   │   ├── config/                # GET/POST /api/config: API 连通性测试与配置持久化
    │   │   ├── export-zip/            # POST /api/export-zip: 4K 买家秀按 SKU 成套打包
    │   │   ├── generate-image/        # POST /api/generate-image: 异步生图提交与任务查询
    │   │   ├── generate-video/        # POST /api/generate-video: AI 影视级视频生成
    │   │   ├── models/                # GET /api/models: 854+ 模型列表与连通性查询
    │   │   ├── products/              # GET/POST/DELETE /api/products: 本地商品资产管理
    │   │   ├── prompts/               # GET/POST/DELETE /api/prompts: 提示词库分类与归档
    │   │   ├── proxy-image/           # GET /api/proxy-image: 防盗链跨域图片缓存与中转
    │   │   ├── styles/                # POST /api/styles: 爆款买家秀风格提取与配方解析
    │   │   └── tasks/                 # GET /api/tasks: 异步任务状态轮询
    │   ├── favicon.ico                # 根 Favicon 图标
    │   ├── globals.css                # 全局样式与 Tailwind 配置
    │   ├── icon.png                   # Next.js 动态 App Icon
    │   ├── layout.tsx                 # 根布局与全局元数据
    │   └── page.tsx                   # 主入口与多视图调度中心
    │
    ├── components/                    # 前端模块化业务组件体系
    │   ├── assets/                    # 资产中心
    │   │   └── AssetCenter.tsx        # 商品库/提示词库/风格配方/生图历史/按SKU导出
    │   ├── assistant/                 # AI 视觉导演助理
    │   │   ├── AIAssistantButton.tsx  # 页面右下角常驻唤起按钮
    │   │   ├── AIAssistantDrawer.tsx  # 多模态主抽屉面板 (支持 Skill 协议与生图卡片)
    │   │   ├── AIAssistantHistoryDrawer.tsx # 对话历史记录列表
    │   │   ├── BatchPromptModal.tsx   # 批量解析提示词确认与派发弹窗
    │   │   ├── CustomSkillModal.tsx   # 专业 Skill 技能提炼与编辑弹窗
    │   │   ├── FormattedMarkdown.tsx  # Markdown 渲染与分镜卡片自适应组件
    │   │   └── ProductCardWidget.tsx  # 商品卡片预览与调入组件
    │   ├── common/                    # 全局通用 UI
    │   │   ├── AppSidebar.tsx         # 左侧常驻导航侧边栏
    │   │   ├── AspectRatioSelector.tsx # 12 种微缩几何比例选择器 (1:1, 3:4, 16:9 等)
    │   │   ├── BrandIcons.tsx         # 京东、淘宝、APIA、Comfly 等品牌矢量组件
    │   │   ├── ModelIcons.tsx         # 80+ 官方大模型品牌图标 (集成 @lobehub/icons)
    │   │   └── Navbar.tsx             # 顶部流转导航条 (买家秀 4 步进度指示)
    │   ├── hub/                       # 创意灵感展台
    │   │   ├── CreativeHub.tsx        # 展台主容器
    │   │   ├── FeatureCapsules.tsx    # 核心能力功能胶囊入口
    │   │   ├── InspirationFeed.tsx    # 17 套爆款商业案例瀑布流展示
    │   │   ├── InspirationModal.tsx   # 案例 4K 详情大图与参数弹窗
    │   │   └── PromptActionBar.tsx    # 顶部快捷输入与对话生图控制台
    │   ├── modals/                    # 全局模态弹窗
    │   │   ├── CategoryManagerModal.tsx # 行业品类与分类管理弹窗
    │   │   ├── GatewayModelModal.tsx  # 854+ 模型列表检索与选择弹窗
    │   │   ├── ImageLightboxModal.tsx # 全局 4K 高清大图灯箱预览
    │   │   ├── ProductHistoryModal.tsx # 本地商品资产库弹窗
    │   │   ├── PromptHistoryModal.tsx # 提示词历史策划归档弹窗
    │   │   ├── SettingsModal.tsx      # API 密钥与大模型参数配置中心
    │   │   ├── StyleExtractModal.tsx  # 爆款买家秀风格提取与配方解析弹窗
    │   │   └── UniversalCollectorModal.tsx # 全渠道智能采集中心 (万邦电商 + APIA 社媒)
    │   ├── step1-import/              # Step 1: 商品素材采编
    │   │   ├── StudioGallery.tsx      # 主图/SKU图/详情图瀑布流与底图勾选
    │   │   └── StudioSidebar.tsx      # 链接抓取表单与本地图片上传
    │   ├── step2-vision/              # Step 2: 视觉模型策划
    │   │   └── PromptStudio.tsx       # 视觉大模型选型、分镜策划与提示词卡片矩阵
    │   ├── step3-image/               # Step 3: AI 矩阵生图
    │   │   └── ImageGenStudio.tsx     # 生图模型矩阵、比例控制、垫图与异步并发生成
    │   ├── step4-export/              # Step 4: 成品交付
    │   │   └── ExportStudio.tsx       # 4K 高清画廊、按 SKU 目录打包 ZIP 导出
    │   ├── studio/                    # 买家秀四步闭环主流程
    │   │   └── BuyerShowStudio.tsx    # 四步流转容器
    │   └── workspace/                 # 极速生成工作区
    │       └── GenerateWorkspace.tsx  # 多会话隔离、实时任务流、3D 堆叠与批量操作
    │
    ├── lib/                           # 核心底层类库与适配器
    │   ├── drawing.ts                 # 生图模型参数适配器、比例映射与提示词清洗
    │   ├── mediaHelper.ts             # 媒体格式转换与视频抽帧工具
    │   ├── prisma.ts                  # Prisma Client 客户端单例
    │   ├── video.ts                   # 视频生成请求调度与模型配置
    │   ├── vision.ts                  # 视觉大模型 Prompt 模板与调度引擎
    │   └── skills/                    # AI 视觉导演专业 Skill 协议
    │       └── ecommerce-visual-director.ts # 商业摄影/穿搭上身/小红书网感等 Skill 定义
    │
    ├── store/                         # 全局响应式状态机
    │   └── useAppStore.ts             # Zustand 统一状态管理
    │
    └── types/                         # TypeScript 类型系统定义
        └── index.ts                   # 全局类型接口
```

---

## 🤖 核心模型矩阵支持

### 1. 视觉大模型 (Step 2 提示词分析 & AI 助理)
- **Gemini 3.1 Pro (深度思考)**：首选视觉模型，擅长多模态多图深度识别与真实生活化买家秀场景推断。
- **Grok 4.6**：备选旗舰，具备强大的自然语言表达能力与反 AI 质感提示词生成。
- **GPT-5.5 Pro / GPT-4o**：全能型视觉大模型，擅长高精度构图与光影控制。

### 2. 生图渲染引擎 (Step 3 矩阵生图)
- **GPT-Image-2 (4K超清)**：画质细腻，对中文主体理解精准，支持高保真垫图。
- **Midjourney v6.0 / Niji 6**：商业摄影光影顶级，色彩还原力强。
- **Flux.1 Pro / Schnell**：文字排版与写实纹理优秀。
- **豆包 Doubao-Seed**：国内高性价比电商商品生图引擎。

---

## 📦 数据库持久化规范 (Prisma SQLite)

- **`Product`**：存储抓取的商品基础信息（商品 ID、标题、平台、价格、主图/SKU/详情图链接）。本地已存商品再次录入时直接调取，实现 **0 成本二次使用**。
- **`ImageTask`**：存储异步生图与生视频任务（任务 ID、模型、提示词、状态、渲染结果 URL、耗时）。
- **`PromptTemplate`**：用户自定义或收藏的提示词配方与风格模板。

---

## 🚀 启动与调试

```bash
# 依赖安装
npm install

# 本地开发服务器 (默认端口 3000)
npm run dev

# 静态类型检查
npx tsc --noEmit

# 生产环境打包构建
npm run build
```
