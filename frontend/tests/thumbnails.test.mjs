// Thumbnails and catalogue caching (#235). Run with `npm test`.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CACHE_TAGS, CATALOGUE_REVALIDATE, catalogueFetchOptions } from "../lib/catalogueCache.ts";
import { THUMB_WIDTH, thumbSize, thumbUrl } from "../lib/thumb.ts";

const SHOP = "0b6f9a5e-3c1d-4e2f-9a8b-7c6d5e4f3a2b";

test("thumbUrl derives the thumbnail of our bucket's originals only", () => {
  const cases = [
    [`http://localhost/media/shops/${SHOP}/logo-0123456789abcdef01234567.jpg`, `http://localhost/media/shops/${SHOP}/logo-0123456789abcdef01234567.thumb.webp`],
    [`https://cdn.monicafe.tw/coffees/${SHOP}/photo-89abcdef0123456789abcdef.webp`, `https://cdn.monicafe.tw/coffees/${SHOP}/photo-89abcdef0123456789abcdef.thumb.webp`],
    [`https://cdn.monicafe.tw/coffees/${SHOP}/photo-89abcdef0123456789abcdef.png`, `https://cdn.monicafe.tw/coffees/${SHOP}/photo-89abcdef0123456789abcdef.thumb.webp`],
    [`https://cdn.monicafe.tw/coffees/${SHOP}/photo-89abcdef0123456789abcdef.thumb.webp`, null],
    [`https://cdn.monicafe.tw/coffees/${SHOP}/photo-89abcdef0123456789abcdef.jpg?v=2`, null],
    ["https://example.com/photo.jpg", null],
    [`https://example.com/other/${SHOP}/photo-89abcdef0123456789abcdef.jpg`, null],
    ["", null],
    [null, null],
    [undefined, null],
  ];
  for (const [input, want] of cases) assert.equal(thumbUrl(input), want, String(input));
});

test("thumbSize scales to 640 wide and never enlarges", () => {
  assert.deepEqual(thumbSize(2000, 1500), { width: THUMB_WIDTH, height: 480 });
  assert.deepEqual(thumbSize(1280, 1920), { width: THUMB_WIDTH, height: 960 });
  assert.deepEqual(thumbSize(500, 300), { width: 500, height: 300 });
  assert.deepEqual(thumbSize(640, 640), { width: 640, height: 640 });
  assert.deepEqual(thumbSize(4000, 1), { width: THUMB_WIDTH, height: 1 });
  assert.deepEqual(thumbSize(0, 10), { width: 0, height: 10 });
});

test("catalogue fetches revalidate every minute with their tags", () => {
  assert.equal(CATALOGUE_REVALIDATE, 60);
  assert.deepEqual(catalogueFetchOptions([CACHE_TAGS.home]), { revalidate: 60, tags: ["catalogue:home"] });
  assert.equal(new Set(Object.values(CACHE_TAGS)).size, Object.values(CACHE_TAGS).length);
});

function sources(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

test("every image goes through <Picture>", () => {
  for (const file of [...sources("app"), ...sources("components")]) {
    if (file.endsWith(join("ui", "Picture.tsx"))) continue;
    assert.ok(!/<img[\s>]/.test(readFileSync(file, "utf8")), `${file} uses a plain <img>; use <Picture> from @/components/ui`);
  }
});

test("cached queries carry no viewer state", () => {
  const graphql = readFileSync("lib/graphql.ts", "utf8");
  const body = graphql.slice(graphql.indexOf("export function cachedClient"), graphql.indexOf("export function authedClient"));
  assert.ok(body.includes("next }"), "cachedClient passes next.revalidate");
  assert.ok(!/credentials|Authorization|headers|no-store/.test(body.replace(/\/\*[\s\S]*?\*\//, "")), "cachedClient must not send cookies, tokens or per-visitor headers");
});
