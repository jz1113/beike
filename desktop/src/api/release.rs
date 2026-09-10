//! DEPRECATED: 原 release 本地 SQLite GET 快路径。
//! `desktop_api` 已一律转发 Hono sidecar；本模块不再挂载。

#![allow(dead_code)]

use super::ApiResponse;
use crate::state::AppState;
use serde_json::{json, Value};
use std::collections::HashMap;

fn json_response(status: u16, value: Value) -> ApiResponse {
    ApiResponse {
        status,
        body: value.to_string(),
        headers: HashMap::from([("content-type".to_string(), "application/json".to_string())]),
    }
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
    _state: &AppState,
    _path: &str,
    _method: &str,
    _url: &str,
) -> Option<ApiResponse> {
    None
}
