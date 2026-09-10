fn main() {
    #[cfg(target_os = "macos")]
    {
        let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
        let info_plist = std::path::Path::new(&manifest_dir).join("Info.plist");
        if info_plist.exists() {
            println!("cargo:rustc-link-arg=-Wl,-sectcreate,__TEXT,__info_plist,{}", info_plist.display());
        }
    }
    tauri_build::build()
}
