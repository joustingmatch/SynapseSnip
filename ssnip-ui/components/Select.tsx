import { useEffect, useRef, useState, useCallback } from "react";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Select({
  value,
  options,
  onChange,
  placeholder = "Select...",
  label,
  disabled = false,
  size = "md",
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedOption = options.find((opt) => opt.value === value);

  const sizeStyles = {
    sm: { height: "28px", padding: "0 var(--space-2)", fontSize: "var(--text-xs)" },
    md: { height: "36px", padding: "0 var(--space-3)", fontSize: "var(--text-base)" },
    lg: { height: "44px", padding: "0 var(--space-4)", fontSize: "var(--text-md)" },
  };

  const minOptionHeight = size === "sm" ? 28 : size === "md" ? 36 : 44;
  const optionFontSize = size === "sm" ? "var(--text-xs)" : size === "md" ? "var(--text-base)" : "var(--text-md)";

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Focus management when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const currentIndex = options.findIndex((opt) => opt.value === value);
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
    } else {
      setHighlightedIndex(-1);
    }
  }, [isOpen, options, value]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
            setHighlightedIndex(-1);
          } else {
            setIsOpen(!isOpen);
          }
          break;

        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          triggerRef.current?.focus();
          break;

        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev < options.length - 1 ? prev + 1 : 0
            );
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) =>
              prev > 0 ? prev - 1 : options.length - 1
            );
          }
          break;

        case "Home":
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex(0);
          }
          break;

        case "End":
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex(options.length - 1);
          }
          break;

        case "Tab":
          if (isOpen) {
            setIsOpen(false);
            setHighlightedIndex(-1);
          }
          break;
      }
    },
    [disabled, highlightedIndex, isOpen, onChange, options]
  );

  const handleOptionClick = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
    setHighlightedIndex(-1);
    triggerRef.current?.focus();
  };

  const handleOptionMouseEnter = (index: number) => {
    setHighlightedIndex(index);
  };

  const labelId = label ? `select-label-${Math.random().toString(36).substr(2, 9)}` : undefined;
  const listboxId = `listbox-${Math.random().toString(36).substr(2, 9)}`;

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onKeyDown={handleKeyDown}
      style={{ fontFamily: 'var(--font-mono)' }}
    >
      {label && (
        <label 
          id={labelId}
          className="block mb-1.5 text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full flex items-center justify-between gap-2
          rounded border transition-all duration-200
          focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]
          ${disabled
            ? "opacity-50 cursor-not-allowed"
            : "cursor-pointer hover:border-[var(--border-strong)]"
          }
          ${isOpen ? "border-[var(--accent)]" : "border-[var(--border-default)]"}
        `}
        style={{
          ...sizeStyles[size],
          background: "var(--surface-default)",
          color: "var(--text-primary)",
          fontFamily: 'var(--font-mono)',
          borderRadius: 'var(--radius-md)',
        }}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-labelledby={labelId}
        aria-controls={isOpen ? listboxId : undefined}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined
        }
      >
        <span className="flex items-center gap-2 truncate">
          {selectedOption?.icon && (
            <span className="flex-shrink-0">{selectedOption.icon}</span>
          )}
          <span className="truncate">
            {selectedOption?.label || placeholder}
          </span>
        </span>

        {/* Chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          className={`flex-shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
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
      <div
        id={listboxId}
        data-select-dropdown
        className={`
          absolute left-0 right-0 z-50 mt-1
          rounded overflow-hidden
          transition-all duration-200 origin-top
          ${isOpen ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 -translate-y-2 pointer-events-none"}
        `}
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderRadius: 'var(--radius-md)',
          maxHeight: "240px",
          overflowY: "auto",
          fontFamily: 'var(--font-mono)',
        }}
        role="listbox"
        aria-label={label || "Options"}
        aria-activedescendant={
          highlightedIndex >= 0 ? `option-${highlightedIndex}` : undefined
        }
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`option-${index}`}
            onClick={() => handleOptionClick(option.value)}
            onMouseEnter={() => handleOptionMouseEnter(index)}
            className={`
              flex items-center gap-2 px-3 cursor-pointer transition-colors duration-150
              ${highlightedIndex === index ? "bg-[var(--accent-subtle)]" : "hover:bg-[var(--surface-hover)]"}
              ${option.value === value ? "bg-[var(--accent-subtle)]" : ""}
            `}
            style={{
              minHeight: minOptionHeight,
              fontSize: optionFontSize,
              fontFamily: 'var(--font-mono)',
            }}
            role="option"
            aria-selected={option.value === value}
          >
            {option.icon && (
              <span
                className="flex-shrink-0"
                style={{
                  color:
                    option.value === value || highlightedIndex === index
                      ? "var(--accent)"
                      : "var(--text-tertiary)",
                }}
                aria-hidden="true"
              >
                {option.icon}
              </span>
            )}

            <div className="flex-1 min-w-0">
              <div
                className="truncate font-medium"
                style={{
                  color:
                    option.value === value || highlightedIndex === index
                      ? "var(--accent)"
                      : "var(--text-primary)",
                }}
              >
                {option.label}
              </div>
              {option.description && (
                <div
                  className="truncate text-[10px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  {option.description}
                </div>
              )}
            </div>

            {/* Checkmark for selected */}
            {option.value === value && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="flex-shrink-0"
                style={{ color: "var(--accent)" }}
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Convenience component for simple string arrays
interface SimpleSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
  formatLabel?: (value: string) => string;
}

export function SimpleSelect({
  value,
  options,
  onChange,
  placeholder,
  label,
  disabled,
  size,
  formatLabel = (v) => v,
}: SimpleSelectProps) {
  const selectOptions: SelectOption[] = options.map((opt) => ({
    value: opt,
    label: formatLabel(opt),
  }));

  return (
    <Select
      value={value}
      options={selectOptions}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
      disabled={disabled}
      size={size}
    />
  );
}

// Specialized selects for common use cases
export function DelaySelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const options: SelectOption[] = [
    { value: "0", label: "No delay", description: "Capture immediately" },
    { value: "3", label: "3 seconds", description: "Short countdown" },
    { value: "5", label: "5 seconds", description: "Medium countdown" },
    { value: "10", label: "10 seconds", description: "Long countdown" },
  ];

  return (
    <Select
      value={String(value)}
      options={options}
      onChange={(v) => onChange(Number(v))}
      size="md"
    />
  );
}

export function FormatSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const options: SelectOption[] = [
    {
      value: "png",
      label: "PNG",
      description: "Lossless quality",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 12h8M12 8v8" />
        </svg>
      ),
    },
    {
      value: "jpg",
      label: "JPEG",
      description: "Compressed, smaller files",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      ),
    },
    {
      value: "bmp",
      label: "BMP",
      description: "Uncompressed bitmap",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M8 8h8v8H8z" />
        </svg>
      ),
    },
  ];

  return (
    <Select
      value={value}
      options={options}
      onChange={onChange}
      size="md"
    />
  );
}
