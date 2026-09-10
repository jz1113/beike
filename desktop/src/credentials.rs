use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

// 🌟 运行期进程级凭据内存缓存：加速读写，杜绝系统钥匙串弹窗与冗余磁盘 I/O
static CREDENTIAL_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

/// 获取本地安全凭证存储文件路径 (~/Library/Application Support/com.azhuo.workbench/credentials.json)
fn credentials_file_path() -> PathBuf {
    let base = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("com.azhuo.workbench").join("credentials.json")
}

/// 从本地安全凭证文件中载入存储的所有凭证
fn load_persisted_credentials() -> HashMap<String, String> {
    let path = credentials_file_path();
    if !path.exists() {
        return HashMap::new();
    }
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

/// 将凭证安全写入本地私有文件，并在 Unix 系统上限制文件权限为 0600（仅当前用户可读写）
fn save_persisted_credentials(map: &HashMap<String, String>) -> Result<(), String> {
    let path = credentials_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建凭据目录失败: {e}"))?;
    }
    let json = serde_json::to_string_pretty(map).map_err(|e| format!("序列化凭证失败: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("写入凭证文件失败: {e}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn cache() -> &'static Mutex<HashMap<String, String>> {
    CREDENTIAL_CACHE.get_or_init(|| {
        let map = load_persisted_credentials();
        Mutex::new(map)
    })
}

/// 合法的凭证 key 格式：字母开头，仅含字母数字下划线短横
fn is_valid_key_format(key: &str) -> bool {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return false;
    }
    let mut chars = trimmed.chars();
    let first = chars.next().unwrap();
    if !first.is_alphabetic() && first != '_' {
        return false;
    }
    chars.all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

#[tauri::command]
pub fn credential_set(key: String, value: String) -> Result<(), String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("凭证 key 为空".to_string());
    }
    if !is_valid_key_format(k) {
        return Err(format!("凭证 key 格式非法（仅允许字母数字下划线短横，且首字符为字母或下划线）: {k}"));
    }
    let val = value.trim();

    let mut lock = cache().lock().map_err(|e| e.to_string())?;
    lock.insert(k.to_string(), val.to_string());
    save_persisted_credentials(&lock)?;
    Ok(())
}

#[tauri::command]
pub fn credential_delete(key: String) -> Result<(), String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("凭证 key 为空".to_string());
    }
    if !is_valid_key_format(k) {
        return Err(format!("凭证 key 格式非法（仅允许字母数字下划线短横，且首字符为字母或下划线）: {k}"));
    }

    let mut lock = cache().lock().map_err(|e| e.to_string())?;
    lock.remove(k);
    save_persisted_credentials(&lock)?;
    Ok(())
}

#[tauri::command]
pub fn credential_get(key: String) -> Result<Option<String>, String> {
    let k = key.trim();
    if k.is_empty() {
        return Ok(None);
    }
    if !is_valid_key_format(k) {
        return Err(format!("凭证 key 格式非法（仅允许字母数字下划线短横，且首字符为字母或下划线）: {k}"));
    }

    let lock = cache().lock().map_err(|e| e.to_string())?;
    Ok(lock.get(k).cloned())
}

#[tauri::command]
pub fn credential_has(key: String) -> Result<bool, String> {
    let k = key.trim();
    if k.is_empty() {
        return Ok(false);
    }
    if !is_valid_key_format(k) {
        return Err(format!("凭证 key 格式非法（仅允许字母数字下划线短横，且首字符为字母或下划线）: {k}"));
    }

    let lock = cache().lock().map_err(|e| e.to_string())?;
    Ok(lock.get(k).map(|v| !v.is_empty()).unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_credential_lifecycle() {
        let test_k = "test_lifecycle_key";
        let test_v = "sk-test-secret-123456";
        let _ = credential_delete(test_k.to_string());

        assert!(credential_set(test_k.to_string(), test_v.to_string()).is_ok());
        assert_eq!(credential_get(test_k.to_string()).unwrap(), Some(test_v.to_string()));
        assert!(credential_has(test_k.to_string()).unwrap());

        assert!(credential_delete(test_k.to_string()).is_ok());
        assert_eq!(credential_get(test_k.to_string()).unwrap(), None);
        assert!(!credential_has(test_k.to_string()).unwrap());
    }
}
