const { test } = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const key = `fbk_${"a".repeat(64)}`; // Test-only placeholder; never a real credential.
const account = "import-fixture";
const origin = "https://freebase.cloud";
const fixtures = [
  { id: "existing-owned", name: "Existing postgres", engine: "postgresql", access: "owner", ownerName: "You" },
  { id: "existing-shared", name: "Shared mongo", engine: "mongodb", access: "viewer", ownerName: "Owner" },
];

function harness(options = {}) {
  const commands = new Map(), errors = [], messages = [], requests = [], stores = [], panels = [];
  const secrets = new Map(options.signedOut ? [] : [[`freebase.editor:${origin}`, "test-editor-placeholder"]]);
  const state = new Map();
  let provider, passwords = 0, signIns = 0, visible = fixtures;
  const mock = {
    EventEmitter: class { constructor() { this.event = () => ({ dispose() {} }); } fire() {} dispose() {} },
    TreeItem: class { constructor(label) { this.label = label; } },
    ThemeIcon: class {},
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    StatusBarAlignment: { Left: 1 }, ProgressLocation: { Notification: 1 },
    workspace: { getConfiguration: () => ({ get: () => origin }), onDidChangeConfiguration: () => ({ dispose() {} }) },
    Uri: { parse: value => value },
    env: { openExternal: async () => { signIns++; throw new Error("Website approval required"); } },
    commands: {
      registerCommand: (name, fn) => { commands.set(name, fn); return { dispose() {} }; },
      executeCommand: async name => assert.equal(name, "workbench.view.extension.freebase"),
    },
    window: {
      registerTreeDataProvider: (_name, p) => { provider = p; return { dispose() {} }; },
      createStatusBarItem: () => ({ show() {}, dispose() {} }),
      showErrorMessage: async message => errors.push(message),
      showInformationMessage: async message => { messages.push(message); return undefined; },
      showInputBox: async config => {
        passwords++;
        assert.equal(config.password, true);
        assert.ok(config.validateInput("invalid"));
        assert.equal(config.validateInput(key), undefined);
        return options.cancelKey ? undefined : options.key ?? key;
      },
      showQuickPick: async (choices, config) => {
        assert.equal(config.canPickMany, true);
        return options.cancelSelection ? undefined : choices;
      },
      withProgress: async (_config, action) => action({ report() {} }),
      createWebviewPanel: () => { panels.push("unexpected"); throw new Error("Import must not open a panel without consent"); },
    },
  };
  const originalLoad = Module._load, originalFetch = global.fetch;
  Module._load = function(name, parent, isMain) { return name === "vscode" ? mock : originalLoad.call(this, name, parent, isMain); };
  delete require.cache[require.resolve("../dist/extension.cjs")];
  global.fetch = async (url, init) => {
    const path = new URL(url).pathname;
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({ path, method: init.method, body });
    assert.ok(!url.includes(key), "keys never enter URLs");
    if (path === "/api/vscode/device") return new Response(JSON.stringify({ code: "locator", expiresAt: new Date(Date.now() + 60000).toISOString(), interval: 3 }));
    assert.equal(init.headers.Authorization, "Bearer test-editor-placeholder", "approved editor authentication remains mandatory");
    let status = 200, result;
    if (path.endsWith("/account")) result = { id: account, email: "fixture@example.test" };
    else if (path.endsWith("/database-instances") && init.method === "GET") result = visible;
    else if (path.endsWith("/key-check")) {
      assert.equal(init.method, "POST"); assert.equal(body.key, key);
      if (options.invalidKey || (options.failSecond && body.instanceId === fixtures[1].id)) {
        status = 403; result = { error: "Key invalid or access revoked" };
      } else result = { ok: true };
    } else throw new Error(`Unexpected request: ${path}`);
    return new Response(JSON.stringify(result), { status, headers: { "Content-Type": "application/json" } });
  };
  const extension = require("../dist/extension.cjs");
  extension.activate({
    subscriptions: [],
    globalState: { get: (k, fallback) => state.get(k) ?? fallback, update: async (k, value) => state.set(k, value) },
    secrets: {
      get: async k => secrets.get(k),
      store: async (k, value) => { secrets.set(k, value); stores.push(k); },
      delete: async k => secrets.delete(k),
    },
  });
  return {
    commands, errors, messages, requests, stores, panels, secrets, state,
    provider: () => provider, passwords: () => passwords, signIns: () => signIns,
    setVisible: value => { visible = value; },
    close() { extension.deactivate(); Module._load = originalLoad; global.fetch = originalFetch; },
  };
}

test("imports existing owned/shared databases with verified key, no provisioning or files", async () => {
  const h = harness();
  try {
    await h.commands.get("freebase.importExisting")();
    assert.deepEqual(h.errors, []);
    assert.equal(h.panels.length, 0);
    assert.equal(h.requests.filter(r => r.path.endsWith("/key-check")).length, 2);
    assert.ok(!h.requests.some(r => r.path.endsWith("/api-keys") || (r.method === "POST" && r.path.endsWith("/database-instances"))));
    const stateKey = `freebase.imported:${origin}:${account}`;
    assert.deepEqual(h.state.get(stateKey), fixtures.map(i => i.id));
    assert.equal(h.secrets.get(`freebase.project-key:${origin}:${account}`), key);
    assert.ok(!JSON.stringify([...h.state]).includes(key), "metadata has no key");
    assert.match(h.messages[0], /No new instances or keys created/);
    const root = await h.provider().getChildren();
    const imported = root.find(i => i.label === "Imported databases");
    assert.equal((await h.provider().getChildren(imported)).length, 2);
    h.setVisible([fixtures[0]]);
    assert.deepEqual((await h.provider().getChildren(imported)).map(i => i.instance.id), [fixtures[0].id], "revoked sharing disappears");
    await h.commands.get("freebase.importExisting")();
    assert.equal(h.state.get(stateKey).length, 2, "reimport deduplicates shortcuts");
  } finally { h.close(); }
});

for (const scenario of [
  { title: "invalid/revoked or different-account key", invalidKey: true },
  { title: "a failed destination in a multi-import", failSecond: true },
  { title: "cancelled key entry", cancelKey: true },
  { title: "cancelled database selection", cancelSelection: true },
  { title: "invalid key format", key: "bad" },
]) {
  test(`does not persist keys or shortcuts after ${scenario.title}`, async () => {
    const h = harness(scenario);
    try {
      await h.commands.get("freebase.importExisting")();
      assert.equal(h.stores.length, 0);
      assert.equal(h.state.size, 0);
      assert.equal(h.messages.length, 0);
      if (scenario.invalidKey || scenario.failSecond || scenario.key) assert.equal(h.errors.length, 1);
    } finally { h.close(); }
  });
}
test("requires website approval before asking for an existing key", async () => {
  const h = harness({ signedOut: true });
  try {
    await h.commands.get("freebase.importExisting")();
    assert.equal(h.signIns(), 1); assert.equal(h.passwords(), 0);
    assert.equal(h.stores.length, 0);
    assert.ok(h.requests.every(r => r.path === "/api/vscode/device"));
  } finally { h.close(); }
});
