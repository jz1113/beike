# 代码健康

这次梳理对照的是浏览器产品。桌面端已经删除，质量门禁里的未使用绑定、超长文件和依赖边界在提交时是通过的。下面是仍然值得继续拆的部分。

## 已经处理

- 删除 `apps/desktop`、Tauri 脚本、Windows 安装包流水线和浏览器里的桌面壳分支。下载改为浏览器保存，凭证写入 credential 接口，不再调用桌面环境文件接口。
- 删除没有引用的模块、重复的 `JellyRadio.jsx`，以及未接入脚本的 `jsrepo`。
- 关键词审核的数据库访问改走 `apps/api/src/repositories/keywordReview.ts`。
- `shared/` 不再引用 `features/`。画布摘要由画布模块注册。
- 批准模型清单拆到 `packages/domain/src/modelCatalog/`，`modelCatalog.ts` 只做聚合。
- 分镜组装的后半段拆到 `promptAssemblerFinish.ts`。商品采集从路由挪到 `services/collect/collectProduct.ts`。
- 助手事件类型不再和 `assistant/types.ts` 互相引用。

## 仍然偏大的文件

这些文件还在 `tools/configs/max-lines-baseline.json` 里，或者物理行数超过 400。拆的时候保持对外函数签名不变，拆完从 baseline 删掉对应条目。baseline 只允许变小。

优先顺序：

1. `apps/web/src/features/workshop/hooks/useBatchWorkshopRunner.ts`：采集、分析、生图、导出还在一个 hook 里。适合按阶段拆 hook，并用一个 reducer 收拢状态。
2. `apps/web/src/shared/modals/ImageLightboxModal.tsx` 和 `shared/modals/lightbox/SmartEditModal.tsx`：预览、工具栏和参数状态可以下沉成独立组件。
3. `CanvasMultiAngleModal.tsx` 与 `LightboxMultiAngleModal.tsx`：预设和参数类型已经接近，组件本身仍然各写一套。
4. `usePosterProduction.ts`、`useStyleExtractWorkflow.ts`：按导入、生成、导出拆出去。
5. `AssetCenter.tsx`、`UsageTab.tsx`、`PromptActionBar.tsx` 等其余 baseline 条目。

## 分层

路由和 service 仍然有直接查询数据库的历史代码。新增代码走 `repositories/`，不要从 service 或 route import `repositories/db.ts`。

`packages/domain/src/prompt-engine/assembler.ts` 和 `guards.ts` 仍互相引用。`apps/web/src/store/types.ts` 与 `brandKitSlice.ts`、`assistantSkillSlice.ts` 也是类型层面的环。解开时把被两边使用的类型挪到第三个文件。

## 类型与测试

`packages/contracts` 和 `packages/domain` 的显式 `any` 很少。历史 `any` 集中在 `apps/web` 和 `apps/api`，尤其是提示词组装、资产编辑和助手流式响应。ESLint 对 `no-explicit-any` 仍是警告。

测试覆盖关键词审核、大字报、网关凭证和部分生成策略。工坊 runner、助手回合、生图提交轮询几乎没有测试。采集平台识别有 `collectProduct.test.mjs`。

## 本地产物

这些路径不在 Git 里，清理磁盘时可以删，但不要提交：

- `apps/web/dist`
- `.local/`（含部署私钥和数据库备份）
- `packages/prisma/dev.db` 与 `packages/prisma/backups/`
