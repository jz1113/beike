use crate::state::AppState;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::State;
use url::Url;

/// 安全白名单：仅允许转发到 /api/... 路径前缀，杜绝前端 JS 被 XSS 后
/// 通过 desktop_api 命令访问任意 sidecar 路径或代理外部域。
const ALLOWED_PATH_PREFIXES: &[&str] = &["/api/", "/storage/"];
const MAX_PATH_LEN: usize = 1024;
const MAX_BODY_LEN: usize = 8 * 1024 * 1024; // 8MB

#[derive(Debug, Deserialize)]
pub struct ApiRequest {
    pub method: String,
    pub url: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ApiResponse {
    pub status: u16,
    pub body: String,
    pub headers: HashMap<String, String>,
}

static SIDECAR_CLIENT: OnceLock<Client> = OnceLock::new();

fn sidecar_client() -> &'static Client {
    SIDECAR_CLIENT.get_or_init(|| {
        Client::builder()
            .timeout(Duration::from_secs(480))
            .pool_max_idle_per_host(8)
            .build()
            .expect("构建 HTTP 客户端失败")
    })
}

/// 仅允许的 URL scheme + host（防御 SSRF：拒绝非 http(s) 与非本机地址）
fn validate_incoming_url(url: &str) -> Result<(), String> {
    if url.is_empty() || url.starts_with('/') {
        return Ok(());
    }
    let parsed = Url::parse(url).map_err(|e| format!("URL 解析失败: {e}"))?;
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(format!("禁止的 URL scheme: {scheme}"));
    }
    if let Some(host) = parsed.host_str() {
        let host_l = host.to_lowercase();
        // 仅允许本机（loopback / ipv6 loopback / 容器内网 host.docker.internal）
        if host_l == "localhost"
            || host_l == "127.0.0.1"
            || host_l == "::1"
            || host_l == "0.0.0.0"
            || host_l == "host.docker.internal"
        {
            return Ok(());
        }
        return Err(format!("禁止外部域名: {host}"));
    }
    Ok(())
}

/// 仅允许转发到 sidecar（127.0.0.1）的合法 API path。
/// 防御：禁止路径遍历、查询注入、绝对 URL、非预期前缀。
fn validate_incoming_path(path: &str) -> Result<String, String> {
    if path.is_empty() {
        return Err("缺少 path".to_string());
    }
    if path.len() > MAX_PATH_LEN {
        return Err(format!("路径长度超过限制 (最大 {MAX_PATH_LEN} 字节): {path}"));
    }
    if path.contains("..") {
        return Err(format!("路径包含非法片段: {path}"));
    }
    if !path.starts_with('/') {
        return Err(format!("path 必须以 / 开头: {path}"));
    }
    // 白名单前缀：仅允许转发到 API 与本地静态 storage 资源
    if !ALLOWED_PATH_PREFIXES.iter().any(|p| path.starts_with(p)) {
        return Err(format!("path 不在白名单: {path}"));
    }
    Ok(path.to_string())
}

/// 从 url 中提取 path（若有）与 query。path 仅用于二次白名单校验；
/// 实际转发路径一律使用已校验的 `req.path`，杜绝相对/绝对 URL 绕过白名单。
fn extract_url_path_and_query(url: &str) -> Result<(Option<String>, String), String> {
    if url.is_empty() {
        return Ok((None, String::new()));
    }
    if url.starts_with('/') {
        return match url.split_once('?') {
            Some((path_part, query_part)) => {
                Ok((Some(path_part.to_string()), format!("?{query_part}")))
            }
            None => Ok((Some(url.to_string()), String::new())),
        };
    }
    let parsed = Url::parse(url).map_err(|e| format!("URL 解析失败: {e}"))?;
    let query = parsed
        .query()
        .map(|q| format!("?{q}"))
        .unwrap_or_default();
    let path = parsed.path().to_string();
    let path_opt = if path.is_empty() || path == "/" {
        None
    } else {
        Some(path)
    };
    Ok((path_opt, query))
}

pub async fn forward_to_sidecar(state: &AppState, req: &ApiRequest) -> Result<ApiResponse, String> {
    let client = sidecar_client();

    // 安全：校验 url 与 path 合法性，禁止转发到任意外部地址
    validate_incoming_url(&req.url)?;
    let safe_path = validate_incoming_path(&req.path)?;

    // url 若自带 path（相对或绝对），必须同样过白名单；target 仍只用 safe_path
    let (url_path, query) = extract_url_path_and_query(&req.url)?;
    if let Some(ref p) = url_path {
        validate_incoming_path(p)?;
    }

    let target = format!("http://127.0.0.1:{}{}{}", state.api_port, safe_path, query);
    // 安全：仅允许 GET/POST/PUT/DELETE，禁止 method 大小写绕过与未知方法
    let mut builder = match req.method.to_uppercase().as_str() {
        "GET" => client.get(&target),
        "POST" => client.post(&target),
        "PUT" => client.put(&target),
        "DELETE" => client.delete(&target),
        m => return Err(format!("不支持的 HTTP 方法: {m}")),
    };
    // 安全：拒绝 host/connection/content-length 等敏感 header 由前端控制
    const FORBIDDEN_HEADERS: &[&str] = &[
        "host",
        "connection",
        "content-length",
        "transfer-encoding",
    ];
    let mut has_token = false;
    for (k, v) in &req.headers {
        let lk = k.to_lowercase();
        if FORBIDDEN_HEADERS.contains(&lk.as_str()) {
            continue;
        }
        if k.eq_ignore_ascii_case("x-app-token") {
            has_token = true;
        }
        builder = builder.header(k, v);
    }
    if !has_token && !state.access_token.is_empty() {
        builder = builder.header("x-app-token", &state.access_token);
    }
    if let Some(body) = &req.body {
        if body.len() > MAX_BODY_LEN {
            return Err(format!("请求体超过限制 (最大 {}MB)", MAX_BODY_LEN / (1024 * 1024)));
        }
        builder = builder.body(body.clone());
    }
    let resp = builder
        .send()
        .await
        .map_err(|e| format!("向 API sidecar ({target}) 发送请求失败: {e}"))?;
    let status = resp.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in resp.headers().iter() {
        if let Ok(s) = v.to_str() {
            headers.insert(k.to_string(), s.to_string());
        }
    }
    let body = resp.text().await.unwrap_or_default();
    Ok(ApiResponse {
        status,
        body,
        headers,
    })
}

#[tauri::command]
pub fn get_api_base(state: State<'_, AppState>) -> String {
    format!("http://127.0.0.1:{}", state.api_port)
}

/// 一律转发 Hono sidecar（Prisma 唯一读写 azhuo.db）。不再走 Rust rusqlite 快路径。
#[tauri::command]
pub async fn desktop_api(
    state: State<'_, AppState>,
    req: Option<ApiRequest>,
    method: Option<String>,
    url: Option<String>,
    path: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<ApiResponse, String> {
    let final_req = if let Some(r) = req {
        r
    } else {
        ApiRequest {
            method: method.unwrap_or_else(|| "GET".to_string()),
            url: url.unwrap_or_default(),
            path: path.unwrap_or_default(),
            headers: headers.unwrap_or_default(),
            body,
        }
    };

    forward_to_sidecar(&state, &final_req).await
}
