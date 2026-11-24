import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeEnvironment, integrationExample } from "../src/env.ts";

test("appends integration without altering unrelated values", () => {
  const result = mergeEnvironment("# Keep this\nOTHER='value with spaces'\n", { FREEBASE_URL: "https://example.test", FREEBASE_API_KEY: "secret" });
  assert.match(result.content, /OTHER='value with spaces'/);
  assert.match(result.content, /FREEBASE_API_KEY="secret"/);
  assert.deepEqual(result.conflicts, []);
});
test("never silently overwrites existing integration", () => {
  const original = "FREEBASE_API_KEY=existing\nOTHER=keep\n";
  const blocked = mergeEnvironment(original, { FREEBASE_API_KEY: "replacement" });
  assert.equal(blocked.content, original);
  assert.deepEqual(blocked.conflicts, ["FREEBASE_API_KEY"]);
  assert.match(mergeEnvironment(original, { FREEBASE_API_KEY: "replacement" }, true).content, /OTHER=keep/);
});
test("refuses duplicate and multiline target entries", () => {
  assert.throws(() => mergeEnvironment("FREEBASE_URL=one\nFREEBASE_URL=two", { FREEBASE_URL: "new" }), /Duplicate/);
  assert.throws(() => mergeEnvironment('FREEBASE_URL="one\ntwo"', { FREEBASE_URL: "new" }, true), /Multiline/);
});
test("quotes configuration and supplies a real authenticated instance header", () => {
  const result = mergeEnvironment("", { FREEBASE_URL: "https://example.test" });
  assert.match(result.content, /FREEBASE_URL="https:\/\/example.test"/);
  assert.match(integrationExample(), /X-Database-Instance/);
  assert.match(integrationExample(), /Authorization:'Bearer '/);
  assert.doesNotMatch(integrationExample(), /fbk_[a-f0-9]{64}/);
});
