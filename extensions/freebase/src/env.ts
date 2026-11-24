/** Pure helpers: no VS Code API and no secret values in thrown errors. */
export function mergeEnvironment(original: string, values: Record<string, string>, replace = false) {
  const lines = original.split(/\r?\n/);
  const found = new Set<string>();
  const conflicts: string[] = [];
  const merged = lines.map(line => {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (!match || !(match[1] in values)) return line;
    const key = match[1];
    if (found.has(key)) throw new Error("Duplicate Freebase environment entries. Resolve them manually before setup.");
    found.add(key);
    if (!replace) { conflicts.push(key); return line; }
    const current = match[2].trim();
    if ((current.startsWith('"') && !/^"(?:[^"\\]|\\.)*"\s*(?:#.*)?$/.test(current)) ||
        (current.startsWith("'") && !/^'[^']*'\s*(?:#.*)?$/.test(current)) || current.startsWith("`"))
      throw new Error("Multiline Freebase entries must be updated manually. No file was changed.");
    return `${key}=${JSON.stringify(values[key])}`;
  });
  if (conflicts.length) return { content: original, conflicts };
  const additions = Object.entries(values).filter(([key]) => !found.has(key)).map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  const content = merged.join("\n").replace(/\n*$/, "") + (additions.length ? `\n\n# Freebase project integration\n${additions.join("\n")}` : "") + "\n";
  return { content, conflicts: [] as string[] };
}
export function integrationExample() {
  return `// Node.js 20+: node --env-file=.env freebase-example.mjs
// HTTPS reaches Freebase through its authenticated site API, not public TCP.
const base = process.env.FREEBASE_URL;
const key = process.env.FREEBASE_API_KEY;
const instanceId = process.env.FREEBASE_INSTANCE_ID;
const protocol = process.env.FREEBASE_ENGINE;
if (!base || !key || !instanceId || !protocol) throw new Error('Load your Freebase .env first');
const query = process.argv.slice(2).join(' ') || ({
  mongodb: '{"listCollections":1}',
  redis: 'KEYS *',
  cassandra: 'SELECT table_name FROM system_schema.tables'
}[protocol] || 'SHOW TABLES');
const response = await fetch(base + '/api/wire/query', {
  method: 'POST',
  headers: {'Content-Type':'application/json', Authorization:'Bearer ' + key, 'X-Database-Instance':instanceId},
  body: JSON.stringify({protocol, query, namespace:'default'})
});
if (!response.ok) throw new Error('Freebase request failed (' + response.status + ')');
console.log(JSON.stringify(await response.json(), null, 2));
`;
}
