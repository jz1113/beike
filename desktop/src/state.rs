use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub api_port: u16,
    pub access_token: String,
    /// 数据目录下的 azhuo.db；读写一律走 Hono+Prisma，Rust 不再直连。
    #[allow(dead_code)]
    pub db_path: PathBuf,
}

pub struct ApiServer(pub Mutex<Option<std::process::Child>>);
