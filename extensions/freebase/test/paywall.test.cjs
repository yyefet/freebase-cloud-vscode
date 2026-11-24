const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

test("creation paywall offers trusted website sign-in and billing, without creating a panel", async () => {
  const commands = new Map();
  const warnings = [];
  const external = [];
  const errors = [];
  const mock = {
    EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} },
    TreeItem: class {},
    ThemeIcon: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    StatusBarAlignment: { Left: 1 },
    workspace: {
      getConfiguration: () => ({ get: () => "https://freebase.cloud" }),
      onDidChangeConfiguration: () => ({ dispose() {} }),
    },
    commands: { registerCommand: (name, fn) => { commands.set(name, fn); return { dispose() {} }; } },
    Uri: { parse: value => value },
    env: { openExternal: async uri => { external.push(uri); return true; } },
    window: {
      registerTreeDataProvider: () => ({ dispose() {} }),
      createStatusBarItem: () => ({ show() {}, dispose() {} }),
      showQuickPick: async () => "mysql",
      showInputBox: async () => "another mysql",
      showErrorMessage: async message => errors.push(message),
      showWarningMessage: async (message, _options, action) => { warnings.push(message); return action; },
      createWebviewPanel: () => { throw new Error("A blocked create must not open a database"); },
    },
  };
  const load = Module._load;
  const originalFetch = global.fetch;
  Module._load = function(name, parent, isMain) { return name === "vscode" ? mock : load.call(this, name, parent, isMain); };
  let attempts = 0;
  global.fetch = async (url, options) => {
    assert.equal(url, "https://freebase.cloud/api/vscode/service/database-instances");
    assert.equal(options.method, "POST");
    attempts++;
    return new Response(JSON.stringify({ error: "Upgrade required", code: "INSTANCE_UPGRADE_REQUIRED" }), {
      status: 402, headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const extension = require("../dist/extension.cjs");
    extension.activate({ subscriptions: [], secrets: { get: async () => "test-only-placeholder" } });
    await commands.get("freebase.createDatabase")();
    assert.equal(attempts, 1, "never retries a blocked creation");
    assert.equal(errors.length, 0);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /one instance per database type/);
    assert.match(warnings[0], /subscribe to Pro/);
    assert.match(warnings[0], /Sharing remains free/);
    const upgrade = new URL(external[0]);
    assert.equal(upgrade.origin, "https://freebase.cloud");
    assert.equal(upgrade.pathname, "/api/login");
    assert.equal(upgrade.searchParams.get("returnTo"), "/settings?tab=billing");
    extension.deactivate();
  } finally { Module._load = load; global.fetch = originalFetch; }
});
