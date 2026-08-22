# 贝壳云图问题修复实施计划（Gate 0–3 版）

制定日期：2026-08-22  
更新日期：2026-08-22（Gate 0–3 实施完成）  
依据：`docs/FULL_PROGRAM_REVIEW_2026-08-22.md`

## 一、策略摘要

原六阶段计划已压缩为 **Gate 0–3**，桌面内测 MVP = Gate 0–2。

| Gate | 目标 | 状态 |
|---|---|:---:|
| 0 | Git 基线、`typecheck`/`check:desktop`、干净构建 | **完成** |
| 1 | P0 文件边界、CSP、TS 热修、流式上限、Vitest 脚手架 | **完成** |
| 2 | admin 分离、媒体鉴权、CSPRNG token、dev 随机 token | **完成** |
| 3 | Keychain、Prisma、拆包、Hook、E2E 配置 | **完成**（storage 服务端化留正式版） |

## 二、已完成（CODEBASE_AUDIT 运行时项）

不必重复排期：C1–C3、H1–H6、M1–M12、D1–D4。

## 三、Gate 0：可复现基线

- [x] `pre-remediation` tag
- [x] `typecheck`、`check`、`check:desktop` 脚本
- [x] ESLint 分区（browser / Node）
- [x] 废弃 Next.js 引用清理
- [x] `tsc --noEmit` 零错误

## 四、Gate 1：桌面安全 MVP

### 1A 编译热修
- [x] `Stack.tsx` 导入 `useRef`
- [x] 7 个 TS 错误修复
- [x] `build` 前置 `typecheck`

### 1B 文件写入边界
- [x] `write_binary_file` → `register_download_directory` + `save_download_file`
- [x] Rust 单元测试（文件名校验）

### 1C CSP + capability
- [x] `tauri.conf.json` CSP 启用
- [x] `opener:default` → 最小权限
- [x] 凭证 command 独立 capability

### 1D 内存硬上限
- [x] `proxy-image.ts` 流式限流
- [x] `export-zip.ts` 流式下载
- [x] `extract-document.ts` ZIP/页数/超时预检

### 1E 测试
- [x] Vitest 配置 + `apiAuth` / `readBodyLimited` 用例

## 五、Gate 2：鉴权收紧

- [x] `getAdminToken()` 禁止回退 access token
- [x] 危险路由未配置 admin → 403
- [x] `proxyMediaUrl` 移除长期 query token
- [x] 媒体 HMAC 短时签名（`mediaSign.ts`）
- [x] Rust CSPRNG + 0600 文件权限
- [x] `dev-desktop.mjs` 随机 token

## 六、Gate 3：内测后迭代（已实施基础版）

- [x] Keychain（`credentials.rs` + `credentialClient.ts` + 启动迁移）
- [x] Prisma `onDelete: SetNull` + migration
- [x] export-zip 请求边界校验
- [x] Hook deps 修复（AssetCenter / AIAssistantDrawer / ImageGenStudio）
- [x] 四主视图 `React.lazy` + `manualChunks`
- [x] Playwright smoke 配置（`e2e/smoke.spec.ts`）
- [ ] `x-storage-config` 完全移除（正式版）
- [ ] ESLint 0 warning（正式版）

## 七、验证命令

```bash
npm run typecheck
npm run test          # 需 npm install vitest
npm run check:desktop
cargo test --manifest-path src-tauri/Cargo.toml
```

## 八、回滚

- Git：`pre-remediation` tag 对比
- 数据库：migration 前备份 `azhuo.db`
- 凭证：Keychain 项可手动清除；localStorage 迁移失败时保留旧 key
