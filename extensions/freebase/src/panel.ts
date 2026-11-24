import * as vscode from "vscode";
import { FreebaseApi } from "./api";
import { DbObject, Instance } from "./explorer";
import { panelHtml } from "./panel-html";
import { sharing } from "./sharing";

interface RecordPage { table: string; version: string; readOnly: boolean; total: number; filteredTotal: number; rows: { index: number; value: Record<string, unknown> }[]; note?: string; }
const text = (value: unknown) => JSON.stringify(value, null, 2);
export class DatabasePanel {
  static all = new Set<DatabasePanel>();
  static closeAll() { for (const panel of DatabasePanel.all) panel.panel.dispose(); }
  private panel: vscode.WebviewPanel;
  private objects: DbObject[] = [];
  private table = "";
  private search = "";
  private offset = 0;
  private page?: RecordPage;
  private approval?: any;
  private busy = false;
  private disposed = false;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private api: FreebaseApi, private instance: Instance, private engine: string,
    private configure: () => Promise<void>, table?: string, private mode = "ask") {
    this.table = table ?? "";
    this.panel = vscode.window.createWebviewPanel("freebase.database", `Freebase · ${instance.name}`, vscode.ViewColumn.One, {
      enableScripts: true, localResourceRoots: [], retainContextWhenHidden: false,
    });
    DatabasePanel.all.add(this);
    this.panel.webview.html = panelHtml(this.panel.webview.cspSource);
    this.panel.onDidDispose(() => { this.disposed = true; this.clearApproval(); DatabasePanel.all.delete(this); });
    this.panel.webview.onDidReceiveMessage(message => void this.message(message));
  }
  private send(value: unknown) { if (!this.disposed) void this.panel.webview.postMessage(value); }
  private status(message: string) { this.send({ type: "status", message }); }
  private clearApproval() {
    this.approval = undefined; clearTimeout(this.timer);
    this.send({ type: "approval", preview: null });
  }
  private async catalog() {
    const catalog = await this.api.service<{ objects: DbObject[] }>(`/data-browser/${this.engine}/catalog`, "GET", undefined, this.instance.id);
    this.objects = catalog.objects;
    if (!this.objects.some(o => o.name === this.table)) this.table = this.objects[0]?.name ?? "";
    this.send({ type: "catalog", objects: this.objects, table: this.table });
  }
  private showRows(rows: Record<string, unknown>[], editable = false) {
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    this.send({ type: "rows", columns, rows, editable });
  }
  private async browse() {
    this.clearApproval();
    this.page = undefined;
    if (!this.table) { this.showRows([]); this.status("This database is empty. Create a table/collection, or run a supported native CREATE command."); return; }
    const params = new URLSearchParams({ table: this.table, offset: String(this.offset), limit: "50", search: this.search });
    this.page = await this.api.service<RecordPage>(`/data-browser/${this.engine}/records?${params}`, "GET", undefined, this.instance.id);
    const object = this.objects.find(o => o.name === this.table);
    this.showRows(this.page.rows.map(r => r.value), !this.page.readOnly && ["owner", "editor"].includes(object?.role ?? this.instance.access));
    this.status(`${this.table}: ${this.page.rows.length} shown · ${this.page.filteredTotal} matching · ${this.page.total} total · offset ${this.offset}. ${this.page.note ?? ""}`);
  }
  private async editRecord(action: string, index?: number) {
    if (!this.page || this.page.readOnly) throw new Error("Browse a writable table before editing.");
    const row = index === undefined ? undefined : this.page.rows[index];
    if (action !== "insert" && !row) throw new Error("Refresh and select a current record.");
    const before = this.page;
    let value: Record<string, unknown> | undefined;
    if (action !== "delete") {
      const input = await vscode.window.showInputBox({
        title: action === "insert" ? "Insert record as JSON" : "Edit complete record as JSON",
        value: action === "insert" ? "{}" : JSON.stringify(row!.value),
        prompt: "Use a JSON object. Preserve MongoDB Extended JSON types and _id.",
      });
      if (input === undefined) return;
      value = JSON.parse(input);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A JSON object is required.");
    }
    const confirm = await vscode.window.showWarningMessage(
      `${action.toUpperCase()} one record in ${this.table}?\n${text(action === "delete" ? row!.value : value)}`,
      { modal: true }, "Apply change");
    if (confirm !== "Apply change") return;
    await this.api.service(`/data-browser/${this.engine}/records`, action === "insert" ? "POST" : action === "edit" ? "PATCH" : "DELETE", {
      table: before.table, version: before.version, ...(row ? { index: row.index } : {}), ...(value ? { value } : {}),
    }, this.instance.id);
    await this.browse();
  }
  private async createObject() {
    const name = await vscode.window.showInputBox({ title: "New table / collection", prompt: "For primary keys, defaults and constraints use a native CREATE command." });
    if (!name) return;
    let columns: unknown[] = [];
    if (this.engine !== "mongodb") {
      const input = await vscode.window.showInputBox({ title: "Columns as JSON", value: '[{"name":"name","type":"text"},{"name":"age","type":"integer"}]' });
      if (!input) return; columns = JSON.parse(input);
    }
    if (await vscode.window.showWarningMessage(`Create “${name}” in ${this.instance.name}?`, { modal: true }, "Create") !== "Create") return;
    await this.api.service(`/data-browser/${this.engine}/objects`, "POST", { name, columns }, this.instance.id);
    this.table = name; await this.catalog(); await this.browse();
  }
  private async run(mode: string, query: string) {
    if (!query.trim() || query.length > 20000) throw new Error("Enter a query of at most 20,000 characters.");
    this.clearApproval(); this.page = undefined;
    if (mode === "native") {
      const confirm = await vscode.window.showWarningMessage(
        `Run this exact ${this.engine} command against “${this.instance.name}”? It may modify or delete data.\n\n${query}`,
        { modal: true }, "Run command");
      if (confirm !== "Run command") { this.status("Command cancelled. Nothing was sent."); return; }
      const result = await this.api.service("/native-query", "POST", { engine: this.engine, instanceId: this.instance.id, query, confirmed: true });
      if (result.error) throw new Error(result.error);
      let rows = result.rows;
      if (Array.isArray(rows) && result.columns) rows = rows.map((r: unknown[]) => Object.fromEntries(result.columns.map((c: string, i: number) => [c, r[i]])));
      else rows = result.cursor?.firstBatch ?? [result];
      this.showRows(rows ?? []);
      this.status(`Command completed against real data. ${result.count ?? result.row_count ?? rows?.length ?? 0} result(s). Refresh before any retry.`);
      await this.catalog(); return;
    }
    if (query.length > 2000) throw new Error("Natural-language questions are limited to 2,000 characters.");
    const result = await this.api.service("/data-chat/ask", "POST", { engine: this.engine, instanceId: this.instance.id, question: query });
    this.showRows(result.rows);
    this.status(result.message);
    if (result.status === "confirmation") {
      this.approval = result;
      this.send({ type: "approval", preview: text({ operation: result.operation, table: result.table, before: result.before, after: result.after, expiresAt: result.expiresAt }) });
      this.timer = setTimeout(() => { this.clearApproval(); this.status("Approval expired. Nothing was applied. Ask again for a new preview."); },
        Math.max(0, Date.parse(result.expiresAt) - Date.now()));
    }
  }
  private async message(message: any) {
    const actions = new Set(["ready", "refresh", "createObject", "insert", "share", "configure", "website", "browse", "previous", "next", "run", "confirm", "cancel", "edit", "delete"]);
    if (this.disposed || this.busy || !message || !actions.has(message.action)) return;
    this.busy = true; this.send({ type: "busy", value: true });
    try {
      const action = message.action;
      if (action === "ready") {
        this.send({ type: "initial", name: this.instance.name, subtitle: `${this.engine} · ${this.instance.access} · canonical private data`,
          mode: this.mode, query: this.mode === "native" ? this.engine === "mongodb" ? '{"find":"people","filter":{},"limit":50}' : this.engine === "redis" ? "KEYS *" : "SHOW TABLES" : "" });
        await this.catalog(); await this.browse();
      } else if (action === "refresh") { await this.catalog(); await this.browse(); }
      else if (action === "browse") {
        if (typeof message.table !== "string" || !this.objects.some(o => o.name === message.table)) throw new Error("Select a listed table.");
        this.table = message.table; this.offset = 0;
        this.search = typeof message.search === "string" ? message.search.slice(0, 200) : ""; await this.browse();
      } else if (action === "previous" || action === "next") {
        this.offset = Math.max(0, this.offset + (action === "next" ? 50 : -50)); await this.browse();
      } else if (["insert", "edit", "delete"].includes(action)) {
        if (action !== "insert" && (!Number.isSafeInteger(message.index) || message.index < 0)) throw new Error("Invalid row selection.");
        await this.editRecord(action, action === "insert" ? undefined : message.index);
      } else if (action === "createObject") await this.createObject();
      else if (action === "run") {
        if (typeof message.query !== "string" || !["native", "ask"].includes(message.mode)) throw new Error("Invalid query");
        await this.run(message.mode, message.query);
      } else if (action === "confirm") {
        const approval = this.approval; this.clearApproval();
        if (!approval || Date.parse(approval.expiresAt) <= Date.now()) throw new Error("Approval expired. Ask again.");
        // Native modal ensures untrusted webview messages are never approval.
        if (await vscode.window.showWarningMessage(`Apply the previewed ${approval.operation} to ${approval.table}?`, { modal: true }, "Confirm change") !== "Confirm change") {
          this.status("Change cancelled. Nothing applied."); return;
        }
        const result = await this.api.service("/data-chat/confirm", "POST", { engine: this.engine, instanceId: this.instance.id, token: approval.token });
        this.showRows(result.rows); this.status(result.message);
      } else if (action === "cancel") { this.clearApproval(); this.status("Change cancelled. Nothing applied."); }
      else if (action === "configure") await this.configure();
      else if (action === "share") await sharing(this.api, this.instance, this.objects.find(o => o.name === this.table));
      else if (action === "website") await this.api.website(`/data/${this.engine}?instance=${encodeURIComponent(this.instance.id)}`);
    } catch (error) {
      this.clearApproval();
      // Prevent editing an old page after unknown writes or authorization errors.
      this.page = undefined;
      this.showRows([]);
      this.status(error instanceof Error ? error.message : "Request failed. Refresh real data before retrying any write.");
    } finally { this.busy = false; this.send({ type: "busy", value: false }); }
  }
}
