/** An inline form error: a danger-tinted box with `role="alert"`. */
export function FormError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-box bg-danger/10 px-3 py-2 text-sm text-danger ring-1 ring-danger/30">
      {children}
    </p>
  );
}
