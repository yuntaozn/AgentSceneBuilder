import { catalog, loaders } from "agentscene:browser-catalog";

export { catalog };

const pendingPacks = new Map();

export async function loadCatalogEntry(summary) {
  const { id, pack } = summary;
  if (!pendingPacks.has(pack)) {
    const request = loaders[pack]().catch(error => {
      pendingPacks.delete(pack);
      throw error;
    });
    pendingPacks.set(pack, request);
  }
  const { default: entries } = await pendingPacks.get(pack);
  const detail = entries[id];
  if (!detail) throw new Error(`Missing catalog detail for ${id}`);
  return { ...summary, ...detail };
}
