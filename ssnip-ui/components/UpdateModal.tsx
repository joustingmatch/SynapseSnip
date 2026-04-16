import { useCallback, useState, useEffect } from "react";
import type { Update } from "@tauri-apps/plugin-updater";

interface UpdateModalProps {
  update: Update | null;
  onInstall: () => void;
  onDismiss: () => void;
  isInstalling?: boolean;
  error?: string | null;
}

/**
 * Refined Update Available Modal
 * 
 * Quiet design principles:
 * - Clean, centered modal presentation
 * - Restrained color usage
 * - Clear action hierarchy
 * - Smooth, purposeful animation
 * - No decorative elements
 */
export function UpdateModal({ 
  update, 
  onInstall, 
  onDismiss, 
  isInstalling = false,
  error = null 
}: UpdateModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (update && !isVisible) {
      // Small delay for natural feel
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else if (!update && isVisible) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsExiting(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [update, isVisible]);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
      setIsExiting(false);
      setIsVisible(false);
    }, 200);
  }, [onDismiss]);

  if (!update || (!isVisible && !isExiting)) return null;

  return (
    <div 
      className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{
        background: isExiting 
          ? "rgba(0, 0, 0, 0)" 
          : "rgba(0, 0, 0, 0.5)",
        backdropFilter: isExiting ? "blur(0px)" : "blur(3px)",
        transition: "all 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        opacity: isVisible && !isExiting ? 1 : 0,
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
    >
      <div
        className="w-full max-w-[360px]"
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-lg)",
          padding: "28px",
          transform: isExiting 
            ? "scale(0.96) translateY(8px)" 
            : "scale(1) translateY(0)",
          opacity: isExiting ? 0 : 1,
          transition: "all 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        }}
      >
        {/* Icon */}
        <div 
          className="flex items-center justify-center mb-5"
          style={{
            width: "48px",
            height: "48px",
            background: "var(--accent-subtle)",
            borderRadius: "var(--radius-md)",
            margin: "0 auto 20px",
          }}
        >
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="var(--accent)" 
            strokeWidth="1.5" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>

        {/* Content */}
        <div className="text-center mb-6">
          <h2 
            id="update-title"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-lg)",
              fontWeight: 500,
              color: "var(--text-primary)",
              marginBottom: "8px",
              letterSpacing: "0.01em",
            }}
          >
            Update Available
          </h2>
          <p
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            SynapseSnip v{update.version} is ready to install. 
            This update includes improvements and bug fixes.
          </p>
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              background: "var(--error-subtle)",
              border: "1px solid var(--error)",
              borderRadius: "var(--radius-md)",
              padding: "10px 12px",
              marginBottom: "16px",
            }}
          >
            <p
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--text-xs)",
                color: "var(--error)",
                margin: 0,
                lineHeight: 1.4,
              }}
            >
              {error}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={isInstalling}
            className="flex-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "var(--text-secondary)",
              background: "transparent",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              padding: "10px 16px",
              cursor: isInstalling ? "not-allowed" : "pointer",
              opacity: isInstalling ? 0.5 : 1,
              transition: "all 150ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
            onMouseEnter={(e) => {
              if (!isInstalling) {
                e.currentTarget.style.background = "var(--surface-hover)";
                e.currentTarget.style.borderColor = "var(--border-strong)";
                e.currentTarget.style.color = "var(--text-primary)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            Later
          </button>
          <button
            type="button"
            onClick={onInstall}
            disabled={isInstalling}
            className="flex-1"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--text-sm)",
              fontWeight: 500,
              color: "var(--text-primary)",
              background: "var(--accent-subtle)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--radius-md)",
              padding: "10px 16px",
              cursor: isInstalling ? "not-allowed" : "pointer",
              transition: "all 150ms cubic-bezier(0.25, 1, 0.5, 1)",
            }}
            onMouseEnter={(e) => {
              if (!isInstalling) {
                e.currentTarget.style.background = "var(--accent)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "var(--accent-subtle)";
            }}
          >
            {isInstalling ? (
              <span className="flex items-center justify-center gap-2">
                <svg 
                  width="14" 
                  height="14" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  style={{
                    animation: "spin 1s linear infinite",
                  }}
                >
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Installing...
              </span>
            ) : (
              "Install Now"
            )}
          </button>
        </div>

        {/* Version info */}
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-muted)",
            textAlign: "center",
            marginTop: "16px",
            marginBottom: 0,
          }}
        >
          Current: v{update.currentVersion}
        </p>
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
