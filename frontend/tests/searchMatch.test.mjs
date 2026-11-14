// Search-result "matched" line helpers (lib/searchMatch.ts, #274). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SNIPPET_RADIUS, cardSearchFields, findSearchMatch, indexOfFold, snippet } from "../lib/searchMatch.ts";

const coffee = {
  name: "Kochere 水洗",
  flavorNotes: ["茉莉花", "檸檬", "紅茶", "蜂蜜", "佛手柑"],
  region: "耶加雪菲",
  producer: "Kochere 合作社",
  variety: { name: "Heirloom" },
  originCountry: { nameEn: "Ethiopia", nameZh: "衣索比亞" },
  processingMethod: { nameEn: "Washed", nameZh: "水洗" },
  shop: { name: "Moni Roasters" },
  description: "A bright, tea-like cup grown at 2,000 m by smallholders around the Kochere town.",
};
const zh = cardSearchFields(coffee, "zh-TW");
const en = cardSearchFields(coffee, "en");

test("indexOfFold is case-insensitive and keeps positions", () => {
  assert.equal(indexOfFold("Yirgacheffe Kochere", "kochere"), 12);
  assert.equal(indexOfFold("abc", ""), -1);
  assert.equal(indexOfFold("abc", "x"), -1);
});

test("nothing to explain when every typed word is visible", () => {
  assert.equal(findSearchMatch(zh, [["kochere"]]), null);
  assert.equal(findSearchMatch(zh, [["茉莉花", "Jasmine", "茉莉"]]), null);
  assert.equal(findSearchMatch(zh, []), null);
});

test("a synonym match names the field and marks the text", () => {
  const m = findSearchMatch(zh, [["Yirgacheffe", "Yirgachefe", "耶加雪菲", "耶加雪啡"]]);
  assert.deepEqual(m, { field: "region", before: "", match: "耶加雪菲", after: "" });
});

test("the first word needing an explanation wins; visible words are skipped", () => {
  const m = findSearchMatch(zh, [["Kochere"], ["Bergamot", "佛手柑"]]);
  assert.equal(m?.field, "notes");
  assert.equal(m?.match, "佛手柑");
});

test("a note beyond the visible four is explained even when typed exactly", () => {
  const m = findSearchMatch(zh, [["佛手柑"]]);
  assert.equal(m?.field, "notes");
});

test("the other language's origin name is not visible", () => {
  assert.equal(findSearchMatch(en, [["Ethiopia"]]), null);
  assert.equal(findSearchMatch(zh, [["Ethiopia", "衣索比亞"]])?.field, "origin");
  // English page, Chinese query: the card shows "Ethiopia", so the line says why.
  assert.equal(findSearchMatch(en, [["衣索比亞", "Ethiopia"]])?.match, "Ethiopia");
});

test("a description match is cut to a snippet with ellipses", () => {
  const m = findSearchMatch(zh, [["smallholders"]]);
  assert.equal(m?.field, "description");
  assert.equal(m?.match, "smallholders");
  assert.ok(m?.before.startsWith("…"));
  assert.ok(m?.after.endsWith("…"));
  assert.ok(m.before.length <= SNIPPET_RADIUS + 1);
  assert.ok(m.after.length <= SNIPPET_RADIUS + 1);
});

test("no field contains the word: no line", () => {
  assert.equal(findSearchMatch(zh, [["ristretto"]]), null);
  // Without the description fetched, a description-only match can't be explained.
  assert.equal(findSearchMatch(cardSearchFields({ ...coffee, description: undefined }, "zh-TW"), [["smallholders"]]), null);
});

test("snippet keeps the matched text as typed by the seller and flattens whitespace", () => {
  const s = snippet("description", "line one\n\nGeisha lot", 10, 16);
  assert.deepEqual(s, { field: "description", before: "line one ", match: "Geisha", after: " lot" });
});
