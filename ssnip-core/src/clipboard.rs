use crate::{AppError, AppResult};
use arboard::{Clipboard, ImageData};
use std::borrow::Cow;
use std::thread;
use std::time::Duration;

fn set_clipboard_from_png(bytes: &[u8]) -> AppResult<()> {
    let img = image::load_from_memory(bytes).map_err(|e| AppError::Clipboard(e.to_string()))?;
    let rgba = img.to_rgba8();
    let (w, h) = (rgba.width() as usize, rgba.height() as usize);
    let data = ImageData {
        width: w,
        height: h,
        bytes: Cow::Owned(rgba.into_raw()),
    };
    let mut last_error = None;
    for attempt in 0..4 {
        match Clipboard::new() {
            Ok(mut cb) => match cb.set_image(data.clone()) {
                Ok(()) => return Ok(()),
                Err(err) => {
                    last_error = Some(err.to_string());
                }
            },
            Err(err) => {
                last_error = Some(err.to_string());
            }
        }

        if attempt < 3 {
            thread::sleep(Duration::from_millis(40));
        }
    }

    Err(AppError::Clipboard(
        last_error.unwrap_or_else(|| "unknown clipboard failure".to_string()),
    ))
}

#[tauri::command]
pub fn copy_image_to_clipboard(id: String) -> AppResult<()> {
    let bytes = crate::capture::get_snip_bytes(&id)?;
    set_clipboard_from_png(&bytes)
}

#[tauri::command]
pub fn copy_png_bytes_to_clipboard(bytes: Vec<u8>) -> AppResult<()> {
    set_clipboard_from_png(&bytes)
}
