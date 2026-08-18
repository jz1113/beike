# 🌸 贝壳云图

全流程工业级电商视觉生成解决方案：支持京东/淘宝等平台商品素材智能采集与本地多图上传，结合多模态视觉大模型深度策划买家秀分镜与摄影提示词，调度顶级 AI 生图/生视频模型矩阵并发渲染 4K 超清成图，并支持按商品 SKU 规范成套打包交付与资产统一归档。

---

## 🧭 四大核心业务模块与全流程闭环

```text
[Step 1: 素材采编] ➔ [Step 2: 视觉策划] ➔ [Step 3: 矩阵生图] ➔ [Step 4: 成品交付]
  · 电商链接/ID抓取      · 真实买家秀提示词      · 多大模型矩阵选型      · SKU目录树预览
  · 本地素材批量上传      · 外观特征语义提取      · 12种几何比例框        · 单张/成套打包下载
  · 主图/SKU/商详筛选    · 2~6镜头分镜策划       · 4K超清异步轮询渲染    · 提示词清单导出
```

1. **🎨 创意灵感展台 (Creative Hub)**：
   - 顶部快捷意图输入与对话生图，支持智能选图与模型调度。
   - 内置 17 套经过真实商业验证的高清 AI 爆款案例与一键同款提示词提取。
   - 集成全渠道智能采集入口（万邦电商 API + APIA 社媒无水印解析）。

2. **⚡ 极速生成工作区 (Generate Workspace)**：
   - 多会话隔离管理（支持重命名、置顶、导出、删除）。
   - 沉浸式多卡片生成流，支持图片/视频结果即时预览、4K 原图下载、提示词复用。
   - 任务组折叠/3D 旋转堆叠视图与全屏画廊灯箱。

3. **📸 AI 买家秀与商业视觉工坊 (Buyer Show Studio)**：
   - **Step 1 素材采编**：支持输入京东/淘宝商品链接或 ID 秒级解析主图、SKU 图及商详图，自动持久化入库，杜绝重复扣费；支持本地商品图拖拽上传与多选底图。
   - **Step 2 视觉策划**：多模态大模型（Gemini 3.1 Pro / Grok 4.6 / GPT-5.5 Pro）深度分析商品主体细节、材质与应用场景，输出生活化手机实拍买家秀分镜（中景、特写、微距等）。
   - **Step 3 矩阵生图**：多生图引擎（GPT-Image-2、Midjourney、Flux、Grok、Gemini 3.1 等）并行渲染，精准支持 12 种微缩几何比例控制与画质参数调优。
   - **Step 4 成品交付**：支持 4K 超清原图批量选图、全屏灯箱放大对比，一键按商品 SKU 规范成套打包下载 ZIP。

4. **🗃️ 资产与历史中心 (Asset Center)**：
   - **已采商品库**：本地 SQLite 数据库持久化，秒级载入已存商品素材，永久 0 消耗。
   - **提示词与配方库**：爆款买家秀风格提取器（支持解析小红书/抖音/微博/图集链接反推提示词）。
   - **行业品类管理**：灵活增删自定义行业品类与分类标签。
   - **生图历史总览**：全量历史生成记录统一检索与批量打包导出。

5. **🤖 智能视觉导演助理 (AI Assistant)**：
   - 右下角常驻多模态 AI 问答抽屉，支持图片/视频附件上传。
   - 支持挂载专业 Skill 技能协议（商业静物摄影、模特穿搭上身、爆款网感买家秀等）及自定义技能提炼。
   - 智能识别分镜结构并提供「一键批量派发生图」卡片。

---

## 📂 项目全景文件与目录架构

```text
贝壳云图/
├── 启动程序.command                    # macOS 一键双击极速启动脚本 (带浏览器自启)
├── 启动程序.bat                        # Windows 一键双击极速启动脚本
├── README.md                          # 全局项目说明文档
│
├── 接口文档/                           # 第三方服务能力接入说明与规范
│   ├── all_prompts.md                 # 提示词库全量规范参考
│   ├── Ai绘图/                         # 视觉大模型与生图平台接口规范 (文生图/图生图/视频/分析)
│   ├── 万邦接口/                       # 京东/淘宝商品图文数据采集 API 与 SDK
│   └── 外站抓取/                       # APIA 社媒多平台无水印图集抓取规范
│
└── web-app/                           # Next.js 16 全栈主程序工程
    ├── package.json                   # 项目依赖声明与运行脚本
    ├── tsconfig.json                  # TypeScript 编译规则配置
    ├── next.config.ts                 # Next.js 框架配置
    ├── eslint.config.mjs              # 代码规范与 Lint 规则
    ├── postcss.config.mjs             # PostCSS 样式编译
    ├── .env                           # 环境变量与 API 基础配置
    ├── .gitignore                     # Git 忽略规则
    ├── README.md                      # Web 全栈工程深度架构说明
    │
    ├── prisma/                        # SQLite 本地轻量数据库持久化层
    │   ├── schema.prisma              # 数据表模型 (Product, ImageTask, PromptTemplate 等)
    │   └── dev.db                     # 本地持久化数据库文件
    │
    ├── public/                        # 纯净静态资源目录
    │   ├── app_logo.png               # 官方主视觉 Logo
    │   ├── favicon.ico                # 网页 Favicon 图标
    │   ├── brand/                     # 平台与合作方标准品牌微标 (京东/APIA/Comfly)
    │   └── inspirations/              # 17 套 4K 超清商业买家秀案例展示图
    │
    ├── scripts/                       # 批量运维与生成辅助脚本
    │   └── generate_all_inspirations.js # 自动化生成与校验灵感案例脚本
    │
    └── src/                           # 核心应用源码
        ├── app/                       # Next.js App Router 路由与后端 API 端点
        │   ├── api/                   # RESTful 后端接口矩阵 (13 个核心业务接口)
        │   │   ├── analyze/           # 视觉大模型买家秀分镜深度解析
        │   │   ├── chat/              # AI 视觉助理多模态问答与意图调度
        │   │   ├── collect/           # 电商与社媒全渠道图文抓取 (万邦/APIA)
        │   │   ├── config/            # API 密钥与网关地址配置读写
        │   │   ├── export-zip/        # 4K 高清买家秀按 SKU 成套打包 ZIP 下载
        │   │   ├── generate-image/    # 异步多模型 4K 生图任务派发与轮询
        │   │   ├── generate-video/    # 影视级 AI 视频生成 (Luma/Kling/Runway)
        │   │   ├── models/            # 854+ 全网大模型列表动态查询
        │   │   ├── products/          # 商品素材库管理与防重扣费查询
        │   │   ├── prompts/           # 提示词库分类与历史记录管理
        │   │   ├── proxy-image/       # 防盗链跨域图片高速代理与缓存
        │   │   ├── styles/            # 爆款买家秀风格提取与配方解析
        │   │   └── tasks/             # 生图/生视频任务实时状态轮询
        │   ├── globals.css            # 全局样式与 Tailwind 视觉主题
        │   ├── layout.tsx             # 根布局配置与元数据
        │   └── page.tsx               # 工作台主入口与多视图调度
        │
        ├── components/                # 模块化前端业务组件体系
        │   ├── assets/                # 资产中心 (商品库/提示词库/风格配方/生图历史/按SKU导出)
        │   ├── assistant/             # AI 智能视觉助理 (Skill 执行协议/多模态/批量卡片)
        │   ├── common/                # 通用组件 (AppSidebar/Navbar/BrandIcons/ModelIcons/比例选择)
        │   ├── hub/                   # 创意灵感展台 (PromptActionBar/InspirationFeed/FeatureCapsules)
        │   ├── modals/                # 全局模态弹窗 (设置/全能采集/风格提取/全屏灯箱/商品提示词库)
        │   ├── studio/                # 商业视觉工坊 (四步闭环: 素材采编/视觉策划/AI矩阵生图/成套交付)
        │   └── workspace/             # 极速生图与多会话造梦工作区
        │
        ├── lib/                       # 核心业务库与底层工具
        │   ├── drawing.ts             # 生图模型参数适配器、比例计算与提示词清洗
        │   ├── mediaHelper.ts         # 媒体处理与缩略图提取
        │   ├── prisma.ts              # Prisma ORM 客户端单例
        │   ├── video.ts               # 视频生成请求调度器
        │   ├── vision.ts              # 视觉模型提示词模板、品类配方与调度
        │   └── skills/                # AI 视觉助理专业 Skill 技能定义
        │
        ├── store/                     # Zustand 全局响应式状态机
        │   └── useAppStore.ts         # 统一状态管理
        │
        └── types/                     # TypeScript 全局强类型定义
            └── index.ts
```

---

## 🚀 极速启动与运行指南

### 方法 1：一键双击启动（推荐）
- **macOS 用户**：双击运行根目录下的 `启动程序.command`，程序将自动加载 Node.js 环境、启动开发服务器并在默认浏览器中打开页面。
- **Windows 用户**：双击运行根目录下的 `启动程序.bat` 即可一键启动。

### 方法 2：命令行手动启动
```bash
# 1. 进入 Web 主工程
cd web-app

# 2. 安装依赖 (首次运行或依赖更新时执行)
npm install

# 3. 启动开发服务器
npm run dev
```

本地服务就绪后，在浏览器中访问：**[http://localhost:3000](http://localhost:3000)**

---

## ⚙️ 核心配置与 API 密钥说明

系统支持在界面右上角点击 **「设置 (⚙️)」** 模态框中直接配置并持久化，或在 `web-app/.env` 中配置默认值：

| 配置项 | 环境变量名 | 默认值 / 推荐网关 | 作用说明 |
| :--- | :--- | :--- | :--- |
| **生图与视觉 API Key** | `NEXT_PUBLIC_DRAWING_API_KEY` | `sk-...` | 用于调用视觉大模型 (Gemini/Grok/GPT) 与生图模型 (GPT-Image-2/Midjourney 等) |
| **生图与视觉 Base URL** | `NEXT_PUBLIC_DRAWING_BASE_URL` | `https://ai.comfly.chat` | 兼容 OpenAI / Claude 标准格式的 API 网关地址 |
| **万邦电商 API Key** | `ONEBOUND_API_KEY` | - | 用于一键抓取京东/淘宝商品的官方主图、SKU 与商详图 |
| **APIA 社媒解析 Key** | `APIA_API_KEY` | - | 用于抖音、小红书、快手等社媒平台图集与视频无水印高速解析 |

---

## 🛠️ 技术栈清单

- **全栈框架**：Next.js 16 (React 19 / App Router / TypeScript)
- **数据持久化**：Prisma ORM + SQLite (轻量零运维，本地防重复扣费)
- **状态管理**：Zustand (响应式多会话管理与跨组件通信)
- **图标系统**：Lucide React + @lobehub/icons (80+ 官方大模型品牌高清矢量图标)
- **UI 风格**：Tailwind CSS (轻奢极简明亮风、自适应比例卡片、3D 堆叠流)
- **打包导出**：JSZip + FileSaver (4K 超清成套按 SKU 规范目录打包)
