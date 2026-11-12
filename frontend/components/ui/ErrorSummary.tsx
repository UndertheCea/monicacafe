"use client";

import type { ReactNode } from "react";

/**
 * The one-line summary above a refused form (#232): the form-level message, or "please fix the marked fields",
 * with a link to the first problem. It takes focus when only the form (no field) has a problem.
 */
export function ErrorSummary({
  formId,
  message,
  firstFieldId,
  jumpLabel,
}: {
  formId: string;
  message: ReactNode;
  /** DOM id of the first invalid field, if any. */
  firstFieldId?: string;
  /** Link text, e.g. "前往第一個問題". */
  jumpLabel?: ReactNode;
}) {
  return (
    <div
      id={`${formId}-summary`}
      tabIndex={-1}
      role="alert"
      className="rounded-box bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-danger/30"
    >
      {message}
      {firstFieldId && jumpLabel && (
        <>
          {" "}
          <a
            href={`#${firstFieldId}`}
            className="font-semibold underline underline-offset-4"
            onClick={(e) => {
              const el = document.getElementById(firstFieldId);
              if (!el) return;
              e.preventDefault();
              el.focus();
            }}
          >
            {jumpLabel}
          </a>
        </>
      )}
    </div>
  );
}
