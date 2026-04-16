import { useState, useCallback, useRef, useEffect } from "react";
import { useAppStore } from "../../store/appStore";

interface ColorPickerProps {
  isOpen: boolean;
}

// Convert hex to HSV
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  const s = max === 0 ? 0 : d / max;
  const v = max;

  return { h: h * 360, s, v };
}

// Convert HSV to hex
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r = 0, g = 0, b = 0;

  if (h < 60) {
    r = c; g = x; b = 0;
  } else if (h < 120) {
    r = x; g = c; b = 0;
  } else if (h < 180) {
    r = 0; g = c; b = x;
  } else if (h < 240) {
    r = 0; g = x; b = c;
  } else if (h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Validate hex color
function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

export function ColorPicker({ isOpen }: ColorPickerProps) {
  const color = useAppStore((s) => s.color);
  const setColor = useAppStore((s) => s.setColor);
  
  const [hsv, setHsv] = useState(() => hexToHsv(color));
  const [hexInput, setHexInput] = useState(color.toUpperCase());
  const [isDragging, setIsDragging] = useState<"saturation" | "hue" | null>(null);
  
  const saturationRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  // Update hex input when color changes externally
  useEffect(() => {
    setHexInput(color.toUpperCase());
    setHsv(hexToHsv(color));
  }, [color]);

  const handleSaturationChange = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!saturationRef.current) return;
    
    const rect = saturationRef.current.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
    
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    
    const newHsv = { ...hsv, s: x, v: 1 - y };
    setHsv(newHsv);
    const newColor = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    setColor(newColor);
    setHexInput(newColor.toUpperCase());
  }, [hsv, setColor]);

  const handleHueChange = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!hueRef.current) return;

    const rect = hueRef.current.getBoundingClientRect();
    const clientY = "touches" in e ? e.touches[0].clientY : (e as MouseEvent).clientY;

    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    const newHsv = { ...hsv, h: y * 360 };
    setHsv(newHsv);
    const newColor = hsvToHex(newHsv.h, newHsv.s, newHsv.v);
    setColor(newColor);
    setHexInput(newColor.toUpperCase());
  }, [hsv, setColor]);

  // Global drag handlers
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent | TouchEvent) => {
      if (isDragging === "saturation") {
        handleSaturationChange(e);
      } else if (isDragging === "hue") {
        handleHueChange(e);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchmove", handleMouseMove);
    window.addEventListener("touchend", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchmove", handleMouseMove);
      window.removeEventListener("touchend", handleMouseUp);
    };
  }, [isDragging, handleSaturationChange, handleHueChange]);

  const handleHexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValidHex(hexInput)) {
      let normalizedHex = hexInput.toLowerCase();
      if (normalizedHex.length === 4) {
        normalizedHex = `#${normalizedHex[1]}${normalizedHex[1]}${normalizedHex[2]}${normalizedHex[2]}${normalizedHex[3]}${normalizedHex[3]}`;
      }
      setColor(normalizedHex);
      setHsv(hexToHsv(normalizedHex));
      setHexInput(normalizedHex.toUpperCase());
    } else {
      setHexInput(color.toUpperCase());
    }
  };

  const currentColor = hsvToHex(hsv.h, hsv.s, hsv.v);

  if (!isOpen) return null;

  return (
    <div 
      className="absolute left-full ml-3 top-0 rounded animate-fade-in-up z-[200]"
      style={{ 
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-default)',
        fontFamily: 'var(--font-mono)',
        width: '240px',
        padding: '16px'
      }}
    >
      {/* Saturation/Value Area */}
      <div style={{ marginBottom: '12px' }}>
        <div
          ref={saturationRef}
          className="relative w-full cursor-crosshair overflow-hidden"
          style={{
            height: '160px',
            borderRadius: '4px',
            background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${hsvToHex(hsv.h, 1, 1)})`,
            border: '1px solid var(--border-subtle)'
          }}
          onMouseDown={(e) => {
            setIsDragging("saturation");
            handleSaturationChange(e);
          }}
          onTouchStart={(e) => {
            setIsDragging("saturation");
            handleSaturationChange(e);
          }}
        >
          {/* Draggable Handle */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: '12px',
              height: '12px',
              background: currentColor,
              border: `2px solid ${hsv.v > 0.5 ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)'}`,
              boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              transform: 'translate(-50%, -50%)',
              transition: isDragging === "saturation" ? 'none' : 'transform 0.15s var(--ease-out-quart)'
            }}
          />
        </div>
      </div>

      {/* Hue Slider */}
      <div style={{ marginBottom: '16px' }}>
        <div
          ref={hueRef}
          className="relative w-full cursor-pointer overflow-hidden"
          style={{
            height: '16px',
            borderRadius: '4px',
            background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
            border: '1px solid var(--border-subtle)'
          }}
          onMouseDown={(e) => {
            setIsDragging("hue");
            handleHueChange(e);
          }}
          onTouchStart={(e) => {
            setIsDragging("hue");
            handleHueChange(e);
          }}
        >
          {/* Hue Handle */}
          <div
            className="absolute pointer-events-none"
            style={{
              width: '4px',
              height: '100%',
              background: '#fff',
              boxShadow: '0 0 0 1px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(0,0,0,0.2)',
              left: `${(hsv.h / 360) * 100}%`,
              transform: 'translateX(-50%)',
              transition: isDragging === "hue" ? 'none' : 'left 0.15s var(--ease-out-quart)'
            }}
          />
        </div>
      </div>

      {/* Hex Input Row */}
      <form onSubmit={handleHexSubmit}>
        <div 
          className="flex items-center"
          style={{ gap: '8px' }}
        >
          {/* Color Preview */}
          <div
            className="rounded flex-shrink-0"
            style={{
              width: '32px',
              height: '32px',
              background: currentColor,
              border: '1px solid var(--border-default)',
              borderRadius: '4px'
            }}
          />
          
          {/* Hex Input */}
          <div className="flex-1 relative">
            <span 
              className="absolute pointer-events-none"
              style={{ 
                left: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: '11px',
                color: 'var(--text-muted)'
              }}
            >
              #
            </span>
            <input
              type="text"
              value={hexInput.replace(/^#/, '')}
              onChange={(e) => {
                const value = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 6);
                setHexInput(`#${value}`);
              }}
              onBlur={handleHexSubmit}
              style={{
                width: '100%',
                height: '32px',
                paddingLeft: '18px',
                paddingRight: '8px',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: isValidHex(hexInput) ? 'var(--text-primary)' : 'var(--error)',
                background: 'var(--surface-default)',
                border: `1px solid ${isValidHex(hexInput) ? 'var(--border-default)' : 'var(--error)'}`,
                borderRadius: '4px',
                outline: 'none',
                transition: 'border-color 0.15s var(--ease-out-quart), box-shadow 0.15s var(--ease-out-quart)'
              }}
              placeholder="RRGGBB"
              maxLength={6}
            />
          </div>

          {/* Copy Button */}
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(color.toUpperCase());
            }}
            className="flex items-center justify-center flex-shrink-0"
            style={{
              width: '32px',
              height: '32px',
              color: 'var(--text-tertiary)',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'color 0.15s var(--ease-out-quart), background 0.15s var(--ease-out-quart), border-color 0.15s var(--ease-out-quart)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'var(--surface-hover)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
            title="Copy hex"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
          </button>
        </div>
        {!isValidHex(hexInput) && hexInput.length > 1 && (
          <span 
            style={{ 
              display: 'block',
              marginTop: '4px',
              fontSize: '10px',
              color: 'var(--error)'
            }}
          >
            Invalid hex
          </span>
        )}
      </form>
    </div>
  );
}
