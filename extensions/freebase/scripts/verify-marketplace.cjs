// A successful upload is not proof of public availability.
const { version, publisher, name } = require("../package.json");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  const id = `${publisher}.${name}`;
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const response = await fetch("https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json;api-version=7.2-preview.1" },
        body: JSON.stringify({ filters: [{ criteria: [
          { filterType: 7, value: id }, { filterType: 12, value: "37888" },
        ] }], flags: 49 }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`Marketplace returned HTTP ${response.status}`);
      const data = await response.json();
      const extension = data.results?.[0]?.extensions?.find(e =>
        e.publisher?.publisherName?.toLowerCase() === publisher.toLowerCase() && e.extensionName === name);
      if (extension?.versions?.some(v => v.version === version &&
          !v.properties?.some(p => p.key === "Microsoft.VisualStudio.Code.PreRelease" && p.value === "true"))) {
        console.log(`Verified public release ${id}@${version}\nhttps://marketplace.visualstudio.com/items?itemName=${id}`);
        return;
      }
    } catch (error) { console.warn(`Public verification attempt ${attempt + 1}: ${error.message}`); }
    if (attempt < 19) await delay(15000);
  }
  throw new Error(`Submission may still be processing. ${id}@${version} is not publicly verified. Check Marketplace management before retrying; do not resubmit the same version blindly.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
