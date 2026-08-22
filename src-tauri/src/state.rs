#[cfg(not(debug_assertions))]
use std::path::PathBuf;
use std::sync::Mutex;

pub struct AppState {
    pub api_port: u16,
    #[cfg(not(debug_assertions))]
    pub access_token: String,
    #[cfg(not(debug_assertions))]
    pub db_path: PathBuf,
}

pub struct ApiServer(pub Mutex<Option<std::process::Child>>);
