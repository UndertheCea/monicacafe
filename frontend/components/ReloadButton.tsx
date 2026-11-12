"use client";

import { Button } from "@/components/ui";

/** "Try again" for server-rendered error panels: reloads the page (re-runs the failed fetch). */
export function ReloadButton({ label }: { label: string }) {
  return (
    <Button type="button" variant="danger" onClick={() => window.location.reload()}>
      {label}
    </Button>
  );
}
