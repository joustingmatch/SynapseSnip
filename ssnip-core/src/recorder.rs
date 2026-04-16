// Recording backend using bundled FFmpeg sidecar (Option A).
// FFmpeg's gdigrab captures screen regions on Windows with H.264 encoding.
// The sidecar binary is registered in tauri.conf.json under bundle.externalBin.

use crate::{AppError, AppResult};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

/// Physical-pixel rect (x, y, w, h) marking the region that must remain
/// interactive while the overlay is cursor-transparent during recording.
static PASSTHROUGH_HUD_RECT: Lazy<Mutex<Option<(i32, i32, i32, i32)>>> =
    Lazy::new(|| Mutex::new(None));
static PASSTHROUGH_ACTIVE: AtomicBool = AtomicBool::new(false);

/// Mark/unmark the overlay window as excluded from screen capture.
/// Without this, ffmpeg's gdigrab captures our topmost transparent overlay
/// window as solid black, which produces a black/frozen recording.
/// WDA_EXCLUDEFROMCAPTURE requires Windows 10 2004+; on older builds the
/// call is a no-op and the overlay falls back to being visible to capture.
#[cfg(windows)]
fn set_overlay_capture_exclusion(app: &AppHandle, exclude: bool) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowDisplayAffinity, WDA_EXCLUDEFROMCAPTURE, WDA_NONE,
    };
    if let Some(overlay) = app.get_webview_window("overlay") {
        if let Ok(hwnd) = overlay.hwnd() {
            let affinity = if exclude { WDA_EXCLUDEFROMCAPTURE } else { WDA_NONE };
            unsafe {
                SetWindowDisplayAffinity(hwnd.0 as _, affinity);
            }
        }
    }
}
#[cfg(not(windows))]
fn set_overlay_capture_exclusion(_app: &AppHandle, _exclude: bool) {}

/// Toggle the overlay's cursor-ignore state. Set with CSS-level pointer-events
/// is insufficient — the OS window itself must be click-through (WS_EX_TRANSPARENT)
/// for clicks to reach the desktop below.
fn set_overlay_ignore_cursor(app: &AppHandle, ignore: bool) {
    if let Some(overlay) = app.get_webview_window("overlay") {
        let _ = overlay.set_ignore_cursor_events(ignore);
    }
}

/// Start/stop/update the overlay passthrough region. While a HUD rect is set,
/// a background thread polls the OS cursor position and toggles the overlay's
/// ignore-cursor state so clicks reach the live desktop everywhere EXCEPT the
/// HUD area (where stop/cancel buttons live). Pass None to disable completely.
///
/// `rect` is in physical screen pixels (same coordinate space as GetCursorPos).
#[tauri::command]
pub fn set_overlay_passthrough(
    app: AppHandle,
    rect: Option<(i32, i32, i32, i32)>,
) -> AppResult<()> {
    match rect {
        None => {
            PASSTHROUGH_ACTIVE.store(false, Ordering::SeqCst);
            *PASSTHROUGH_HUD_RECT.lock().unwrap() = None;
            set_overlay_ignore_cursor(&app, false);
        }
        Some(r) => {
            *PASSTHROUGH_HUD_RECT.lock().unwrap() = Some(r);
            let was_active = PASSTHROUGH_ACTIVE.swap(true, Ordering::SeqCst);
            if !was_active {
                let app_clone = app.clone();
                std::thread::spawn(move || passthrough_poll_loop(app_clone));
            }
        }
    }
    Ok(())
}

#[cfg(windows)]
fn passthrough_poll_loop(app: AppHandle) {
    use windows_sys::Win32::Foundation::POINT;
    use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;

    let mut last_ignore: Option<bool> = None;
    while PASSTHROUGH_ACTIVE.load(Ordering::SeqCst) {
        let hud = *PASSTHROUGH_HUD_RECT.lock().unwrap();
        if let Some((hx, hy, hw, hh)) = hud {
            let mut p = POINT { x: 0, y: 0 };
            let ok = unsafe { GetCursorPos(&mut p) };
            if ok != 0 {
                let inside = p.x >= hx && p.x < hx + hw && p.y >= hy && p.y < hy + hh;
                let want_ignore = !inside;
                if last_ignore != Some(want_ignore) {
                    set_overlay_ignore_cursor(&app, want_ignore);
                    last_ignore = Some(want_ignore);
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(30));
    }
    set_overlay_ignore_cursor(&app, false);
}

#[cfg(not(windows))]
fn passthrough_poll_loop(_app: AppHandle) {}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoRecordingOptions {
    pub format: String,
    pub fps: u32,
    pub microphone: bool,
    pub microphone_device: String,
    pub system_audio: bool,
    pub system_audio_device: String,
    pub show_cursor: bool,
    pub click_highlight: bool,
    pub countdown_seconds: u32,
    pub max_duration_seconds: u32,
}

impl Default for VideoRecordingOptions {
    fn default() -> Self {
        Self {
            format: "mp4".into(),
            fps: 30,
            microphone: false,
            microphone_device: String::new(),
            system_audio: false,
            system_audio_device: String::new(),
            show_cursor: true,
            click_highlight: false,
            countdown_seconds: 3,
            max_duration_seconds: 0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AudioDevice {
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoRecordingResult {
    pub id: String,
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub duration_ms: u64,
    pub size_bytes: u64,
    pub format: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordingStatus {
    pub id: String,
    pub elapsed_ms: u64,
    pub bytes_written: u64,
    pub is_recording: bool,
}

struct RecordingSession {
    child: Child,
    temp_path: PathBuf,
    start_time: Instant,
    options: VideoRecordingOptions,
    physical_w: u32,
    physical_h: u32,
}

static SESSIONS: Lazy<Mutex<HashMap<String, RecordingSession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn next_recording_id() -> String {
    let n = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    format!("rec_{n}")
}

fn ffmpeg_path() -> AppResult<PathBuf> {
    // Tauri's `externalBin` ships ffmpeg as a sidecar. In bundled releases
    // it lands next to the app exe stripped of its target-triple suffix
    // (e.g. `ffmpeg.exe`). During `cargo tauri dev` it keeps the suffix
    // (e.g. `ffmpeg-x86_64-pc-windows-msvc.exe`). Probe both layouts plus
    // a few legacy locations so local dev without the sidecar still works.
    let exe_dir = std::env::current_exe()
        .map_err(|e| AppError::Capture(format!("exe path: {e}")))?
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    let ext = std::env::consts::EXE_SUFFIX;
    let triple = env!("HOST_TRIPLE_FALLBACK");
    let sidecar_name = format!("ffmpeg-{triple}{ext}");
    let stripped_name = format!("ffmpeg{ext}");

    let candidates = [
        exe_dir.join(&stripped_name),
        exe_dir.join(&sidecar_name),
        exe_dir.join("binaries").join(&sidecar_name),
        exe_dir.join("binaries").join(&stripped_name),
        exe_dir.join("bin").join(&stripped_name),
        PathBuf::from(&stripped_name),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return Ok(candidate.clone());
        }
    }

    Err(AppError::Capture(format!(
        "{stripped_name} sidecar not found. Expected next to the app executable (bundled) \
         or as {sidecar_name} during dev. Run `cargo tauri build`/`dev` so the sidecar \
         from ssnip-core/binaries/ gets copied."
    )))
}

fn file_extension(format: &str) -> &str {
    match format {
        "gif" => "gif",
        "webm" => "webm",
        _ => "mp4",
    }
}

fn video_codec_args(format: &str, fps: u32) -> Vec<String> {
    match format {
        "gif" => {
            let gif_fps = fps.min(30);
            vec![
                "-vf".into(),
                format!("fps={gif_fps},split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse"),
                "-c:v".into(),
                "gif".into(),
            ]
        }
        "webm" => vec![
            "-vf".into(),
            "crop=trunc(iw/2)*2:trunc(ih/2)*2".into(),
            "-c:v".into(),
            "libvpx-vp9".into(),
            "-b:v".into(),
            "0".into(),
            "-crf".into(),
            "24".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
        ],
        _ => vec![
            "-vf".into(),
            "crop=trunc(iw/2)*2:trunc(ih/2)*2".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "medium".into(),
            "-crf".into(),
            "18".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-movflags".into(),
            "+faststart".into(),
        ],
    }
}

#[tauri::command]
pub fn start_video_recording(
    app: AppHandle,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    options: VideoRecordingOptions,
) -> AppResult<String> {
    let id = next_recording_id();
    let ffmpeg = ffmpeg_path()?;

    let ext = file_extension(&options.format);
    let mut temp_dir = std::env::temp_dir();
    temp_dir.push("SynapseSnip");
    std::fs::create_dir_all(&temp_dir)?;
    temp_dir.push(format!("{id}.{ext}"));
    let temp_path = temp_dir;

    let temp_path_clone = temp_path.clone();

    // ffmpeg.exe ships without a DPI-aware manifest, so Windows DPI-virtualizes
    // every coordinate it sees. Passing physical pixels to gdigrab here makes
    // it capture a stretched/offset region (severe blur on high-DPI displays).
    // Convert the incoming physical rect to logical pixels using the primary
    // monitor's scale factor so gdigrab interprets the coordinates correctly.
    let scale = app
        .get_webview_window("main")
        .and_then(|w| w.primary_monitor().ok().flatten())
        .map(|m| m.scale_factor())
        .unwrap_or(1.0)
        .max(0.5);
    let lx = (x as f64 / scale).round() as i32;
    let ly = (y as f64 / scale).round() as i32;
    let lw = ((width as f64 / scale).round() as u32).max(2);
    let lh = ((height as f64 / scale).round() as u32).max(2);

    // libx264 / libvpx with yuv420p require even dimensions. Snap down to the
    // nearest even pair so gdigrab captures a stream the encoders can accept.
    let even_w = (lw & !1).max(2);
    let even_h = (lh & !1).max(2);
    // gdigrab accepts negative offsets for monitors left-of/above the primary
    // on a virtual desktop. Do NOT clamp to zero.
    let mut cmd = Command::new(&ffmpeg);
    cmd.arg("-y")
        // Real-time buffer size: prevents dropped frames at high FPS / large regions.
        .arg("-rtbufsize")
        .arg("100M")
        .arg("-f")
        .arg("gdigrab")
        .arg("-framerate")
        .arg(options.fps.to_string())
        .arg("-offset_x")
        .arg(lx.to_string())
        .arg("-offset_y")
        .arg(ly.to_string())
        .arg("-video_size")
        .arg(format!("{}x{}", even_w, even_h));

    if options.show_cursor {
        cmd.arg("-draw_mouse").arg("1");
    } else {
        cmd.arg("-draw_mouse").arg("0");
    }

    cmd.arg("-i").arg("desktop");

    // Count how many audio inputs we add so we can emit the correct stream
    // map below. Input 0 is always the gdigrab video. Each dshow audio input
    // gets the next free input index.
    let mut audio_input_indices: Vec<usize> = Vec::new();
    let mut next_input_index: usize = 1;

    if options.system_audio {
        let sys_dev = if options.system_audio_device.is_empty() {
            "Cable Input (VB-Audio Virtual Cable)"
        } else {
            &options.system_audio_device
        };
        cmd.arg("-f")
            .arg("dshow")
            .arg("-i")
            .arg(format!("audio={sys_dev}"));
        audio_input_indices.push(next_input_index);
        next_input_index += 1;
    }
    if options.microphone && !options.microphone_device.is_empty() {
        cmd.arg("-f")
            .arg("dshow")
            .arg("-i")
            .arg(format!("audio={}", options.microphone_device));
        audio_input_indices.push(next_input_index);
        next_input_index += 1;
    }
    let _ = next_input_index;

    if audio_input_indices.is_empty() {
        cmd.arg("-an");
    }

    let codec_args = video_codec_args(&options.format, options.fps);
    for arg in codec_args {
        cmd.arg(arg);
    }

    // Without an explicit map, ffmpeg auto-selects a single audio stream when
    // multiple dshow inputs are present, and when two inputs carry different
    // sample rates the muxer can abort mid-stream — the resulting temp file is
    // truncated, the rename into the user's save dir fails, and the video
    // "doesn't save". Mix both sources with amix and map them explicitly.
    match audio_input_indices.len() {
        1 => {
            cmd.arg("-map").arg("0:v");
            cmd.arg("-map").arg(format!("{}:a", audio_input_indices[0]));
        }
        2 => {
            let filter = format!(
                "[{}:a][{}:a]amix=inputs=2:duration=longest:dropout_transition=0[aout]",
                audio_input_indices[0], audio_input_indices[1]
            );
            cmd.arg("-filter_complex").arg(filter);
            cmd.arg("-map").arg("0:v");
            cmd.arg("-map").arg("[aout]");
        }
        _ => {}
    }

    if options.microphone || options.system_audio {
        cmd.arg("-ac").arg("2").arg("-ar").arg("44100");
    }

    // Max duration timeout
    if options.max_duration_seconds > 0 {
        cmd.arg("-t").arg(options.max_duration_seconds.to_string());
    }

    cmd.arg(temp_path.to_string_lossy().as_ref());
    cmd.stdout(Stdio::null())
        .stderr(Stdio::piped())
        .stdin(Stdio::piped());
    // Prevent a console window from flashing up on Windows when spawning
    // ffmpeg. 0x08000000 = CREATE_NO_WINDOW.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    // Exclude the overlay window from gdigrab capture BEFORE spawning ffmpeg,
    // so the very first frame already sees through to the live desktop.
    set_overlay_capture_exclusion(&app, true);

    let mut child = cmd
        .spawn()
        .map_err(|e| {
            set_overlay_capture_exclusion(&app, false);
            AppError::Capture(format!("failed to start ffmpeg: {e}"))
        })?;

    let stderr_reader = child.stderr.take();
    let app_stderr = app.clone();
    let id_stderr = id.clone();
    std::thread::spawn(move || {
        if let Some(stderr) = stderr_reader {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines().flatten() {
                // Only surface genuine fatal ffmpeg errors. Generic "error"
                // substring matches noisy benign log lines (e.g. "Error averages").
                let lower = line.to_ascii_lowercase();
                let is_fatal = lower.starts_with("error")
                    || lower.contains("error opening")
                    || lower.contains("could not")
                    || lower.contains("no such file")
                    || lower.contains("permission denied")
                    || lower.contains("invalid argument")
                    || lower.contains("unknown encoder");
                if is_fatal {
                    let _ = app_stderr.emit(
                        "recording-error",
                        serde_json::json!({ "id": id_stderr, "message": line }),
                    );
                }
            }
        }
    });

    let start_time = Instant::now();

    let app_clone = app.clone();
    let id_clone = id.clone();
    let temp_path_tick = temp_path_clone.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_millis(500));
        let sessions = SESSIONS.lock().unwrap();
        if !sessions.contains_key(&id_clone) {
            break;
        }
        drop(sessions);
        let elapsed = start_time.elapsed().as_millis() as u64;
        let bytes = std::fs::metadata(&temp_path_tick)
            .map(|m| m.len())
            .unwrap_or(0);
        let _ = app_clone.emit(
            "recording-tick",
            serde_json::json!({
                "id": id_clone,
                "elapsed_ms": elapsed,
                "bytes_written": bytes,
            }),
        );
    });

    SESSIONS.lock().unwrap().insert(
        id.clone(),
        RecordingSession {
            child,
            temp_path,
            start_time,
            options,
            physical_w: even_w,
            physical_h: even_h,
        },
    );

    Ok(id)
}

#[tauri::command]
pub fn stop_video_recording(app: AppHandle, id: String) -> AppResult<VideoRecordingResult> {
    let mut sessions = SESSIONS.lock().unwrap();
    let mut session = sessions
        .remove(&id)
        .ok_or_else(|| AppError::Capture("recording session not found".into()))?;
    drop(sessions);

    // Recording is ending — restore overlay visibility to subsequent captures
    // and stop the cursor-passthrough poller so the overlay becomes clickable again.
    set_overlay_capture_exclusion(&app, false);
    PASSTHROUGH_ACTIVE.store(false, Ordering::SeqCst);
    *PASSTHROUGH_HUD_RECT.lock().unwrap() = None;
    set_overlay_ignore_cursor(&app, false);

    if let Some(stdin) = session.child.stdin.take() {
        use std::io::Write;
        let mut s = stdin;
        let _ = s.write_all(b"q\n");
        let _ = s.flush();
        drop(s);
    }

    // ffmpeg needs time to flush the moov atom on long / large recordings.
    // If we kill it early the MP4 is missing its trailer and Windows Media
    // Player rejects it with 0xC00D36C4 (unsupported bytestream).
    let timeout = std::time::Duration::from_secs(30);
    let deadline = Instant::now() + timeout;
    loop {
        match session.child.try_wait() {
            Ok(Some(_)) => {
                break;
            }
            Ok(None) => {
                if Instant::now() > deadline {
                    let _ = session.child.kill();
                    let _ = session.child.wait();
                    break;
                }
                std::thread::sleep(std::time::Duration::from_millis(100));
            }
            Err(_) => {
                let _ = session.child.kill();
                break;
            }
        }
    }

    let duration_ms = session.start_time.elapsed().as_millis() as u64;
    let file_path = session.temp_path.clone();
    let size_bytes = std::fs::metadata(&file_path).map(|m| m.len()).unwrap_or(0);

    // ffmpeg failed to produce output (e.g. dshow device open error). Without
    // this guard we'd silently return the missing temp path as the "final"
    // save location — the frontend would think it succeeded while nothing
    // actually reached the user's save dir.
    if size_bytes == 0 {
        let _ = std::fs::remove_file(&file_path);
        return Err(AppError::Capture(
            "recording produced no output — check audio device selection and ffmpeg logs".into(),
        ));
    }

    let settings = crate::settings::read_settings(&app).unwrap_or_default();
    let save_dir = if settings.default_save_dir.is_empty() {
        dirs::picture_dir()
            .or_else(dirs::home_dir)
            .unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(&settings.default_save_dir)
    };

    // Videos should not inherit the screenshot template's "snip-" prefix.
    let base_template = if settings.filename_template.is_empty() {
        "recording-{yyyy}{MM}{dd}-{HH}{mm}{ss}".to_string()
    } else {
        settings.filename_template.clone()
    };
    let template = if base_template.starts_with("snip-") {
        format!("recording-{}", &base_template[5..])
    } else {
        base_template
    };

    let filename =
        crate::settings::format_filename(&template, file_extension(&session.options.format));
    let dest = save_dir.join(&filename);

    if let Some(parent) = dest.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let final_path = match std::fs::rename(&file_path, &dest) {
        Ok(_) => dest.to_string_lossy().to_string(),
        Err(_) => {
            // Cross-device rename fallback: copy then delete
            if std::fs::copy(&file_path, &dest).is_ok() {
                let _ = std::fs::remove_file(&file_path);
                dest.to_string_lossy().to_string()
            } else {
                file_path.to_string_lossy().to_string()
            }
        }
    };

    let result = VideoRecordingResult {
        id: id.clone(),
        path: final_path,
        width: session.physical_w,
        height: session.physical_h,
        duration_ms,
        size_bytes,
        format: session.options.format.clone(),
    };

    let _ = app.emit("recording-stopped", &result);

    Ok(result)
}

const VIDEO_NOTIFICATION_W: f64 = 420.0;
const VIDEO_NOTIFICATION_H: f64 = 260.0;

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

#[tauri::command]
pub async fn show_video_notification(app: AppHandle, path: String, format: String, width: u32, height: u32, duration_ms: u64, size_bytes: u64) -> AppResult<()> {
    let (mx, my, mw, mh) = primary_workarea(&app);
    let pad: f64 = 24.0;
    let x = mx + mw - VIDEO_NOTIFICATION_W - pad;
    let y = my + mh - VIDEO_NOTIFICATION_H - pad;

    let label = "vidnotif0";
    let url = format!(
        "index.html#video-notification?path={}&format={}&width={}&height={}&duration_ms={}&size_bytes={}",
        urlencoding::encode(&path),
        format,
        width,
        height,
        duration_ms,
        size_bytes
    );

    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_position(LogicalPosition { x, y });
        let _ = win.emit("video-notif-reload", ());
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(&app, label, WebviewUrl::App(url.into()))
        .title("SynapseSnip - Video")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .inner_size(VIDEO_NOTIFICATION_W, VIDEO_NOTIFICATION_H)
        .position(x, y)
        .focused(true)
        .build()
        .map_err(|e| AppError::Capture(e.to_string()))?;
    let _ = win.show();
    let _ = win.set_focus();
    Ok(())
}

#[tauri::command]
pub fn cancel_video_recording(app: AppHandle, id: String) -> AppResult<()> {
    set_overlay_capture_exclusion(&app, false);
    PASSTHROUGH_ACTIVE.store(false, Ordering::SeqCst);
    *PASSTHROUGH_HUD_RECT.lock().unwrap() = None;
    set_overlay_ignore_cursor(&app, false);
    let mut sessions = SESSIONS.lock().unwrap();
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
        let _ = session.child.wait();
        let temp = session.temp_path.clone();
        drop(sessions);
        let _ = std::fs::remove_file(temp);
        let _ = app.emit(
            "recording-error",
            serde_json::json!({ "id": id, "message": "cancelled" }),
        );
    }
    Ok(())
}

#[tauri::command]
pub fn get_recording_status(id: String) -> AppResult<RecordingStatus> {
    let sessions = SESSIONS.lock().unwrap();
    let session = sessions
        .get(&id)
        .ok_or_else(|| AppError::Capture("recording session not found".into()))?;
    let elapsed_ms = session.start_time.elapsed().as_millis() as u64;
    let bytes_written = std::fs::metadata(&session.temp_path)
        .map(|m| m.len())
        .unwrap_or(0);
    Ok(RecordingStatus {
        id: id.clone(),
        elapsed_ms,
        bytes_written,
        is_recording: true,
    })
}

#[tauri::command]
pub fn reveal_path_in_folder(path: String) -> AppResult<()> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(AppError::Capture(format!("file not found: {path}")));
    }
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| AppError::Capture(format!("explorer: {e}")))?;
    }
    Ok(())
}

#[tauri::command]
pub fn enumerate_audio_devices() -> AppResult<Vec<AudioDevice>> {
    let ffmpeg = match ffmpeg_path() {
        Ok(p) => p,
        Err(_) => return Ok(vec![]),
    };

    let output = Command::new(&ffmpeg)
        .args(["-list_devices", "true", "-f", "dshow", "-i", "dummy"])
        .stderr(Stdio::piped())
        .stdout(Stdio::null())
        .output()
        .map_err(|e| AppError::Capture(format!("ffmpeg enumerate: {e}")))?;

    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut devices = Vec::new();
    let mut current_kind = String::new();

    for line in stderr.lines() {
        if line.contains("DirectShow video devices") {
            current_kind = "video".into();
        } else if line.contains("DirectShow audio devices") {
            current_kind = "audio".into();
        } else if line.contains("\"") && !current_kind.is_empty() {
            if let Some(name) = line.split('"').nth(1) {
                devices.push(AudioDevice {
                    name: name.into(),
                    kind: current_kind.clone(),
                });
            }
        }
    }

    let audio: Vec<AudioDevice> = devices.into_iter().filter(|d| d.kind == "audio").collect();
    Ok(audio)
}

pub fn cleanup_all_recordings() {
    if let Ok(mut sessions) = SESSIONS.lock() {
        let ids: Vec<String> = sessions.keys().cloned().collect();
        for id in ids {
            if let Some(mut session) = sessions.remove(&id) {
                let _ = session.child.kill();
                let _ = session.child.wait();
                let _ = std::fs::remove_file(&session.temp_path);
            }
        }
    }
}
