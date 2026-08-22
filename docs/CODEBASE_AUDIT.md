# 贝壳云图 · 缺陷审计与处置清单

| 项 | 内容 |
|---|---|
| **更新日期** | 2026-08-22（第四批：安全修复 Gate 0–3） |
| **代码范围** | `src/` 前端 + `server/` API + `src-tauri/` + `src/lib/` |
| **审查方法** | 全程序审查 + Gate 0–3 实施 |
| **本文用途** | 运行时缺陷 + 安全/发布项统一跟踪 |

---

## 0. 总览

### 运行时缺陷（原 CODEBASE_AUDIT）

| 级别 | 合计 | 已修 | 未修 |
|---|---|---|---|
| Critical | 3 | **3** | 0 |
| High | 6 | **6** | 0 |
| Medium | 12 | **12** | 0 |
| Low | 8 | 0 | **8** |

### 安全/发布项（FULL_PROGRAM_REVIEW → Gate 修复）

| 级别 | 合计 | 已修 | 未修 |
|---|---|---|---|
| P0 | 1 | **1** | 0 |
| P1 | 6 | **6** | 0 |
| P2（桌面 MVP 范围） | 4 | **4** | 0 |
| P2/P3（正式版） | 6 | 2 | **4** |

**桌面内测发布线（Gate 0–2）**：已满足 typecheck、cargo test、P0/P1、admin 分离、query token 移除、CSPRNG token。  
**正式版待办**：`x-storage-config` 完全服务端化、ESLint 全绿、完整 E2E、CORS 生产域名白名单细化。

---

## 1. 安全/发布项映射

| 审查 ID | 问题 | Gate | 状态 |
|---|---|---|:---:|
| P0-01 | Tauri 任意路径写文件 | 1B | **已修** — `save_download_file` + 目录句柄 |
| P1-01 | typecheck 未入 build | 1A | **已修** |
| P1-02 | Stack 缺 `useRef` | 1A | **已修** |
| P1-03 | CSP null | 1C | **已修** |
| P1-04 | secret 在 localStorage | 3 | **部分** — Keychain 迁移 + 启动迁移；storage header 仍待服务端化 |
| P1-05 | proxy/export 先 arrayBuffer | 1D | **已修** — 流式硬上限 |
| P1-06 | extract-document 无隔离 | 1D | **已修** — 预检 + 30s 超时 |
| P2-04 | Product/ImageTask 删除 | 3 | **已修** — `onDelete: SetNull` + migration |
| P2-05 | admin 回退普通 token | 2 | **已修** |
| P2-06 | query token 泄漏 | 2 | **已修** — Cookie + HMAC 签名 |
| P2-07 | Rust token 可预测 | 2 | **已修** — CSPRNG + 0600 |
| P2-08 | 无拆包 | 3 | **已修** — React.lazy + manualChunks |
| P2-09 | API 无 schema | 3 | **部分** — export-zip 边界校验 |
| P2-10 | 空 catch | 3 | 未修（Low 优先级） |
| P3-01 | CORS `*` | 2 | **已修** — 本地 origin 白名单 |
| P3-03 | dev 硬编码 token | 2 | **已修** — 随机 token 文件 |
| P3-04 | Git 脏工作区 | 0 | **已修** — 提交整理 + `pre-remediation` tag |

---

## 2. 已修复 · Critical（运行时）

C1 Step3/4 无限渲染 · C2 PromptStudio 死循环 · C3 blob 垫图 — 均 **已修**（见历史批次）

---

## 3. 已修复 · High / Medium / 桌面专项

H1–H6、M1–M12、D1–D4 — 均 **已修**（见 2026-08-22 第二、三批）

---

## 4. 发布门槛

| 检查 | 桌面内测 | 正式版 |
|---|---|---|
| Git 干净 checkout | 必须 | 必须 |
| `typecheck` + `cargo check` | 必须 | 必须 |
| P0/P1 安全 | 必须 | 必须 |
| admin / query token | 必须 | 必须 |
| Keychain 无 localStorage secret | 部分（AI key 已迁） | 必须 |
| ESLint 全绿 | 否 | 必须 |
| E2E smoke | 配置就绪 | 必须 |

---

## 5. 修订记录

| 日期 | 内容 |
|---|---|
| 2026-08-21 | 初稿 |
| 2026-08-22 | 第二、三批运行时修复 |
| 2026-08-22 | 第四批：Gate 0–3 安全修复，合并 FULL_PROGRAM_REVIEW 跟踪 |
