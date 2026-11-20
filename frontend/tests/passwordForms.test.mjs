// Forms that hold a password post, never GET (#422): a submit before hydration
// (or without JavaScript) would otherwise put the password in the URL, the
// browser history and the access logs. Run with `npm test`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("..", import.meta.url).pathname;

function* tsx(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* tsx(p);
    else if (p.endsWith(".tsx")) yield p;
  }
}

test("every <form> in a file with a password field has method=\"post\"", () => {
  let checked = 0;
  for (const dir of ["app", "components"]) {
    for (const file of tsx(join(root, dir))) {
      const src = readFileSync(file, "utf8");
      if (!src.includes('type="password"')) continue;
      // The attribute comes first or soon after `<form` (before any handler body).
      for (const m of src.matchAll(/<form\b/g)) {
        const line = src.slice(src.lastIndexOf("\n", m.index) + 1, m.index).trim();
        if (line.startsWith("*") || line.startsWith("//")) continue; // a comment mentioning <form>
        checked++;
        const head = src.slice(m.index, m.index + 80);
        assert.match(head, /method="post"/, `${file.slice(root.length)}: ${head}`);
      }
    }
  }
  assert.ok(checked >= 2, "found the login / register and account forms");
});
