# 贝壳云图项目 7GB 磁盘占用说明与优化方案

检查日期：2026-08-22  
检查对象：`/Users/huayuzulin/Downloads/阿卓工作台`  
Finder 截图显示：约 7.3GB  
终端 `du -sh` 实测：约 5.9GB

## 一、结论

这不是 5–6 万行源码本身占用了 7GB。当前项目真正的业务源码、配置、图片和数据库合计只有几十 MB；绝大部分空间来自 Tauri/Rust 在开发和发布编译过程中产生的 `src-tauri/target` 缓存。

当前实测：

| 内容 | 实际占用 | 是否源码 | 是否可以重建 |
|---|---:|---|---|
| `src-tauri/target` | 5.1GB | 否 | 是 |
| `node_modules` | 372MB | 否 | 是，可由 lockfile 安装 |
| `.git` | 337MB | 版本历史 | 可压缩，不建议直接删除 |
| `src-tauri/binaries` | 86MB | 否，Node sidecar 副本 | 是 |
| `dist` | 19MB | 否，前端构建产物 | 是 |
| `public` | 17MB | 是，静态资源 | 需要保留 |
| `prisma` | 5.5MB | schema + 当前数据库 | 数据库需保留 |
| `src` | 2.4MB | 是，主要前端源码 | 必须保留 |
| `server` | 344KB | 是，后端源码 | 必须保留 |
| 其他配置/脚本/文档 | 约数 MB | 是 | 必须保留 |

因此，5.1GB 的 Rust `target` 约占终端实测总量的 86%。清除可重建缓存后，保留依赖和 Git 历史的项目预计约为 750–850MB；如果再删除 `node_modules`，约为 350–450MB；使用项目自带的精简源码打包命令且不包含 `.git`，源码备份通常只有几十 MB，最终压缩包还会更小。

## 二、为什么 Tauri/Rust 会产生 5GB 以上缓存

### 1. Debug 编译保留了大量调试信息

`src-tauri/target/debug` 当前占 3.8GB，其中：

| Debug 子目录/文件 | 大小 |
|---|---:|
| `debug/deps` | 2.7GB |
| `debug/build` | 360MB |
| `libazhuo_workbench_lib.a` | 371MB |
| `debug/incremental` | 155MB |
| `libazhuo_workbench_lib.rlib` | 105MB |
| Node sidecar 副本 | 86MB |
| Debug 应用二进制 | 42MB |

Rust 开发构建为了支持断点调试、快速增量重编译和依赖链接，会保存：

- 每个依赖 crate 的编译产物；
- 带完整调试符号的静态库和 rlib；
- build script 输出；
- incremental 增量编译缓存；
- 同一库在根目录和 `deps` 中的多个链接阶段产物。

当前程序使用 Tauri、reqwest、Prisma sidecar 相关桌面集成等依赖，Rust 依赖树并不小。Debug 构建达到数 GB 是常见现象，但不代表最终安装包会有同样大小。

### 2. Debug 和 Release 产物同时存在

`src-tauri/target/release` 另外占 1.3GB：

| Release 子目录/文件 | 大小 |
|---|---:|
| `release/deps` | 972MB |
| `release/build` | 194MB |
| Node sidecar 副本 | 86MB |
| 静态库 | 69MB |
| 最终应用二进制 | 15MB |

开发期间执行 `tauri:dev` 会生成 debug 缓存，执行 `tauri:build`/release 检查又生成 release 缓存，两套同时保留，空间自然累加。

### 3. Node sidecar 被复制了多次

当前 Node 可执行文件单份约 86MB，至少存在于：

- `src-tauri/binaries/node-aarch64-apple-darwin`
- `src-tauri/target/debug/node`
- `src-tauri/target/release/node`

三份合计约 258MB。这样做是为了让 Tauri 开发和安装包携带 Hono API 所需的 Node runtime。它不是源码，可以由 `tools/scripts/ensure-desktop-sidecar.mjs` 或打包流程重新复制。

### 4. Node 前端/后端依赖本身约 372MB

`node_modules` 中包含 Prisma engines、Sharp/libvips、Tauri CLI、TypeScript、AWS SDK、xlsx 等原生或大型依赖。372MB 对包含这些依赖的桌面全栈项目并不异常。

体积较明显的依赖包括 Prisma、Sharp、Tauri CLI、TypeScript、AWS SDK、lucide-react 和 xlsx。它们影响开发目录大小，但不会全部原样进入前端 JS 包。

### 5. Git 历史约 337MB

`.git` 的 pack 文件约 319MB，说明历史提交中包含过较大的图片、数据库、旧目录或其他二进制文件。即使这些文件从当前工作树删除，Git 为了保留历史仍然保存它们。

这部分不影响运行，但会影响项目目录和 clone/备份大小。普通 `git gc` 只能整理对象，不能消除仍被历史引用的大文件；真正缩小需要重写 Git 历史，属于高风险、团队协作影响较大的独立操作。

## 三、Finder 为什么显示 7.3GB，而 `du` 是 5.9GB

两者统计口径可能不同：

1. Finder 的“大小”可能统计文件逻辑长度，而 `du` 更接近磁盘实际分配块。
2. APFS 的压缩、clone/copy-on-write、稀疏文件会造成逻辑大小和实际占用不同。
3. Rust 同一编译单元在 `target/debug` 和 `target/debug/deps` 中可能有多个大文件；Finder 和命令行对这些文件的展示方式不同。
4. Finder 信息窗口可能尚未刷新，仍包含检查前的旧构建结果。
5. 文件系统元数据和大量小文件会带来额外统计差异。当前项目约有 31,172 个文件、4,126 个目录。

判断“还能释放多少真实磁盘”应以清理前后的 `du -sh` 和系统磁盘剩余空间为准，而不是只看 Finder 的单次显示。

## 四、这种占用正常吗

分情况看：

- 对纯 React/Vite Web 项目：7GB 明显过大。
- 对包含 Tauri/Rust、debug + release、增量编译和内置 Node sidecar 的桌面项目：开发一段时间后达到 4–8GB 并不罕见。
- 对源码归档或交付包：7GB 不正常，不应把 `target`、`node_modules`、`dist` 和 sidecar 副本作为源码备份。
- 对最终用户安装包：不应达到 7GB。最终包主要包含 release 应用、前端 dist、Node sidecar 和 API 运行依赖；需要以最终 `.dmg`/`.app`/安装包实测，而不能用整个开发目录大小代表安装体积。

所以这是“开发缓存膨胀”，不是“程序源码异常膨胀”。它可以优化，而且仓库已经提供了清理命令。

## 五、可以安全清理什么

### 方案 A：只清理 Rust/Tauri 构建缓存（推荐日常使用）

```bash
npm run clean
```

该命令删除：

- `src-tauri/target`
- `dist`

按本次实测，预计释放约 5.1GB 以上。不会删除源码、数据库、Git 历史或 `node_modules`。下次 `tauri:dev` 会重新编译，首次启动会明显更慢。

### 方案 B：同时清理 sidecar 副本

```bash
npm run clean:dev
```

它执行 `clean`，并删除 `src-tauri/binaries/node-*`。本次预计比方案 A 再多释放约 86MB。下次运行 `tauri:dev` 会自动重新复制 Node sidecar。

这是当前项目开发结束后最合适的清理方式，README 也已经说明该命令用于释放约 3GB；根据当前实际情况，这次可以释放约 5.2GB。

### 方案 C：连 Node 依赖一起删除

```bash
npm run clean:all
```

除上述内容外还删除 `node_modules`，预计再释放约 372MB。下次开发前必须重新安装依赖。适合长期归档或磁盘空间紧张时使用，不适合每天执行。

### 方案 D：制作精简源码备份

```bash
npm run pack:source
```

该脚本明确排除：

- `node_modules`
- `src-tauri/target`
- `src-tauri/binaries`
- `dist`
- `.git`（默认）

因此适合传输、备份和交付源码，而不是直接压缩整个项目文件夹。只有设置 `WITH_GIT=1` 才会带上约 337MB Git 历史。

## 六、哪些内容不要随意删除

以下内容应保留或先备份：

- `src/`、`server/`、`src-tauri/src/`、`tools/`：业务和构建源码。
- `package.json`、`package-lock.json`、`Cargo.toml`、`Cargo.lock`：可复现依赖版本。
- `prisma/schema.prisma`：数据库结构。
- `prisma/dev.db`：当前开发数据；如果其中有真实商品、任务或助手会话，删除会丢数据。
- `.env`、桌面应用数据目录：包含配置/凭证；不能随源码公开，删除前确认影响。
- `.git`：版本历史。不要为了省空间直接删除，除非明确只保留无历史源码副本。

`npm run clean:*` 当前不会删除 `prisma/dev.db`，也不会删除桌面用户数据目录。

## 七、长期优化方案

### 1. 给 Rust 开发 profile 减少调试信息

在 `src-tauri/Cargo.toml` 中评估增加：

```toml
[profile.dev]
debug = 1
incremental = true

[profile.dev.package."*"]
debug = false
```

含义：应用自身保留有限行号调试信息，第三方依赖不生成完整调试符号。通常可显著降低 `target/debug` 体积，同时仍保留基本回溯。

取舍：调试第三方 Rust 依赖时信息会减少。修改后应验证崩溃回溯、Tauri dev 和 Rust 调试体验。

如果几乎不调试 Rust，也可以使用 `debug = 0`；不建议在未验证前直接采用。

### 2. 定期清理，而不是长期累积 debug/release

建议制度：

- 日常连续开发期间保留 `target`，换取快速增量编译。
- 完成一个版本或磁盘紧张时执行 `npm run clean:dev`。
- 长期归档执行 `npm run clean:all` 后再 `pack:source`。
- CI 使用临时 runner 或缓存设置上限，避免构建机无限累积。

### 3. 检查重复 Node sidecar 的打包必要性

源码目录中的 `binaries` 副本是 Tauri externalBin 所需，`target/debug` 和 `target/release` 的复制品是构建输出。它们不可全部取消，但可以做到：

- 仅在真正执行 Tauri dev/build 前生成 `binaries`。
- Web-only 开发不运行 sidecar 准备脚本。
- 发布结束后清理 `target`，不要保留 debug 和 release 两套缓存。

### 4. 控制 Git 二进制历史

后续应确保 `.gitignore` 持续排除：

- `node_modules/`
- `dist/`
- `src-tauri/target/`
- `src-tauri/binaries/node-*`
- 本地数据库、安装包、压缩包和生成媒体（根据项目数据策略）

当前这些主要构建目录已经被 `.gitignore` 排除，做法正确。以后大型图片或模型资源应使用 Git LFS、发布附件或外部对象存储，不要直接提交普通 Git 历史。

若要缩小当前 337MB `.git`，应先用 `git rev-list`/`git filter-repo --analyze` 识别历史大对象，再决定是否重写历史。重写会改变所有 commit hash，必须单独备份并协调所有协作者，不能作为普通清理动作执行。

### 5. 给清理命令增加可观测输出

可以改进 `clean` 脚本，在删除前后显示目录大小，并拆成：

- `clean:ui`：只删 `dist`
- `clean:rust`：只运行 `cargo clean`
- `clean:sidecar`：只删生成的 Node 副本
- `clean:dev`：组合日常深度清理
- `clean:all`：包含 `node_modules`

这样能减少误解，也方便只清理最占空间的部分。

## 八、推荐操作方案

如果现在只是想释放空间，同时马上还要继续开发：

```bash
npm run clean:dev
```

预计结果：项目从 Finder 显示的约 7.3GB，下降到约 0.7–0.9GB（Finder 和 `du` 口径仍可能不同）。下次 Tauri 首次编译会变慢，之后增量编译恢复正常速度。

如果准备长期归档：

```bash
npm run clean:all
npm run pack:source
```

归档前应先备份并确认 `prisma/dev.db` 和 `.env` 的处理方式；`.env` 含敏感信息，不建议包含在对外源码包中。当前 `pack:source` 的排除列表没有明确排除 `.env`，这是一个需要修复的安全问题：应额外排除 `.env`、`.env.*`（保留 `.env.example`）以及本地数据库。

## 九、建议新增的自动控制

1. 在 README 中把“约 3GB”更新为“通常 3–6GB，取决于 debug/release 构建次数”。
2. 启动或退出时不自动删除 Rust 缓存，否则每次都要全量重编译；只在设置页面提供“释放开发缓存”说明即可。
3. CI 监控 `src-tauri/target` 缓存大小并设置淘汰上限。
4. `pack:source` 增加 secret 和本地数据库排除规则。
5. 可选加入 `cargo-cache`/CI cache pruning，但开发机优先使用项目自带 clean 命令，减少额外工具依赖。

## 十、最终判断

- 7.3GB 不是程序源码或最终程序必然需要的大小。
- 主要原因是 Rust/Tauri debug 与 release 构建缓存同时存在。
- 这种情况在桌面 Rust 开发中常见，但应定期清理，不应带入源码备份。
- 当前可以安全释放约 5.2GB 的可重建 Tauri 缓存；连依赖一起清理可再释放约 372MB。
- 长期应通过降低 dev debug 信息、按阶段清理、控制 Git 大文件和改进源码打包排除项来治理。
