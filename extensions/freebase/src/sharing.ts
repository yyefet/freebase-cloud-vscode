import * as vscode from "vscode";
import { FreebaseApi } from "./api";
import type { Instance, DbObject } from "./explorer";

export async function sharing(api: FreebaseApi, instance: Instance, object?: DbObject) {
  const action = await vscode.window.showQuickPick(
    instance.access === "owner" ? ["Invite people", "Manage existing shares", "Open sharing on website"] : ["Review invitations on website"],
    { title: `Share ${object?.name ?? instance.name}` });
  if (!action) return;
  if (action.includes("website")) { await api.website("/sharing"); return; }
  if (action === "Invite people") {
    const input = await vscode.window.showInputBox({ title: "Invite by email", prompt: "Comma-separated emails. Freebase sends real invitation emails." });
    if (!input) return;
    const role = await vscode.window.showQuickPick(["viewer", "editor"], { title: "Choose access" });
    if (!role) return;
    const emails = input.split(",").map(s => s.trim()).filter(Boolean);
    if (await vscode.window.showWarningMessage(`Send ${role} invitation emails for “${object?.name ?? instance.name}” to ${emails.length} recipient(s)?`, { modal: true }, "Send invitations") !== "Send invitations") return;
    const result = await api.service<any[]>(`/database-instances/${instance.id}/sharing`, "POST", { emails, role, ...(object?.id ? { objectId: object.id } : {}) });
    void vscode.window.showInformationMessage(`Invitations recorded. Delivery: ${result.map(r => r.deliveryStatus).join(", ")}. View delivery and resend on the website.`);
    return;
  }
  const shares = await api.service<any[]>(`/database-instances/${instance.id}/sharing`);
  const selected = await vscode.window.showQuickPick(shares.filter(s => !object || s.objectId === object.id).map(share => ({
    label: share.email, description: `${share.role} · ${share.status} · ${share.objectName ?? "entire database"}`, share,
  })), { title: "Select direct permission (broader grants may also apply)" });
  if (!selected) return;
  const change = await vscode.window.showQuickPick(["Viewer", "Editor", "Revoke direct share", "Resend invitation"], { title: selected.label });
  if (!change) return;
  if (await vscode.window.showWarningMessage(`${change} for ${selected.label}? Revoking cannot erase downloaded copies.`, { modal: true }, "Confirm") !== "Confirm") return;
  const endpoint = `/sharing/${encodeURIComponent(selected.share.id)}`;
  const result = change.startsWith("Revoke") ? await api.service(endpoint, "DELETE")
    : change.startsWith("Resend") ? await api.service(`${endpoint}/resend`, "POST", {})
      : await api.service(endpoint, "PATCH", { role: change.toLowerCase() });
  void vscode.window.showInformationMessage(result.message ?? "Sharing updated.");
}
