mod api;
mod credentials;
mod state;
mod storage;

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use api::{desktop_api, get_api_base};
use credentials::{credential_delete, credential_get, credential_has, credential_set};
use storage::{
    get_app_data_dir, get_app_memory_usage, get_default_download_dir, get_disk_usage,
    get_system_memory, register_download_directory, save_download_file, DownloadDirRegistry,
};
use state::{ApiServer, AppState};
use tauri::{Manager, RunEvent, WebviewWindow};

const APP_TITLE: &str = "贝壳云图";

fn port_free(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

fn pick_port() -> u16 {
    for port in 3000..3100 {
        if port_free(port) {
            return port;
        }
    }
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(3000)
}

fn health_ok(port: u16) -> bool {
    let addr: std::net::SocketAddr = match format!("127.0.0.1:{port}").parse() {
        Ok(a) => a,
        Err(_) => return false,
    };
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(400)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(400)));
    if stream
        .write_all(
            format!("GET /api/health HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n")
                .as_bytes(),
        )
        .is_err()
    {
        return false;
    }
    let mut buf = String::new();
    let _ = stream.read_to_string(&mut buf);
    buf.contains("HTTP/1.1 200") && (buf.contains("\"ok\":true") || buf.contains("\"ok\": true"))
}

fn wait_for_health(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    let mut delay_ms = 100u64;
    while start.elapsed() < timeout {
        if health_ok(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(delay_ms));
        delay_ms = (delay_ms * 2).min(2000);
    }
    false
}

fn emit_api_ready(window: &WebviewWindow) {
    let _ = window.eval(&format!(
        "window.dispatchEvent(new CustomEvent('{}'))",
        "beike-api-ready"
    ));
}

fn show_desktop_window(window: &WebviewWindow) {
    let _ = window.set_title(APP_TITLE);
    let _ = window.show();
    let _ = window.set_focus();
}

fn parse_env_file(path: &Path) -> Vec<(String, String)> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let key = k.trim().to_string();
        let mut val = v.trim().to_string();
        if val.len() >= 2
            && ((val.starts_with('"') && val.ends_with('"'))
                || (val.starts_with('\'') && val.ends_with('\'')))
        {
            val = val[1..val.len() - 1].to_string();
        }
        if !key.is_empty() {
            out.push((key, val));
        }
    }
    out
}

fn file_url(path: &Path) -> String {
    let abs = path.canonicalize().unwrap_or_else(|_| path.to_path_buf());
    let mut s = abs.to_string_lossy().replace('\\', "/");
    if s.starts_with("//?/") {
        s = s[4..].to_string();
    } else if s.starts_with("\\\\?\\") {
        s = s[4..].to_string();
    }
    if cfg!(windows) {
        format!("file:{s}")
    } else {
        if !s.starts_with('/') {
            s = format!("/{s}");
        }
        format!("file:{s}")
    }
}

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    // 安全：getrandom 失败时仅记录日志，不使用 SystemTime + pid（后者可能 panic）
    if let Err(err) = getrandom::getrandom(&mut bytes) {
        eprintln!(
            "[generate_token] getrandom 失败: {err}，使用零字节 token（仅在开发/测试环境）"
        );
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn write_secret_file(path: &Path, content: &str) -> std::io::Result<()> {
    use std::io::Write;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)
        .map_err(std::io::Error::other)?.as_nanos();
    let temp = path.with_extension(format!("tmp-{}-{nonce}", std::process::id()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temp)?;
        file.write_all(content.as_bytes())?;
        file.sync_all()?;
        fs::rename(&temp, path)?;
        Ok(())
    })();
    if result.is_err() { let _ = fs::remove_file(&temp); }
    result
}

fn ensure_private_dir(path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)?.permissions();
        perms.set_mode(0o700);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
}

fn sidecar_node_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut search_dirs: Vec<PathBuf> = Vec::new();

    // 1. 优先检查当前运行的二进制所在目录（macOS 位于 Contents/MacOS/，Windows 位于 .exe 同级目录）
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            search_dirs.push(parent.to_path_buf());
            search_dirs.push(parent.join("binaries"));
            search_dirs.push(parent.join("resources"));
        }
    }

    // 2. 检查资源目录及子目录
    if let Ok(resource) = app.path().resource_dir() {
        search_dirs.push(resource.clone());
        search_dirs.push(resource.join("binaries"));
        search_dirs.push(resource.join("resources"));
    }

    // 3. 检查 Tauri 报告的 executable_dir（若有）
    if let Ok(exe_dir) = app.path().executable_dir() {
        search_dirs.push(exe_dir);
    }

    // 4. 开发/本地调试路径
    if let Ok(cwd) = std::env::current_dir() {
        search_dirs.push(cwd.join("apps").join("desktop").join("binaries"));
        search_dirs.push(cwd.join("binaries"));
    }

    let plain = if cfg!(windows) { "node.exe" } else { "node" };

    for dir in &search_dirs {
        let plain_path = dir.join(plain);
        if plain_path.is_file() {
            return Some(plain_path);
        }

        // Tauri externalBin 随包名可能为 node-{target-triple}
        if let Ok(read_dir) = fs::read_dir(dir) {
            for entry in read_dir.flatten() {
                let name = entry.file_name();
                let s = name.to_string_lossy();
                if s.starts_with("node-") && !s.ends_with(".d.ts") {
                    let path = entry.path();
                    if path.is_file() {
                        return Some(path);
                    }
                }
            }
        }
    }

    // 5. 兜底尝试系统环境中的 node 解释器（若用户本地安装有 Node）
    for candidate in [
        "/usr/local/bin/node",
        "/opt/homebrew/bin/node",
        "/usr/bin/node",
        "C:\\Program Files\\nodejs\\node.exe",
    ] {
        let p = PathBuf::from(candidate);
        if p.is_file() {
            return Some(p);
        }
    }

    None
}

fn resolve_api_server_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("resources").join("api-server"));
        candidates.push(resource.join("api-server"));
        candidates.push(resource.join("resources/api-server"));
        candidates.push(resource);
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join("resources").join("api-server"));
            candidates.push(parent.join("api-server"));
            if let Some(contents) = parent.parent() {
                candidates.push(contents.join("Resources").join("resources").join("api-server"));
                candidates.push(contents.join("Resources").join("api-server"));
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join("apps").join("desktop").join("resources").join("api-server"));
        candidates.push(cwd.join("resources").join("api-server"));
    }

    candidates
        .into_iter()
        .find(|p| p.join("index.cjs").is_file())
}

fn copy_if_missing(src: &Path, dest: &Path) -> std::io::Result<()> {
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)?;
    }
    if src.is_file() {
        fs::copy(src, dest)?;
    }
    Ok(())
}

fn kill_api_server(state: &ApiServer) {
    if let Ok(mut guard) = state.0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn prepare_data_dir(app: &tauri::AppHandle) -> Result<(PathBuf, String, PathBuf), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    ensure_private_dir(&data_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(data_dir.join("storage")).map_err(|e| e.to_string())?;

    let db_path = data_dir.join("azhuo.db");
    let env_path = data_dir.join(".env");

    if cfg!(not(debug_assertions)) {
        if let Some(server_dir) = resolve_api_server_dir(app) {
            let template = server_dir.join("prisma").join("template.db");
            copy_if_missing(&template, &db_path).map_err(|e| e.to_string())?;

            // 首次启动时若用户数据目录下无 .env，自动释放随包预置配置（保留初始 API Key）
            let template_env = server_dir.join(".env");
            let _ = copy_if_missing(&template_env, &env_path);
        }
    }

    let file_vars = parse_env_file(&env_path);

    let token_path = data_dir.join("access.token");
    let mut token = file_vars
        .iter()
        .find(|(k, _)| k == "LOCAL_ACCESS_TOKEN")
        .map(|(_, v)| v.clone())
        .filter(|s| !s.is_empty());
    if token.is_none() {
        if let Ok(existing) = fs::read_to_string(&token_path) {
            let t = existing.trim().to_string();
            if !t.is_empty() {
                token = Some(t);
            }
        }
    }
    let token = if cfg!(debug_assertions) {
        token.unwrap_or_else(|| "azhuo-local-dev".to_string())
    } else {
        token.unwrap_or_else(generate_token)
    };
    let _ = write_secret_file(&token_path, &token);

    Ok((data_dir, token, db_path))
}

fn spawn_api_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let server_dir = resolve_api_server_dir(app).ok_or("未找到打包的 API 服务（resources/api-server）")?;
    let node = sidecar_node_path(app).ok_or("未找到随包 Node sidecar")?;

    let (data_dir, token, db_path) = prepare_data_dir(app)?;
    let env_path = data_dir.join(".env");
    let file_vars = parse_env_file(&env_path);

    let log_file = data_dir.join("api-server.log");
    let log_handle = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(true)
        .open(&log_file);
    let (log_out, log_err) = match log_handle {
        Ok(file) => {
            let err_clone = file.try_clone().map(Stdio::from).unwrap_or_else(|_| Stdio::null());
            (Stdio::from(file), err_clone)
        }
        Err(_) => (Stdio::null(), Stdio::null()),
    };

    let index_file = server_dir.join("index.cjs");
    let mut cmd = Command::new(&node);
    cmd.arg("--max-old-space-size=2048")
        .arg("--expose-gc")
        .arg(&index_file)
        .current_dir(&server_dir)
        .stdin(Stdio::null())
        .stdout(log_out)
        .stderr(log_err);

    for (k, v) in file_vars {
        if matches!(
            k.as_str(),
            "PORT" | "HOSTNAME" | "DATABASE_URL" | "DESKTOP_SHELL" | "AZHUO_DATA_DIR"
        ) {
            continue;
        }
        cmd.env(k, v);
    }

    cmd.env("NODE_ENV", "production")
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("DESKTOP_SHELL", "1")
        .env("AZHUO_DATA_DIR", &data_dir)
        .env("DATABASE_URL", file_url(&db_path))
        .env("LOCAL_ACCESS_TOKEN", &token)
        .env("NODE_PATH", server_dir.join("node_modules"))
        .env("NODE_OPTIONS", "--max-old-space-size=2048 --expose-gc");

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    cmd.spawn().map_err(|e| format!("启动 API sidecar 失败: {e}"))
}

fn write_env_file(path: &Path, vars: &[(String, String)]) -> std::io::Result<()> {
    let mut lines = vec!["# 贝壳云图 · 桌面端 API 配置（由应用自动写入）".to_string()];
    for (k, v) in vars {
        lines.push(format!("{k}={v}"));
    }
    write_secret_file(path, &format!("{}\n", lines.join("\n")))
}

fn upsert_env_var(vars: &mut Vec<(String, String)>, key: &str, value: &str) {
    if let Some(entry) = vars.iter_mut().find(|(k, _)| k == key) {
        entry.1 = value.to_string();
    } else {
        vars.push((key.to_string(), value.to_string()));
    }
}

/// 桌面 .env 的唯一文件写入者。sidecar 进程内仅通过 /api/system/desktop-env 热更新 process.env。
#[tauri::command]
fn save_desktop_env(
    app: tauri::AppHandle,
    base_url: Option<String>,
    api_key: Option<String>,
    wanbang_key: Option<String>,
    wanbang_secret: Option<String>,
    external_scraper_id: Option<String>,
    external_scraper_secret: Option<String>,
    storage_enabled: Option<bool>,
    storage_provider: Option<String>,
    storage_account_id: Option<String>,
    storage_endpoint: Option<String>,
    storage_access_key_id: Option<String>,
    storage_secret_access_key: Option<String>,
    storage_bucket_name: Option<String>,
    storage_public_domain: Option<String>,
    cache_dir: Option<String>,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    static ENV_WRITE_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    let _guard = ENV_WRITE_LOCK.lock().map_err(|_| "配置保存锁异常".to_string())?;
    let env_path = data_dir.join(".env");
    let mut vars = parse_env_file(&env_path);
    upsert_env_var(&mut vars, "ALLOW_CUSTOM_BASE_URL", "true");
    if let Some(url) = base_url.filter(|s| !s.trim().is_empty()) {
        upsert_env_var(
            &mut vars,
            "AI_DRAWING_BASE_URL",
            url.trim().trim_end_matches('/'),
        );
    }
    if let Some(key) = api_key {
        upsert_env_var(&mut vars, "AI_DRAWING_API_KEY", key.trim());
    }
    if let Some(v) = wanbang_key {
        upsert_env_var(&mut vars, "WANBANG_API_KEY", v.trim());
    }
    if let Some(v) = wanbang_secret {
        upsert_env_var(&mut vars, "WANBANG_API_SECRET", v.trim());
    }
    if let Some(v) = external_scraper_id {
        upsert_env_var(&mut vars, "EXTERNAL_SCRAPER_ID", v.trim());
    }
    if let Some(v) = external_scraper_secret {
        upsert_env_var(&mut vars, "EXTERNAL_SCRAPER_SECRET", v.trim());
    }
    if let Some(enabled) = storage_enabled {
        upsert_env_var(
            &mut vars,
            "STORAGE_ENABLED",
            if enabled { "true" } else { "false" },
        );
    }
    if let Some(v) = storage_provider.filter(|s| !s.trim().is_empty()) {
        upsert_env_var(&mut vars, "STORAGE_PROVIDER", v.trim());
    }
    if let Some(v) = storage_account_id {
        upsert_env_var(&mut vars, "R2_ACCOUNT_ID", v.trim());
    }
    if let Some(v) = storage_endpoint {
        upsert_env_var(&mut vars, "S3_ENDPOINT", v.trim());
    }
    if let Some(v) = storage_access_key_id {
        upsert_env_var(&mut vars, "S3_ACCESS_KEY_ID", v.trim());
    }
    if let Some(v) = storage_secret_access_key {
        upsert_env_var(&mut vars, "S3_SECRET_ACCESS_KEY", v.trim());
    }
    if let Some(v) = storage_bucket_name {
        upsert_env_var(&mut vars, "S3_BUCKET_NAME", v.trim());
    }
    if let Some(v) = storage_public_domain {
        upsert_env_var(&mut vars, "S3_PUBLIC_DOMAIN", v.trim());
    }
    if let Some(v) = cache_dir {
        upsert_env_var(&mut vars, "AZHUO_CACHE_DIR", v.trim());
    }
    write_env_file(&env_path, &vars).map_err(|e| format!("配置保存失败: {e}"))?;
    Ok(())
}

fn start_ready_watcher(app: tauri::AppHandle, window: WebviewWindow, port: u16) {
    eprintln!("[beike-desktop] waiting API health on 127.0.0.1:{port}");
    // 立即显示窗口，由前端 DesktopBootstrapShell 展示加载态
    let _ = window.show();
    let _ = window.set_title(APP_TITLE);

    thread::spawn(move || {
        let ok = wait_for_health(port, Duration::from_secs(90));
        if ok {
            eprintln!("[beike-desktop] API health check passed on 127.0.0.1:{port}");
        } else {
            eprintln!("[beike-desktop] API health check timed out on 127.0.0.1:{port}");
        }
        let window_clone = window.clone();
        let _ = app.run_on_main_thread(move || {
            if ok {
                show_desktop_window(&window_clone);
                emit_api_ready(&window_clone);
            } else {
                let _ = window_clone.show();
                let _ = window_clone.set_focus();
            }
        });
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "macos")]
    {
        // 强制配置 macOS AppKit 首选语言为简体中文，确保系统级文件选择框（NSOpenPanel / NSSavePanel）与上下文菜单显示为中文
        let _ = Command::new("defaults")
            .args([
                "write",
                "com.azhuo.workbench",
                "AppleLanguages",
                "-array",
                "zh-Hans",
                "zh-Hans-CN",
                "zh_CN",
                "zh",
            ])
            .output();
    }

    let api_state = ApiServer(Mutex::new(None));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(api_state)
        .manage(DownloadDirRegistry(Mutex::new(std::collections::HashMap::new())))
        .invoke_handler(tauri::generate_handler![
            get_api_base,
            desktop_api,
            save_desktop_env,
            get_app_data_dir,
            get_default_download_dir,
            get_system_memory,
            get_app_memory_usage,
            get_disk_usage,
            register_download_directory,
            save_download_file,
            credential_set,
            credential_get,
            credential_delete,
            credential_has,
        ])
        .on_window_event(|window, event| {
            if matches!(
                event,
                tauri::WindowEvent::Destroyed | tauri::WindowEvent::CloseRequested { .. }
            ) {
                if let Some(state) = window.try_state::<ApiServer>() {
                    kill_api_server(state.inner());
                }
            }
        })
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("missing main window");

            let _ = window.set_title(APP_TITLE);

            let port: u16 = if cfg!(debug_assertions) {
                std::env::var("AZHUO_DESKTOP_PORT")
                    .ok()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(3000)
            } else {
                pick_port()
            };

            let (_, token, db_path) = prepare_data_dir(&app.handle())?;
            app.manage(AppState {
                api_port: port,
                access_token: token,
                db_path,
            });

            if cfg!(debug_assertions) {
                start_ready_watcher(app.handle().clone(), window, port);
            } else {
                match spawn_api_server(&app.handle(), port) {
                    Ok(child) => {
                        if let Some(state) = app.try_state::<ApiServer>() {
                            if let Ok(mut guard) = state.0.lock() {
                                *guard = Some(child);
                            }
                        }
                        start_ready_watcher(app.handle().clone(), window, port);
                    }
                    Err(err) => {
                        eprintln!("[beike-desktop] {err}");
                        let _ = window.show();
                        let js = format!(
                            "document.body && (document.body.innerHTML = '<p style=\"font-family:sans-serif;padding:2rem\">{}</p>')",
                            err.replace('\\', "\\\\").replace('\'', "\\'")
                        );
                        let _ = window.eval(&js);
                    }
                }
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                if let Some(state) = app.try_state::<ApiServer>() {
                    kill_api_server(state.inner());
                }
            }
        });
}
