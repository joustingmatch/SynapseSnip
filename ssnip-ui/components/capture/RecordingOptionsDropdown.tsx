import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../../store/appStore";
import { enumerateAudioDevices } from "../../hooks/useCapture";
import type { AudioDevice } from "../../types";

interface RecordingOptionsDropdownProps {
  onClose: () => void;
}

export function RecordingOptionsDropdown({ onClose }: RecordingOptionsDropdownProps) {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const ref = useRef<HTMLDivElement>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [devicesLoaded, setDevicesLoaded] = useState(false);

  useEffect(() => {
    if (!devicesLoaded) {
      enumerateAudioDevices()
        .then((devices) => setAudioDevices(devices))
        .catch(() => setAudioDevices([]))
        .finally(() => setDevicesLoaded(true));
    }
  }, [devicesLoaded]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  if (!settings) return null;

  const micDevices = audioDevices;
  const sysDevices = audioDevices;

  const selectStyle: React.CSSProperties = {
    background: "var(--surface-default)",
    color: "var(--text-primary)",
    border: "1px solid var(--border-default)",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 11,
    fontFamily: "var(--font-mono)",
    maxWidth: 140,
  };

  return (
    <div
      ref={ref}
      style={{
        marginTop: 8,
        padding: 12,
        borderRadius: 4,
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        fontFamily: "var(--font-mono)",
      }}
    >
      <Row label="Format">
        <select
          value={settings.recording_format}
          onChange={(e) => updateSettings({ recording_format: e.target.value as "mp4" | "gif" | "webm" })}
          style={selectStyle}
        >
          <option value="mp4">MP4 (H.264)</option>
          <option value="webm">WebM (VP9)</option>
          <option value="gif">GIF</option>
        </select>
      </Row>

      <Row label="FPS">
        <select
          value={String(settings.recording_fps)}
          onChange={(e) => updateSettings({ recording_fps: Number(e.target.value) })}
          style={selectStyle}
        >
          <option value="15">15</option>
          <option value="30">30</option>
          <option value="60">60</option>
        </select>
      </Row>

      <Row label="Cursor">
        <input
          type="checkbox"
          checked={settings.recording_show_cursor}
          onChange={(e) => updateSettings({ recording_show_cursor: e.target.checked })}
          className="toggle"
        />
      </Row>

      <Row label="Mic">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            type="checkbox"
            checked={settings.recording_microphone}
            onChange={(e) => updateSettings({ recording_microphone: e.target.checked })}
            className="toggle"
          />
          {settings.recording_microphone && devicesLoaded && (
            <select
              value={settings.recording_microphone_device}
              onChange={(e) => updateSettings({ recording_microphone_device: e.target.value })}
              style={{ ...selectStyle, fontSize: 10, maxWidth: 160 }}
            >
              <option value="">Default</option>
              {micDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </Row>

      <Row label="System audio">
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <input
            type="checkbox"
            checked={settings.recording_system_audio}
            onChange={(e) => updateSettings({ recording_system_audio: e.target.checked })}
            className="toggle"
          />
          {settings.recording_system_audio && devicesLoaded && (
            <select
              value={settings.recording_system_audio_device}
              onChange={(e) => updateSettings({ recording_system_audio_device: e.target.value })}
              style={{ ...selectStyle, fontSize: 10, maxWidth: 160 }}
            >
              <option value="">VB-Audio Cable (default)</option>
              {sysDevices.map((d) => (
                <option key={d.name} value={d.name}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </Row>

      <Row label="Countdown">
        <select
          value={String(settings.recording_countdown_seconds)}
          onChange={(e) => updateSettings({ recording_countdown_seconds: Number(e.target.value) })}
          style={selectStyle}
        >
          <option value="0">None</option>
          <option value="3">3s</option>
          <option value="5">5s</option>
        </select>
      </Row>

      <Row label="Max duration">
        <select
          value={String(settings.recording_max_duration_seconds)}
          onChange={(e) => updateSettings({ recording_max_duration_seconds: Number(e.target.value) })}
          style={selectStyle}
        >
          <option value="0">No limit</option>
          <option value="30">30s</option>
          <option value="60">1 min</option>
          <option value="300">5 min</option>
          <option value="600">10 min</option>
        </select>
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}