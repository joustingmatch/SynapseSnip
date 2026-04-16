mod capture;
mod clipboard;
mod hotkeys;
mod recorder;
mod settings;

use tauri::{
    http::Request,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("capture failed: {0}")]
    Capture(String),
    #[error("clipboard failed: {0}")]
    Clipboard(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("encode: {0}")]
    Encode(String),
    #[error("settings: {0}")]
    Settings(#[from] serde_json::Error),
    #[error("settings: {0}")]
    SettingsMessage(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.to_string().as_ref())
    }
}

pub type AppResult<T> = Result<T, AppError>;

fn trigger_capture(app: &tauri::AppHandle, mode: &str) {
    let _ = app.emit("tray-capture", mode.to_string());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("snip", |_ctx, request: Request<Vec<u8>>| {
            capture::handle_snip_protocol(&request)
        })
        .register_uri_scheme_protocol("pending", |_ctx, request: Request<Vec<u8>>| {
            capture::handle_pending_protocol(&request)
        })
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_drag::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let s = settings::read_settings(&handle).unwrap_or_default();
            capture::start_housekeeping();
            if let Err(e) = hotkeys::register_all(&handle, &s) {
                eprintln!("hotkey init failed: {e}");
            }

            let menu = MenuBuilder::new(app)
                .item(&MenuItemBuilder::with_id("cap_rect", "New Snip (Rectangle)").build(app)?)
                .item(&MenuItemBuilder::with_id("cap_full", "Fullscreen").build(app)?)
                .item(&MenuItemBuilder::with_id("cap_window", "Window at Cursor").build(app)?)
                .item(&MenuItemBuilder::with_id("cap_active", "Active Window").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("show", "Show SynapseSnip").build(app)?)
                .item(&MenuItemBuilder::with_id("settings", "Settings").build(app)?)
                .separator()
                .item(&MenuItemBuilder::with_id("quit", "Quit").build(app)?)
                .build()?;

            let tray_handle = handle.clone();
            let mut tb = TrayIconBuilder::with_id("main-tray")
                .tooltip("SynapseSnip")
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "cap_rect" => trigger_capture(app, "rect"),
                    "cap_full" => trigger_capture(app, "fullscreen"),
                    "cap_window" => trigger_capture(app, "window"),
                    "cap_active" => trigger_capture(app, "active_window"),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "settings" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                            let _ = w.emit("open-settings", ());
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(w) = tray.app_handle().get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                });

            if let Some(icon) = app.default_window_icon() {
                tb = tb.icon(icon.clone());
            }
            tb.build(app)?;
            let _ = tray_handle;

            if s.start_minimized {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.hide();
                }
            }

            capture::prewarm_notification_window(&handle);

            if app.get_webview_window("overlay").is_none() {
                let _ = WebviewWindowBuilder::new(
                    app,
                    "overlay",
                    WebviewUrl::App("index.html#overlay".into()),
                )
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .build();
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" {
                    let app = window.app_handle();
                    let s = settings::read_settings(app).unwrap_or_default();
                    if s.close_to_tray {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
            }
            if matches!(event, WindowEvent::Destroyed) {
                capture::handle_window_destroyed(window.label());
            }
        })
        .invoke_handler(tauri::generate_handler![
            capture::capture_fullscreen,
            capture::capture_region,
            capture::capture_monitor,
            capture::list_monitors,
            capture::save_image,
            capture::begin_capture,
            capture::get_pending_capture,
            capture::finalize_capture,
            capture::cancel_capture,
            capture::mark_overlay_ready,
            capture::get_snip,
            capture::get_snip_png_bytes,
            capture::discard_snip,
            capture::force_discard,
            capture::attach_snip,
            capture::retain_snip,
            capture::release_snip_ref,
            capture::store_snip_bytes,
            capture::show_snip_notification,
            capture::show_snip_editor,
            capture::show_floating_image,
            capture::move_window_to,
            capture::export_snip_to_temp,
            capture::close_self_window,
            capture::release_notification_window,
            capture::debug_snip_count,
            clipboard::copy_image_to_clipboard,
            clipboard::copy_png_bytes_to_clipboard,
            recorder::start_video_recording,
            recorder::stop_video_recording,
            recorder::cancel_video_recording,
            recorder::get_recording_status,
            recorder::show_video_notification,
            recorder::reveal_path_in_folder,
            recorder::enumerate_audio_devices,
            recorder::set_overlay_passthrough,
            settings::load_settings,
            settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");

    recorder::cleanup_all_recordings();
}
