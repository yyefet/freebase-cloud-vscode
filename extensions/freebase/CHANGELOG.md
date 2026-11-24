# Changelog

## 0.1.2

- Import existing owned/shared databases using a same-account API key after website approval; no new instances or keys are created.

Prepared Marketplace publishing under `freebasecloud` with a manually approved
GitHub Trusted Publishing workflow. Kept direct VSIX downloads. Older packages
under `freebase-cloud` have a different identity; uninstall the old extension and
install the new one, then sign in again. Publication requires a successful
workflow run and public listing verification.

## 0.1.1

Enforced one free owned database instance per engine. Additional same-engine
instances require Pro, with an explicit website sign-in/upgrade prompt.

## 0.1.0

Initial direct-download release: browser-approved sign-in, private database
explorer, hosted instance creation, real query results, guarded AI data questions,
revision-safe CRUD, sharing and trusted-workspace project setup.
