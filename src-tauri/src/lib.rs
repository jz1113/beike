mod api;
mod credentials;
#[cfg(not(debug_assertions))]
mod db;
mod state;
mod storage;

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use api::{desktop_api, get_api_base};
use credentials::{credential_delete, credential_has, credential_set};
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
    while start.elapsed() < timeout {
        if health_ok(port) {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }
    false
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
    s = s.replace(' ', "%20");
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
    getrandom::getrandom(&mut bytes).unwrap_or_else(|_| {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(1) as u64;
        bytes[..8].copy_from_slice(&nanos.to_le_bytes());
        bytes[8..16].copy_from_slice(&std::process::id().to_le_bytes());
    });
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn write_secret_file(path: &Path, content: &str) -> std::io::Result<()> {
    fs::write(path, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(path, perms)?;
    }
    Ok(())
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
    let exe = app.path().executable_dir().ok()?;
    let plain = if cfg!(windows) { "node.exe" } else { "node" };
    let plain_path = exe.join(plain);
    if plain_path.exists() {
        return Some(plain_path);
    }
    // Tauri externalBin 随包名为 node-{target-triple}
    if let Ok(read_dir) = fs::read_dir(&exe) {
        for entry in read_dir.flatten() {
            let name = entry.file_name();
            let s = name.to_string_lossy();
            if s.starts_with("node-") {
                let path = entry.path();
                if path.is_file() {
                    return Some(path);
                }
            }
        }
    }
    None
}

fn resolve_api_server_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    let resource = app.path().resource_dir().ok()?;
    let candidates = [
        resource.join("resources").join("api-server"),
        resource.join("api-server"),
        resource.join("resources/api-server"),
    ];
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
    let file_vars = parse_env_file(&env_path);

    if cfg!(not(debug_assertions)) {
        if let Some(server_dir) = resolve_api_server_dir(app) {
            let template = server_dir.join("prisma").join("template.db");
            copy_if_missing(&template, &db_path).map_err(|e| e.to_string())?;
        }
    }

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
    let token = token.unwrap_or_else(generate_token);
    let _ = write_secret_file(&token_path, &token);

    Ok((data_dir, token, db_path))
}

fn spawn_api_server(app: &tauri::AppHandle, port: u16) -> Result<Child, String> {
    let server_dir = resolve_api_server_dir(app).ok_or("未找到打包的 API 服务（resources/api-server）")?;
    let node = sidecar_node_path(app).ok_or("未找到随包 Node sidecar")?;

    let (data_dir, token, db_path) = prepare_data_dir(app)?;
    let env_path = data_dir.join(".env");
    let file_vars = parse_env_file(&env_path);

    let mut cmd = Command::new(node);
    cmd.arg("index.cjs")
        .current_dir(&server_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

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
        .env("NEXT_PUBLIC_APP_ACCESS_TOKEN", &token);

    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        cmd.process_group(0);
    }

    cmd.spawn().map_err(|e| format!("启动 API sidecar 失败: {e}"))
}

fn write_env_file(path: &Path, vars: &[(String, String)]) {
    let mut lines = vec!["# 贝壳云图 · 桌面端 API 配置（由应用自动写入）".to_string()];
    for (k, v) in vars {
        lines.push(format!("{k}={v}"));
    }
    let _ = write_secret_file(path, &format!("{}\n", lines.join("\n")));
}

fn upsert_env_var(vars: &mut Vec<(String, String)>, key: &str, value: &str) {
    if let Some(entry) = vars.iter_mut().find(|(k, _)| k == key) {
        entry.1 = value.to_string();
    } else {
        vars.push((key.to_string(), value.to_string()));
    }
}

#[tauri::command]
fn save_desktop_env(
    app: tauri::AppHandle,
    base_url: Option<String>,
    api_key: Option<String>,
) -> Result<(), String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let env_path = data_dir.join(".env");
    let mut vars = parse_env_file(&env_path);
    upsert_env_var(&mut vars, "ALLOW_CUSTOM_BASE_URL", "true");
    if let Some(url) = base_url.filter(|s| !s.trim().is_empty()) {
        upsert_env_var(&mut vars, "AI_DRAWING_BASE_URL", url.trim().trim_end_matches('/'));
    }
    if let Some(key) = api_key.filter(|s| !s.trim().is_empty()) {
        upsert_env_var(&mut vars, "AI_DRAWING_API_KEY", key.trim());
    }
    write_env_file(&env_path, &vars);
    Ok(())
}

fn start_ready_watcher(window: WebviewWindow, port: u16) {
    thread::spawn(move || {
        if wait_for_health(port, Duration::from_secs(90)) {
            show_desktop_window(&window);
        } else {
            let _ = window.show();
            let _ = window.eval(
                "document.body && (document.body.innerHTML = '<p style=\"font-family:sans-serif;padding:2rem\">贝壳云图服务启动超时。请确认 127.0.0.1 端口未被占用后重试。</p>')",
            );
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
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

            #[cfg(debug_assertions)]
            {
                prepare_data_dir(&app.handle())?;
                app.manage(AppState {
                    api_port: port,
                });
            }

            #[cfg(not(debug_assertions))]
            {
                let (_, token, db_path) = prepare_data_dir(&app.handle())?;
                app.manage(AppState {
                    api_port: port,
                    access_token: token,
                    db_path,
                });
            }

            if cfg!(debug_assertions) {
                start_ready_watcher(window, port);
            } else {
                match spawn_api_server(&app.handle(), port) {
                    Ok(child) => {
                        if let Some(state) = app.try_state::<ApiServer>() {
                            if let Ok(mut guard) = state.0.lock() {
                                *guard = Some(child);
                            }
                        }
                        start_ready_watcher(window, port);
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
