// "Saved" confirmation state (#556). Loadable by `node --test`.

/** Whether the "Saved" note stays after a field changes from `before` to `after`: any real edit clears it. */
export function savedAfterEdit(saved: boolean, before: string | boolean, after: string | boolean): boolean {
  return before === after ? saved : false;
}
