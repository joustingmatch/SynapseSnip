import { getCurrentWindow } from "@tauri-apps/api/window";

type Props = {
  subtitle?: string;
  onOpenSettings?: () => void;
};

export function TitleBar({ subtitle, onOpenSettings }: Props) {
  const appWindow = getCurrentWindow();

  // data-tauri-drag-region waits for a move threshold before dragging, which
  // feels sluggish. Call startDragging() directly on mousedown so dragging
  // begins immediately, and still allow double-click to maximize.
  const beginDrag = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea, [data-no-drag]")) return;
    e.preventDefault();
    void appWindow.startDragging();
  };

  return (
    <div
      onMouseDown={beginDrag}
      className="flex items-center justify-between h-12 px-4 select-none"
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)'
      }}
    >
      {/* Left: Title */}
      <div
        className="flex items-center gap-3 flex-1 cursor-default"
      >
        {/* App Icon */}
        <img 
          src="/icons/app-icon.png"
          alt="SynapseSnip"
          className="w-5 h-5 rounded"
          style={{ objectFit: 'cover' }}
        />
        
        <span 
          className="text-sm font-bold"
          style={{ color: 'var(--text-primary)' }}
        >
          SynapseSnip
        </span>
        
        {subtitle && (
          <>
            <span style={{ color: 'var(--border-default)' }}>/</span>
            <span 
              className="text-sm font-medium"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {subtitle}
            </span>
          </>
        )}
      </div>

      {/* Right: Controls */}
      <div className="flex items-center gap-1">
        {onOpenSettings && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="btn-icon"
            aria-label="Open settings"
            title="Settings"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}

        <div 
          className="w-px h-4 mx-1"
          style={{ background: 'var(--border-subtle)' }}
        />

        <button
          type="button"
          className="btn-icon"
          onClick={() => void appWindow.minimize()}
          aria-label="Minimize window"
          title="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <rect x="1" y="5.5" width="10" height="1" rx="0.5" fill="currentColor"/>
          </svg>
        </button>

        <button
          type="button"
          className="btn-icon hover:text-[var(--error)]"
          onClick={() => void appWindow.close()}
          aria-label="Close window"
          title="Close"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
