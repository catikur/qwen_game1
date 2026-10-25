fn main() {
    // Steam derlemesi (Tur 70): `libsteam_api` oyunun yanında aranıyor (Steam
    // deposunda çalıştırılabilir dosyayla aynı klasör). Windows DLL'i zaten
    // önce kendi klasöründe arıyor.
    if std::env::var_os("CARGO_FEATURE_STEAM").is_some() {
        match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
            Ok("linux") => println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN"),
            Ok("macos") => println!("cargo:rustc-link-arg=-Wl,-rpath,@executable_path"),
            _ => {}
        }
    }
    tauri_build::build()
}
