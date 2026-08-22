use keyring::Entry;

const SERVICE: &str = "com.azhuo.workbench";

fn entry(key: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credential_set(key: String, value: String) -> Result<(), String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("凭证 key 为空".to_string());
    }
    entry(k)?
        .set_password(value.trim())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn credential_delete(key: String) -> Result<(), String> {
    let k = key.trim();
    if k.is_empty() {
        return Err("凭证 key 为空".to_string());
    }
    match entry(k)?.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn credential_has(key: String) -> Result<bool, String> {
    let k = key.trim();
    if k.is_empty() {
        return Ok(false);
    }
    match entry(k)?.get_password() {
        Ok(v) => Ok(!v.is_empty()),
        Err(keyring::Error::NoEntry) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
