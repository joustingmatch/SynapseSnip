import { useEffect, useState, useCallback, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "../store/appStore";
import { HotkeyRecorder } from "./HotkeyRecorder";
import { DelaySelect, FormatSelect } from "./Select";
import { ThemeDropdown } from "./ThemeDropdown";
import type { ImageFormat } from "../types";

type Tab = "general" | "capture" | "recording" | "shortcuts";

interface TabItem {
  id: Tab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabItem[] = [
  {
    id: "general",
    label: "General",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
    ),
  },
  {
    id: "capture",
    label: "Capture",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    ),
  },
  {
    id: "recording",
    label: "Recording",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
  },
  {
    id: "shortcuts",
    label: "Shortcuts",
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z"/>
      </svg>
    ),
  },
];

export function SettingsPanel() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setShowSettings = useAppStore((s) => s.setShowSettings);
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [isExiting, setIsExiting] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabButtonsRef = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Immediate close for button clicks - no animation delay
  const handleCloseImmediate = useCallback(() => {
    setShowSettings(false);
  }, [setShowSettings]);

  // Animated close for escape key - feels more natural
  const handleCloseAnimated = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => setShowSettings(false), 150);
  }, [setShowSettings]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseAnimated();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleCloseAnimated]);

  const pickDir = useCallback(async () => {
    const r = await open({ directory: true, multiple: false });
    if (typeof r === "string") updateSettings({ default_save_dir: r });
  }, [updateSettings]);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    // Focus management: move focus to content area for screen readers
    setTimeout(() => {
      contentRef.current?.focus();
    }, 50);
  }, []);



  // Keyboard navigation for tabs
  const handleTabKeyDown = useCallback((e: React.KeyboardEvent, currentTab: Tab) => {
    const tabIds = TABS.map(t => t.id);
    const currentIndex = tabIds.indexOf(currentTab);

    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        const nextIndex = (currentIndex + 1) % TABS.length;
        const nextTab = TABS[nextIndex].id;
        handleTabChange(nextTab);
        tabButtonsRef.current.get(nextTab)?.focus();
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        const prevIndex = (currentIndex - 1 + TABS.length) % TABS.length;
        const prevTab = TABS[prevIndex].id;
        handleTabChange(prevTab);
        tabButtonsRef.current.get(prevTab)?.focus();
        break;
      case "Home":
        e.preventDefault();
        handleTabChange(TABS[0].id);
        tabButtonsRef.current.get(TABS[0].id)?.focus();
        break;
      case "End":
        e.preventDefault();
        handleTabChange(TABS[TABS.length - 1].id);
        tabButtonsRef.current.get(TABS[TABS.length - 1].id)?.focus();
        break;
    }
  }, [handleTabChange]);

  if (!settings) return null;

  return (
    <div 
      className={`fixed inset-0 z-[200] flex items-center justify-center settings-backdrop ${isExiting ? 'opacity-0' : 'opacity-100'}`}
      style={{ 
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        transition: 'opacity var(--duration-normal) var(--ease-out-quart)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <div 
        className={`w-full max-w-[720px] max-h-[85vh] flex flex-col settings-panel ${isExiting ? 'scale-[0.98] opacity-0' : 'scale-100 opacity-100'}`}
        style={{ 
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 32px 64px -16px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.03)',
          transition: 'transform var(--duration-normal) var(--ease-out-quart), opacity var(--duration-normal) var(--ease-out-quart)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle noise texture overlay */}
        <div 
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            opacity: 0.02,
            zIndex: 0,
          }}
        />
        {/* Header */}
        <header 
          className="flex items-center justify-between px-6 py-4 relative z-10"
          style={{ 
            borderBottom: '1px solid var(--border-subtle)',
            background: 'linear-gradient(180deg, var(--bg-secondary) 0%, var(--surface-default) 100%)',
          }}
        >
          <h2 
            id="settings-title"
            className="text-sm"
            style={{ 
              color: 'var(--text-primary)', 
              fontFamily: 'var(--font-mono)',
              letterSpacing: '-0.01em',
              fontWeight: 500,
            }}
          >
            Settings
          </h2>
          <button 
            type="button"
            onClick={handleCloseImmediate}
            className="flex items-center justify-center w-7 h-7 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{
              color: 'var(--text-tertiary)',
              transition: 'all var(--duration-fast) ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--surface-hover)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
            aria-label="Close settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <div className="flex flex-1 overflow-hidden" style={{ minHeight: '420px' }}>
          {/* Sidebar Navigation */}
          <nav 
            className="relative w-48 flex-shrink-0 py-3 px-3 flex flex-col z-10"
            style={{ 
              borderRight: '1px solid var(--border-subtle)',
              background: 'var(--bg-primary)',
            }}
            role="tablist"
            aria-label="Settings tabs"
          >
            <div className="space-y-0.5">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  ref={(el) => {
                    if (el) tabButtonsRef.current.set(tab.id, el);
                  }}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`tabpanel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  onClick={() => handleTabChange(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--accent)]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    background: activeTab === tab.id ? 'var(--surface-active)' : 'transparent',
                    borderRadius: 'var(--radius-md)',
                  }}
                  onMouseEnter={(e) => {
                    if (activeTab !== tab.id) {
                      e.currentTarget.style.background = 'var(--surface-default)';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (activeTab !== tab.id) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-tertiary)';
                    }
                  }}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                >
                  <span style={{ 
                    color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)',
                    transition: 'color var(--duration-fast) ease',
                  }} aria-hidden="true">
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Version info at bottom */}
            <div 
              className="mt-auto pt-4 text-[10px]"
              style={{ 
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
              }}
              aria-label="Application version"
            >
              Synapse v1.0
            </div>
          </nav>

          {/* Content Area */}
          <div 
            ref={contentRef}
            className="flex-1 overflow-y-auto outline-none"
            style={{ 
              background: 'var(--bg-primary)',
            }}
            role="tabpanel"
            id={`tabpanel-${activeTab}`}
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={0}
          >
            <div className="p-6">
              {activeTab === "general" && <GeneralTab settings={settings} updateSettings={updateSettings} />}
              {activeTab === "capture" && <CaptureTab settings={settings} updateSettings={updateSettings} pickDir={pickDir} />}
              {activeTab === "recording" && <RecordingTab settings={settings} updateSettings={updateSettings} />}
              {activeTab === "shortcuts" && <ShortcutsTab settings={settings} updateSettings={updateSettings} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Tab Components

function GeneralTab({ settings, updateSettings }: { settings: any; updateSettings: (s: any) => void }) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Theme Section */}
      <section>
        <SectionHeader title="Appearance" description="Customize the look and feel" />
        <div className="mt-4">
          <ThemeDropdown
            value={settings.theme}
            onChange={(theme) => updateSettings({ theme })}
          />
        </div>
      </section>

      <SectionDivider />

      {/* System Behavior */}
      <section>
        <SectionHeader title="System" description="Application behavior" />
        <div className="mt-4 space-y-1">
          <ToggleRow 
            label="Close to tray"
            description="Keep running in background when closed"
            checked={settings.close_to_tray}
            onChange={(v) => updateSettings({ close_to_tray: v })}
          />
          <ToggleRow 
            label="Start minimized"
            description="Launch directly to system tray"
            checked={settings.start_minimized}
            onChange={(v) => updateSettings({ start_minimized: v })}
          />
        </div>
      </section>
    </div>
  );
}

function CaptureTab({ settings, updateSettings, pickDir }: { settings: any; updateSettings: (s: any) => void; pickDir: () => void }) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* After Capture */}
      <section>
        <SectionHeader title="After Capture" description="Automatic actions" />
        <div className="mt-4 space-y-1">
          <ToggleRow 
            label="Copy to clipboard"
            description="Automatically copy screenshots"
            checked={settings.auto_copy}
            onChange={(v) => updateSettings({ auto_copy: v })}
          />
          <ToggleRow 
            label="Show preview"
            description="Display notification after capture"
            checked={settings.show_notification}
            onChange={(v) => updateSettings({ show_notification: v })}
          />
          <ToggleRow 
            label="Auto-save"
            description="Save to default folder automatically"
            checked={settings.auto_save}
            onChange={(v) => updateSettings({ auto_save: v })}
          />
        </div>
      </section>

      <SectionDivider />

      {/* Storage */}
      <section>
        <SectionHeader title="Storage" description="Save location and format" />
        
        <div className="mt-4 space-y-4">
          {/* Save Location */}
          <div>
            <label 
              className="text-xs font-medium block mb-2"
              style={{ 
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Save location
            </label>
            <button
              type="button"
              onClick={pickDir}
              className="w-full group focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              style={{
                background: 'var(--surface-default)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                padding: '12px var(--space-3)',
                textAlign: 'left',
                transition: 'all var(--duration-fast) ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.background = 'var(--surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.background = 'var(--surface-default)';
              }}
            >
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--text-tertiary)' }} aria-hidden="true">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <div 
                    className="text-sm truncate"
                    style={{ 
                      color: 'var(--text-secondary)', 
                      fontFamily: 'var(--font-mono)',
                    }}
                  >
                    {settings.default_save_dir || "No folder selected"}
                  </div>
                </div>
                <span 
                  className="text-xs"
                  style={{ 
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  Change
                </span>
              </div>
            </button>
          </div>

          {/* Format & Delay */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label 
                className="text-xs font-medium block mb-2"
                style={{ 
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Format
              </label>
              <FormatSelect
                value={settings.default_format}
                onChange={(v) => updateSettings({ default_format: v as ImageFormat })}
              />
            </div>
            <div>
              <label 
                className="text-xs font-medium block mb-2"
                style={{ 
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Delay
              </label>
              <DelaySelect
                value={settings.delay_seconds}
                onChange={(v) => updateSettings({ delay_seconds: v })}
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function RecordingTab({ settings, updateSettings }: { settings: any; updateSettings: (s: any) => void }) {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Video Settings */}
      <section>
        <SectionHeader title="Video Settings" description="Recording quality and format" />
        <div className="mt-4 grid grid-cols-2 gap-4">
          <SelectField
            label="Format"
            value={settings.recording_format || "mp4"}
            onChange={(v) => updateSettings({ recording_format: v })}
            options={[
              { value: "mp4", label: "MP4 (H.264)" },
              { value: "webm", label: "WebM (VP9)" },
              { value: "gif", label: "GIF" },
            ]}
          />
          <SelectField
            label="Frame rate"
            value={String(settings.recording_fps || 30)}
            onChange={(v) => updateSettings({ recording_fps: Number(v) })}
            options={[
              { value: "15", label: "15 fps" },
              { value: "30", label: "30 fps" },
              { value: "60", label: "60 fps" },
            ]}
          />
          <SelectField
            label="Countdown"
            value={String(settings.recording_countdown_seconds ?? 3)}
            onChange={(v) => updateSettings({ recording_countdown_seconds: Number(v) })}
            options={[
              { value: "0", label: "None" },
              { value: "3", label: "3 seconds" },
              { value: "5", label: "5 seconds" },
            ]}
          />
          <SelectField
            label="Max duration"
            value={String(settings.recording_max_duration_seconds ?? 0)}
            onChange={(v) => updateSettings({ recording_max_duration_seconds: Number(v) })}
            options={[
              { value: "0", label: "No limit" },
              { value: "30", label: "30 seconds" },
              { value: "60", label: "1 minute" },
              { value: "300", label: "5 minutes" },
              { value: "600", label: "10 minutes" },
            ]}
          />
        </div>
      </section>

      <SectionDivider />

      {/* Cursor */}
      <section>
        <SectionHeader title="Cursor" description="Cursor visibility in recordings" />
        <div className="mt-4 space-y-1">
          <ToggleRow
            label="Show cursor"
            description="Include cursor in recording"
            checked={settings.recording_show_cursor ?? true}
            onChange={(v) => updateSettings({ recording_show_cursor: v })}
          />
        </div>
      </section>
    </div>
  );
}

function ShortcutsTab({ settings, updateSettings }: { settings: any; updateSettings: (s: any) => void }) {
  const shortcuts = [
    { key: "hotkey_rect", label: "Area capture", description: "Select any region" },
    { key: "hotkey_fullscreen", label: "Fullscreen", description: "Capture entire screen" },
    { key: "hotkey_window", label: "Window", description: "Capture specific window" },
    { key: "hotkey_active_window", label: "Active window", description: "Capture focused window" },
    { key: "hotkey_toggle_app", label: "Toggle app", description: "Show or hide main window" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <section>
        <SectionHeader title="Keyboard Shortcuts" description="Global shortcuts work anywhere" />
        
        <div className="mt-4 space-y-3">
          {shortcuts.map((shortcut) => (
            <ShortcutRow
              key={shortcut.key}
              label={shortcut.label}
              description={shortcut.description}
              value={settings[shortcut.key]}
              onChange={(v) => updateSettings({ [shortcut.key]: v })}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

// Sub-components

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 
        className="text-sm font-medium"
        style={{ 
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.01em',
        }}
      >
        {title}
      </h3>
      <p 
        className="text-xs mt-0.5"
        style={{ 
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {description}
      </p>
    </div>
  );
}

function SectionDivider() {
  return (
    <div 
      className="w-full"
      style={{ 
        height: '1px',
        background: 'linear-gradient(90deg, transparent, var(--border-subtle) 20%, var(--border-subtle) 80%, transparent)',
      }}
      aria-hidden="true"
    />
  );
}

function ToggleRow({ 
  label, 
  description, 
  checked, 
  onChange 
}: { 
  label: string; 
  description: string; 
  checked: boolean; 
  onChange: (v: boolean) => void;
}) {
  const id = `toggle-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div 
      className="flex items-center justify-between py-3 px-3 -mx-3 rounded-lg"
      style={{
        transition: 'background-color var(--duration-fast) ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface-default)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
    >
      <div>
        <label 
          htmlFor={id}
          className="text-sm cursor-pointer"
          style={{ 
            color: 'var(--text-secondary)', 
            fontFamily: 'var(--font-mono)',
          }}
        >
          {label}
        </label>
        <p
          className="text-xs mt-0.5"
          style={{ 
            color: 'var(--text-muted)', 
            fontFamily: 'var(--font-mono)',
          }}
          id={`${id}-description`}
        >
          {description}
        </p>
      </div>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="toggle cursor-pointer"
        aria-describedby={`${id}-description`}
      />
    </div>
  );
}

function SelectField({ 
  label, 
  value, 
  onChange, 
  options 
}: { 
  label: string; 
  value: string; 
  onChange: (v: string) => void; 
  options: { value: string; label: string }[];
}) {
  const selectId = `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  
  return (
    <div>
      <label 
        htmlFor={selectId}
        className="text-xs font-medium block mb-2"
        style={{ 
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-9 px-3 text-sm rounded-md cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{
          background: 'var(--surface-default)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-mono)',
          transition: 'border-color var(--duration-fast) ease, background-color var(--duration-fast) ease',
          appearance: 'none',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M2.5 4.5L6 8L9.5 4.5' stroke='%239a9898' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 10px center',
          paddingRight: '32px',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)';
          e.currentTarget.style.backgroundColor = 'var(--surface-default)';
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function ShortcutRow({ 
  label, 
  description,
  value, 
  onChange 
}: { 
  label: string;
  description: string;
  value: string; 
  onChange: (v: string) => void;
}) {
  return (
    <div 
      className="p-4 rounded-lg"
      style={{ 
        background: 'var(--surface-default)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <div 
            className="text-sm"
            style={{ 
              color: 'var(--text-secondary)', 
              fontFamily: 'var(--font-mono)',
            }}
          >
            {label}
          </div>
          <div 
            className="text-xs mt-0.5"
            style={{ 
              color: 'var(--text-muted)', 
              fontFamily: 'var(--font-mono)',
            }}
          >
            {description}
          </div>
        </div>
      </div>
      <HotkeyRecorder value={value} onChange={onChange} />
    </div>
  );
}
