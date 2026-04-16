import { useEffect, useState, type ReactNode } from "react";
import { useAppStore } from "../store/appStore";
import type { TextAnnotationStyle, ToolKind } from "../types";
import { ColorPicker } from "./editor/ColorPicker";

const TOOLS: { id: ToolKind; label: string; icon: ReactNode; shortcut: string }[] = [
  {
    id: "cursor", label: "Select", shortcut: "V",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>
  },
  {
    id: "pen", label: "Pen", shortcut: "P",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
  },
  {
    id: "highlighter", label: "Highlight", shortcut: "H",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l-6 6v3h9l3-3"/><path d="M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/><path d="M4 16l3 3"/></svg>
  },
  {
    id: "text", label: "Text", shortcut: "T",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>
  },
  {
    id: "rectangle", label: "Rect", shortcut: "R",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
  },
  {
    id: "ellipse", label: "Circle", shortcut: "O",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
  },
  {
    id: "arrow", label: "Arrow", shortcut: "A",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
  },
  {
    id: "eraser", label: "Erase", shortcut: "E",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 20H7L3 16l7-7 10 10zM11 11l5 5"/></svg>
  },
  {
    id: "blur", label: "Blur", shortcut: "B",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
  },
  {
    id: "crop", label: "Crop", shortcut: "C",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14M18 22V8a2 2 0 0 0-2-2H2"/></svg>
  },
];

const FONT_CHOICES: Array<{ id: TextAnnotationStyle["fontFamily"]; label: string }> = [
  { id: "sans", label: "Sans" },
  { id: "serif", label: "Serif" },
  { id: "mono", label: "Mono" },
];

const ALIGN_CHOICES: Array<{ id: TextAnnotationStyle["align"]; label: string; icon: ReactNode }> = [
  { id: "left", label: "Left", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 10H3M21 6H3M21 14H3M17 18H3"/></svg> },
  { id: "center", label: "Center", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 10H6M21 6H3M21 14H3M18 18H6"/></svg> },
  { id: "right", label: "Right", icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10H7M21 6H3M21 14H3M21 18H7"/></svg> },
];

const BACKGROUND_CHOICES: Array<{ id: TextAnnotationStyle["background"]; label: string }> = [
  { id: "none", label: "None" },
  { id: "soft", label: "Soft" },
  { id: "solid", label: "Solid" },
];

export function Toolbar() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const color = useAppStore((s) => s.color);
  const thickness = useAppStore((s) => s.thickness);
  const setThickness = useAppStore((s) => s.setThickness);
  const blurStrength = useAppStore((s) => s.blurStrength);
  const setBlurStrength = useAppStore((s) => s.setBlurStrength);
  const textStyle = useAppStore((s) => s.textStyle);
  const setTextStyle = useAppStore((s) => s.setTextStyle);
  const isTypingText = useAppStore((s) => s.isTypingText);
  const [customizeTool, setCustomizeTool] = useState<ToolKind | null>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingText) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const hit = TOOLS.find((t) => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (hit) {
        setTool(hit.id);
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isTypingText, setTool]);

  const renderToolCustomization = (activeCustomTool: ToolKind) => {
    const canCustomizeColor = activeCustomTool !== "eraser" && activeCustomTool !== "blur" && activeCustomTool !== "cursor";
    const canCustomizeThickness = activeCustomTool !== "cursor";
    
    return (
      <div 
        className="absolute left-full ml-3 top-0 rounded p-4 w-[260px] animate-fade-in-up z-[200]"
        style={{ 
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)'
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <span 
            className="text-sm font-bold"
            style={{ color: 'var(--text-secondary)' }}
          >
            {TOOLS.find(t => t.id === activeCustomTool)?.label} Options
          </span>
          <button
            onClick={() => {
              setCustomizeTool(null);
              setShowColorPicker(false);
            }}
            className="btn-icon w-6 h-6"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {canCustomizeColor && (
          <div className="relative mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Color</span>
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="flex items-center gap-2 px-2 py-1 rounded transition-colors"
                style={{
                  background: showColorPicker ? 'var(--surface-active)' : 'transparent',
                  border: '1px solid var(--border-subtle)'
                }}
              >
                <div
                  className="w-5 h-5 rounded border"
                  style={{
                    background: color,
                    borderColor: 'var(--border-default)'
                  }}
                />
                <span
                  className="text-xs font-mono uppercase"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {color.toUpperCase()}
                </span>
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  style={{
                    color: 'var(--text-tertiary)',
                    transform: showColorPicker ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 200ms var(--ease-out-quart)'
                  }}
                >
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
            </div>
            <ColorPicker
              isOpen={showColorPicker}
            />
          </div>
        )}

        {canCustomizeThickness && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {activeCustomTool === "blur" ? "Blur strength" : "Stroke width"}
              </span>
              <span 
                className="text-xs"
                style={{ color: 'var(--text-secondary)' }}
              >
                {activeCustomTool === "blur" ? `${blurStrength}px` : `${thickness}px`}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={activeCustomTool === "blur" ? 32 : 24}
              value={activeCustomTool === "blur" ? blurStrength : thickness}
              onChange={(e) => {
                const next = Number(e.target.value);
                if (activeCustomTool === "blur") {
                  setBlurStrength(next);
                } else {
                  setThickness(next);
                }
              }}
              className="w-full"
              style={{ accentColor: 'var(--accent)' }}
            />
          </div>
        )}

        {activeCustomTool === "text" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Font</span>
              <div className="segment-group w-full">
                {FONT_CHOICES.map((font) => (
                  <button
                    key={font.id}
                    type="button"
                    onClick={() => setTextStyle({ fontFamily: font.id })}
                    data-active={textStyle.fontFamily === font.id}
                    className="segment-btn flex-1"
                  >
                    {font.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Align</span>
              <div className="segment-group w-full">
                {ALIGN_CHOICES.map((align) => (
                  <button
                    key={align.id}
                    type="button"
                    onClick={() => setTextStyle({ align: align.id })}
                    data-active={textStyle.align === align.id}
                    className="segment-btn flex-1"
                    title={align.label}
                  >
                    {align.icon}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Background</span>
              <div className="segment-group w-full">
                {BACKGROUND_CHOICES.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    onClick={() => setTextStyle({ background: bg.id })}
                    data-active={textStyle.background === bg.id}
                    className="segment-btn flex-1"
                  >
                    {bg.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Size</span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {textStyle.fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={12}
                max={72}
                value={textStyle.fontSize}
                onChange={(e) => setTextStyle({ fontSize: Number(e.target.value) })}
                className="w-full"
                style={{ accentColor: 'var(--accent)' }}
              />
            </div>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Uppercase</span>
              <input
                type="checkbox"
                checked={textStyle.uppercase}
                onChange={(e) => setTextStyle({ uppercase: e.target.checked })}
                className="toggle"
              />
            </label>
          </div>
        )}
      </div>
    );
  };

  return (
    <div 
      className="flex flex-col gap-1 p-2 rounded"
      style={{ 
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)'
      }}
    >
      {TOOLS.map((t) => (
        <div key={t.id} className="relative">
          <button
            onClick={() => {
              setTool(t.id);
              setCustomizeTool(null);
              setShowColorPicker(false);
            }}
            onDoubleClick={() => {
              setTool(t.id);
              setCustomizeTool((prev) => (prev === t.id ? null : t.id));
              setShowColorPicker(false);
            }}
            title={`${t.label} (${t.shortcut})`}
            className={`
              w-9 h-9 flex items-center justify-center rounded transition-all duration-200
              ${tool === t.id
                ? "text-[var(--accent)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
              }
            `}
            style={tool === t.id ? {
              background: 'var(--accent-subtle)',
            } : {}}
            data-active={tool === t.id}
          >
            {t.icon}
          </button>
          {customizeTool === t.id && renderToolCustomization(t.id)}
        </div>
      ))}
    </div>
  );
}
