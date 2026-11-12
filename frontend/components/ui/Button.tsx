import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/lib/ui";

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  full?: boolean;
  /** Working: the button is disabled, marked aria-busy and shows a pulsing dot after its label. */
  pending?: boolean;
  className?: string;
  children: ReactNode;
};

type AsButton = Common & Omit<ComponentProps<"button">, "className" | "children"> & { href?: undefined };
type AsLink = Common & Omit<ComponentProps<typeof Link>, "className" | "children">;

function PendingDot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" />;
}

/**
 * The one button (#230). Renders a `<button>` (type="button" unless set), or a Next `<Link>` when `href` is given.
 * Server-component friendly: no client state of its own.
 */
export function Button(props: AsButton | AsLink) {
  const { variant, size, full, pending = false, className, children, ...rest } = props;
  const cls = buttonClass({ variant, size, full, className });
  if (rest.href !== undefined) {
    return (
      <Link {...(rest as Omit<AsLink, keyof Common>)} className={cls}>
        {children}
      </Link>
    );
  }
  const { type = "button", disabled, ...buttonRest } = rest as Omit<AsButton, keyof Common>;
  return (
    <button {...buttonRest} type={type} disabled={disabled || pending} aria-busy={pending || undefined} className={cls}>
      {children}
      {pending && <PendingDot />}
    </button>
  );
}
