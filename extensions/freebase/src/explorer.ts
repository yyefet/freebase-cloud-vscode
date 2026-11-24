import * as vscode from "vscode";
import { FreebaseApi } from "./api";

export const ENGINES = ["postgresql", "mysql", "mongodb", "redis", "sqlite", "cassandra", "dynamodb", "clickhouse", "elasticsearch", "neo4j", "mariadb", "influxdb", "prometheus", "timescaledb", "cockroachdb"];
export interface Instance { id: string; name: string; engine: string; access: string; ownerName: string; }
export interface DbObject { name: string; id: string; kind: string; readOnly: boolean; canShare: boolean; role: string; }
export class Entry extends vscode.TreeItem {
  constructor(label: string, public kind: string, public instance?: Instance, public object?: DbObject, public engine?: string) {
    super(label, ["group", "database"].includes(kind) ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    this.contextValue = kind;
    this.iconPath = new vscode.ThemeIcon(kind === "database" ? "database" : kind === "object" ? "table" : kind === "group" ? "folder-library" : "account");
    if (kind === "database" && instance) {
      this.description = `${instance.engine} · ${instance.access}`;
      this.tooltip = `Owner: ${instance.ownerName} · ${instance.access}`;
      this.command = { command: "freebase.open", title: "Open Database", arguments: [this] };
    }
    if (kind === "object") this.command = { command: "freebase.open", title: "Browse Records", arguments: [this] };
  }
}
export class Explorer implements vscode.TreeDataProvider<Entry> {
  private changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private choices = new Map<string, string>();
  constructor(private api: FreebaseApi) {}
  refresh() { this.changed.fire(); }
  clear() { this.choices.clear(); this.refresh(); }
  getTreeItem(item: Entry) { return item; }
  async instances() { return this.api.service<Instance[]>("/database-instances"); }
  async engine(instance: Instance) {
    if (instance.engine !== "mixed") return instance.engine;
    if (this.choices.has(instance.id)) return this.choices.get(instance.id)!;
    const engine = await vscode.window.showQuickPick(ENGINES, { title: "Choose a client for this legacy mixed-engine database" });
    if (engine) this.choices.set(instance.id, engine);
    return engine;
  }
  async pick(entry?: Entry): Promise<{ instance: Instance; engine: string } | undefined> {
    const instance = entry?.instance ?? (await vscode.window.showQuickPick(
      (await this.instances()).map(i => ({ label: i.name, description: `${i.engine} · ${i.access}`, instance: i })),
      { title: "Choose a Freebase database" }))?.instance;
    if (!instance) return;
    const engine = entry?.engine ?? await this.engine(instance);
    if (!engine) return;
    return { instance, engine };
  }
  async getChildren(entry?: Entry): Promise<Entry[]> {
    if (!(await this.api.connected())) {
      const login = new Entry("Sign in to Freebase", "account");
      login.command = { command: "freebase.signIn", title: "Sign In" }; return [login];
    }
    try {
      if (!entry) {
        const account = await this.api.service<{ email: string; firstName: string }>("/account");
        return [new Entry(account.email || account.firstName || "Signed in", "account"), new Entry("Owned databases", "group"), new Entry("Shared with me", "group")];
      }
      if (entry.kind === "group") {
        const owned = entry.label === "Owned databases";
        const list = (await this.instances()).filter(i => (i.access === "owner") === owned);
        return list.length ? list.map(i => new Entry(i.name, "database", i)) : [new Entry(owned ? "No databases yet — Create Database" : "No accepted shared databases", "empty")];
      }
      if (entry.kind === "database" && entry.instance) {
        const engine = await this.engine(entry.instance); if (!engine) return [];
        const catalog = await this.api.service<{ objects: DbObject[] }>(`/data-browser/${engine}/catalog`, "GET", undefined, entry.instance.id);
        return catalog.objects.length ? catalog.objects.map(o => new Entry(o.name, "object", entry.instance, o, engine)) : [new Entry("Empty database — open to create a table", "empty")];
      }
      return [];
    } catch (error) {
      const item = new Entry(error instanceof Error ? error.message : "Offline. Refresh to reconnect.", "error");
      item.command = { command: "freebase.refresh", title: "Reconnect" }; return [item];
    }
  }
  dispose() { this.changed.dispose(); }
}
