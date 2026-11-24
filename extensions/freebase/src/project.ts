import * as vscode from "vscode";
import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { FreebaseApi, ApiError } from "./api";
import { mergeEnvironment, integrationExample } from "./env";

async function safeRead(file: string) {
  try {
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Setup refuses symlinked or non-regular configuration files.");
    if (stat.size > 1024 * 1024) throw new Error("Configuration file is too large for automatic setup.");
    return await fs.readFile(file, "utf8");
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""; throw error; }
}
export async function configureProject(api: FreebaseApi, context: vscode.ExtensionContext, instance: { id: string; name: string }, engine: string) {
  if (!vscode.workspace.isTrusted) throw new Error("Trust this workspace before writing credentials.");
  const folders = vscode.workspace.workspaceFolders?.filter(f => f.uri.scheme === "file") ?? [];
  if (!folders.length) throw new Error("Open a local project folder first.");
  const folder = folders.length === 1 ? folders[0] :
    await vscode.window.showWorkspaceFolderPick({ placeHolder: "Choose the project folder that should receive Freebase credentials" });
  if (!folder || folder.uri.scheme !== "file") return;
  const directory = folder.uri.fsPath;
  const envPath = path.join(directory, ".env");
  const ignorePath = path.join(directory, ".gitignore");
  const examplePath = path.join(directory, ".env.example");
  const scriptPath = path.join(directory, "freebase-example.mjs");
  const [original, ignore, example, script] = await Promise.all([envPath, ignorePath, examplePath, scriptPath].map(safeRead));
  try {
    const tracked = await promisify(execFile)("git", ["ls-files", "--error-unmatch", "--", ".env"], { cwd: directory });
    if (tracked.stdout.trim()) throw new Error("Your .env is tracked by Git. Untrack it and rotate any exposed keys before automatic setup.");
  } catch (error) {
    // git exit1 means untracked, exit128 means not in a Git repository.
    if (!(error as { code?: number }).code || ![1, 128, "ENOENT"].includes((error as any).code)) throw error;
  }
  const consent = await vscode.window.showWarningMessage(
    `Configure ${folder.name} for “${instance.name}”? Writes a plaintext API key to .env, protects it in .gitignore and creates a runnable example. API keys may access other databases permitted to your account; this key is not instance-scoped.`,
    { modal: true }, "Configure Project");
  if (consent !== "Configure Project") return;
  const skeleton = { FREEBASE_URL: api.origin, FREEBASE_API_KEY: "pending", FREEBASE_INSTANCE_ID: instance.id, FREEBASE_ENGINE: engine };
  const preflight = mergeEnvironment(original, skeleton);
  let replace = false;
  if (preflight.conflicts.length) {
    replace = await vscode.window.showWarningMessage(
      `Existing Freebase entries: ${preflight.conflicts.join(", ")}. Other environment values will be preserved.`,
      { modal: true }, "Replace Freebase entries") === "Replace Freebase entries";
    if (!replace) return;
    mergeEnvironment(original, skeleton, true); // Validate before creating a key.
  }
  const account = await api.service<{ id: string }>("/account");
  const keyId = `freebase.project-key:${api.origin}:${account.id}`;
  let key = await context.secrets.get(keyId);
  if (!key) {
    const mode = await vscode.window.showQuickPick(["Generate a new API key", "Import my existing API key"], {
      title: "Project API key", placeHolder: "Free accounts allow one API key. Existing keys are never revoked automatically.",
    });
    if (!mode) return;
    if (mode.startsWith("Generate")) {
      try {
        const created = await api.service<{ fullKey: string }>("/api-keys", "POST", { name: `VS Code project · ${folder.name}`.slice(0, 100) });
        key = created.fullKey;
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 403) throw error;
        await vscode.window.showWarningMessage(error.message);
        key = await vscode.window.showInputBox({ title: "Import existing Freebase API key", password: true, ignoreFocusOut: true, prompt: "Or cancel and manage keys/upgrade on the website. No existing key was changed." });
      }
    } else key = await vscode.window.showInputBox({ title: "Freebase API key", password: true, ignoreFocusOut: true });
    if (!key) return;
  }
  if (!/^fbk_[a-f0-9]{64}$/.test(key)) throw new Error("Invalid Freebase API key format.");
  // Cache a newly generated one-time key securely before any transient check or
  // file error; users can retry without generating another key or losing it.
  await context.secrets.store(keyId, key);
  try { await api.service("/key-check", "POST", { key, instanceId: instance.id }); }
  catch (error) {
    if (error instanceof ApiError && error.status === 403) await context.secrets.delete(keyId);
    throw error;
  }
  const content = mergeEnvironment(original, { ...skeleton, FREEBASE_API_KEY: key }, replace).content;
  // Refuse concurrent edits rather than overwriting a newly changed file.
  for (const [file, before] of [[envPath, original], [ignorePath, ignore], [examplePath, example], [scriptPath, script]]) {
    if (await safeRead(file) !== before) throw new Error("A project file changed during setup. No credentials were written; retry after reviewing it.");
  }
  const protect = `${ignore.replace(/\n*$/, "")}\n\n# Freebase credentials\n.env\n.env.*\n!.env.example\n`;
  await fs.writeFile(ignorePath, protect, { flag: "w" });
  // .env.example never overwrites an existing file or contains actual secrets.
  if (!example) {
    await fs.writeFile(examplePath, "FREEBASE_URL=https://your-freebase-site\nFREEBASE_API_KEY=your_api_key\nFREEBASE_INSTANCE_ID=your_instance_id\nFREEBASE_ENGINE=postgresql\n", { flag: "wx" }).catch(error => {
      if (error.code !== "EEXIST") throw error;
    });
  }
  if (!script) await fs.writeFile(scriptPath, integrationExample(), { flag: "wx" }).catch(error => { if (error.code !== "EEXIST") throw error; });
  // chmod first: a pre-existing world-readable file must not briefly receive
  // credentials before its permissions are restricted.
  try { await fs.chmod(envPath, 0o600); } catch (error) { if ((error as any).code !== "ENOENT") throw error; }
  await fs.writeFile(envPath, content, { mode: 0o600 });
  await fs.chmod(envPath, 0o600);
  void vscode.window.showInformationMessage("Freebase .env is configured and the key verified against your database. Run: node --env-file=.env freebase-example.mjs");
}
