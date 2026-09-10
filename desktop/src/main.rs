#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(target_os = "macos")]
fn ensure_macos_chinese_locale() {
    std::env::set_var("LANG", "zh_CN.UTF-8");
    std::env::set_var("LC_ALL", "zh_CN.UTF-8");

    // 确保应用偏好设置语言为简体中文，使 macOS 系统弹窗（NSOpenPanel/NSSavePanel）显示中文
    let _ = std::process::Command::new("defaults")
        .args(["write", "com.azhuo.workbench", "AppleLanguages", "('zh-Hans-CN', 'zh-Hans', 'zh_CN', 'zh')"])
        .output();
    let _ = std::process::Command::new("defaults")
        .args(["write", "com.azhuo.workbench", "AppleLocale", "zh_CN"])
        .output();
    let _ = std::process::Command::new("defaults")
        .args(["write", "azhuo-workbench", "AppleLanguages", "('zh-Hans-CN', 'zh-Hans', 'zh_CN', 'zh')"])
        .output();
    let _ = std::process::Command::new("defaults")
        .args(["write", "azhuo-workbench", "AppleLocale", "zh_CN"])
        .output();
}

fn main() {
    std::panic::set_hook(Box::new(|info| {
        let msg = format!("程序异常退出 (Panic):\n{info}\n");
        eprintln!("{msg}");
        if let Ok(exe) = std::env::current_exe() {
            if let Some(parent) = exe.parent() {
                let _ = std::fs::write(parent.join("crash.log"), &msg);
            }
        }
        if let Some(dir) = dirs::data_dir() {
            let app_data = dir.join("com.azhuo.workbench");
            let _ = std::fs::create_dir_all(&app_data);
            let _ = std::fs::write(app_data.join("crash.log"), &msg);
        }
    }));

    #[cfg(target_os = "macos")]
    ensure_macos_chinese_locale();

    azhuo_workbench_lib::run();
}
