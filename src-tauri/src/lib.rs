mod project;

use std::{fs, path::PathBuf};
use tauri::Manager;

#[tauri::command]
async fn choose_project() -> Result<Option<String>, String> {
    Ok(rfd::AsyncFileDialog::new()
        .set_title("选择代码项目")
        .pick_folder()
        .await
        .map(|folder| folder.path().to_string_lossy().into_owned()))
}

#[tauri::command]
async fn read_project(root_path: String) -> Result<project::ProjectSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || project::read_project(&PathBuf::from(root_path)))
        .await
        .map_err(|e| e.to_string())?
}

fn layout_path(app: &tauri::AppHandle, root_path: &str) -> Result<PathBuf, String> {
    // Stable FNV-1a key; the document also records its root to detect a hash collision.
    let hash = root_path
        .as_bytes()
        .iter()
        .fold(0xcbf29ce484222325u64, |hash, byte| {
            (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
        });
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("layouts");
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    Ok(directory.join(format!("{hash:016x}.json")))
}

#[tauri::command]
fn load_layout(
    app: tauri::AppHandle,
    root_path: String,
) -> Result<Option<serde_json::Value>, String> {
    let path = layout_path(&app, &root_path)?;
    match fs::read(path) {
        Ok(bytes) => {
            let document: serde_json::Value =
                serde_json::from_slice(&bytes).map_err(|e| format!("布局读取失败：{e}"))?;
            if document["rootPath"].as_str() != Some(root_path.as_str()) {
                return Err("布局项目标识不匹配".into());
            }
            Ok(Some(document))
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(format!("布局读取失败：{error}")),
    }
}

#[tauri::command]
fn save_layout(
    app: tauri::AppHandle,
    root_path: String,
    document: serde_json::Value,
) -> Result<(), String> {
    if document["rootPath"].as_str() != Some(root_path.as_str()) {
        return Err("布局项目标识不匹配".into());
    }
    let path = layout_path(&app, &root_path)?;
    let temporary = path.with_extension("tmp");
    fs::write(
        &temporary,
        serde_json::to_vec(&document).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(temporary, path).map_err(|e| format!("布局保存失败：{e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            choose_project,
            read_project,
            load_layout,
            save_layout
        ])
        .run(tauri::generate_context!())
        .expect("error while running InfinityCodeView");
}
