const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const manifest = require("../package.json");
const read = file => readFileSync(path.resolve(__dirname, file), "utf8");

test("release metadata, direct install instructions and changelog stay aligned", () => {
  assert.equal(`${manifest.publisher}.${manifest.name}`, "freebasecloud.freebase-vscode");
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.ok(read("../CHANGELOG.md").includes(`## ${manifest.version}\n`));
  assert.ok(read("../README.md").includes(`${manifest.name}-${manifest.version}.vsix`));
  assert.equal(manifest.repository.url, "https://github.com/yyefet/freebase-cloud-vscode.git");
});
test("publishing needs explicit approval on the official default branch and uses OIDC only", () => {
  const workflow = read("../../../.github/workflows/publish.yml");
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /inputs\.approve && github\.repository == 'yyefet\/freebase-cloud-vscode'/);
  assert.match(workflow, /github\.event\.repository\.default_branch/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /vsce publish --oidc --packagePath/);
  assert.doesNotMatch(workflow, /VSCE_PAT|--pat\b|pull_request_target:|^\s+environment:/m);
  assert.ok(workflow.indexOf("actions/upload-artifact") < workflow.indexOf("vsce publish --oidc"));
});
test("package naming follows the source version instead of a fixed release number", () => {
  assert.equal(manifest.scripts.package, "pnpm run build && node scripts/package.cjs");
  assert.match(read("../scripts/package.cjs"), /manifest\.version/);
  assert.match(read("../.vscodeignore"), /scripts\/\*\*/);
});
