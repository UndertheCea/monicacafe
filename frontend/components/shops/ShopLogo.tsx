import { shopInitials } from "@/lib/shopInitials";

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
        // Logos come from our media bucket (backend/internal/storage), so plain <img> is fine.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <span>{shopInitials(name)}</span>
      )}
    </div>
  );
}
