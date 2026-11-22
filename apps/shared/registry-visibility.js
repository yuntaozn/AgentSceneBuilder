export { isPublicRegistryEntry, publicRegistryEntries } from "../../registry/catalog.js";

export function publicRegistryCounts(entries) {
  const visibleEntries = entries ?? [];
  return Object.fromEntries(
    ["component", "method", "composition"].map(kind => [
      kind,
      visibleEntries.filter(entry => entry.kind === kind).length,
    ]),
  );
}
