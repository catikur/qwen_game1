//! CapitalForge'un masaüstü kabuğu (Tur 66).
//!
//! Oyunun kendisi web paketi (`apps/web`, `--mode desktop`); kabuk onu bir
//! pencerede açıyor ve sayfaya dosya komutları veriyor: kayıt slotları,
//! küçük ayar dosyaları, dışa aktarma. Sayfa tarafı `apps/web/src/desktop/`.
//! Dosya işleri `store` modülünde, Steam başarımları `steam` modülünde
//! (Tur 70); burada yalnız komutların kapısı.

// Windows'ta sürüm paketinde oyunun yanında bir konsol penceresi açılmasın.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod steam;
mod store;

use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

/// Dosya işleri sırayla: iki yazma aynı geçici dosyaya çakışmasın.
static FILES: Mutex<()> = Mutex::new(());

/// Pencere kapanırken sayfaya giden haber (`apps/web/src/desktop/bridge.ts` → `CLOSE_EVENT`).
const CLOSE_EVENT: &str = "capitalforge://close-requested";
/// Sayfa kaydedip `quit` demezse (donmuş ya da çökmüş) kabuk bu kadar sonra kendisi kapanıyor.
const CLOSE_GRACE: Duration = Duration::from_secs(5);
static CLOSING: AtomicBool = AtomicBool::new(false);

fn locked<T>(run: impl FnOnce() -> store::Result<T>) -> Result<T, String> {
    let _guard = FILES.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    run().map_err(|error| error.to_string())
}

/// Oyunun verisi. `CAPITALFORGE_DATA_DIR` verilirse orası: testler ve taşınabilir kurulum.
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("CAPITALFORGE_DATA_DIR") {
        return Ok(PathBuf::from(dir));
    }
    app.path().app_data_dir().map_err(|error| error.to_string())
}

/// Dışa aktarma İndirilenler'e; yoksa Belgeler'e, o da yoksa ev dizinine.
fn export_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(dir) = std::env::var_os("CAPITALFORGE_EXPORT_DIR") {
        return Ok(PathBuf::from(dir));
    }
    let paths = app.path();
    paths
        .download_dir()
        .or_else(|_| paths.document_dir())
        .or_else(|_| paths.home_dir())
        .map_err(|error| error.to_string())
}

fn raw_body<'a>(request: &'a Request<'_>) -> Result<&'a [u8], String> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes),
        _ => Err("ham bayt bekleniyordu".into()),
    }
}

fn header<'a>(request: &'a Request<'_>, name: &str) -> Result<&'a str, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| format!("{name} başlığı yok"))
}

#[tauri::command]
async fn save_write(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let slot: u32 = header(&request, "slot")?.parse().map_err(|_| "slot bir sayı değil".to_string())?;
    let root = data_dir(&app)?;
    let bytes = raw_body(&request)?;
    locked(|| store::save_write(&root, slot, bytes))
}

/// Kayıt ham bayt olarak dönüyor; slot boşsa boş.
#[tauri::command]
async fn save_read(app: AppHandle, slot: u32) -> Result<Response, String> {
    let root = data_dir(&app)?;
    let bytes = locked(|| store::save_read(&root, slot))?;
    Ok(Response::new(bytes.unwrap_or_default()))
}

#[tauri::command]
async fn save_list(app: AppHandle) -> Result<Vec<Value>, String> {
    let root = data_dir(&app)?;
    locked(|| Ok(store::save_list(&root)))
}

#[tauri::command]
async fn save_remove(app: AppHandle, slot: u32) -> Result<(), String> {
    let root = data_dir(&app)?;
    locked(|| store::save_remove(&root, slot))
}

#[tauri::command]
async fn profile_read_all(app: AppHandle) -> Result<BTreeMap<String, String>, String> {
    let root = data_dir(&app)?;
    locked(|| store::profile_read_all(&root))
}

#[tauri::command]
async fn profile_set(app: AppHandle, key: String, value: String) -> Result<(), String> {
    let root = data_dir(&app)?;
    locked(|| store::profile_set(&root, &key, &value))
}

#[tauri::command]
async fn profile_remove(app: AppHandle, key: String) -> Result<(), String> {
    let root = data_dir(&app)?;
    locked(|| store::profile_remove(&root, &key))
}

/// Yazılan dosyanın yolu döner.
#[tauri::command]
async fn export_file(app: AppHandle, request: Request<'_>) -> Result<String, String> {
    let name = header(&request, "filename")?;
    let dir = export_dir(&app)?;
    let bytes = raw_body(&request)?;
    let path = locked(|| store::export_file(&dir, name, bytes))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Steam'e bağlı mı; değilse neden (Steam'siz derleme, istemci kapalı).
#[tauri::command]
fn steam_status() -> steam::Status {
    steam::status()
}

/// Açılan kariyer rozetlerinin Steam başarımları (API adları); kuyruğa giriyor.
#[tauri::command]
fn steam_unlock(names: Vec<String>) {
    steam::unlock(names);
}

/// Sayfa kaydını bitirdi: kapan.
#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

fn main() {
    // Steam pencereden önce: istemci oyunu açılışta tanısın.
    steam::start();
    tauri::Builder::default()
        // Tek pencere (Tur 70): ikinci kopya açılırsa yeni pencere değil, var
        // olan öne geliyor. İki pencere aynı kayıt dosyasına yazmasın.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        // Kapatma düğmesi: önce sayfa otomatik kayda yazsın. İkinci tıklama
        // ya da süre dolması beklemeden kapatıyor.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if CLOSING.swap(true, Ordering::SeqCst) {
                    return;
                }
                api.prevent_close();
                if window.emit(CLOSE_EVENT, ()).is_err() {
                    window.app_handle().exit(0);
                    return;
                }
                let app = window.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(CLOSE_GRACE);
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            save_write,
            save_read,
            save_list,
            save_remove,
            profile_read_all,
            profile_set,
            profile_remove,
            export_file,
            steam_status,
            steam_unlock,
            quit,
        ])
        .run(tauri::generate_context!())
        .expect("CapitalForge açılamadı");
}
