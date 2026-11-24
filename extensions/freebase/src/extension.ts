import * as vscode from "vscode";
import { FreebaseApi, ApiError } from "./api";
import { Explorer, Entry, ENGINES } from "./explorer";
import { DatabasePanel } from "./panel";
import { configureProject } from "./project";
import { sharing } from "./sharing";

export function activate(context: vscode.ExtensionContext) {
  let explorer: Explorer;
  const api = new FreebaseApi(context, () => { DatabasePanel.closeAll(); explorer?.clear(); });
  explorer = new Explorer(api);
  context.subscriptions.push(explorer, vscode.window.registerTreeDataProvider("freebase.explorer", explorer));
  const register = (name: string, action: (entry?: Entry) => unknown) => context.subscriptions.push(
    vscode.commands.registerCommand(`freebase.${name}`, async (entry?: Entry) => {
      try { await action(entry); }
      catch (error) { void vscode.window.showErrorMessage(error instanceof Error ? error.message : "Freebase action failed."); }
    }));
  const open = async (entry?: Entry, mode = "ask") => {
    const selected = await explorer.pick(entry); if (!selected) return;
    new DatabasePanel(api, selected.instance, selected.engine,
      () => configureProject(api, context, selected.instance, selected.engine), entry?.object?.name, mode);
  };
  register("signIn", async () => { await api.signIn(); explorer.refresh(); });
  register("signOut", () => api.signOut());
  register("refresh", () => explorer.refresh());
  register("open", entry => open(entry));
  register("ask", entry => open(entry));
  register("runQuery", entry => open(entry, "native"));
  register("configure", async entry => { const selected = await explorer.pick(entry); if (selected) await configureProject(api, context, selected.instance, selected.engine); });
  register("sharing", async entry => { const selected = await explorer.pick(entry); if (selected) await sharing(api, selected.instance, entry?.object); });
  register("website", entry => api.website(entry?.instance ? `/data/${entry.instance.engine === "mixed" ? "postgresql" : entry.instance.engine}?instance=${encodeURIComponent(entry.instance.id)}` : "/databases"));
  register("createDatabase", async () => {
    if (!(await api.connected())) { await api.signIn(); if (!(await api.connected())) return; }
    const engine = await vscode.window.showQuickPick(ENGINES, { title: "Create a real hosted Freebase database", placeHolder: "Uses your site's existing account entitlements" });
    if (!engine) return;
    const name = await vscode.window.showInputBox({ title: `${engine} database name`, validateInput: value => value.trim() ? undefined : "Enter a name" });
    if (!name) return;
    try {
      const instance = await api.service("/database-instances", "POST", { engine, name });
      explorer.refresh(); await open(new Entry(instance.name, "database", instance));
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 402 || error.code !== "INSTANCE_UPGRADE_REQUIRED") throw error;
      const action = await vscode.window.showWarningMessage(
        `You already own a ${engine} instance. Free includes one instance per database type. Sign in on the Freebase website and subscribe to Pro for additional instances, then return here and retry. Sharing remains free.`,
        { modal: true }, "Open website to upgrade");
      if (action === "Open website to upgrade") {
        await api.website(`/api/login?returnTo=${encodeURIComponent("/settings?tab=billing")}`);
      }
    }
  });
  context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(event => {
    if (event.affectsConfiguration("freebase.siteUrl")) {
      DatabasePanel.closeAll(); explorer.clear();
      void vscode.window.showWarningMessage("Freebase site URL changed. Reload VS Code to apply it; credentials are never transferred to another origin.", "Reload Window")
        .then(action => { if (action) void vscode.commands.executeCommand("workbench.action.reloadWindow"); });
    }
  }));
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.text = "$(database) Freebase"; status.command = "freebase.open"; status.tooltip = "Open your real Freebase data"; status.show();
  context.subscriptions.push(status, { dispose: () => DatabasePanel.closeAll() });
}
export function deactivate() { DatabasePanel.closeAll(); }
