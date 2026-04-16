import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { DelayTimer } from "./components/DelayTimer";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import {
  beginCapture,
  copyImageToClipboard,
  saveImage,
  showSnipNotification,
} from "./hooks/useCapture";
import { SynapseLogo } from "./components/SynapseLogo";
import { useAppStore } from "./store/appStore";
import type { CaptureEvent, CaptureMode, Settings, VideoRecordingResult } from "./types";
import { DEFAULT_SETTINGS } from "./utils/defaultSettings";
import { formatFilename } from "./utils/filename";
import { applyTheme } from "./utils/theme";

const CAPTURE_MODES: { id: CaptureMode; label: string; description: string; icon: JSX.Element }[] = [
  {
    id: "rect",
    label: "Area",
    description: "Select a region",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="16" height="16" rx="2"/>
        <path d="M4 9h16M9 4v16"/>
      </svg>
    ),
  },
  {
    id: "fullscreen",
    label: "Full",
    description: "Entire screen",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>
      </svg>
    ),
  },
  {
    id: "window",
    label: "Window",
    description: "Single window",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <path d="M3 9h18"/>
      </svg>
    ),
  },
  {
    id: "active_window",
    label: "Active",
    description: "Focused window",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="5" width="16" height="14" rx="2"/>
        <path d="M9 3h6M12 8v8"/>
      </svg>
    ),
  },
  {
    id: "monitor",
    label: "Screen",
    description: "Full monitor",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="12" rx="2"/>
        <path d="M8 20h8M12 16v4"/>
      </svg>
    ),
  },
];

function joinPath(dir: string, name: string): string {
  const trimmed = dir.replace(/[\\/]+$/, "");
  if (!trimmed) return name;
  const sep = trimmed.includes("\\") ? "\\" : "/";
  return `${trimmed}${sep}${name}`;
}

export default function App() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const countdown = useAppStore((s) => s.countdown);
  const setCountdown = useAppStore((s) => s.setCountdown);
  const showSettings = useAppStore((s) => s.showSettings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const [updateBannerVersion, setUpdateBannerVersion] = useState<string | null>(null);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    invoke<Settings>("load_settings")
      .then((loaded) => {
        if (!alive) return;
        setSettings(loaded);
        setMode(loaded.default_mode);
        applyTheme(loaded.theme);
        requestAnimationFrame(() => setIsLoaded(true));
      })
      .catch(() => {
        if (!alive) return;
        setSettings(DEFAULT_SETTINGS);
        setMode(DEFAULT_SETTINGS.default_mode);
        applyTheme(DEFAULT_SETTINGS.theme);
        requestAnimationFrame(() => setIsLoaded(true));
      });

    return () => {
      alive = false;
    };
  }, [setMode, setSettings]);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdate = async () => {
      try {
        const dismissedKey = "synapsesnip:dismissedRemoteUpdateVersion";
        const dismissedVersion = localStorage.getItem(dismissedKey);
        const update = await check();

        if (!update) {
          return;
        }

        if (!cancelled && dismissedVersion !== update.version) {
          setAvailableUpdate(update);
          setUpdateBannerVersion(update.version);
        }
      } catch (error) {
        console.error("Failed to check for updates", error);
      }
    };

    void checkForUpdate();

    return () => {
      cancelled = true;
    };
  }, []);

  const dismissUpdateBanner = useCallback(() => {
    if (!updateBannerVersion) return;
    localStorage.setItem("synapsesnip:dismissedRemoteUpdateVersion", updateBannerVersion);
    setAvailableUpdate(null);
    setUpdateBannerVersion(null);
  }, [updateBannerVersion]);

  const installUpdate = useCallback(async () => {
    if (!availableUpdate || isInstallingUpdate) return;

    setIsInstallingUpdate(true);
    setUpdateError(null);

    try {
      await availableUpdate.downloadAndInstall();
      localStorage.setItem("synapsesnip:dismissedRemoteUpdateVersion", availableUpdate.version);
      setAvailableUpdate(null);
      setUpdateBannerVersion(null);
    } catch (error) {
      console.error("Failed to install update", error);
      setUpdateError("Install failed. Try again.");
    } finally {
      setIsInstallingUpdate(false);
    }
  }, [availableUpdate, isInstallingUpdate]);

  const startCapture = useCallback(
    async (targetMode?: CaptureMode) => {
      const nextMode = targetMode ?? mode;
      if (settings && settings.delay_seconds > 0) {
        setCountdown(settings.delay_seconds);
        await new Promise((resolve) => setTimeout(resolve, settings.delay_seconds * 1000));
        setCountdown(0);
      }
      try {
        await beginCapture(nextMode);
      } catch (error) {
        console.error(error);
      }
    },
    [mode, settings, setCountdown]
  );

  useEffect(() => {
    const unHotkey = listen<string>("hotkey-triggered", (event) => {
      if (event.payload === "toggle_app") return;
      void startCapture(event.payload as CaptureMode);
    });
    const unTray = listen<string>("tray-capture", (event) => {
      void startCapture(event.payload as CaptureMode);
    });
    return () => {
      unHotkey.then((cleanup) => cleanup());
      unTray.then((cleanup) => cleanup());
    };
  }, [startCapture]);

  useEffect(() => {
    const unlisten = listen("open-settings", () => {
      setShowSettings(true);
    });
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, [setShowSettings]);

  useEffect(() => {
    const unlisten = listen<CaptureEvent>("capture-done", async (event) => {
      const current = settings;
      if (!current) return;

      if (current.auto_copy) {
        try {
          await copyImageToClipboard(event.payload.id);
        } catch (error) {
          console.error("capture-done auto-copy failed", error);
        }
      }

      if (current.auto_save && current.default_save_dir) {
        try {
          const ext = current.default_format || "png";
          const template = current.filename_template || "snip-{yyyy}{MM}{dd}-{HH}{mm}{ss}";
          const filename = formatFilename(template, ext);
          const fullPath = joinPath(current.default_save_dir, filename);
          await saveImage(event.payload.id, fullPath, ext);
        } catch (error) {
          console.error("capture-done auto-save failed", error);
        }
      }

      if (current.show_notification) {
        try {
          await showSnipNotification(event.payload.id);
        } catch (error) {
          console.error("capture-done notification failed", error);
        }
      }
    });
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, [settings]);

  useEffect(() => {
    const unlisten = listen<VideoRecordingResult>("recording-stopped", async (event) => {
      const current = settings;
      if (!current) return;
      const r = event.payload;

      if (current.auto_copy) {
        try {
          await navigator.clipboard.writeText(r.path);
        } catch (error) {
          console.error("recording-stopped auto-copy path failed", error);
        }
      }

      if (current.show_notification) {
        try {
          await invoke("show_video_notification", {
            path: r.path,
            format: r.format,
            width: r.width,
            height: r.height,
            durationMs: r.duration_ms,
            sizeBytes: r.size_bytes,
          });
        } catch (error) {
          console.error("recording-stopped notification failed", error);
        }
      }
    });
    return () => {
      unlisten.then((cleanup) => cleanup());
    };
  }, [settings]);

  if (!settings) return null;

  return (
    <div 
      className={`min-h-screen flex flex-col transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ 
        background: 'var(--bg-primary)',
        fontFamily: 'var(--font-mono)'
      }}
    >
      <TitleBar onOpenSettings={() => setShowSettings(true)} />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Logo */}
        <div
          style={{
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0)' : 'translateY(-12px)',
            transition: 'opacity 500ms var(--ease-out-expo), transform 500ms var(--ease-out-expo)',
            transitionDelay: '50ms',
            marginBottom: '32px',
          }}
        >
          <SynapseLogo />
        </div>

        {/* Mode Selector */}
        <div 
          className="w-full max-w-[400px]"
          style={{
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 400ms var(--ease-out-expo), transform 400ms var(--ease-out-expo)',
            transitionDelay: '100ms'
          }}
        >
          {updateBannerVersion && (
            <div
              className="mb-4 rounded-md px-3 py-2"
              style={{
                background: "var(--surface-active)",
                border: "1px solid var(--border-strong)",
              }}
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div
                    className="text-xs font-medium uppercase tracking-wide"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Update Available
                  </div>
                  <div
                    className="text-xs mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    SynapseSnip v{updateBannerVersion} is ready to install.
                  </div>
                  {updateError && (
                    <div className="text-xs mt-1" style={{ color: "var(--error)" }}>
                      {updateError}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void installUpdate()}
                    className="text-xs"
                    style={{ color: "var(--text-primary)" }}
                    aria-label="Install available update"
                    disabled={isInstallingUpdate}
                  >
                    {isInstallingUpdate ? "Installing..." : "Install"}
                  </button>
                  <button
                    type="button"
                    onClick={dismissUpdateBanner}
                    className="text-xs"
                    style={{ color: "var(--text-muted)" }}
                    aria-label="Dismiss update notice"
                    disabled={isInstallingUpdate}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <span 
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--text-tertiary)' }}
            >
              Capture Mode
            </span>
            <span 
              className="text-xs transition-opacity duration-200"
              style={{ 
                color: 'var(--text-muted)',
                opacity: isLoaded ? 1 : 0,
                transitionDelay: '200ms'
              }}
            >
              {CAPTURE_MODES.find(m => m.id === mode)?.description}
            </span>
          </div>
          
          <div className="grid grid-cols-5 gap-2">
            {CAPTURE_MODES.map((captureMode, index) => (
              <button
                key={captureMode.id}
                type="button"
                onClick={() => setMode(captureMode.id)}
                data-active={mode === captureMode.id}
                className={`
                  group flex flex-col items-center gap-2 p-3 rounded transition-all duration-200
                  ${mode === captureMode.id
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }
                `}
                style={{
                  background: mode === captureMode.id ? 'var(--surface-active)' : 'var(--surface-default)',
                  border: mode === captureMode.id ? '1px solid var(--border-strong)' : '1px solid var(--border-subtle)',
                  opacity: isLoaded ? 1 : 0,
                  transform: isLoaded ? 'translateY(0)' : 'translateY(8px)',
                  transition: `opacity 300ms var(--ease-out-expo), transform 300ms var(--ease-out-expo), background-color 150ms var(--ease-out-quart), border-color 150ms var(--ease-out-quart)`,
                  transitionDelay: isLoaded ? `${100 + index * 50}ms` : '0ms',
                }}
              >
                <div 
                  className={`
                    transition-transform duration-200
                    ${mode === captureMode.id ? 'scale-110' : 'group-hover:scale-105'}
                  `}
                >
                  {captureMode.icon}
                </div>
                <span 
                  className="text-[10px] font-medium uppercase tracking-wide"
                  style={{ lineHeight: 1 }}
                >
                  {captureMode.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div 
          className="w-full max-w-[400px] my-8"
          style={{ 
            height: '1px', 
            background: 'var(--border-subtle)',
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'opacity 300ms var(--ease-out-quart), transform 400ms var(--ease-out-expo)',
            transitionDelay: '300ms',
            transformOrigin: 'center',
          }}
        />

        {/* Primary Action */}
        <div 
          className="w-full max-w-[400px]"
          style={{
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0)' : 'translateY(12px)',
            transition: 'opacity 400ms var(--ease-out-expo), transform 400ms var(--ease-out-expo)',
            transitionDelay: '400ms'
          }}
        >
          <button
            type="button"
            onClick={() => void startCapture()}
            className="btn-primary w-full"
            style={{ height: '44px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Capture
          </button>
          
          <div 
            className="flex items-center justify-center gap-4 mt-4"
            style={{
              opacity: isLoaded ? 1 : 0,
              transition: 'opacity 300ms var(--ease-out-quart)',
              transitionDelay: '500ms'
            }}
          >
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Press <kbd>Enter</kbd> to capture
            </span>
            <span style={{ color: 'var(--border-default)' }}>|</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              <kbd>Esc</kbd> for settings
            </span>
          </div>
        </div>
      </main>

      {countdown > 0 && <DelayTimer onDone={() => setCountdown(0)} />}
      {showSettings && <SettingsPanel />}
    </div>
  );
}
