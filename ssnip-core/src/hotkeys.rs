use crate::{settings::Settings, AppError, AppResult};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

fn parse(s: &str) -> AppResult<Shortcut> {
    s.parse::<Shortcut>()
        .map_err(|e| AppError::SettingsMessage(e.to_string()))
}

fn clear_all(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}

fn register_one(app: &AppHandle, accel: &str, action: &'static str) -> AppResult<()> {
    if accel.trim().is_empty() {
        return Ok(());
    }
    let sc = parse(accel)?;
    let handle = app.clone();
    let action_str = action.to_string();
    app.global_shortcut()
        .on_shortcut(sc, move |_app, _sc, ev| {
            if ev.state == ShortcutState::Pressed {
                let _ = handle.emit("hotkey-triggered", action_str.clone());
                if action_str == "toggle_app" {
                    if let Some(w) = handle.get_webview_window("main") {
                        let visible = w.is_visible().unwrap_or(false);
                        if visible {
                            let _ = w.hide();
                        } else {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                }
            }
        })
        .map_err(|e| AppError::SettingsMessage(e.to_string()))?;
    Ok(())
}

pub fn register_all(app: &AppHandle, s: &Settings) -> AppResult<()> {
    clear_all(app);
    register_one(app, &s.hotkey_rect, "rect")?;
    register_one(app, &s.hotkey_fullscreen, "fullscreen")?;
    register_one(app, &s.hotkey_window, "window")?;
    register_one(app, &s.hotkey_active_window, "active_window")?;
    register_one(app, &s.hotkey_toggle_app, "toggle_app")?;
    Ok(())
}
