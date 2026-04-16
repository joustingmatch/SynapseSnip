use crate::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    pub default_save_dir: String,
    pub default_mode: String,
    pub theme: String,
    pub delay_seconds: u32,
    pub auto_copy: bool,
    pub auto_save: bool,
    pub filename_template: String,
    pub show_notification: bool,
    pub notification_timer_seconds: u32,
    pub close_to_tray: bool,
    pub start_minimized: bool,
    pub default_format: String,
    pub pen_color: String,
    pub pen_thickness: u32,
    pub hotkey_rect: String,
    pub hotkey_fullscreen: String,
    pub hotkey_window: String,
    pub hotkey_active_window: String,
    pub hotkey_toggle_app: String,
    #[serde(default)]
    pub rect_require_enter: bool,
    #[serde(default)]
    pub recording_format: String,
    #[serde(default)]
    pub recording_fps: u32,
    #[serde(default)]
    pub recording_microphone: bool,
    #[serde(default)]
    pub recording_microphone_device: String,
    #[serde(default)]
    pub recording_system_audio: bool,
    #[serde(default)]
    pub recording_show_cursor: bool,
    #[serde(default)]
    pub recording_click_highlight: bool,
    #[serde(default)]
    pub recording_countdown_seconds: u32,
    #[serde(default)]
    pub recording_max_duration_seconds: u32,
    #[serde(default)]
    pub recording_system_audio_device: String,
}

impl Default for Settings {
    fn default() -> Self {
        let dir = dirs::picture_dir()
            .or_else(dirs::home_dir)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();
        Self {
            default_save_dir: dir,
            default_mode: "rect".into(),
            theme: "dark".into(),
            delay_seconds: 0,
            auto_copy: true,
            auto_save: false,
            filename_template: "snip-{yyyy}{MM}{dd}-{HH}{mm}{ss}".into(),
            show_notification: true,
            notification_timer_seconds: 8,
            close_to_tray: true,
            start_minimized: false,
            default_format: "png".into(),
            pen_color: "#ff3b30".into(),
            pen_thickness: 3,
            hotkey_rect: "Shift+Super+S".into(),
            hotkey_fullscreen: "Shift+Super+F".into(),
            hotkey_window: "Shift+Super+W".into(),
            hotkey_active_window: "Shift+Super+A".into(),
            hotkey_toggle_app: "Shift+Super+D".into(),
            rect_require_enter: false,
            recording_format: "mp4".into(),
            recording_fps: 30,
            recording_microphone: false,
            recording_microphone_device: String::new(),
            recording_system_audio: false,
            recording_show_cursor: true,
            recording_click_highlight: false,
            recording_countdown_seconds: 3,
            recording_max_duration_seconds: 0,
            recording_system_audio_device: String::new(),
        }
    }
}

fn settings_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::SettingsMessage(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join("settings.json"))
}

pub fn read_settings(app: &AppHandle) -> AppResult<Settings> {
    let p = settings_path(app)?;
    if !p.exists() {
        return Ok(Settings::default());
    }
    let text = fs::read_to_string(&p)?;
    let mut parsed: serde_json::Value = serde_json::from_str(&text)?;
    let defaults = serde_json::to_value(Settings::default())?;
    if let (Some(obj), Some(def_obj)) = (parsed.as_object_mut(), defaults.as_object()) {
        for (k, v) in def_obj {
            obj.entry(k.clone()).or_insert(v.clone());
        }
    }
    Ok(serde_json::from_value(parsed)?)
}

fn write_settings(app: &AppHandle, settings: &Settings) -> AppResult<()> {
    let p = settings_path(app)?;
    let text = serde_json::to_string_pretty(settings)?;
    let tmp = p.with_extension("json.tmp");
    let mut file = File::create(&tmp)?;
    file.write_all(text.as_bytes())
        .and_then(|_| file.sync_all())?;
    drop(file);
    fs::rename(&tmp, &p)?;
    Ok(())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> AppResult<Settings> {
    read_settings(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: Settings) -> AppResult<()> {
    write_settings(&app, &settings)?;
    crate::hotkeys::register_all(&app, &settings)
        .map_err(|e| AppError::SettingsMessage(format!("hotkey reload: {e}")))?;
    Ok(())
}

pub fn format_filename(template: &str, ext: &str) -> String {
    let now = chrono::Local::now();
    let formatted = template
        .replace("{yyyy}", &now.format("%Y").to_string())
        .replace("{MM}", &now.format("%m").to_string())
        .replace("{dd}", &now.format("%d").to_string())
        .replace("{HH}", &now.format("%H").to_string())
        .replace("{mm}", &now.format("%M").to_string())
        .replace("{ss}", &now.format("%S").to_string())
        .replace("{timestamp}", &now.timestamp().to_string())
        .replace("{ext}", ext);
    format!("{}.{}", formatted, ext)
}
