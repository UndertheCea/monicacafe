// Password length rule shared by register, change password and the BFF.
// No imports, so `node --test` can load this file directly.

/** Backend auth.ValidatePassword: at least 8 characters (code points, like utf8.RuneCountInString)... */
export const PASSWORD_MIN_CHARS = 8;
/** ...and at most 72 bytes of UTF-8 (bcrypt's limit). */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Whether a new password meets the API's length rules. Login doesn't use it.
 * The minimum counts the password without surrounding spaces, like the API
 * (eight spaces are not a password, #535); the byte cap counts all of it.
 */
export function passwordLengthOk(pw: string): boolean {
  return [...pw.trim()].length >= PASSWORD_MIN_CHARS && new TextEncoder().encode(pw).length <= PASSWORD_MAX_BYTES;
}
