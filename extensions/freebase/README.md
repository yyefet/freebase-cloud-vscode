# Freebase for VS Code

Your private hosted databases, directly in your editor. The explorer, website,
MCP and supported desktop clients use the same canonical data and permissions.

## Install and connect

The approved Marketplace identity is **`freebasecloud.freebase-vscode`**.
Publication is only confirmed after a successful GitHub publishing run and a
public listing check. The site's `/vscode` page checks availability before
offering Marketplace installation.

When the listing is available, find that exact ID in VS Code's Extensions view
and confirm publisher **freebasecloud**, or run:

```
code --install-extension freebasecloud.freebase-vscode
```

VS Code offers newer compatible Marketplace versions; automatic installation
depends on your extension auto-update setting. VSIX installs normally have
auto-updates disabled: install from Marketplace, explicitly enable auto-updates
for the extension, or manually install a newer VSIX.

**Upgrading from the old publisher:** VSIX versions through 0.1.1 used
`freebase-cloud.freebase-vscode`, a different identity. Uninstall that extension
first, install `freebasecloud.freebase-vscode`, and sign in again. Hosted databases
and project files are unchanged. Do not leave both extensions enabled.

### Direct download (always supported)

1. Download the `.vsix` from your Freebase site's `/vscode` page.
2. Open Extensions → `…` → **Install from VSIX**, or run
   `code --install-extension freebase-vscode-0.1.2.vsix`.
3. Run **Freebase: Sign In**. Your browser opens the site's approval page.
   Check that you initiated the request and recognize the device name.
4. Approve, return to VS Code and open the Freebase activity-bar icon.
5. Run **Freebase: Create Database**, choose an engine and enter a name.
   This creates a real hosted Freebase instance, not a local database process.

Free includes one owned instance per database type. A second instance of the
same type requires Pro. VS Code offers **Open website to upgrade**, where you
sign in and subscribe. Return to VS Code and retry creation after upgrading.
The server checks your current plan on every create; browser redirects never
unlock access. Shared-with-me databases do not consume your owned-instance quota.
Existing databases are not deleted or hidden after a downgrade.

The website must have the matching extension service release published before
the extension can sign in. Downloading does not silently install an extension.

## Working with data

Expand Owned databases or Shared with me, then a table/collection. Browse records,
search stored values, page through results, create simple objects and perform
record CRUD. Updates/deletes use the immutable revision you viewed and reject
stale edits. MongoDB uses canonical Extended JSON; preserve typed values and `_id`.

**Ask Your Data** answers bounded database questions against actual records,
not simulated results. Unrelated questions are rejected. Changes show a preview
and require explicit approval; tokens expire after three minutes and cannot replay.
One object per question, 100 returned rows and one changed record per approval.
Questions are independent; no conversation context is stored.

**Run Query** uses the site's existing engine compatibility paths. Every native
command is reviewed in a VS Code modal before sending, including reads, because
commands may write. Never retry an uncertain write without checking current data.
MySQL/MariaDB use the same bounded SQL implementation as the desktop clients;
MongoDB accepts JSON commands, not arbitrary JavaScript; Cassandra uses bounded
CQL v4. Other engines use the existing HTTP/MCP compatibility interpreter, which
may use AI translation. These are not full native database servers. Unsupported
operations return errors rather than invented results.

Examples (create the corresponding table/collection before reading):

```sql
CREATE TABLE people (name TEXT, age INT);
INSERT INTO people (name, age) VALUES ('Alice', 28);
SELECT * FROM people WHERE age > 25;
```

```json
{"insert":"people","documents":[{"name":"Alice","age":28}]}
{"find":"people","filter":{"age":{"$gt":25}},"limit":50}
```

## Project integration

Run **Freebase: Configure Project** in a trusted local workspace. Select the
folder in a multi-root workspace and approve setup. Generate a key or import an
existing one into a password input. Keys are validated against the selected real
database before writing files.

- Creates/merges `.env`: `FREEBASE_URL`, `FREEBASE_API_KEY`,
  `FREEBASE_INSTANCE_ID`, `FREEBASE_ENGINE`.
- Existing values are never silently overwritten; conflicting Freebase entries
  require approval. Other environment values remain intact.
- Protects `.env` with Git ignore rules and restrictive local permissions.
  Refuses tracked `.env` files and symlinked configuration files.
- Creates `.env.example` with placeholders only, without replacing an existing file.
- Creates `freebase-example.mjs` only if absent.
- Run `node --env-file=.env freebase-example.mjs` with Node.js 20+.
- Query another supported command:
  `node --env-file=.env freebase-example.mjs "SELECT * FROM people"`.

`.env` contains plaintext credentials. Do not upload, commit or share it. An API
key is **account-wide**, not restricted to the selected instance; it can access
other resources explicitly permitted to its owner. The instance header chooses
a destination but does not narrow the key's authority.

Free accounts currently allow one API key. If it already exists, import it or
manage keys/upgrade on the website. The extension never silently deletes or
rotates an existing integration key. Generated/imported project keys are cached
in SecretStorage under the site/account to support safe retries. Signing out
removes that account's local cached project key, but cannot erase copies already
written to `.env`; revoke them separately on the site's settings page.

## Security and revocation

Editor sign-in uses an expiring, one-time SHA-256 proof-bound browser approval.
No browser cookie or password is copied into VS Code or URLs. Editor credentials
are stored in VS Code SecretStorage and expire after 30 days. The service rechecks
the session and resource permissions for every request. Workspace settings cannot
redirect credentials: the HTTPS site URL is an application-level setting and
credentials are scoped to its exact origin.

Use **Freebase: Sign Out**, or revoke a connection at `/vscode/connections`.
Local sign-out closes result panels. If remote revocation fails while offline,
the extension explicitly tells you to revoke the connection on the website.
Project API keys and editor sessions are separate: revoking one does not revoke
the other. Shared data is private, never public by default.

## Site-feature coverage

| Feature | Where |
|---|---|
| Sign in, account identity, reconnect/sign out | Editor + browser approval |
| Create instance, owned/shared discovery | Editor |
| Tables/collections, record CRUD, search and paging | Editor |
| Native queries and real results | Editor, existing compatibility limits |
| Natural-language reads and confirmed changes | Editor |
| Invite by email, direct-role change/revoke/resend | Editor, existing Resend service |
| Invitation acceptance and email verification | Website: Sharing |
| Project API-key generation/import + environment | Editor |
| API-key deletion/rotation, billing and account settings | Website: Settings |
| Backups, restore, import/export | Website: database/dashboard workflows |
| MCP/Claude configuration | Website: Settings/MCP and Connect |
| Organization and administrator controls | Website, existing role restrictions |

**Freebase: Open on Website** opens the same database. Use the site's navigation
for its other workflows. The extension's authorization cannot access billing or
admin APIs.

## Troubleshooting

- **401/expired/revoked**: Sign in again.
- **403**: Check the selected account, verified invited email and latest grants.
- **Offline/503/unknown write outcome**: Refresh data before retrying.
- **Stale record**: Reload the table and reapply your edit to the latest revision.
- **Empty database**: New instances are isolated; existing cross-engine data is
  under the legacy mixed-engine database, not copied into a new instance.
- **Custom preview testing**: Set `freebase.siteUrl` in user/application settings
  to the trusted preview HTTPS origin and reload. Never send credentials to an
  origin you do not control. Production is the default.

## Build

From the repository root:

```
pnpm --filter freebase-vscode run typecheck
pnpm --filter freebase-vscode run test
pnpm --filter freebase-vscode run package
```

The package is generated under `generated-artifacts/`, outside Git/deploy output.
Release upload tooling publishes immutable bytes to App Storage and records their
SHA-256 in the API release manifest. See `RELEASING.md` in the source repository
for the GitHub Trusted Publishing setup and release procedure.
