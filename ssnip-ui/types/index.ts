export type CaptureMode =
  | "rect"
  | "fullscreen"
  | "window"
  | "active_window"
  | "monitor";

export type HotkeyAction =
  | "hotkey_rect"
  | "hotkey_fullscreen"
  | "hotkey_window"
  | "hotkey_active_window"
  | "hotkey_toggle_app";

export type ToolKind =
  | "cursor"
  | "pen"
  | "highlighter"
  | "text"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "eraser"
  | "blur"
  | "crop";

export interface CaptureResult {
  id: string;
  width: number;
  height: number;
}

export interface CaptureEvent {
  id: string;
  width: number;
  height: number;
}

export interface PendingInfo {
  origin_x: number;
  origin_y: number;
  width: number;
  height: number;
  scale: number;
}

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TextFontFamily = "sans" | "serif" | "mono";
export type TextAlign = "left" | "center" | "right";
export type TextBackground = "none" | "soft" | "solid";
export type ImageFormat = "png" | "jpg" | "bmp";

export interface TextAnnotationStyle {
  fontFamily: TextFontFamily;
  fontSize: number;
  fontWeight: 500 | 600 | 700 | 800;
  lineHeight: number;
  letterSpacing: number;
  align: TextAlign;
  background: TextBackground;
  uppercase: boolean;
}

export interface Settings {
  default_save_dir: string;
  default_mode: CaptureMode;
  theme:
    | "light"
    | "dark"
    | "slate"
    | "midnight"
    | "ember"
    | "forest"
    | "rose"
    | "gold"
    | "ocean"
    | "mint"
    | "purple"
    | "nord"
    | "dracula"
    | "gruvbox"
    | "solarized"
    | "sepia"
    | "contrast";
  delay_seconds: number;
  auto_copy: boolean;
  auto_save: boolean;
  filename_template: string;
  show_notification: boolean;
  notification_timer_seconds: number;
  close_to_tray: boolean;
  start_minimized: boolean;
  default_format: ImageFormat;
  pen_color: string;
  pen_thickness: number;
  hotkey_rect: string;
  hotkey_fullscreen: string;
  hotkey_window: string;
  hotkey_active_window: string;
  hotkey_toggle_app: string;
  rect_require_enter: boolean;
  recording_format: VideoFormat;
  recording_fps: number;
  recording_microphone: boolean;
  recording_microphone_device: string;
  recording_system_audio: boolean;
  recording_show_cursor: boolean;
  recording_click_highlight: boolean;
  recording_countdown_seconds: number;
  recording_max_duration_seconds: number;
  recording_system_audio_device: string;
}

export type VideoFormat = "mp4" | "gif" | "webm";

export interface VideoRecordingOptions {
  format: VideoFormat;
  fps: number;
  microphone: boolean;
  microphone_device: string;
  system_audio: boolean;
  system_audio_device: string;
  show_cursor: boolean;
  click_highlight: boolean;
  countdown_seconds: number;
  max_duration_seconds: number;
}

export interface VideoRecordingResult {
  id: string;
  path: string;
  width: number;
  height: number;
  duration_ms: number;
  size_bytes: number;
  format: string;
}

export interface RecordingStatus {
  id: string;
  elapsed_ms: number;
  bytes_written: number;
  is_recording: boolean;
}

export interface RecordingTickEvent {
  id: string;
  elapsed_ms: number;
  bytes_written: number;
}

export interface RecordingStoppedEvent {
  id: string;
  path: string;
  width: number;
  height: number;
  duration_ms: number;
  size_bytes: number;
  format: string;
}

export interface RecordingErrorEvent {
  id: string;
  message: string;
}

export interface AudioDevice {
  name: string;
  kind: string;
}

export interface MonitorInfo {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
  is_primary: boolean;
}

export interface Annotation {
  id: string;
  tool: ToolKind;
  color: string;
  thickness: number;
  points: { x: number; y: number }[];
  text?: string;
  textStyle?: TextAnnotationStyle;
  rect?: Region;
}

export interface Snip {
  id: string;
  capture: CaptureResult;
  createdAt: number;
}
