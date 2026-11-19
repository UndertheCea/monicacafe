// Where focus goes after an action removes the row it was on (#405, WCAG 2.4.3).
// Pure, no imports, so `npm test` can load it; the DOM side is
// `components/focusAfterRemoval.ts`.

/** A row as shown, in order: its id and whether it has an action button to land on. */
export interface FocusRow {
  id: string;
  hasAction: boolean;
}

export type RowFocusTarget = { kind: "row"; id: string } | { kind: "heading" };

/**
 * The nearest row after the removed one that has an action, else the nearest
 * one before it, else the section heading. `rows` is the list before the
 * removal; an unknown `removedId` is treated as the first row.
 */
export function rowFocusTarget(rows: FocusRow[], removedId: string): RowFocusTarget {
  const at = Math.max(0, rows.findIndex((r) => r.id === removedId));
  for (let i = at; i < rows.length; i++) {
    if (rows[i].id !== removedId && rows[i].hasAction) return { kind: "row", id: rows[i].id };
  }
  for (let i = at - 1; i >= 0; i--) {
    if (rows[i].id !== removedId && rows[i].hasAction) return { kind: "row", id: rows[i].id };
  }
  return { kind: "heading" };
}
