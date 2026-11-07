// Dashboard engagement line (lib/dashboard/engagement.ts). Run with `npm test`.
import assert from "node:assert/strict";
import { test } from "node:test";
import { engagementParts } from "../lib/dashboard/engagement.ts";

test("engagementParts picks singular / plural keys and clamps bad counts", () => {
  const cases = [
    ["none", { commentCount: 0, saveCount: 0 }, [["dash.comments.other", 0], ["dash.saves.other", 0]]],
    ["one each", { commentCount: 1, saveCount: 1 }, [["dash.comments.one", 1], ["dash.saves.one", 1]]],
    ["many", { commentCount: 12, saveCount: 3 }, [["dash.comments.other", 12], ["dash.saves.other", 3]]],
    ["missing", {}, [["dash.comments.other", 0], ["dash.saves.other", 0]]],
    ["negative / null", { commentCount: -2, saveCount: null }, [["dash.comments.other", 0], ["dash.saves.other", 0]]],
  ];
  for (const [name, input, want] of cases) {
    assert.deepEqual(
      engagementParts(input).map((p) => [p.key, p.n]),
      want,
      name,
    );
  }
});
