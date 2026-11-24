import * as vscode from "vscode";
import { randomBytes, createHash } from "node:crypto";
import { hostname } from "node:os";

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) { super(message); }
}
export class FreebaseApi {
  private originValue: string;
  constructor(private context: vscode.ExtensionContext, private invalidated: () => void) {
    this.originValue = this.readOrigin();
  }
  private readOrigin() {
    const value = vscode.workspace.getConfiguration("freebase").get<string>("siteUrl")!;
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("Freebase siteUrl must be a trusted HTTPS origin without a path or credentials.");
    return url.origin;
  }
  get origin() { return this.originValue; }
  private get secretKey() { return `freebase.editor:${this.origin}`; }
  async connected() { return !!(await this.context.secrets.get(this.secretKey)); }
  async request<T = any>(path: string, options: { method?: string; body?: unknown; public?: boolean; instanceId?: string } = {}): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid API path");
    const token = options.public ? undefined : await this.context.secrets.get(this.secretKey);
    if (!options.public && !token) throw new ApiError(401, "Sign in with Freebase: Sign In first.");
    const response = await fetch(`${this.origin}/api/vscode${path}`, {
      method: options.method ?? "GET", redirect: "error",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.instanceId ? { "X-Database-Instance": options.instanceId } : {}) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: AbortSignal.timeout(75_000),
    });
    if (response.status === 204) return undefined as T;
    const result = await response.json() as any;
    if (!response.ok) {
      if (response.status === 401 && !options.public) {
        await this.context.secrets.delete(this.secretKey); this.invalidated();
      }
      throw new ApiError(response.status, result.error ?? "Freebase request failed. Check current data before retrying a write.", result.code);
    }
    return result as T;
  }
  service<T = any>(path: string, method = "GET", body?: unknown, instanceId?: string) {
    return this.request<T>(`/service${path}`, { method, body, instanceId });
  }
  async signIn() {
    // Invalidate cached data before switching accounts. Never leave the old
    // account active if the new authorization is cancelled.
    await this.signOut();
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const device = await this.request<{ code: string; expiresAt: string; interval: number }>("/device", {
      public: true, method: "POST", body: { challenge, name: `VS Code · ${hostname()}`.slice(0, 80) },
    });
    await vscode.env.openExternal(vscode.Uri.parse(`${this.origin}/vscode/authorize?code=${encodeURIComponent(device.code)}`));
    await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: "Approve VS Code on the Freebase website", cancellable: true }, async (_progress, cancel) => {
      while (!cancel.isCancellationRequested && Date.now() < Date.parse(device.expiresAt)) {
        await new Promise(resolve => setTimeout(resolve, 3100));
        if (cancel.isCancellationRequested) break;
        let result: { status: string; token?: string };
        try {
          result = await this.request("/token", { public: true, method: "POST", body: { code: device.code, verifier } });
        } catch (error) { if (error instanceof ApiError && error.status === 429) continue; throw error; }
        if (result.status === "denied") throw new Error("Browser authorization was declined.");
        if (result.status === "approved" && result.token) {
          if (cancel.isCancellationRequested) {
            // Token was issued during cancellation; revoke instead of storing.
            await this.context.secrets.store(this.secretKey, result.token);
            await this.signOut(); return;
          }
          await this.context.secrets.store(this.secretKey, result.token);
          const account = await this.service<{ id: string }>("/account");
          await this.context.globalState.update(`freebase.account:${this.origin}`, account.id);
          return;
        }
      }
    });
  }
  async signOut() {
    const account = this.context.globalState.get<string>(`freebase.account:${this.origin}`);
    if (await this.connected()) {
      // A failed remote revoke is not falsely reported as success.
      try { await this.service("/connection", "DELETE"); }
      catch { void vscode.window.showWarningMessage("Local sign-out completed. If offline, revoke this connection on the Freebase /vscode/connections page."); }
    }
    await this.context.secrets.delete(this.secretKey);
    if (account) await this.context.secrets.delete(`freebase.project-key:${this.origin}:${account}`);
    await this.context.globalState.update(`freebase.account:${this.origin}`, undefined);
    this.invalidated();
  }
  website(path: string) { return vscode.env.openExternal(vscode.Uri.parse(`${this.origin}${path}`)); }
}
