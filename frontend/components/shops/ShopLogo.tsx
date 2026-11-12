import { shopInitials } from "@/lib/shopInitials";
import { Picture } from "@/components/ui";

const SIZES = {
  sm: "h-12 w-12 text-base",
  md: "h-14 w-14 text-lg",
  lg: "h-24 w-24 text-3xl",
} as const;

/**
 * A shop's round logo, or — without one — a white circle outlined in black with the shop's initials
 * (#112). Decorative: the shop's name is always written next to it, so it has no accessible name.
 */
export function ShopLogo({
  name,
  logoUrl,
  size,
  className = "",
}: {
  name: string;
  logoUrl: string | null | undefined;
  size: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`grid shrink-0 place-items-center overflow-hidden rounded-full bg-paper font-bold tracking-tight text-ink ${
        logoUrl ? "ring-1 ring-line" : "ring-1 ring-ink"
      } ${SIZES[size]} ${className}`}
    >
      {logoUrl ? (
        <Picture src={logoUrl} thumb width={96} height={96} alt="" />
      ) : (
        <span>{shopInitials(name)}</span>
      )}
    </div>
  );
}
