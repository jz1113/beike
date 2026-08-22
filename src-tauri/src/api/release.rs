//! Release 构建专用：本地 SQLite 只读路由（dev 走 sidecar，不编译本模块）

use super::ApiResponse;
use crate::db::Db;
use crate::state::AppState;
use serde_json::{json, Value};
use std::collections::HashMap;
use url::Url;

fn json_response(status: u16, value: Value) -> ApiResponse {
    ApiResponse {
        status,
        body: value.to_string(),
        headers: HashMap::from([(
            "content-type".to_string(),
            "application/json".to_string(),
        )]),
    }
}

fn parse_query(url: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    if let Ok(u) = Url::parse(url) {
        for (k, v) in u.query_pairs() {
            out.insert(k.into_owned(), v.into_owned());
        }
    }
    out
}

fn parse_page(q: &HashMap<String, String>) -> (i64, i64) {
    let page = q
        .get("page")
        .and_then(|s| s.parse().ok())
        .unwrap_or(1)
        .max(1);
    let page_size = q
        .get("pageSize")
        .and_then(|s| s.parse().ok())
        .unwrap_or(50)
        .clamp(1, 100);
    (page, page_size)
}

pub fn health_response(token: &str) -> ApiResponse {
    json_response(
        200,
        json!({
            "ok": true,
            "desktop": true,
            "desktopToken": token,
        }),
    )
}

pub fn handle_db_route(
    state: &AppState,
    path: &str,
    method: &str,
    url: &str,
) -> Option<ApiResponse> {
    let db = Db::open(&state.db_path).ok()?;
    let q = parse_query(url);

    if path.starts_with("/api/catalog/products") && method == "GET" {
        let (page, page_size) = parse_page(&q);
        return db
            .list_products(page, page_size)
            .ok()
            .map(|v| json_response(200, v));
    }
    if path.starts_with("/api/catalog/prompts") && method == "GET" {
        return db.list_prompts().ok().map(|v| json_response(200, v));
    }
    if path.starts_with("/api/catalog/styles")
        && method == "GET"
        && !path.contains("/extract")
        && !path.contains("/parse-link")
    {
        return db.list_styles().ok().map(|v| json_response(200, v));
    }
    if path.starts_with("/api/assets/tasks") && method == "GET" {
        let (page, page_size) = parse_page(&q);
        return db
            .list_tasks(page, page_size)
            .ok()
            .map(|v| json_response(200, v));
    }
    None
}
