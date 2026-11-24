const { mkdir } = require("node:fs/promises");
const path = require("node:path");
const { createVSIX, PackageManager } = require("@vscode/vsce");
const manifest = require("../package.json");

async function main() {
  const output = path.resolve(__dirname, "../../../generated-artifacts");
  await mkdir(output, { recursive: true });
  await createVSIX({
    cwd: path.resolve(__dirname, ".."),
    packagePath: path.join(output, `${manifest.name}-${manifest.version}.vsix`),
    packageManager: PackageManager.None,
    allowMissingRepository: true,
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
