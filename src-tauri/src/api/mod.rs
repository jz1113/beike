use crate::state::AppState;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Duration;
use tauri::State;
use url::Url;

#[cfg(not(debug_assertions))]
mod release;

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

pub fn forward_to_sidecar(state: &AppState, req: &ApiRequest) -> Option<ApiResponse> {
    let client = Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .ok()?;
    let target = if let Ok(u) = Url::parse(&req.url) {
        let query = u.query().map(|q| format!("?{q}")).unwrap_or_default();
        format!("http://127.0.0.1:{}{}{}", state.api_port, u.path(), query)
    } else {
        format!("http://127.0.0.1:{}{}", state.api_port, req.path)
    };
    let mut builder = match req.method.as_str() {
        "GET" => client.get(&target),
        "POST" => client.post(&target),
        "PUT" => client.put(&target),
        "DELETE" => client.delete(&target),
        _ => return None,
    };
    for (k, v) in &req.headers {
        builder = builder.header(k, v);
    }
    if let Some(body) = &req.body {
        builder = builder.body(body.clone());
    }
    let resp = builder.send().ok()?;
    let status = resp.status().as_u16();
    let mut headers = HashMap::new();
    for (k, v) in resp.headers().iter() {
        if let Ok(s) = v.to_str() {
            headers.insert(k.to_string(), s.to_string());
        }
    }
    let body = resp.text().unwrap_or_default();
    Some(ApiResponse {
        status,
        body,
        headers,
    })
}

#[tauri::command]
pub fn get_api_base(state: State<'_, AppState>) -> String {
    format!("http://127.0.0.1:{}", state.api_port)
}

#[tauri::command]
pub fn desktop_api(state: State<'_, AppState>, req: ApiRequest) -> Result<ApiResponse, String> {
    #[cfg(debug_assertions)]
    {
        return forward_to_sidecar(&state, &req)
            .ok_or_else(|| "API sidecar unavailable".to_string());
    }

    #[cfg(not(debug_assertions))]
    {
        let method = req.method.to_uppercase();

        if req.path == "/api/health" && method == "GET" {
            return Ok(release::health_response(&state.access_token));
        }

        if req.path.starts_with("/api/system/proxy-image") && method == "GET" {
            return forward_to_sidecar(&state, &req)
                .ok_or_else(|| "API sidecar unavailable".to_string());
        }

        if let Some(r) = release::handle_db_route(&state, &req.path, &method, &req.url) {
            return Ok(r);
        }

        forward_to_sidecar(&state, &req).ok_or_else(|| "API sidecar unavailable".to_string())
    }
}
