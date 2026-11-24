import * as vscode from "vscode";
import { FreebaseApi } from "./api";
import { Explorer, Instance } from "./explorer";

/** Import shortcuts to existing remote instances, never copies of their data. */
export async function importExistingDatabases(
  api: FreebaseApi, context: vscode.ExtensionContext, explorer: Explorer,
): Promise<Instance[] | undefined> {
  if (!(await api.connected())) {
    await api.signIn();
    if (!(await api.connected())) return;
  }
  const account = await api.service<{ id: string }>("/account");
  const instances = await explorer.instances();
  if (!instances.length) {
    await vscode.window.showInformationMessage("No existing databases are available to this account. Accept pending invitations on the website or use Create Database.");
    return;
  }
  const key = (await vscode.window.showInputBox({
    title: "Import existing databases · API key",
    prompt: "Paste an existing Freebase API key belonging to your signed-in account. It is stored in VS Code SecretStorage, never in import settings or logs.",
    password: true, ignoreFocusOut: true,
    validateInput: value => /^fbk_[a-f0-9]{64}$/.test(value.trim()) ? undefined : "Enter a Freebase API key (fbk_ followed by 64 hexadecimal characters).",
  }))?.trim();
  if (!key) return;
  if (!/^fbk_[a-f0-9]{64}$/.test(key)) throw new Error("Invalid Freebase API key format.");
  const selected = await vscode.window.showQuickPick(
    instances.map(instance => ({
      label: instance.name, description: `${instance.engine} · ${instance.access}`,
      detail: `${instance.id} · ${instance.access === "owner" ? "Your existing database" : `Shared by ${instance.ownerName}`}`,
      instance,
    })),
    { title: "Select existing databases to import", canPickMany: true,
      placeHolder: "These are shortcuts to the same remote data. No instances or API keys will be created." },
  );
  if (!selected?.length) return;
  // Check the supplied key against the live public credential path for every
  // destination. No persistence until all selected destinations pass.
  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification, title: "Verifying existing key and database access",
  }, async progress => {
    for (const { instance } of selected) {
      progress.report({ message: instance.name });
      await api.service("/key-check", "POST", { key, instanceId: instance.id });
    }
  });
  const current = await api.service<{ id: string }>("/account");
  if (current.id !== account.id) throw new Error("The signed-in account changed. Start the import again.");
  await context.secrets.store(`freebase.project-key:${api.origin}:${account.id}`, key);
  await explorer.rememberImported(account.id, selected.map(({ instance }) => instance.id));
  explorer.refresh();
  return selected.map(({ instance }) => instance);
}
