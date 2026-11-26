// Password length rule (lib/auth/password.ts), mirroring auth.ValidatePassword. Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { passwordLengthOk } from "../lib/auth/password.ts";

test("passwordLengthOk matches the API's length rule", () => {
  const cases = [
    ["abcdefgh", true],
    ["abcdefg", false],
    ["咖啡咖啡咖啡咖啡", true], // 8 characters, 24 bytes
    ["a".repeat(72), true],
    ["a".repeat(73), false],
    ["咖".repeat(25), false], // 75 bytes
    // Surrounding spaces don't count towards the minimum (#535)...
    ["        ", false],
    ["abc     ", false],
    ["\tabcdefg\n", false],
    // ...but count towards the byte cap, and inner spaces count.
    [" abcdefgh ", true],
    ["abc  def", true],
    [" " + "a".repeat(72), false],
  ];
  for (const [pw, want] of cases) assert.equal(passwordLengthOk(pw), want, JSON.stringify(pw));
});
