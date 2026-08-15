"use client";

import { useEffect } from "react";

export interface ModalProps {
  open: boolean;
  children: React.ReactNode;
  ariaLabel: string;
  /** Omit for a mandatory flow (e.g. the onboarding quiz) — no overlay-click
   * or Escape dismissal when there's nothing to fall back to. */
  onClose?: () => void;
  maxWidthClassName?: string;
}

/**
 * The one Dialog/modal primitive for the app — a plain fixed-overlay
 * pattern (no portal library needed; `position: fixed` already escapes
 * normal layout flow, the same technique the results page's mobile drawer
 * and MimirChatPanel already use), styled to the charcoal-surface/pure-
 * black-page system (Task 1 STYLE spec). Used for the quiz's Questionnaire
 * Dialog and the "Retake the Quiz" confirmation.
 */
export function Modal({ open, children, ariaLabel, onClose, maxWidthClassName = "max-w-lg" }: ModalProps) {
  useEffect(() => {
    if (!open || !onClose) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0"
        style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`relative w-full ${maxWidthClassName} max-h-[90vh] overflow-y-auto rounded-lg p-6 shadow-xl`}
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        {children}
      </div>
    </div>
  );
}
