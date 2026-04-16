import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { CaptureEvent, CaptureMode, CaptureResult, MonitorInfo, PendingInfo, VideoRecordingOptions, VideoRecordingResult, RecordingStatus, AudioDevice } from "../types";

export async function captureFullscreen(): Promise<CaptureResult> {
  return invoke<CaptureResult>("capture_fullscreen");
}

export async function captureRegion(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<CaptureResult> {
  return invoke<CaptureResult>("capture_region", { x, y, width, height });
}

export async function listMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("list_monitors");
}

export async function saveImage(
  id: string,
  path: string,
  format: string
): Promise<string> {
  return invoke<string>("save_image", { id, path, format });
}

export async function copyImageToClipboard(id: string): Promise<void> {
  return invoke("copy_image_to_clipboard", { id });
}

export async function copyPngBytesToClipboard(bytes: Uint8Array): Promise<void> {
  return invoke("copy_png_bytes_to_clipboard", { bytes: Array.from(bytes) });
}

export async function beginCapture(mode: CaptureMode): Promise<void> {
  return invoke("begin_capture", { mode });
}

export async function getPendingCapture(): Promise<PendingInfo> {
  return invoke<PendingInfo>("get_pending_capture");
}

export async function finalizeCapture(
  x: number,
  y: number,
  width: number,
  height: number
): Promise<CaptureEvent> {
  return invoke<CaptureEvent>("finalize_capture", { x, y, width, height });
}

export async function cancelCapture(): Promise<void> {
  return invoke("cancel_capture");
}

export async function getSnip(id: string): Promise<CaptureResult> {
  return invoke<CaptureResult>("get_snip", { id });
}

export async function getSnipPngBytes(id: string): Promise<Uint8Array> {
  const bytes = await invoke<number[]>("get_snip_png_bytes", { id });
  return new Uint8Array(bytes);
}

export async function discardSnip(id: string): Promise<void> {
  return invoke("discard_snip", { id });
}

export async function forceDiscard(id: string): Promise<void> {
  return invoke("force_discard", { id });
}

export async function attachSnip(id: string): Promise<void> {
  return invoke("attach_snip", { id });
}

export async function retainSnip(id: string, key: string): Promise<void> {
  return invoke("retain_snip", { id, key });
}

export async function releaseSnipRef(key: string): Promise<void> {
  return invoke("release_snip_ref", { key });
}

export async function storeSnipBytes(bytes: Uint8Array): Promise<string> {
  return invoke<string>("store_snip_bytes", { bytes: Array.from(bytes) });
}

export async function showSnipNotification(id: string): Promise<void> {
  return invoke("show_snip_notification", { id });
}

export async function showSnipEditor(id: string): Promise<void> {
  return invoke("show_snip_editor", { id });
}

export async function showFloatingImage(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number
): Promise<string> {
  return invoke<string>("show_floating_image", { id, x, y, width, height });
}

export async function moveWindowTo(label: string, x: number, y: number): Promise<void> {
  return invoke("move_window_to", { label, x, y });
}

export async function exportSnipToTemp(id: string): Promise<string> {
  return invoke<string>("export_snip_to_temp", { id });
}

export async function closeSelfWindow(): Promise<void> {
  return invoke("close_self_window");
}

export async function releaseNotificationWindow(): Promise<void> {
  return invoke("release_notification_window");
}

export async function debugSnipCount(): Promise<number> {
  return invoke<number>("debug_snip_count");
}

export function getSnipSrc(id: string): string {
  return convertFileSrc(id, "snip");
}

export function getPendingSrc(id = "current"): string {
  return convertFileSrc(id, "pending");
}

export async function startVideoRecording(
  x: number,
  y: number,
  width: number,
  height: number,
  options: VideoRecordingOptions
): Promise<string> {
  return invoke<string>("start_video_recording", { x, y, width, height, options });
}

export async function stopVideoRecording(id: string): Promise<VideoRecordingResult> {
  return invoke<VideoRecordingResult>("stop_video_recording", { id });
}

export async function cancelVideoRecording(id: string): Promise<void> {
  return invoke("cancel_video_recording", { id });
}

export async function getRecordingStatus(id: string): Promise<RecordingStatus> {
  return invoke<RecordingStatus>("get_recording_status", { id });
}

export async function enumerateAudioDevices(): Promise<AudioDevice[]> {
  return invoke<AudioDevice[]>("enumerate_audio_devices");
}

export async function setOverlayPassthrough(
  rect: [number, number, number, number] | null
): Promise<void> {
  return invoke("set_overlay_passthrough", { rect });
}

export async function markOverlayReady(): Promise<void> {
  return invoke("mark_overlay_ready");
}
