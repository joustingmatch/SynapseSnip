import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { DelayTimer } from "./components/DelayTimer";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { UpdateModal } from "./components/UpdateModal";
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

  const dismissUpdate = useCallback(() => {
    if (!availableUpdate) return;
    localStorage.setItem("synapsesnip:dismissedRemoteUpdateVersion", availableUpdate.version);
    setAvailableUpdate(null);
  }, [availableUpdate]);

  const installUpdate = useCallback(async () => {
    if (!availableUpdate || isInstallingUpdate) return;

    setIsInstallingUpdate(true);
    setUpdateError(null);

    try {
      await availableUpdate.downloadAndInstall();
      localStorage.setItem("synapsesnip:dismissedRemoteUpdateVersion", availableUpdate.version);
      setAvailableUpdate(null);
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
      className={`min-h-screen flex flex-col transition-opacity duration-500 relative overflow-hidden ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
      style={{ 
        background: 'var(--bg-primary)',
        fontFamily: 'var(--font-mono)'
      }}
    >
      {/* Ambient background orbs */}
      <div 
        className="ambient-orb ambient-orb-1"
        style={{ opacity: isLoaded ? 0.35 : 0, transition: 'opacity 1s ease-out' }}
      />
      <div 
        className="ambient-orb ambient-orb-2"
        style={{ opacity: isLoaded ? 0.25 : 0, transition: 'opacity 1s ease-out 200ms' }}
      />
      
      {/* Subtle grid pattern overlay */}
      <div 
        className="absolute inset-0 bg-grid pointer-events-none"
        style={{ opacity: 0.4 }}
      />
      
      {/* Noise texture overlay */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          opacity: 0.025,
        }}
      />

      <TitleBar onOpenSettings={() => setShowSettings(true)} />

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 relative z-10">
        {/* Logo */}
        <div
          style={{
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0) scale(1)' : 'translateY(-16px) scale(0.96)',
            transition: 'opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)',
            transitionDelay: '100ms',
            marginBottom: '40px',
          }}
        >
          <SynapseLogo />
        </div>

        {/* Mode Selector */}
        <div 
          className="w-full max-w-[420px]"
          style={{
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transitionDelay: '200ms'
          }}
        >
          <div className="flex items-center justify-between mb-4">
            <span 
              className="text-[11px] font-medium uppercase tracking-[0.12em]"
              style={{ 
                color: 'var(--text-tertiary)',
                fontWeight: 500,
              }}
            >
              Capture Mode
            </span>
            <span 
              className="text-[11px] transition-all duration-300"
              style={{ 
                color: 'var(--text-muted)',
                opacity: isLoaded ? 1 : 0,
                transform: isLoaded ? 'translateX(0)' : 'translateX(8px)',
                transitionDelay: '400ms',
                letterSpacing: '0.02em',
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
                  group flex flex-col items-center gap-2.5 p-3 rounded-md transition-all duration-200
                  ${mode === captureMode.id
                    ? "text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }
                `}
                style={{
                  background: mode === captureMode.id ? 'var(--surface-active)' : 'var(--surface-default)',
                  border: mode === captureMode.id 
                    ? '1px solid var(--accent)' 
                    : '1px solid var(--border-subtle)',
                  opacity: isLoaded ? 1 : 0,
                  transform: isLoaded ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.95)',
                  transition: `opacity 400ms cubic-bezier(0.16, 1, 0.3, 1), transform 400ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms var(--ease-out-quart), border-color 200ms var(--ease-out-quart), box-shadow 200ms var(--ease-out-quart)`,
                  transitionDelay: isLoaded ? `${150 + index * 60}ms` : '0ms',
                  boxShadow: mode === captureMode.id 
                    ? '0 0 0 1px var(--accent-subtle), 0 4px 12px rgba(0, 0, 0, 0.15)' 
                    : '0 2px 4px rgba(0, 0, 0, 0.05)',
                }}
              >
                <div 
                  className={`
                    transition-all duration-200
                    ${mode === captureMode.id ? 'scale-110' : 'group-hover:scale-105'}
                  `}
                  style={{
                    color: mode === captureMode.id ? 'var(--accent)' : 'currentColor',
                    filter: mode === captureMode.id ? 'drop-shadow(0 0 4px var(--accent-subtle))' : 'none',
                  }}
                >
                  {captureMode.icon}
                </div>
                <span 
                  className="text-[10px] font-medium uppercase tracking-[0.08em]"
                  style={{ 
                    lineHeight: 1,
                    fontWeight: mode === captureMode.id ? 500 : 400,
                  }}
                >
                  {captureMode.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div 
          className="w-full max-w-[420px] my-10"
          style={{ 
            height: '1px',
            background: 'linear-gradient(90deg, transparent 0%, var(--border-default) 20%, var(--border-default) 80%, transparent 100%)',
            opacity: isLoaded ? 0.6 : 0,
            transform: isLoaded ? 'scaleX(1)' : 'scaleX(0)',
            transition: 'opacity 400ms var(--ease-out-quart), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transitionDelay: '450ms',
            transformOrigin: 'center',
          }}
        />

        {/* Primary Action */}
        <div 
          className="w-full max-w-[420px]"
          style={{
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)',
            transitionDelay: '550ms'
          }}
        >
          <button
            type="button"
            onClick={() => void startCapture()}
            className="group w-full relative overflow-hidden"
            style={{ 
              height: '48px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              padding: '0 24px',
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-base)',
              fontWeight: 500,
              lineHeight: 1,
              color: 'var(--text-primary)',
              background: 'var(--surface-active)',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
              transition: 'all 200ms var(--ease-out-quart)',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-pressed)';
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.2), 0 0 0 1px var(--accent-subtle), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--surface-active)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05)';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.98)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {/* Shimmer effect on hover */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.03) 50%, transparent 100%)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 2s infinite',
              }}
            />
            <svg 
              width="16" 
              height="16" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="1.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="relative z-10 group-hover:scale-110 transition-transform duration-200"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            <span className="relative z-10">Capture</span>
          </button>
          
          <div 
            className="flex items-center justify-center gap-6 mt-5"
            style={{
              opacity: isLoaded ? 1 : 0,
              transform: isLoaded ? 'translateY(0)' : 'translateY(8px)',
              transition: 'opacity 400ms var(--ease-out-quart), transform 400ms var(--ease-out-quart)',
              transitionDelay: '700ms'
            }}
          >
            <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              Press 
              <kbd style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '22px',
                height: '20px',
                padding: '0 4px',
                fontSize: '10px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--surface-default)',
                border: '1px solid var(--border-default)',
                borderRadius: '3px',
                boxShadow: '0 1px 0 var(--border-default)',
              }}>↵</kbd>
              to capture
            </span>
            <span style={{ color: 'var(--border-default)', fontSize: '10px' }}>•</span>
            <span className="text-[11px] flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <kbd style={{ 
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '22px',
                height: '20px',
                padding: '0 4px',
                fontSize: '10px',
                fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--surface-default)',
                border: '1px solid var(--border-default)',
                borderRadius: '3px',
                boxShadow: '0 1px 0 var(--border-default)',
              }}>esc</kbd>
              for settings
            </span>
          </div>
        </div>
      </main>

      {countdown > 0 && <DelayTimer onDone={() => setCountdown(0)} />}
      {showSettings && <SettingsPanel />}
      
      {/* Update Modal */}
      <UpdateModal
        update={availableUpdate}
        onInstall={installUpdate}
        onDismiss={dismissUpdate}
        isInstalling={isInstallingUpdate}
        error={updateError}
      />
    </div>
  );
}
