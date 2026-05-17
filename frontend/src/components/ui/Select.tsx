"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** Stretch to the container width (default). Set false for inline filters. */
  fullWidth?: boolean;
  /** "md" for form fields, "sm" for compact filter bars. */
  size?: "sm" | "md";
  /** Extra classes merged onto the trigger button (font, width tweaks). */
  className?: string;
  "aria-label"?: string;
}

/**
 * Custom dropdown that replaces the native <select>. Unlike a native select,
 * the open list is fully styled (rounded popover, hover/selected states,
 * keyboard navigation) and consistent across browsers and the whole app.
 */
export default function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  id,
  disabled = false,
  fullWidth = true,
  size = "md",
  className = "",
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reactId = useId();
  const listId = `${id || reactId}-listbox`;

  const selected = options.find((o) => o.value === value);
  const selectedIndex = options.findIndex((o) => o.value === value);

  // Close when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Highlight the current selection when the list opens.
  useEffect(() => {
    if (open) setHighlight(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  // Keep the highlighted row scrolled into view.
  useEffect(() => {
    if (!open || highlight < 0 || !listRef.current) return;
    const node = listRef.current.children[highlight] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [open, highlight]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
  };

  const moveHighlight = (dir: 1 | -1) => {
    setHighlight((h) => {
      let next = h;
      for (let i = 0; i < options.length; i += 1) {
        next = (next + dir + options.length) % options.length;
        if (!options[next]?.disabled) return next;
      }
      return h;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveHighlight(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveHighlight(-1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      commit(highlight);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const sizeCls =
    size === "sm" ? "h-[38px] pl-3 pr-2.5 text-sm" : "h-[44px] pl-3.5 pr-3 text-sm";

  return (
    <div
      ref={wrapRef}
      className={`relative ${fullWidth ? "w-full" : "inline-block min-w-[150px]"}`}
    >
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`w-full flex items-center justify-between gap-2 rounded-lg border bg-white text-left transition-all ${sizeCls} ${
          open
            ? "border-[#16a34a] ring-2 ring-[#16a34a]/15"
            : "border-[#e5e7eb] hover:border-[#16a34a]/60"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
      >
        <span className={`truncate ${selected ? "text-[#0a0a0a]" : "text-[#9ca3af]"}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 flex-shrink-0 text-[#9ca3af] transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-auto rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-xl ring-1 ring-black/5"
        >
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-[#9ca3af]">No options</li>
          )}
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHigh = idx === highlight;
            return (
              <li
                key={opt.value || `opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled || undefined}
                onMouseEnter={() => setHighlight(idx)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(idx)}
                className={`mx-1 flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm ${
                  opt.disabled ? "cursor-not-allowed text-[#d1d5db]" : "cursor-pointer"
                } ${isHigh && !opt.disabled ? "bg-[#f0fdf4]" : ""} ${
                  isSelected ? "font-semibold text-[#15803d]" : "text-[#374151]"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-[#16a34a]" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
