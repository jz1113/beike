# 数据库目录与维护

## 文件归属

`20261105_01_generation_submissions` 新增 `GenerationSubmission`，以工作区、阶段和操作标识建立唯一约束，保存输入摘要和最终响应。原始密钥不进入回执输入摘要；渠道凭证仅参与不可逆摘要。模型调用前必须成功领取回执，成功或失败响应由独立结算上下文保存。未结算记录不能作为过期缓存清理，否则会破坏重复提交保护；迁移保留已有任务，不推测或补建旧调用的阶段身份。

`20261104_01_image_task_route` 为 `ImageTask` 追加 `routeFingerprint`，默认空字符串以兼容旧记录。新生图提交在调用上游前写入有效渠道的 SHA-256 摘要，用于刷新恢复后的渠道一致性校验；该字段不保存原始密钥。迁移由正常启动流程执行，保留已有任务和素材；旧记录不猜测或回填渠道。

当前 schema、版本登记与官方种子统一由 `src/backend/internal/platform/database/migrate` 管理：`versions.go` 定义顺序和 checksum，`sources` 保存嵌入源文件。运行时使用 `_BeikeMigration` 账本。新增变更追加版本，不能修改已发布源文件来绕过校验。新库初始化、已有库升级和 `pnpm db:migrate` 使用同一条 Go 迁移链，升级前自动生成快照。

`20261101_04_sales_products` 曾发布过仅末尾空行不同的两个脚本，迁移链兼容这两个已核实等价的 checksum，并保留数据库中原有的登记值。未知 checksum 或未知版本仍阻止启动，不通过改写或删除账本修复。

不再保留第二套历史 SQL。早期增改表已纳入当前基线，后续脚本对应已登记迁移；旧工具链脚本也不能独立组成完整初始化链。历史源码从 Git 查询，当前 Go 迁移源文件及 checksum 保持不变。

根 `database` 仅兼容已有本地数据，整目录忽略提交；新检出无需创建。`database/dev.db` 是已有本地开发数据，`database/database-backups` 保存该库的历史快照与恢复文件，两者保持原位。日常启动沿用系统应用数据目录中的 `azhuo.db`，不把旧开发库自动迁入，也不自动删除。

`*.db`、同名 `*-wal` 和 `*-shm` 构成 SQLite 的运行文件组。WAL 可能包含尚未合并到主文件的已提交数据，不能因文件很小或为空就单独清理。备份目录里的旧恢复库及其附属文件也按用户数据保留；Finder 的 `.DS_Store` 可删除，系统可能重新生成。

## 维护命令选择哪个库

`db:backup`、`db:restore:verify`、`db:migrate`、`db:deploy` 与 `seed:export` 共用路径解析：

1. 文件参数优先，相对路径从执行命令时的目录解析；统一命令应在仓库根目录运行。
2. 没有文件参数时，读取进程环境中的 `DATABASE_URL`。只支持 SQLite `file:` URL；相对 URL 从仓库根目录解析，与 Go 保持一致。支持原生 Windows 路径和含空格、中文的文件 URI。
3. 设置 `AZHUO_DATA_DIR` 时，会读取该目录的 `.env`；Linux 服务用户的 home 包含 `storage` 时，兼容读取 home 下的 `.env`。已有进程环境优先于这些配置文件。
4. 未配置数据库 URL 时，使用 `AZHUO_DATA_DIR/azhuo.db` 或系统应用数据目录中的 `azhuo.db`。

`pnpm start` 使用同一套配置加载与路径解析，并在启动日志显示最终 SQLite 路径。普通 `pnpm dev` 尊重进程显式 `DATABASE_URL`，但忽略根 `.env` 中的旧数据库 URL；`BEIKE_ISOLATED_DEV=1` 则强制使用隔离数据目录中的 `azhuo.db`，不继承数据库 URL。维护隔离开发库时应显式传入日志中的文件路径，避免误用当前终端继承的生产配置。启动检查只准备所选路径的父目录，不复制、移动或覆盖已有库。

维护命令不加载根目录 `.env` 的旧 `file:./dev.db` 配置，也不在运行库缺失时自动选择 `database/dev.db`。需要操作旧库时明确传参，避免迁移、备份或导出作用在错误的数据文件上。`seed:export` 同时兼容旧的 `AZHUO_DB_PATH` 文件参数环境变量。

macOS 系统应用数据目录为 `~/Library/Application Support/com.azhuo.workbench`；Windows 为 `%APPDATA%/com.azhuo.workbench`；Linux 为 `~/.local/share/com.azhuo.workbench`。生产数据目录以服务环境配置为准。

迁移 `20261103_03_library_preferences` 新增 `WorkspaceLibraryPreferences`，按工作区分别保存首页资产库入口和跨工作区共享开关。没有设置记录时，首页显示资产库，共享关闭。

迁移 `20261103_02_sales_prompt_template_version` 给提示词编辑记录加上所属模板版本。读取工作区时清除已退役或与当前模板版本不符的编辑记录，任务和脚本历史保留。

迁移 `20261103_01_sales_media_jobs` 新增按工作区隔离的 `SalesMediaJob` 和参考视频分析配置指纹。旧参考脚本继续可读、可编辑。缺少指纹的历史拆解不会自动作为新配置的缓存。服务端任务记录包含阶段回执和恢复所需的资料；模型凭证在执行或重试请求中提供。

## 检查、备份与恢复

```bash
pnpm db:backup                            # 当前应用库的一致性快照
pnpm db:backup database/dev.db            # 明确备份旧开发库
pnpm db:restore:verify /绝对路径/快照.db    # 完整性与外键检查
pnpm db:migrate /绝对路径/目标.db          # 写操作：初始化或升级指定库
```

备份命令使用 SQLite backup API，把已提交 WAL 数据合并到独立快照；随后验证完整性和外键并同步文件。目标放在源库旁的 `database-backups`，使用时间和随机标识命名，以私有权限创建，已存在的文件不会被覆盖。失败时删除本次未完成的目标文件，保留源库。

服务器上可运行 `AZHUO_DATA_DIR=/var/lib/beike pnpm db:backup`，或直接传入 `/var/lib/beike/azhuo.db`。恢复先校验快照，再停止服务、保留原库及其 WAL/SHM，最后替换运行文件；不对正在使用的主库执行裸文件复制。

空闲页不等于可删除文件。`VACUUM`、checkpoint、备份保留期限和旧库删除涉及运行状态及数据保留策略，不由目录整理自动执行。

人工整理备份时，先确认没有进程占用，在临时副本上检查完整性和外键，再比较表结构、所有表记录和迁移账本。文件校验值不同可能只是 SQLite 页布局不同，不能据此认定内容不同；时间更早、版本更旧也不是删除依据。确认内容相同后保留一份，把重复副本移入废纸篓并记录原路径，暂不永久删除。

历史备份的 WAL/SHM 只有在确认未被使用、主库独立读取与带 WAL 读取的内容一致时才能整理，处理后再次验证。独立历史快照可用 `日期-用途.db` 简化命名；自动备份继续保留时间和随机标识，避免重名覆盖。

## 官方种子导出

`pnpm seed:export [数据库路径]` 先生成一致性快照，再从同一个快照读取架构与资产，写入 `src/shared/data/officialMasterRecipes.json` 和 `promptAssets.json`。前端官方架构与 Go 运行时回填读取同一份 `officialMasterRecipes.json`；导出保留数据库记录 ID，移除工作区与时间戳等运行字段。原始架构行保存在 `promptAssets.json` 的 `data.styleRecipes` 中，不再单独生成第二份 `styleRecipes.json`。导出会更新仓库官方种子，执行前应确认数据来源。

快照保存在 `.local/deploy-backup/azhuo-<时间>-<随机标识>.db`，命令输出本次实际路径，不覆盖已有的 `azhuo.db` 或其他历史备份。导出与备份使用 `SQLITE_BACKUP_PYTHON` 指定的 Python，默认 `python3`。

官方架构种子文件缺失时保留现有官方记录并记录告警；非法 JSON 阻止种子同步。合法显式空目录只同步官方架构，不删除任何工作区的 `recipe_hidden` 偏好事件。启动和迁移共用此规则，不通过资源缺失推断用户希望清空数据。
