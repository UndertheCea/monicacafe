// Pure checks for the /account forms. Only imports with a .ts extension, so
// `node --test` can load this file directly. The backend re-validates everything.
import { passwordLengthOk } from "./password.ts";

export type PasswordChangeProblem = "current" | "password" | "same" | "mismatch";

/** First problem with a change-password form, or null when it can be sent. */
export function passwordChangeProblem(current: string, next: string, confirm: string): PasswordChangeProblem | null {
  if (!current) return "current";
  if (!passwordLengthOk(next)) return "password";
  if (next === current) return "same";
  if (next !== confirm) return "mismatch";
  return null;
}

/** Trimmed display name, or null when it isn't 1–50 characters. */
export function cleanDisplayName(name: string): string | null {
  const v = name.trim();
  const n = [...v].length;
  return n >= 1 && n <= 50 ? v : null;
}

/**
 * Whether saving the display-name form needs a request: not when the cleaned
 * name is the one already saved (the API would answer the same user; #340).
 */
export function displayNameChanged(clean: string, current: string | undefined): boolean {
  return clean !== current;
}

/** Message key for a backend error from changePassword. */
export function passwordErrorKey(
  code: string,
  field?: string,
): "account.error.current" | "auth.error.password" | "auth.error.unavailable" | "account.error.generic" {
  if (code === "BAD_USER_INPUT" && field === "currentPassword") return "account.error.current";
  if (code === "BAD_USER_INPUT" && field === "newPassword") return "auth.error.password";
  if (code === "UNAVAILABLE") return "auth.error.unavailable";
  return "account.error.generic";
}

/**
 * Why this account can't be deleted from /account, or null when it can. The
 * API refuses shop owners (their coffees and links depend on the account) and
 * admins; checking here lets the page explain instead of offering a form.
 */
export function accountDeletionBlock(user: { role: string; shop: unknown }): "shop" | "admin" | null {
  if (user.shop) return "shop";
  if (user.role === "ADMIN") return "admin";
  return null;
}

/** Message key for a backend error from deleteAccount. */
export function deleteAccountErrorKey(
  code: string,
  field?: string,
): "account.error.deletePassword" | "account.delete.blockedShop" | "auth.error.unavailable" | "account.error.generic" {
  if (code === "BAD_USER_INPUT" && field === "password") return "account.error.deletePassword";
  if (code === "FORBIDDEN") return "account.delete.blockedShop";
  if (code === "UNAVAILABLE") return "auth.error.unavailable";
  return "account.error.generic";
}

/**
 * File name for "download my data" (#270): the Taipei calendar date, so a
 * download just after midnight in Taiwan isn't dated the day before.
 */
export function exportFileName(now: Date): string {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return `monicafe-data-${day}.json`;
}

/** Pretty-prints the export (the API sends compact JSON); throws on bad JSON. */
export function formatExport(raw: string): string {
  return JSON.stringify(JSON.parse(raw), null, 2) + "\n";
}

/** The state of an inline "are you sure?" row on /account (#389). */
export type ConfirmStep = { confirming: boolean; busy: boolean };

/**
 * Where focus goes when a hand-built confirm row changes (#389), so keyboard and screen-reader users never land on
 * `<body>` when the focused button unmounts: "yes" when the row opens or comes back after a failed action (the Yes
 * button was disabled while busy), "trigger" when it closes and the close asked for focus back (Cancel, Esc, a failed
 * delete), otherwise null — e.g. typing in the password field closes the row without moving focus.
 */
export function confirmFocusTarget(prev: ConfirmStep, next: ConfirmStep, returnFocus: boolean): "yes" | "trigger" | null {
  if (next.confirming && !next.busy && (!prev.confirming || prev.busy)) return "yes";
  if (prev.confirming && !next.confirming && returnFocus) return "trigger";
  return null;
}
