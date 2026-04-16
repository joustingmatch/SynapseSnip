import { useState, useRef, useEffect, useCallback } from "react";
import { applyTheme } from "../utils/theme";
import type { Settings } from "../types";

interface ThemeOption {
  id: Settings["theme"];
  label: string;
  color: string;
}

const THEMES: ThemeOption[] = [
  { id: "light", label: "Light", color: "#e8e4df" },
  { id: "sepia", label: "Sepia", color: "#d4c4b0" },
  { id: "dark", label: "Dark", color: "#2d2a26" },
  { id: "slate", label: "Slate", color: "#2a2d33" },
  { id: "midnight", label: "Midnight", color: "#222433" },
  { id: "nord", label: "Nord", color: "#2e3440" },
  { id: "dracula", label: "Dracula", color: "#282a36" },
  { id: "contrast", label: "High Contrast", color: "#000000" },
  { id: "forest", label: "Forest", color: "#2d3328" },
  { id: "rose", label: "Rose", color: "#332a2c" },
  { id: "gold", label: "Gold", color: "#3d3628" },
  { id: "ocean", label: "Ocean", color: "#2a2f36" },
  { id: "mint", label: "Mint", color: "#2a3330" },
  { id: "purple", label: "Purple", color: "#2d2633" },
  { id: "ember", label: "Ember", color: "#362a26" },
  { id: "gruvbox", label: "Gruvbox", color: "#282828" },
  { id: "solarized", label: "Solarized", color: "#002b36" },
];

interface ThemeDropdownProps {
  value: Settings["theme"];
  onChange: (theme: Settings["theme"]) => void;
}

export function ThemeDropdown({ value, onChange }: ThemeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [previewTheme, setPreviewTheme] = useState<Settings["theme"] | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const originalThemeRef = useRef<Settings["theme"]>(value);

  const displayTheme = THEMES.find(t => t.id === (previewTheme || value));
  const currentIndex = THEMES.findIndex(t => t.id === value);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        // Reset preview if open
        if (previewTheme) {
          applyTheme(originalThemeRef.current);
          setPreviewTheme(null);
        }
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [previewTheme]);

  // Update original theme ref when value changes
  useEffect(() => {
    originalThemeRef.current = value;
  }, [value]);

  // Set initial highlighted index when opening
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, currentIndex]);

  const handleThemeHover = useCallback((themeId: Settings["theme"]) => {
    setPreviewTheme(themeId);
    applyTheme(themeId);
  }, []);

  const handleThemeLeave = useCallback(() => {
    setPreviewTheme(null);
    applyTheme(originalThemeRef.current);
  }, []);

  const handleThemeSelect = useCallback((themeId: Settings["theme"]) => {
    onChange(themeId);
    originalThemeRef.current = themeId;
    setPreviewTheme(null);
    setIsOpen(false);
    triggerRef.current?.focus();
  }, [onChange]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case "Enter":
      case " ":
        e.preventDefault();
        if (isOpen && highlightedIndex >= 0) {
          handleThemeSelect(THEMES[highlightedIndex].id);
        } else {
          setIsOpen(true);
        }
        break;

      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        handleThemeLeave();
        setHighlightedIndex(-1);
        triggerRef.current?.focus();
        break;

      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const nextIndex = (highlightedIndex + 1) % THEMES.length;
          setHighlightedIndex(nextIndex);
          handleThemeHover(THEMES[nextIndex].id);
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          const prevIndex = (highlightedIndex - 1 + THEMES.length) % THEMES.length;
          setHighlightedIndex(prevIndex);
          handleThemeHover(THEMES[prevIndex].id);
        }
        break;

      case "Home":
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(0);
          handleThemeHover(THEMES[0].id);
        }
        break;

      case "End":
        e.preventDefault();
        if (isOpen) {
          setHighlightedIndex(THEMES.length - 1);
          handleThemeHover(THEMES[THEMES.length - 1].id);
        }
        break;

      case "Tab":
        if (isOpen) {
          setIsOpen(false);
          handleThemeLeave();
          setHighlightedIndex(-1);
        }
        break;
    }
  }, [isOpen, highlightedIndex, handleThemeHover, handleThemeLeave, handleThemeSelect]);

  const listboxId = `theme-listbox-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div 
      ref={containerRef} 
      className="relative w-full" 
      style={{ fontFamily: 'var(--font-mono)' }}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-2)',
          height: '36px',
          padding: '0 var(--space-3)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-sm)',
          fontWeight: 500,
          color: 'var(--text-primary)',
          background: 'var(--surface-default)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          cursor: 'pointer',
          transition: 'border-color var(--duration-fast) var(--ease-out-quart), background-color var(--duration-fast) var(--ease-out-quart)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-strong)';
          e.currentTarget.style.background = 'var(--surface-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-default)';
          e.currentTarget.style.background = 'var(--surface-default)';
        }}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `theme-option-${highlightedIndex}` : undefined
        }
      >
        <div className="flex items-center gap-3">
          <div
            className="w-5 h-5 rounded"
            style={{ 
              background: displayTheme?.color || "#2d2a26",
              border: '1px solid var(--border-default)',
            }}
            aria-hidden="true"
          />
          <span 
            className="flex-1 text-left text-sm font-medium" 
            style={{ color: "var(--text-primary)" }}
          >
            {displayTheme?.label || "Select theme"}
          </span>
          {previewTheme && (
            <span 
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ 
                background: 'var(--accent-subtle)', 
                color: 'var(--accent)',
                fontSize: 'var(--text-xs)',
              }}
            >
              Preview
            </span>
          )}
        </div>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          style={{ color: "var(--text-tertiary)" }}
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          id={listboxId}
          className="toggle-dropdown-menu"
          role="listbox"
          aria-label="Theme selection"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 50,
            fontFamily: 'var(--font-mono)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            animation: 'fade-in-up var(--duration-fast) var(--ease-out-expo) both',
          }}
        >
          <div 
            className="max-h-[240px] overflow-y-auto"
            data-select-dropdown
          >
            {THEMES.map((theme, index) => (
              <button
                key={theme.id}
                id={`theme-option-${index}`}
                type="button"
                role="option"
                aria-selected={theme.id === value}
                onClick={() => handleThemeSelect(theme.id)}
                onMouseEnter={() => {
                  setHighlightedIndex(index);
                  handleThemeHover(theme.id);
                }}
                onMouseLeave={handleThemeLeave}
                className="toggle-dropdown-item focus-visible:outline-2 focus-visible:outline-offset--2 focus-visible:outline-[var(--accent)]"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 500,
                  lineHeight: 1,
                  color: highlightedIndex === index || theme.id === value ? 'var(--accent)' : 'var(--text-primary)',
                  background: highlightedIndex === index ? 'var(--accent-subtle)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color var(--duration-fast) var(--ease-out-quart), color var(--duration-fast) var(--ease-out-quart)',
                  textAlign: 'left',
                }}
              >
                <div
                  className="w-4 h-4 rounded flex-shrink-0"
                  style={{ 
                    background: theme.color,
                    border: '1px solid var(--border-default)',
                  }}
                  aria-hidden="true"
                />
                <span className="flex-1 text-left text-sm">{theme.label}</span>
                {theme.id === value && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--accent)" }}
                    aria-hidden="true"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
