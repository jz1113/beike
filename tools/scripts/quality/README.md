# 源码盘点与质量门禁

从仓库根目录使用 Node 22、pnpm 10.13.1。CI 与本地统一执行 `pnpm run check`，无需安装新的治理框架。

| 命令 | 作用 |
| --- | --- |
| `pnpm run audit:source` | 只读盘点，写入 `.local/source-audit.json`；按物理行统计实现/工具和测试，报告应用源码静态不可达候选以及仅测试可达模块 |
| `pnpm run check:workspaces` | 验证 2 应用 + 4 共享/数据包、私有名称、允许依赖、内部 `workspace:*` 与源码依赖声明 |
| `pnpm run lint:boundaries` | 检查浏览器/Node、packages/apps、shared/features、工坊 model/UI、Prisma 访问和已审核跨功能边界 |
| `pnpm run lint:unused` | 按精确路径、诊断消息、次数比较未使用绑定基线；新增问题失败 |
| `pnpm run lint:max-lines` | 阻止新增超长文件或已有超长文件继续膨胀 |
| `pnpm run lint:secrets` | 扫描已跟踪及未忽略的新文本文件；pre-commit 也执行 |
| `pnpm run test:list` | 列出递归发现的测试文件 |
| `pnpm test` | 执行发现的全部单元/本地集成测试，默认数据库和数据目录隔离在临时目录 |

## 共享实现

- `source-files.mjs` 统一遍历与模块引用读取，不跟随符号链接，不扫描依赖、构建产物和本地数据目录。识别 import、re-export、import type、字面量动态 import/require。
- `boundary-rules.mjs`、`workspace-rules.mjs` 是可单测的规则；入口脚本负责读取工作区与汇总错误。
- `../testing/discover-tests.mjs` 扫描应用源码、packages、tools/scripts 中 `.test.*` / `.spec.*` 文件，支持 all/web/api/domain/tooling；`run-tests.mjs` 统一执行。工具测试也会被发现，浏览器 QA 脚本不自动运行。

## 如何解读结果

`audit:source` 不删除文件，也不证明所有动态代码都有效。扫描不分析非字面量路径、远端调用、DOM 中的静态资源引用或精确的符号级 tree shaking；公开包出口、测试辅助模块、脚本与迁移不能仅凭应用运行时可达性删除。测试-only 模块单列，不作为可直接删除候选。

未使用和行数基线是待治理清单，不是永久豁免。移动文件只更新路径，禁止为了过门禁扩大限额；修复后移除陈旧条目。跨 feature 例外目前仅有 workshop→assets、assets→canvas；不因目录重排新增例外。

**数据安全：** `.env*`、`.local/`、数据库/备份、素材/上传和本地存储不属于源码清理对象。Git ignore 不等于可以删除。盘点与测试不需要连接生产库或付费模型。
