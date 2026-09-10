/**
 * 贝壳云图 · 提示词生成与组装引擎 (Prompt Engine)
 *
 * 原创生成（storyboard_generate）提示词装配流水线（无「定向提示词」遗留字段）：
 *
 * 1. 分析阶段（`/api/generate/analyze`）
 *    - `buildVisionSystemPrompt()`（vision.ts）：注入 `templateStyle`（拍摄架构）、`lockedAssets`（资产锁定）、`assetLibraryData`（资产库插槽）
 *    - 客户端 Batch 固定传入 `extraRequirements`（分镜数量、@图片1 锚定），不经 Zustand store
 *
 * 2. 分镜后处理（analyze.ts / useBatchWorkshopRunner）
 *    - `assembleOriginalShotPrompt()`：8 段式确定性拼装
 *    - `harmonizeOriginalPrompt()`：场景-动作物理消歧、首饰防穿帮
 *    - `enforceLookConsistency()`：组内穿搭强锁定
 *
 * 3. 生图提交（`/api/generate/image`）
 *    - `finalizeImagePrompt()` → `ensureOriginalPromptSlots()`：对齐 @图片1/2/3 槽位
 *    - `formatModelPayload()`（drawing.ts）：网关出站前二次槽位守卫
 *
 * Hub 极速生图（source=home）走 `stripWorkshopPromptGuards()`，不注入工坊守卫块。
 */

export * from './roles';
export * from './guards';
export * from './mentions';
export * from './storyboard';
export * from './assembler';
export * from './multiAngle';
export * from './smartEdit';
