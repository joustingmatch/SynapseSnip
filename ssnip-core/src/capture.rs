use crate::{AppError, AppResult};
use image::{ImageBuffer, Rgba, RgbaImage};
use once_cell::sync::Lazy;
use screenshots::Screen;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Mutex,
};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    http::{
        header::CONTENT_TYPE,
        Response,
        StatusCode,
    },
    AppHandle, Emitter, LogicalPosition, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder, Window,
};

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::{HWND, POINT, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetCursorPos, GetForegroundWindow, GetWindowRect, WindowFromPoint,
    };

    pub fn active_window_rect() -> Option<(i32, i32, u32, u32)> {
        unsafe {
            let hwnd: HWND = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let mut rect = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return None;
            }
            let w = (rect.right - rect.left).max(0) as u32;
            let h = (rect.bottom - rect.top).max(0) as u32;
            Some((rect.left, rect.top, w, h))
        }
    }

    pub fn window_at_cursor() -> Option<(i32, i32, u32, u32)> {
        unsafe {
            let mut p = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut p) == 0 {
                return None;
            }
            let hwnd: HWND = WindowFromPoint(p);
            if hwnd.is_null() {
                return None;
            }
            let mut rect = RECT {
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            };
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return None;
            }
            let w = (rect.right - rect.left).max(0) as u32;
            let h = (rect.bottom - rect.top).max(0) as u32;
            Some((rect.left, rect.top, w, h))
        }
    }

    pub fn cursor_pos() -> Option<(i32, i32)> {
        unsafe {
            let mut p = POINT { x: 0, y: 0 };
            if GetCursorPos(&mut p) == 0 {
                return None;
            }
            Some((p.x, p.y))
        }
    }
}

#[cfg(not(windows))]
mod win {
    pub fn active_window_rect() -> Option<(i32, i32, u32, u32)> {
        None
    }
    pub fn window_at_cursor() -> Option<(i32, i32, u32, u32)> {
        None
    }
    pub fn cursor_pos() -> Option<(i32, i32)> {
        None
    }
}

#[derive(Debug, Clone)]
struct PendingCapture {
    origin_x: i32,
    origin_y: i32,
    width: u32,
    height: u32,
    scale: f32,
    rgba: Vec<u8>,
}

fn encode_rgba_to_bmp(buf: &[u8], w: u32, h: u32) -> AppResult<Vec<u8>> {
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(w, h, buf.to_vec())
        .ok_or_else(|| AppError::Encode("bad buf".into()))?;
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Bmp)
        .map_err(|e| AppError::Encode(e.to_string()))?;
    Ok(out.into_inner())
}

#[derive(Debug, Clone)]
struct SnipData {
    width: u32,
    height: u32,
    png_bytes: Vec<u8>,
    created_at: SystemTime,
    temp_path: Option<PathBuf>,
}

static PENDING: Lazy<Mutex<Option<PendingCapture>>> = Lazy::new(|| Mutex::new(None));
static MAIN_WAS_VISIBLE: Lazy<Mutex<bool>> = Lazy::new(|| Mutex::new(false));
static SNIPS: Lazy<Mutex<HashMap<String, SnipData>>> = Lazy::new(|| Mutex::new(HashMap::new()));
static SNIP_REFS: Lazy<Mutex<HashMap<String, HashSet<String>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static FLOATING_COUNTER: AtomicU64 = AtomicU64::new(0);
static CAPTURE_BUSY: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MonitorInfo {
    pub id: u32,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f32,
    pub is_primary: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SnipInfo {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CaptureEvent {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingInfo {
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
    pub scale: f32,
}

struct CaptureGuard {
    clear_on_drop: bool,
}

impl CaptureGuard {
    fn acquire() -> AppResult<Self> {
        if CAPTURE_BUSY
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(AppError::Capture("busy".into()));
        }
        Ok(Self { clear_on_drop: true })
    }

    fn persist(mut self) {
        self.clear_on_drop = false;
    }
}

impl Drop for CaptureGuard {
    fn drop(&mut self) {
        if self.clear_on_drop {
            CAPTURE_BUSY.store(false, Ordering::SeqCst);
        }
    }
}

fn clear_capture_busy() {
    CAPTURE_BUSY.store(false, Ordering::SeqCst);
}

fn next_id() -> String {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("snip_{n}")
}

fn now() -> SystemTime {
    SystemTime::now()
}

fn png_response(bytes: Vec<u8>) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "image/png")
        .body(bytes)
        .unwrap()
}

fn text_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap()
}

fn encode_rgba_to_png(buf: &[u8], w: u32, h: u32) -> AppResult<Vec<u8>> {
    let img: ImageBuffer<Rgba<u8>, Vec<u8>> = ImageBuffer::from_raw(w, h, buf.to_vec())
        .ok_or_else(|| AppError::Encode("bad buf".into()))?;
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| AppError::Encode(e.to_string()))?;
    Ok(out.into_inner())
}

fn snip_info(id: String, snip: &SnipData) -> SnipInfo {
    SnipInfo {
        id,
        width: snip.width,
        height: snip.height,
    }
}

fn create_snip(png_bytes: Vec<u8>) -> AppResult<SnipData> {
    let dims = image::load_from_memory(&png_bytes)
        .map_err(|e| AppError::Encode(format!("image decode: {e}")))?;
    Ok(SnipData {
        width: dims.width(),
        height: dims.height(),
        png_bytes,
        created_at: now(),
        temp_path: None,
    })
}

fn store_snip_data(snip: SnipData) -> SnipInfo {
    let id = next_id();
    let info = snip_info(id.clone(), &snip);
    SNIPS.lock().unwrap().insert(id.clone(), snip);
    SNIP_REFS.lock().unwrap().entry(id).or_default();
    info
}

fn get_snip_data(id: &str) -> AppResult<SnipData> {
    SNIPS
        .lock()
        .unwrap()
        .get(id)
        .cloned()
        .ok_or_else(|| AppError::Capture("snip not found".into()))
}

pub fn get_snip_bytes(id: &str) -> AppResult<Vec<u8>> {
    Ok(get_snip_data(id)?.png_bytes)
}

#[tauri::command]
pub fn get_snip_png_bytes(id: String) -> AppResult<Vec<u8>> {
    get_snip_bytes(&id)
}

fn cleanup_temp_file(path: &Path) {
    let _ = std::fs::remove_file(path);
}

fn window_ref_token(window_label: &str, key: &str) -> String {
    format!("{window_label}::{key}")
}

fn is_window_ref(token: &str, window_label: &str) -> bool {
    token == window_label || token.starts_with(&format!("{window_label}::"))
}

fn remove_snip_internal(id: &str) {
    let temp_path = SNIPS
        .lock()
        .unwrap()
        .remove(id)
        .and_then(|snip| snip.temp_path);
    SNIP_REFS.lock().unwrap().remove(id);
    if let Some(path) = temp_path {
        cleanup_temp_file(&path);
    }
}

fn sweep_snips(ttl: Duration) {
    let now = now();
    let empty_ids = {
        let refs = SNIP_REFS.lock().unwrap();
        let snips = SNIPS.lock().unwrap();
        snips
            .iter()
            .filter_map(|(id, snip)| {
                let is_attached = refs.get(id).map(|labels| !labels.is_empty()).unwrap_or(false);
                let is_old = now
                    .duration_since(snip.created_at)
                    .map(|age| age >= ttl)
                    .unwrap_or(false);
                if !is_attached && is_old {
                    Some(id.clone())
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
    };

    for id in empty_ids {
        remove_snip_internal(&id);
    }
}

fn sweep_temp_files(max_age: Duration) {
    let mut dir = std::env::temp_dir();
    dir.push("SynapseSnip");
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };

    let now = now();
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        let Ok(modified) = meta.modified() else {
            continue;
        };
        let is_old = now
            .duration_since(modified)
            .map(|age| age >= max_age)
            .unwrap_or(false);
        if is_old {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

fn attach_window_label(id: &str, window_label: &str) -> AppResult<()> {
    if !SNIPS.lock().unwrap().contains_key(id) {
        return Err(AppError::Capture("snip not found".into()));
    }

    let empty_ids = {
        let mut refs = SNIP_REFS.lock().unwrap();
        let mut empty_ids = Vec::new();
        for (snip_id, labels) in refs.iter_mut() {
            if labels.remove(window_label) && labels.is_empty() && snip_id != id {
                empty_ids.push(snip_id.clone());
            }
        }
        refs.entry(id.to_string())
            .or_default()
            .insert(window_label.to_string());
        empty_ids
    };

    for empty_id in empty_ids {
        remove_snip_internal(&empty_id);
    }

    Ok(())
}

fn retain_window_ref(id: &str, window_label: &str, key: &str) -> AppResult<()> {
    if key.trim().is_empty() {
        return Err(AppError::Capture("ref key required".into()));
    }
    if !SNIPS.lock().unwrap().contains_key(id) {
        return Err(AppError::Capture("snip not found".into()));
    }

    let token = window_ref_token(window_label, key);
    SNIP_REFS
        .lock()
        .unwrap()
        .entry(id.to_string())
        .or_default()
        .insert(token);
    Ok(())
}

fn release_window_ref(window_label: &str, key: &str) {
    let token = window_ref_token(window_label, key);
    let empty_ids = {
        let mut refs = SNIP_REFS.lock().unwrap();
        let mut empty_ids = Vec::new();
        for (snip_id, labels) in refs.iter_mut() {
            if labels.remove(&token) && labels.is_empty() {
                empty_ids.push(snip_id.clone());
            }
        }
        empty_ids
    };

    for id in empty_ids {
        remove_snip_internal(&id);
    }
}

fn primary_workarea(app: &AppHandle) -> (f64, f64, f64, f64) {
    if let Some(main) = app.get_webview_window("main") {
        if let Ok(Some(mon)) = main.primary_monitor() {
            let scale = mon.scale_factor();
            let pos = mon.position();
            let size = mon.size();
            return (
                pos.x as f64 / scale,
                pos.y as f64 / scale,
                size.width as f64 / scale,
                size.height as f64 / scale,
            );
        }
    }
    (0.0, 0.0, 1920.0, 1080.0)
}

pub fn handle_snip_protocol(request: &tauri::http::Request<Vec<u8>>) -> Response<Vec<u8>> {
    let id = request.uri().path().trim_start_matches('/');
    match SNIPS.lock().unwrap().get(id).cloned() {
        Some(snip) => png_response(snip.png_bytes),
        None => text_response(StatusCode::NOT_FOUND, "snip not found"),
    }
}

pub fn handle_pending_protocol(request: &tauri::http::Request<Vec<u8>>) -> Response<Vec<u8>> {
    let key = request.uri().path().trim_start_matches('/');
    if key != "current" {
        return text_response(StatusCode::NOT_FOUND, "pending capture not found");
    }
    let snapshot = PENDING
        .lock()
        .unwrap()
        .as_ref()
        .map(|p| (p.rgba.clone(), p.width, p.height));
    match snapshot {
        Some((rgba, w, h)) => match encode_rgba_to_bmp(&rgba, w, h) {
            Ok(bytes) => Response::builder()
                .status(StatusCode::OK)
                .header(CONTENT_TYPE, "image/bmp")
                .body(bytes)
                .unwrap(),
            Err(e) => text_response(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()),
        },
        None => text_response(StatusCode::NOT_FOUND, "pending capture not found"),
    }
}

pub fn handle_window_destroyed(window_label: &str) {
    let empty_ids = {
        let mut refs = SNIP_REFS.lock().unwrap();
        let mut empty_ids = Vec::new();
        for (snip_id, labels) in refs.iter_mut() {
            labels.retain(|token| !is_window_ref(token, window_label));
            if labels.is_empty() {
                empty_ids.push(snip_id.clone());
            }
        }
        empty_ids
    };

    for id in empty_ids {
        remove_snip_internal(&id);
    }
}

pub fn start_housekeeping() {
    sweep_temp_files(Duration::from_secs(24 * 60 * 60));
    thread::spawn(|| loop {
        thread::sleep(Duration::from_secs(60));
        sweep_snips(Duration::from_secs(10 * 60));
        sweep_temp_files(Duration::from_secs(24 * 60 * 60));
    });
}

#[tauri::command]
pub fn debug_snip_count() -> usize {
    SNIPS.lock().unwrap().len()
}

#[tauri::command]
pub fn get_snip(id: String) -> AppResult<SnipInfo> {
    let snip = get_snip_data(&id)?;
    Ok(snip_info(id, &snip))
}

#[tauri::command]
pub fn discard_snip(id: String) {
    remove_snip_internal(&id);
}

#[tauri::command]
pub fn force_discard(id: String) {
    remove_snip_internal(&id);
}

#[tauri::command]
pub fn attach_snip(window: Window, id: String) -> AppResult<()> {
    attach_window_label(&id, window.label())
}

#[tauri::command]
pub fn retain_snip(window: Window, id: String, key: String) -> AppResult<()> {
    retain_window_ref(&id, window.label(), &key)
}

#[tauri::command]
pub fn release_snip_ref(window: Window, key: String) {
    release_window_ref(window.label(), &key);
}

#[tauri::command]
pub fn store_snip_bytes(bytes: Vec<u8>) -> AppResult<String> {
    let snip = create_snip(bytes)?;
    Ok(store_snip_data(snip).id)
}

pub fn store_snip_with_dims(png_bytes: Vec<u8>, width: u32, height: u32) -> AppResult<SnipInfo> {
    let snip = SnipData {
        width,
        height,
        png_bytes,
        created_at: now(),
        temp_path: None,
    };
    Ok(store_snip_data(snip))
}

const NOTIFICATION_LABELS: [&str; 5] = [
    "notification0",
    "notification1",
    "notification2",
    "notification3",
    "notification4",
];
const NOTIFICATION_W: f64 = 420.0;
const NOTIFICATION_H: f64 = 260.0;

pub fn prewarm_notification_window(app: &AppHandle) {
    let label = NOTIFICATION_LABELS[0];
    if app.get_webview_window(label).is_some() {
        return;
    }
    let url = format!("index.html#notification?id=__prewarm__");
    let _ = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title("SynapseSnip")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(NOTIFICATION_W, NOTIFICATION_H)
        .position(-4000.0, -4000.0)
        .visible(false)
        .focused(false)
        .build();
}

#[tauri::command]
pub async fn show_snip_notification(app: AppHandle, id: String) -> AppResult<()> {
    get_snip_data(&id)?;

    // Single-slot notification: a new capture instantly replaces whatever
    // is on screen. Any leftover legacy windows (notification1..4) from a
    // previous stacking implementation are closed so they can't linger.
    for stale in NOTIFICATION_LABELS.iter().skip(1) {
        if let Some(w) = app.get_webview_window(stale) {
            let _ = w.close();
            handle_window_destroyed(stale);
        }
    }

    let label = NOTIFICATION_LABELS[0];
    let (mx, my, mw, mh) = primary_workarea(&app);
    let pad: f64 = 24.0;
    let x = mx + mw - NOTIFICATION_W - pad;
    let y = my + mh - NOTIFICATION_H - pad;

    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_position(LogicalPosition { x, y });
        let _ = attach_window_label(&id, label);
        let _ = win.emit("snip-reload", id.clone());
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let url = format!("index.html#notification?id={id}");
    let win = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title("SynapseSnip")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(NOTIFICATION_W, NOTIFICATION_H)
        .position(x, y)
        .focused(true)
        .build()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    let _ = win.show();
    let _ = win.set_focus();
    let _ = attach_window_label(&id, label);
    Ok(())
}

#[tauri::command]
pub async fn release_notification_window(window: Window) -> AppResult<()> {
    let label = window.label().to_string();
    if NOTIFICATION_LABELS.iter().any(|l| *l == label) {
        let _ = window.hide();
        handle_window_destroyed(&label);
    } else {
        let _ = window.close();
    }
    Ok(())
}

#[tauri::command]
pub async fn show_snip_editor(app: AppHandle, id: String) -> AppResult<()> {
    get_snip_data(&id)?;
    let label = "editor";
    if let Some(w) = app.get_webview_window(label) {
        let _ = attach_window_label(&id, label);
        let _ = w.emit("snip-reload", id.clone());
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        return Ok(());
    }
    let url = format!("index.html#editor?id={id}");
    let win = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title("SynapseSnip - Edit")
        .inner_size(1100.0, 780.0)
        .min_inner_size(720.0, 480.0)
        .resizable(true)
        .decorations(false)
        .shadow(true)
        .build()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    let _ = win.set_focus();
    let _ = attach_window_label(&id, label);
    Ok(())
}

#[tauri::command]
pub async fn close_self_window(window: Window) -> AppResult<()> {
    let _ = window.close();
    Ok(())
}

#[tauri::command]
pub async fn show_floating_image(
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> AppResult<String> {
    get_snip_data(&id)?;
    let n = FLOATING_COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
    let label = format!("floating{n}");
    let w = width.max(40.0).min(1600.0);
    let h = height.max(40.0).min(1600.0);
    let url = format!("index.html#floating?id={id}");
    let win = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title("SynapseSnip - Pinned")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(w, h)
        .position(x, y)
        .focused(false)
        .build()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    let _ = win.set_position(LogicalPosition { x, y });
    let _ = win.show();
    let _ = attach_window_label(&id, &label);
    Ok(label)
}

#[tauri::command]
pub async fn move_window_to(app: AppHandle, label: String, x: f64, y: f64) -> AppResult<()> {
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_position(LogicalPosition { x, y });
    }
    Ok(())
}

#[tauri::command]
pub fn export_snip_to_temp(id: String) -> AppResult<String> {
    let bytes = get_snip_data(&id)?.png_bytes;
    let mut dir = std::env::temp_dir();
    dir.push("SynapseSnip");
    std::fs::create_dir_all(&dir)?;
    dir.push(format!("{id}.png"));
    std::fs::write(&dir, &bytes)?;
    Ok(dir.to_string_lossy().to_string())
}

fn virtual_bounds(screens: &[Screen]) -> (i32, i32, u32, u32) {
    if screens.is_empty() {
        return (0, 0, 1920, 1080);
    }
    let min_x = screens.iter().map(|s| s.display_info.x).min().unwrap();
    let min_y = screens.iter().map(|s| s.display_info.y).min().unwrap();
    let max_x = screens
        .iter()
        .map(|s| s.display_info.x + s.display_info.width as i32)
        .max()
        .unwrap();
    let max_y = screens
        .iter()
        .map(|s| s.display_info.y + s.display_info.height as i32)
        .max()
        .unwrap();
    (
        min_x,
        min_y,
        (max_x - min_x).max(1) as u32,
        (max_y - min_y).max(1) as u32,
    )
}

fn capture_virtual_impl() -> AppResult<PendingCapture> {
    let screens = Screen::all().map_err(|e| AppError::Capture(e.to_string()))?;
    let (vx, vy, vw, vh) = virtual_bounds(&screens);
    let mut canvas: RgbaImage = ImageBuffer::from_pixel(vw, vh, Rgba([0, 0, 0, 255]));
    let scale = screens
        .first()
        .map(|s| s.display_info.scale_factor)
        .unwrap_or(1.0);
    for s in &screens {
        let di = s.display_info;
        let img = s.capture().map_err(|e| AppError::Capture(e.to_string()))?;
        let (iw, ih) = (img.width(), img.height());
        let Some(src) = RgbaImage::from_raw(iw, ih, img.as_raw().to_vec()) else {
            continue;
        };
        let dx = (di.x - vx) as i64;
        let dy = (di.y - vy) as i64;
        image::imageops::overlay(&mut canvas, &src, dx, dy);
    }
    let (w, h) = (canvas.width(), canvas.height());
    let rgba = canvas.into_raw();
    Ok(PendingCapture {
        origin_x: vx,
        origin_y: vy,
        width: w,
        height: h,
        scale,
        rgba,
    })
}

fn crop_pending(pc: &mut PendingCapture, x: i32, y: i32, w: u32, h: u32) -> AppResult<SnipData> {
    let sx = (x - pc.origin_x).max(0) as u32;
    let sy = (y - pc.origin_y).max(0) as u32;
    let sw = w.min(pc.width.saturating_sub(sx)).max(1);
    let sh = h.min(pc.height.saturating_sub(sy)).max(1);
    let rgba = std::mem::take(&mut pc.rgba);
    let full = RgbaImage::from_raw(pc.width, pc.height, rgba)
        .ok_or_else(|| AppError::Encode("bad pending buf".into()))?;
    let sub = image::imageops::crop_imm(&full, sx, sy, sw, sh).to_image();
    Ok(SnipData {
        width: sub.width(),
        height: sub.height(),
        png_bytes: encode_rgba_to_png(sub.as_raw(), sub.width(), sub.height())?,
        created_at: now(),
        temp_path: None,
    })
}

fn emit_capture_result(app: &AppHandle, result: SnipData) -> CaptureEvent {
    restore_main(app);
    let info = store_snip_data(result);
    let event = CaptureEvent {
        id: info.id.clone(),
        width: info.width,
        height: info.height,
    };
    let _ = app.emit("capture-done", &event);
    event
}

fn capture_current_monitor_impl() -> AppResult<SnipData> {
    let screens = Screen::all().map_err(|e| AppError::Capture(e.to_string()))?;
    let cursor = win::cursor_pos();
    let screen = cursor
        .and_then(|(x, y)| {
            screens.iter().find(|screen| {
                let di = screen.display_info;
                x >= di.x
                    && y >= di.y
                    && x < di.x + di.width as i32
                    && y < di.y + di.height as i32
            })
        })
        .or_else(|| screens.first())
        .ok_or_else(|| AppError::Capture("no monitor".into()))?;
    let img = screen
        .capture()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    Ok(SnipData {
        width: img.width(),
        height: img.height(),
        png_bytes: encode_rgba_to_png(img.as_raw(), img.width(), img.height())?,
        created_at: now(),
        temp_path: None,
    })
}

#[tauri::command]
pub fn list_monitors() -> AppResult<Vec<MonitorInfo>> {
    let screens = Screen::all().map_err(|e| AppError::Capture(e.to_string()))?;
    Ok(screens
        .into_iter()
        .enumerate()
        .map(|(i, s)| MonitorInfo {
            id: s.display_info.id,
            x: s.display_info.x,
            y: s.display_info.y,
            width: s.display_info.width,
            height: s.display_info.height,
            scale: s.display_info.scale_factor,
            is_primary: i == 0,
        })
        .collect())
}

#[tauri::command]
pub fn capture_fullscreen() -> AppResult<SnipInfo> {
    let pc = capture_virtual_impl()?;
    let png = encode_rgba_to_png(&pc.rgba, pc.width, pc.height)?;
    store_snip_with_dims(png, pc.width, pc.height)
}

#[tauri::command]
pub fn capture_monitor(id: u32) -> AppResult<SnipInfo> {
    let screens = Screen::all().map_err(|e| AppError::Capture(e.to_string()))?;
    let screen = screens
        .iter()
        .find(|s| s.display_info.id == id)
        .or_else(|| screens.first())
        .ok_or_else(|| AppError::Capture("no monitor".into()))?;
    let img = screen
        .capture()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    let snip = SnipData {
        width: img.width(),
        height: img.height(),
        png_bytes: encode_rgba_to_png(img.as_raw(), img.width(), img.height())?,
        created_at: now(),
        temp_path: None,
    };
    Ok(store_snip_data(snip))
}

#[tauri::command]
pub fn capture_region(x: i32, y: i32, width: u32, height: u32) -> AppResult<SnipInfo> {
    let mut pc = capture_virtual_impl()?;
    Ok(store_snip_data(crop_pending(&mut pc, x, y, width, height)?))
}

#[tauri::command]
pub fn get_pending_capture() -> AppResult<PendingInfo> {
    let guard = PENDING.lock().unwrap();
    let pc = guard
        .as_ref()
        .ok_or_else(|| AppError::Capture("no pending".into()))?;
    Ok(PendingInfo {
        origin_x: pc.origin_x,
        origin_y: pc.origin_y,
        width: pc.width,
        height: pc.height,
        scale: pc.scale,
    })
}

#[tauri::command]
pub fn finalize_capture(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
) -> AppResult<CaptureEvent> {
    clear_capture_busy();
    let pc_opt = PENDING.lock().unwrap().take();
    let mut pc = pc_opt.ok_or_else(|| AppError::Capture("no pending".into()))?;
    let result = crop_pending(&mut pc, x, y, width, height)?;
    if let Some(ov) = app.get_webview_window("overlay") {
        let _ = ov.hide();
    }
    Ok(emit_capture_result(&app, result))
}

#[tauri::command]
pub fn cancel_capture(app: AppHandle) -> AppResult<()> {
    clear_capture_busy();
    *PENDING.lock().unwrap() = None;
    if let Some(ov) = app.get_webview_window("overlay") {
        let _ = ov.hide();
    }
    restore_main(&app);
    Ok(())
}

fn hide_main(app: &AppHandle) {
    let mut was = false;
    if let Some(main) = app.get_webview_window("main") {
        was = main.is_visible().unwrap_or(false);
        if was {
            let _ = main.hide();
        }
    }
    *MAIN_WAS_VISIBLE.lock().unwrap() = was;
    if was {
        thread::sleep(Duration::from_millis(90));
    }
}

fn restore_main(app: &AppHandle) {
    let was = *MAIN_WAS_VISIBLE.lock().unwrap();
    if was {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.show();
        }
    }
}

fn direct_capture_and_emit(
    app: &AppHandle,
    x: i32,
    y: i32,
    w: u32,
    h: u32,
) -> AppResult<CaptureEvent> {
    let mut pc = capture_virtual_impl()?;
    let result = crop_pending(&mut pc, x, y, w, h)?;
    Ok(emit_capture_result(app, result))
}

#[tauri::command]
pub fn mark_overlay_ready(app: AppHandle) {
    if let Some(ov) = app.get_webview_window("overlay") {
        if !ov.is_visible().unwrap_or(false) {
            let _ = ov.show();
            let _ = ov.set_focus();
        }
    }
}

#[tauri::command]
pub async fn begin_capture(app: AppHandle, mode: String) -> AppResult<()> {
    let guard = CaptureGuard::acquire()?;
    hide_main(&app);

    let result = match mode.as_str() {
        "fullscreen" => {
            let capture = capture_virtual_impl()?;
            let png = encode_rgba_to_png(&capture.rgba, capture.width, capture.height)?;
            let result = SnipData {
                width: capture.width,
                height: capture.height,
                png_bytes: png,
                created_at: now(),
                temp_path: None,
            };
            let _ = emit_capture_result(&app, result);
            Ok(())
        }
        "active_window" => {
            let rect = win::active_window_rect()
                .ok_or_else(|| AppError::Capture("cannot detect active window".into()))?;
            let _ = direct_capture_and_emit(&app, rect.0, rect.1, rect.2, rect.3)?;
            Ok(())
        }
        "window" => {
            let rect = win::window_at_cursor()
                .ok_or_else(|| AppError::Capture("cannot detect window at cursor".into()))?;
            let _ = direct_capture_and_emit(&app, rect.0, rect.1, rect.2, rect.3)?;
            Ok(())
        }
        "monitor" => {
            let _ = emit_capture_result(&app, capture_current_monitor_impl()?);
            Ok(())
        }
        _ => {
            let capture = capture_virtual_impl()?;
            let (vx, vy, vw, vh) =
                (capture.origin_x, capture.origin_y, capture.width, capture.height);
            *PENDING.lock().unwrap() = Some(capture);

            let win = if let Some(existing) = app.get_webview_window("overlay") {
                existing
            } else {
                WebviewWindowBuilder::new(
                    &app,
                    "overlay",
                    WebviewUrl::App("index.html#overlay".into()),
                )
                .decorations(false)
                .transparent(true)
                .always_on_top(true)
                .skip_taskbar(true)
                .resizable(false)
                .visible(false)
                .build()
                .map_err(|e| AppError::Capture(e.to_string()))?
            };

            win.set_position(PhysicalPosition { x: vx, y: vy })
                .map_err(|e| AppError::Capture(e.to_string()))?;
            win.set_size(PhysicalSize {
                width: vw,
                height: vh,
            })
            .map_err(|e| AppError::Capture(e.to_string()))?;
            // Window stays hidden. React signals readiness via
            // `mark_overlay_ready` after the new pending image is decoded
            // and painted, which prevents a one-frame flash of the previous
            // capture's content. Fallback timer reveals the overlay if the
            // frontend handshake fails.
            let _ = app.emit("overlay-refresh", ());
            let app2 = app.clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(600));
                if let Some(ov) = app2.get_webview_window("overlay") {
                    if !ov.is_visible().unwrap_or(false) {
                        let _ = ov.show();
                        let _ = ov.set_focus();
                    }
                }
            });
            guard.persist();
            return Ok(());
        }
    };

    if result.is_err() {
        *PENDING.lock().unwrap() = None;
        if let Some(overlay) = app.get_webview_window("overlay") {
            let _ = overlay.hide();
        }
        restore_main(&app);
    }

    result
}

#[tauri::command]
pub fn save_image(id: String, path: String, format: String) -> AppResult<String> {
    let bytes = get_snip_data(&id)?.png_bytes;
    let fmt = match format.to_lowercase().as_str() {
        "jpg" | "jpeg" => image::ImageFormat::Jpeg,
        "bmp" => image::ImageFormat::Bmp,
        _ => image::ImageFormat::Png,
    };
    let path_buf = std::path::PathBuf::from(&path);
    if let Some(parent) = path_buf.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            std::fs::create_dir_all(parent)?;
        }
    }
    if fmt == image::ImageFormat::Png {
        std::fs::write(&path_buf, &bytes)?;
    } else {
        let img = image::load_from_memory(&bytes)
            .map_err(|e| AppError::Encode(format!("image decode: {e}")))?;
        let out = match fmt {
            image::ImageFormat::Jpeg | image::ImageFormat::Bmp => {
                image::DynamicImage::ImageRgb8(img.to_rgb8())
            }
            _ => img,
        };
        out.save_with_format(&path_buf, fmt)
            .map_err(|e| AppError::Encode(format!("image encode: {e}")))?;
    }
    Ok(path_buf.to_string_lossy().to_string())
}
