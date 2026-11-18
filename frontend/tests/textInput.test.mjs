// Naming refused text (lib/textInput.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { capChars, capInput, hasInvisibleChars, textInputErrorKey, textLength } from "../lib/textInput.ts";

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

test("capChars / capInput cut by characters, not UTF-16 units (#395)", () => {
  const astral = "𠮷".repeat(30);
  assert.equal(astral.length, 60);
  assert.equal(capChars(astral, 30), astral);
  assert.equal([...capChars(astral + "x", 30)].length, 30);
  assert.equal(capChars("abc", 5), "abc");
  assert.equal(capChars("abcdef", 3), "abc");
  const el = { value: "😀".repeat(5) };
  capInput(el, 3);
  assert.equal(el.value, "😀😀😀");
});
