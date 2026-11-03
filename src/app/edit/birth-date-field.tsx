"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { fieldStyle } from "./editor-fields";

const message =
  "Date invalide. Utilisez AAAA, AAAA-MM ou AAAA-MM-JJ (ex. 1956-02).";

/**
 * Render a controlled birth-date field with stable help text and an accessible
 * validation tooltip.
 *
 * The parent supplies validation; invalid input remains editable. Show short
 * feedback on focus or hover without moving the form, support Escape dismissal,
 * and keep the error description available to assistive technology while the
 * popup is closed.
 */
export function BirthDateField({
  value,
  invalid,
  onChange,
}: {
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [dismissedValue, setDismissedValue] = useState<string>();
  const open = invalid && (focused || hovered) && dismissedValue !== value;

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  /** Keep the hovered error tooltip open and clear dismissal for the current value. */
  function enter() {
    clearTimeout(closeTimer.current);
    setHovered(true);
    setDismissedValue(undefined);
  }

  /** Delay hover dismissal to allow pointer movement between the field and tooltip. */
  function leave() {
    closeTimer.current = setTimeout(() => setHovered(false), 150);
  }

  useLayoutEffect(() => {
    if (!open) return;
    /**
     * Anchor the error popup to the field and fit it within the viewport,
     * flipping above when necessary.
     */
    function position() {
      const input = inputRef.current;
      const tooltip = tooltipRef.current;
      if (!input || !tooltip) return;
      const anchor = input.getBoundingClientRect();
      const gutter = 12;
      const width = Math.min(anchor.width, window.innerWidth - gutter * 2);
      tooltip.style.width = `${width}px`;
      const height = tooltip.getBoundingClientRect().height;
      tooltip.style.left = `${Math.max(gutter, Math.min(anchor.left, window.innerWidth - width - gutter))}px`;
      const below = anchor.bottom + 8;
      tooltip.style.top = `${below + height <= window.innerHeight - gutter ? below : Math.max(gutter, anchor.top - height - 8)}px`;
    }
    position();
    /** Dismiss the tooltip for the current field value when Escape is pressed. */
    function dismiss(event: KeyboardEvent) {
      if (event.key === "Escape") setDismissedValue(value);
    }
    window.addEventListener("resize", position);
    document.addEventListener("scroll", position, true);
    document.addEventListener("keydown", dismiss);
    return () => {
      window.removeEventListener("resize", position);
      document.removeEventListener("scroll", position, true);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open, value]);

  return (
    <div className={fieldStyle}>
      <label htmlFor="person-birthdate">Date de naissance</label>
      <Input
        ref={inputRef}
        id="person-birthdate"
        placeholder="AAAA, AAAA-MM ou AAAA-MM-JJ"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={
          invalid
            ? "person-birthdate-error person-birthdate-help"
            : "person-birthdate-help"
        }
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => {
          setFocused(true);
          setDismissedValue(undefined);
        }}
        onBlur={() => {
          setFocused(false);
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") {
            enter();
          }
        }}
        onPointerLeave={leave}
      />
      <span id="person-birthdate-help" className="text-xs">
        Conservez la précision connue, ou laissez vide si la date est inconnue.
      </span>
      {invalid &&
        (open ? (
          createPortal(
            <span
              ref={tooltipRef}
              id="person-birthdate-error"
              role="tooltip"
              onPointerEnter={(event) => {
                if (event.pointerType !== "touch") enter();
              }}
              onPointerLeave={leave}
              className="fixed z-110 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs leading-5 text-red-950 shadow-md"
            >
              {message}
            </span>,
            document.body,
          )
        ) : (
          <span id="person-birthdate-error" className="sr-only">
            {message}
          </span>
        ))}
    </div>
  );
}
