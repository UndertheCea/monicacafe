import type { ReactNode } from "react";

interface Props {
  /** The toggle's text on phones, e.g. "Filters (2)". */
  summary: string;
  children: ReactNode;
}

// Phones: the filter form folds behind a toggle so results come first.
// Desktop (lg+): always shown, no toggle. Pure CSS (a visually hidden
// checkbox + its label), so it works without JavaScript at every width; the
// checkbox sits outside the form, so it's never submitted.
export function FilterPanel({ summary, children }: Props) {
  return (
    <div>
      <input id="filter-toggle" type="checkbox" aria-controls="filter-panel" className="peer sr-only lg:hidden" />
      <label
        htmlFor="filter-toggle"
        className="flex cursor-pointer items-center justify-between rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-ink ring-1 ring-neutral-200 peer-checked:[&>span]:rotate-180 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink lg:hidden"
      >
        {summary}
        <span aria-hidden="true" className="text-neutral-500 transition">
          ▾
        </span>
      </label>
      <div id="filter-panel" className="mt-3 hidden peer-checked:block lg:mt-0 lg:block">
        {children}
      </div>
    </div>
  );
}
