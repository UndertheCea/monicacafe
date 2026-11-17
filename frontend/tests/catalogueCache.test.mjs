import { test } from "node:test";
import assert from "node:assert/strict";
import { GraphQLClient } from "graphql-request";
import { catalogueCacheKey } from "../lib/catalogueCache.ts";

test("catalogueCacheKey: same query + variables in any key order share a key", () => {
  const a = catalogueCacheKey("{ x }", { limit: 10, offset: 20, f: { b: 1, a: [2, { d: 3, c: 4 }] } });
  const b = catalogueCacheKey("{ x }", { f: { a: [2, { c: 4, d: 3 }], b: 1 }, offset: 20, limit: 10 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(catalogueCacheKey("{ x }", { limit: 10 }), catalogueCacheKey("{ x }", { limit: 11 }));
  assert.notDeepEqual(catalogueCacheKey("{ x }"), catalogueCacheKey("{ y }"));
  assert.deepEqual(catalogueCacheKey("{ x }"), catalogueCacheKey("{ x }", {}));
  assert.deepEqual(catalogueCacheKey("{ x }", { a: undefined }), catalogueCacheKey("{ x }", {}));
});

// cachedServerQuery relies on this: a GraphQL error sent as HTTP 200 makes
// the request throw, and a thrown call is never stored by unstable_cache.
test("a 200 response with GraphQL errors throws, so it is never cached (#361)", async () => {
  const bodies = [
    { errors: [{ message: "db down", extensions: { code: "INTERNAL" } }], data: null },
    { data: { x: 1 } },
  ];
  let calls = 0;
  const client = new GraphQLClient("http://api.test/graphql", {
    fetch: async () =>
      new Response(JSON.stringify(bodies[calls++]), { status: 200, headers: { "content-type": "application/json" } }),
  });
  await assert.rejects(client.request("{ x }"));
  assert.deepEqual(await client.request("{ x }"), { x: 1 });
  assert.equal(calls, 2);
});
