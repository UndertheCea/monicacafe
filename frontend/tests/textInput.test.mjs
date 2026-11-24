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

test("hasInvisibleChars finds control and format characters", () => {
  assert.equal(hasInvisibleChars("a​b"), true);
  assert.equal(hasInvisibleChars("a\u0007b"), true);
  assert.equal(hasInvisibleChars("a⁠b"), true);
  assert.equal(hasInvisibleChars("Moni 咖啡 ☕"), false);
  assert.equal(hasInvisibleChars("  padded  "), false);
});

test("hasInvisibleChars matches what the API refuses (#502)", () => {
  // Letters that render blank (twfmt isBlankLooking) are refused although they aren't Cf.
  for (const c of ["\u115F", "\u1160", "\u3164", "\uFFA0", "\u2800", "\u17B4", "\u17B5"]) {
    assert.equal(hasInvisibleChars(`Ethiopia${c}`), true, c.codePointAt(0).toString(16));
  }
  // Text that draws nothing: only combining marks, variation selectors or joiners.
  assert.equal(hasInvisibleChars("\u0301\u0301"), true);
  assert.equal(hasInvisibleChars("\uFE0F"), true);
  assert.equal(hasInvisibleChars("\u200D"), true);
  // The zero-width joiner inside an emoji sequence is allowed, and so are accents on letters.
  assert.equal(hasInvisibleChars("Chef 👨\u200D🍳"), false);
  assert.equal(hasInvisibleChars("Cafe\u0301"), false);
  assert.equal(hasInvisibleChars("☕\uFE0F"), false);
  assert.equal(hasInvisibleChars(""), false);
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

test("shopNameErrorKey names why a shop name was refused (#444)", async () => {
  const { shopNameErrorKey } = await import("../lib/textInput.ts");
  assert.equal(shopNameErrorKey("x".repeat(81), 80), "shop.error.name");
  assert.equal(shopNameErrorKey("好咖啡​", 80), "form.error.badChars");
  assert.equal(shopNameErrorKey("Moni Cafe 客服", 80), "shop.error.nameReserved");
});
