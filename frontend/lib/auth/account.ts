// Pure checks for the /account forms. No imports, so `node --test` can load
// this file directly. The backend re-validates everything.

export type PasswordChangeProblem = "current" | "password" | "same" | "mismatch";

/** First problem with a change-password form, or null when it can be sent. */
export function passwordChangeProblem(current: string, next: string, confirm: string): PasswordChangeProblem | null {
  if (!current) return "current";
  const bytes = new TextEncoder().encode(next).length;
  if ([...next].length < 8 || bytes > 72) return "password";
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
