# 关键词审核

## 审核流程

导入关键词工作簿后，先核对工作表及 query、拓展词等列的映射，再选择图文或视频模式。两种模式分别使用自己的垂类集合与审核规则，不能直接复用另一种模式的结论。规则在每轮审核开始时冻结版本；中途编辑规则不改变已启动请求的口径。

可先试审部分行，核对分类与可制作判断后继续。默认试审 50 行、每请求 50 行，单请求上限 60 行；并发按运行情况调整，默认上限 12。规则和执行设置分别管理，不把并发设置写入内容审核规则。

## 导出与恢复

导出保留工作簿中原有工作表和数据，按映射写入“最终垂类”“垂类依据”“是否可制作”“不制作依据”；视频模式另有“低价值关键词”。不能将其他关键词技能的“两列追加”约定套用到本功能。

工作簿记录审核进度，浏览器保留恢复状态。恢复前应核对原工作簿、模式和规则；切换模式时，未完成行中不兼容的旧结果会清理，避免把图文判断当成视频结果。重要结果应及时导出，浏览器恢复状态不能替代工作簿备份。

传输重试沿用同一 `x-idempotency-key` 和 `x-submission-attempt-id`，最多尝试三次。响应未知时隔离该请求，不另建任务重投；模型已经返回但有行缺失或结构不完整时，才按结果恢复逻辑补充或拆分未解决行。这两种重试不能混为一谈。

## 接口与维护

- `POST /api/generate/keyword-review`：提交审核批次。
- `GET /api/generate/keyword-review/rules`、`PUT /api/generate/keyword-review/rules`：读取及更新规则。
- `POST /api/generate/keyword-review/balance`：查询渠道余额。

契约在 `src/shared/contracts/generate.ts`，后端在 `src/backend/internal/keywords/`。前端规则冻结、请求恢复和导出分别见 `src/client/features/keywords/model/reviewRunPreparation.ts`、`reviewRequest.ts`、`keywordReviewWorkbookExport.ts`；执行默认值见同目录 `keywordReviewSettings.ts`。模型协议与思考参数统一遵循[文本协议与思考强度](reasoning.md)。
