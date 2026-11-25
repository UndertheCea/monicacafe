import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { buttonClass, buttonState, type ButtonSize, type ButtonVariant } from "@/lib/ui";

type Common = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to the container's width. */
  full?: boolean;
  /**
   * Working: the button is marked aria-disabled + aria-busy, ignores clicks and Enter-to-submit, and shows a pulsing
   * dot after its label. It is not `disabled`, so it keeps keyboard focus (#510). Pass a client-side value only.
   */
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
  const { type = "button", disabled, onClick, ...buttonRest } = rest as Omit<AsButton, keyof Common>;
  const st = buttonState(pending, disabled);
  return (
    <button
      {...buttonRest}
      type={type}
      disabled={st.disabled}
      aria-disabled={st["aria-disabled"] ?? buttonRest["aria-disabled"]}
      aria-busy={st["aria-busy"] ?? buttonRest["aria-busy"]}
      // Only a busy button needs a handler of its own: server components never pass `pending`, so they stay handler-free.
      onClick={
        st.ignore
          ? (e) => {
              // Also stops Enter in a field from submitting the form: implicit submission clicks the default button.
              e.preventDefault();
            }
          : onClick
      }
      className={cls}
    >
      {children}
      {pending && <PendingDot />}
    </button>
  );
}
