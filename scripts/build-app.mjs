import { readFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { canInsertLibraryGroup, insertableComponentParameters } from "../apps/editor/library-insert.js";
import { publicRegistryEntries } from "../registry/catalog.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const app = process.argv[2];
if (app !== "editor" && app !== "library") throw new Error("Expected editor or library");
const directory = path.join(root, "apps", app);
const registry = JSON.parse(await readFile(new URL("../registry/registry.json", import.meta.url), "utf8"));

const packSize = 180_000;
const packs = [];
let currentPack = {};
let currentSize = 0;
const entries = publicRegistryEntries(registry).map(entry => {
  const { id, kind, title, summary, version, source, license, semanticType, capabilities, tags } = entry;
  const { editor, parameters, guide, dependencies } = entry;
  const detail = { editor, parameters, guide, dependencies };
  const size = Buffer.byteLength(id) + Buffer.byteLength(JSON.stringify(detail)) + 5;
  if (currentSize > 0 && currentSize + size > packSize) {
    packs.push(currentPack);
    currentPack = {};
    currentSize = 0;
  }
  currentPack[id] = detail;
  currentSize += size;
  const hasPreview = Boolean(editor?.node || editor?.document);
  const opensDocument = Boolean(editor?.document && !insertableComponentParameters(entry));
  return {
    id, kind, title, summary, version, source, license, semanticType, capabilities, tags,
    pack: packs.length, hasPreview, opensDocument,
    canInsertGroup: opensDocument && canInsertLibraryGroup(editor.document),
    ...(editor?.template ? { template: editor.template } : {}),
  };
});
if (currentSize > 0) packs.push(currentPack);

const catalogPlugin = {
  name: "browser-model-catalog",
  setup(builder) {
    builder.onResolve({ filter: /^agentscene:browser-catalog$/ }, () => ({ path: "catalog", namespace: "browser-catalog" }));
    builder.onResolve({ filter: /^agentscene:catalog-models-[0-9]+$/ }, ({ path: specifier }) => ({
      path: specifier.slice("agentscene:".length), namespace: "browser-catalog",
    }));
    builder.onLoad({ filter: /^catalog$/, namespace: "browser-catalog" }, () => ({
      contents: `export const catalog = ${JSON.stringify({ schemaVersion: registry.schemaVersion, entries })};
export const loaders = [${packs.map((_, i) => `() => import("agentscene:catalog-models-${i}")`).join(",")}];`,
    }));
    builder.onLoad({ filter: /^catalog-models-[0-9]+$/, namespace: "browser-catalog" }, ({ path: name }) => ({
      loader: "json",
      contents: JSON.stringify(packs[Number(name.slice("catalog-models-".length))]),
    }));
  },
};

const result = await build({
  absWorkingDir: root,
  entryPoints: [path.join(directory, "app.js")],
  outdir: directory,
  entryNames: "app.bundle",
  chunkNames: "chunks/[name]-[hash]",
  format: "esm",
  target: "es2022",
  bundle: true,
  splitting: true,
  minify: true,
  metafile: true,
  plugins: [catalogPlugin],
});
const chunks = path.join(directory, "chunks");
const generated = new Set(Object.keys(result.metafile.outputs).map(output => path.resolve(root, output)));
for (const file of await readdir(chunks, { withFileTypes: true })) {
  if (!file.isFile() || !/^(?:catalog-models-[0-9]+|chunk|renderer)-[A-Z0-9]{8}\.js$/.test(file.name)) continue;
  const chunk = path.join(chunks, file.name);
  if (!generated.has(chunk)) await unlink(chunk);
}
const entryBytes = Object.entries(result.metafile.outputs)
  .find(([file]) => file.endsWith("/app.bundle.js"))?.[1].bytes;
console.log(`${app} built with ${entries.length} catalog entries in ${packs.length} packs (${entryBytes} byte entry)`);
