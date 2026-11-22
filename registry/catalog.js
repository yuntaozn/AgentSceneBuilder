export function isPublicRegistryEntry(entry) {
  return entry?.visibility !== "internal";
}

export function publicRegistryEntries(registry) {
  return (registry?.entries ?? []).filter(isPublicRegistryEntry);
}

export function searchPublicRegistry(registry, query, kind = "all") {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return publicRegistryEntries(registry).filter(entry => {
    if (kind !== "all" && entry.kind !== kind) return false;
    const fields = [entry.id, entry.title, entry.summary, entry.semanticType,
      ...(entry.tags ?? []), ...(entry.capabilities ?? [])];
    const text = fields.join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}
