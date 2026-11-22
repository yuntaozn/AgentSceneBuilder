export function isPublicRegistryEntry(entry) {
  return entry?.visibility !== "internal";
}

export function publicRegistryEntries(registry) {
  return (registry?.entries ?? []).filter(isPublicRegistryEntry);
}

export function publicRegistryCounts(entries) {
  const visibleEntries = entries ?? [];
  return Object.fromEntries(
    ["component", "method", "composition"].map(kind => [
      kind,
      visibleEntries.filter(entry => entry.kind === kind).length,
    ]),
  );
}
