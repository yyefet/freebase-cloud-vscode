# Freebase extension releases

## Publisher and approval

Publisher: `freebasecloud`. Extension name: `freebase-vscode`.
The product owner approved this identity and Marketplace submission. Never
change it for a routine update: VS Code identifies updates by publisher + name.

No Marketplace token or Replit storage credentials belong in GitHub. The
workflow publishes with `vsce publish --oidc`; it does not fall back to a PAT.

## One-time GitHub Trusted Publishing setup

1. The public release repository is
   https://github.com/yyefet/freebase-cloud-vscode. Publish only the extension,
   not the private application. From the Freebase workspace root run
   `node extensions/freebase/scripts/export-repository.cjs` to prepare an
   allowlisted copy in `generated-artifacts/github-extension`, including the
   workflow and a standalone pnpm lockfile. Commit that copy to the release
   repository. The workflow must be on the default branch.
2. Sign in at https://marketplace.visualstudio.com/manage with an account
   authorized to manage publisher **freebasecloud**. Create the publisher if
   necessary. No code configuration proves ownership.
3. Open that publisher's **Trusted Publishing** tab and create a policy:

   | Field | Value |
   |---|---|
   | Policy name | `Freebase extension releases` |
   | Repository owner | `yyefet` |
   | Repository | `freebase-cloud-vscode` |
   | Workflow | `publish.yml` |
   | Environment | Leave empty (the workflow has no environment) |

   Do not enter a Replit username, workspace path, repository URL or the full
   `.github/workflows/` path in those last three identifier fields.
4. For a private repository, run the configured workflow within 48 hours of
   creating the policy to activate it, per Microsoft's current guidance.

## Publish a release

1. Increment `extensions/freebase/package.json` to a new `major.minor.patch`
   version and update CHANGELOG and the README's direct-install filename.
   Never reuse or auto-bump a version during submission.
2. Merge the reviewed changes to the GitHub default branch.
3. In GitHub **Actions → Publish Freebase extension → Run workflow**, select
   the default branch, enter the exact package version, and check approval.
   A push, pull request or unapproved dispatch cannot submit.
4. The workflow typechecks, tests, bundles and packages once. It records
   SHA-256 and uploads the VSIX plus `SHA256SUMS` as an Actions artifact **before**
   attempting submission, then publishes those exact bytes using OIDC.
5. The final step checks the public gallery for this exact publisher, extension
   and version. A submission is not necessarily immediately public. If
   verification times out, inspect publisher management and retry verification,
   not publication. Do not blindly resubmit the same version.
6. Download the Actions artifact promptly (retained for 90 days) and promote
   those same bytes to the website's durable App Storage from this workspace:

   ```
   ./scripts/node_modules/.bin/tsx artifacts/api-server/scripts/release-editor.ts generated-artifacts/freebase-vscode-<version>.vsix
   ```

   The uploader checks the embedded package publisher, name and version against
   the source manifest, then records the immutable object path, SHA-256 and byte
   size. It does not publish the web app. The site release manifest must be
   merged through the normal app workflow for the live download to change.
   Until then, the existing direct download stays available. The installation
   page labels Marketplace and direct-download versions separately.

## Check update behavior

- Keep publisher and extension name unchanged and increase the version.
- Marketplace installs receive newer compatible versions subject to users'
  auto-update settings and `engines.vscode` compatibility.
- Direct VSIX installs normally disable auto-updates. Users can enable them for
  this extension, install from Marketplace, or manually install a newer VSIX.
- Earlier direct VSIX builds used publisher `freebase-cloud`. They cannot automatically
  migrate to `freebasecloud`: uninstall the old extension, install the approved
  identity, and sign in again. Do not run both copies simultaneously.
- The website only offers Marketplace install links after a successful public
  gallery lookup. Missing listings and lookup failures are distinct states,
  cached briefly. Neither is presented as successful publication.

References:
- https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- https://code.visualstudio.com/docs/configure/extensions/extension-marketplace
