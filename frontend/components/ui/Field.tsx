import type { ComponentProps, ReactNode } from "react";
import { FIELD_CONTROL, FIELD_LABEL, SEARCH_CONTROL, describedBy, fieldIds } from "@/lib/ui";

/** The props a control needs to be tied to its label, hint and error. */
export type ControlProps = { id: string; "aria-describedby"?: string; "aria-invalid"?: true };

/**
 * Label + control + hint + error, wired together (#230): the label points at the control, the control's
 * `aria-describedby` names the error and the hint, and `aria-invalid` is set while there is an error.
 * `children` receives those props: `<Field id="email" label="Email">{(p) => <Input {...p} type="email" />}</Field>`.
 */
export function Field({
  id,
  label,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: (control: ControlProps) => ReactNode;
}) {
  const ids = fieldIds(id);
  const control: ControlProps = { id, "aria-describedby": describedBy(id, !!hint, !!error) };
  if (error) control["aria-invalid"] = true;
  return (
    <div className={className}>
      <label htmlFor={id} className={FIELD_LABEL}>
        {label}
      </label>
      <div className="mt-1">{children(control)}</div>
      {error && (
        <p id={ids.error} className="mt-1 text-sm text-danger">
          {error}
        </p>
      )}
      {hint && (
        <p id={ids.hint} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function cls(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

/** A text input in the field style. `search` gives the pill-shaped search box. */
export function Input({ className, search = false, ...rest }: ComponentProps<"input"> & { search?: boolean }) {
  return <input {...rest} className={cls(search ? SEARCH_CONTROL : FIELD_CONTROL, className)} />;
}

export function Select({ className, ...rest }: ComponentProps<"select">) {
  return <select {...rest} className={cls(FIELD_CONTROL, className)} />;
}

export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  return <textarea {...rest} className={cls(`${FIELD_CONTROL} resize-y`, className)} />;
}
