import type { ComponentProps, ElementType, ReactNode } from "react";
import { CARD, LABEL, PAGE_TITLE, SECTION_TITLE, badgeClass, type BadgeTone } from "@/lib/ui";

function cls(base: string, extra?: string) {
  return extra ? `${base} ${extra}` : base;
}

/** A white card with a hairline ring (#230). Pass the padding (`p-4`, `p-6`) and `as` for semantics. */
export function Card({
  as: Tag = "div",
  className,
  children,
  ...rest
}: { as?: ElementType; className?: string; children?: ReactNode } & Omit<ComponentProps<"div">, "className">) {
  return (
    <Tag {...rest} className={cls(CARD, className)}>
      {children}
    </Tag>
  );
}

/** The page's `h1`. One per page. */
export function PageTitle({ className, ...rest }: ComponentProps<"h1">) {
  return <h1 {...rest} className={cls(PAGE_TITLE, className)} />;
}

/** A section heading (`h2` unless `as` says otherwise). */
export function SectionTitle({
  as: Tag = "h2",
  className,
  ...rest
}: { as?: "h2" | "h3" } & ComponentProps<"h2">) {
  return <Tag {...rest} className={cls(SECTION_TITLE, className)} />;
}

/** Small caps label ("GEISHA · NATURAL"). Latin is spaced out, Chinese isn't (`.label-caps`). */
export function Label({ as: Tag = "p", className, ...rest }: { as?: "p" | "span" | "dt" | "h3" } & ComponentProps<"p">) {
  return <Tag {...rest} className={cls(LABEL, className)} />;
}

/** A small status pill. */
export function Badge({ tone = "soft", className, ...rest }: { tone?: BadgeTone } & ComponentProps<"span">) {
  return <span {...rest} className={badgeClass(tone, className)} />;
}
