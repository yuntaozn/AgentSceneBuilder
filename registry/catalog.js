export function isPublicRegistryEntry(entry) {
  return entry?.visibility !== "internal";
}

export function publicRegistryEntries(registry) {
  return (registry?.entries ?? []).filter(isPublicRegistryEntry);
}

const domains = {
  construction: "建筑与室内",
  structure: "结构与基础",
  prefab: "装配式",
  site: "场地与道路",
  mep: "机电",
  instrument: "测量与监测",
  inspection: "检测设备",
  equipment: "施工设备",
  tool: "施工工具",
  electronics: "电子设备",
  primitive: "几何基元",
  spatial: "空间建模",
  composition: "组合示例",
};

function registryDomain(entry) {
  return entry.id.split(".", 1)[0];
}

export function publicRegistryDomains(registry) {
  const used = new Set(publicRegistryEntries(registry).map(registryDomain));
  const known = Object.entries(domains).filter(([key]) => used.has(key));
  const additional = [...used].filter(key => !Object.hasOwn(domains, key)).sort();
  return [...known, ...additional.map(key => [key, key])];
}

export function searchPublicRegistry(registry, query, kind = "all", domain = "all") {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return publicRegistryEntries(registry).filter(entry => {
    if (kind !== "all" && entry.kind !== kind) return false;
    if (domain !== "all" && registryDomain(entry) !== domain) return false;
    const fields = [entry.id, entry.title, entry.summary, entry.semanticType,
      ...(entry.tags ?? []), ...(entry.capabilities ?? [])];
    const text = fields.join(" ").toLowerCase();
    return words.every(word => text.includes(word));
  });
}
