use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use sysinfo::{Pid, System};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Debug, Serialize)]
pub struct DiskUsageStats {
    pub db_bytes: u64,
    pub storage_bytes: u64,
    pub storage_file_count: u64,
    pub derived_bytes: u64,
    pub derived_file_count: u64,
}

#[derive(Debug, Serialize)]
pub struct AppMemoryUsage {
    pub rss_bytes: u64,
    pub total_system_bytes: u64,
}

/// 已授权下载目录注册表（handle → canonical path）
pub struct DownloadDirRegistry(pub Mutex<HashMap<String, PathBuf>>);

fn dir_stats(dir: &Path) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut count = 0u64;
    if !dir.is_dir() {
        return (bytes, count);
    }
    let Ok(read_dir) = fs::read_dir(dir) else {
        return (bytes, count);
    };
    for entry in read_dir.flatten() {
        let path = entry.path();
        if path.is_file() {
            count += 1;
            if let Ok(meta) = fs::metadata(&path) {
                bytes += meta.len();
            }
        } else if path.is_dir() {
            let (sub_bytes, sub_count) = dir_stats(&path);
            bytes += sub_bytes;
            count += sub_count;
        }
    }
    (bytes, count)
}

fn file_size(path: &Path) -> u64 {
    fs::metadata(path).map(|m| m.len()).unwrap_or(0)
}

const WINDOWS_RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

fn validate_filename(filename: &str) -> Result<(), String> {
    let name = filename.trim();
    if name.is_empty() {
        return Err("文件名为空".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains('\0') {
        return Err("文件名包含非法字符".to_string());
    }
    if name == "." || name == ".." {
        return Err("非法文件名".to_string());
    }
    let trimmed = name.trim_end_matches([' ', '.']);
    if trimmed.is_empty() {
        return Err("非法文件名".to_string());
    }
    let base = trimmed.split('.').next().unwrap_or(trimmed).to_uppercase();
    if WINDOWS_RESERVED.contains(&base.as_str()) {
        return Err("Windows 保留文件名".to_string());
    }
    Ok(())
}

fn is_symlink(path: &Path) -> bool {
    fs::symlink_metadata(path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
}

fn canonical_dir(path: &Path) -> Result<PathBuf, String> {
    if !path.exists() {
        return Err("目录不存在".to_string());
    }
    if !path.is_dir() {
        return Err("路径不是目录".to_string());
    }
    if is_symlink(path) {
        return Err("不允许符号链接目录".to_string());
    }
    path.canonicalize().map_err(|e| e.to_string())
}

fn ensure_under(base: &Path, target: &Path) -> Result<(), String> {
    let base = base
        .canonicalize()
        .map_err(|e| format!("授权目录无效: {e}"))?;
    let target_parent = target
        .parent()
        .ok_or_else(|| "目标路径无效".to_string())?;
    let parent = target_parent
        .canonicalize()
        .map_err(|e| format!("目标父目录无效: {e}"))?;
    if !parent.starts_with(&base) {
        return Err("目标路径超出授权目录".to_string());
    }
    Ok(())
}

fn resolve_unique_path(base: &Path, filename: &str, overwrite: bool) -> PathBuf {
    let target = base.join(filename);
    if overwrite || !target.exists() {
        return target;
    }
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    let ext = Path::new(filename)
        .extension()
        .and_then(|s| s.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();

    for i in 1..=9999 {
        let candidate = base.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    target
}

fn atomic_write(target: &Path, data: &[u8], overwrite: bool) -> Result<(), String> {
    if target.exists() && !overwrite {
        return Err("文件已存在".to_string());
    }
    if is_symlink(target) {
        return Err("目标为符号链接".to_string());
    }
    let parent = target.parent().ok_or_else(|| "目标路径无效".to_string())?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;

    let tmp_name = format!(
        ".beike-{}.tmp",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0)
    );
    let tmp_path = parent.join(&tmp_name);
    {
        let mut file = fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
        file.write_all(data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp_path, target).map_err(|e| {
        let _ = fs::remove_file(&tmp_path);
        e.to_string()
    })?;
    Ok(())
}

#[tauri::command]
pub fn get_app_data_dir(app: AppHandle) -> Result<String, String> {
    app.path()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_default_download_dir() -> Result<String, String> {
    dirs::download_dir()
        .or_else(dirs::home_dir)
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "无法解析默认下载目录".to_string())
}

#[tauri::command]
pub fn get_system_memory() -> Result<u64, String> {
    let mut sys = System::new();
    sys.refresh_memory();
    Ok(sys.total_memory())
}

#[tauri::command]
pub fn get_app_memory_usage() -> Result<AppMemoryUsage, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let pid = Pid::from_u32(std::process::id());
    let rss_bytes = sys.process(pid).map(|p| p.memory()).unwrap_or(0);
    Ok(AppMemoryUsage {
        rss_bytes,
        total_system_bytes: sys.total_memory(),
    })
}

#[tauri::command]
pub fn get_disk_usage(app: AppHandle) -> Result<DiskUsageStats, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let db_path = data_dir.join("azhuo.db");
    let storage_dir = data_dir.join("storage");
    let derived_dir = storage_dir.join("derived");

    let db_bytes = file_size(&db_path);
    let (storage_bytes, storage_file_count) = dir_stats(&storage_dir);
    let (derived_bytes, derived_file_count) = dir_stats(&derived_dir);

    Ok(DiskUsageStats {
        db_bytes,
        storage_bytes,
        storage_file_count,
        derived_bytes,
        derived_file_count,
    })
}

/// 注册由原生目录选择器选定的下载目录，返回 opaque handle
#[tauri::command]
pub fn register_download_directory(
    registry: tauri::State<'_, DownloadDirRegistry>,
    path: String,
) -> Result<String, String> {
    let canonical = canonical_dir(Path::new(path.trim()))?;
    let handle = format!(
        "dl-{:x}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(1)
    );
    registry
        .0
        .lock()
        .map_err(|_| "内部锁错误".to_string())?
        .insert(handle.clone(), canonical);
    Ok(handle)
}

/// 在已授权目录内写入文件（支持传入有效句柄或自动回退到系统默认下载目录）
#[tauri::command]
pub fn save_download_file(
    registry: tauri::State<'_, DownloadDirRegistry>,
    directory_handle: Option<String>,
    filename: String,
    data: Vec<u8>,
    overwrite: Option<bool>,
) -> Result<String, String> {
    validate_filename(&filename)?;

    let base = if let Some(dh) = directory_handle.as_deref().filter(|h| !h.trim().is_empty()) {
        registry
            .0
            .lock()
            .map_err(|_| "内部锁错误".to_string())?
            .get(dh.trim())
            .cloned()
            .or_else(|| dirs::download_dir().or_else(dirs::home_dir))
    } else {
        dirs::download_dir().or_else(dirs::home_dir)
    }
    .ok_or_else(|| "无法解析下载目标目录".to_string())?;

    fs::create_dir_all(&base).map_err(|e| format!("创建下载目录失败: {e}"))?;

    let allow_overwrite = overwrite.unwrap_or(false);
    let target = resolve_unique_path(&base, filename.trim(), allow_overwrite);

    if target
        .components()
        .any(|c| matches!(c, Component::ParentDir))
    {
        return Err("非法路径".to_string());
    }

    ensure_under(&base, &target)?;
    atomic_write(&target, &data, true)?;
    Ok(target.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_bad_filenames() {
        assert!(validate_filename("").is_err());
        assert!(validate_filename("../x").is_err());
        assert!(validate_filename("a/b").is_err());
        assert!(validate_filename("CON").is_err());
        assert!(validate_filename("valid.txt").is_ok());
    }
}
