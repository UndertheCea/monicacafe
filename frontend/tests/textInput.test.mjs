// Naming refused text (lib/textInput.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasInvisibleChars, textInputErrorKey, textLength } from "../lib/textInput.ts";

test("textLength counts code points of the trimmed text", () => {
  assert.equal(textLength("  abc  "), 3);
  assert.equal(textLength("咖啡😀"), 3);
  assert.equal(textLength(""), 0);
});

test("textInputErrorKey: length message only when too long, else invisible characters", () => {
  assert.equal(textInputErrorKey("a".repeat(81), 80, "shop.error.name"), "shop.error.name");
  assert.equal(textInputErrorKey("a".repeat(80), 80, "shop.error.name"), "form.error.badChars");
  assert.equal(textInputErrorKey("Moni​Cafe", 80, "shop.error.name"), "form.error.badChars");
  // Emoji count as one character each, not two.
  assert.equal(textInputErrorKey("😀".repeat(50), 50, "auth.error.displayName"), "form.error.badChars");
});

test("hasInvisibleChars finds control and format characters only", () => {
  assert.equal(hasInvisibleChars("a​b"), true);
  assert.equal(hasInvisibleChars("a\u0007b"), true);
  assert.equal(hasInvisibleChars("a⁠b"), true);
  assert.equal(hasInvisibleChars("Moni 咖啡 ☕"), false);
  assert.equal(hasInvisibleChars("  padded  "), false);
});
