import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryRoot = path.join(root, "registry");

async function manifests(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await manifests(target));
    else if (entry.name === "manifest.json") result.push(target);
  }
  return result;
}

function validate(entry, source) {
  const required = ["schemaVersion", "id", "version", "kind", "title", "summary", "license", "capabilities", "tags"];
  for (const key of required) if (entry[key] == null) throw new Error(`${source}: missing ${key}`);
  if (entry.schemaVersion !== "0.1") throw new Error(`${source}: unsupported schemaVersion ${entry.schemaVersion}`);
  if (!/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(entry.id)) throw new Error(`${source}: invalid stable id ${entry.id}`);
  if (!/^\d+\.\d+\.\d+$/.test(entry.version)) throw new Error(`${source}: version must be semver`);
  if (!["component", "method", "composition"].includes(entry.kind)) throw new Error(`${source}: invalid kind ${entry.kind}`);
  if (!Array.isArray(entry.capabilities) || !Array.isArray(entry.tags)) throw new Error(`${source}: capabilities and tags must be arrays`);
  if (entry.kind === "component" && !entry.semanticType) throw new Error(`${source}: component requires semanticType`);
  validateAiGuidance(entry, source);
}

function assertStringArray(value, source, field) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error(`${source}: ai.${field} must be an array of non-empty strings`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${source}: ai.${field} must be unique`);
}

function validateAiGuidance(entry, source) {
  if (entry.ai === undefined) return;
  if (!entry.ai || typeof entry.ai !== "object" || Array.isArray(entry.ai)) throw new Error(`${source}: ai must be an object`);
  if (typeof entry.ai.intent !== "string" || !entry.ai.intent.trim()) throw new Error(`${source}: ai.intent is required`);
  for (const field of ["useWhen", "avoidWhen", "editableParts", "qualityChecks", "commonVariants"]) {
    assertStringArray(entry.ai[field], source, field);
  }
}

function countRepetition(repetition) {
  if (!repetition) return 0;
  if (repetition.type === "linear" || repetition.type === "radial") return repetition.count;
  if (repetition.type === "grid") return repetition.count?.reduce?.((total, value) => total * value, 1) ?? 0;
  if (repetition.type === "path") return null;
  return null;
}

function defaultUseWhen(entry) {
  if (entry.kind === "method") return ["需要复用确定性的空间计算、候选生成或结构检查时使用。"];
  if (entry.kind === "component") return ["需要稳定语义、参数和锚点的基础构件时使用。"];
  return ["需要参考一个可编辑的完整对象结构，而不是导入固定网格模型时使用。"];
}

function defaultQualityChecks(entry) {
  if (entry.kind === "method") return ["确认输入输出保持结构化，不把领域决策硬编码进方法。"];
  if (entry.kind === "component") return ["确认参数单位、锚点方向和语义类型稳定。"];
  return ["确认模型只表达对象本身，构件没有远离主体，描述与实际节点一致。"];
}

function agentContext(entry) {
  const document = entry.editor?.document;
  const nodes = document?.parameters?.nodes ?? (entry.editor?.node ? [entry.editor.node] : []);
  const documentAnchors = document?.parameters?.anchors ? Object.keys(document.parameters.anchors) : [];
  const manifestAnchors = Array.isArray(entry.anchors) ? entry.anchors : [];
  const parameters = Object.keys(entry.parameters ?? {});
  const repetitions = nodes
    .filter(node => node.repetition)
    .map(node => ({
      prototypeId: node.id,
      semanticType: node.semanticType,
      type: node.repetition.type,
      count: countRepetition(node.repetition),
    }));
  return {
    intent: entry.ai?.intent ?? entry.summary,
    useWhen: entry.ai?.useWhen ?? defaultUseWhen(entry),
    avoidWhen: entry.ai?.avoidWhen ?? [],
    editableParts: entry.ai?.editableParts ?? parameters,
    qualityChecks: entry.ai?.qualityChecks ?? defaultQualityChecks(entry),
    commonVariants: entry.ai?.commonVariants ?? [],
    structure: {
      kind: entry.kind,
      semanticType: entry.semanticType,
      parameters,
      anchors: [...new Set([...manifestAnchors, ...documentAnchors])],
      nodeCount: nodes.length,
      geometryTypes: [...new Set(nodes.map(node => node.geometry?.type).filter(Boolean))].sort(),
      repetitionPrototypes: repetitions,
    },
  };
}

export async function buildRegistry({ write = false } = {}) {
  const files = (await manifests(registryRoot)).sort();
  const entries = [];
  const ids = new Set();
  for (const file of files) {
    const entry = JSON.parse(await readFile(file, "utf8"));
    const source = path.relative(root, file).replaceAll("\\", "/");
    validate(entry, source);
    if (ids.has(entry.id)) throw new Error(`${source}: duplicate id ${entry.id}`);
    ids.add(entry.id);
    entries.push({ ...entry, agent: agentContext(entry), source });
  }
  const index = { schemaVersion: "0.1", generated: true, counts: Object.fromEntries(["component", "method", "composition"].map(kind => [kind, entries.filter(item => item.kind === kind).length])), entries };
  if (write) await writeFile(path.join(registryRoot, "registry.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--write");
  const index = await buildRegistry({ write });
  console.log(`registry ok: ${index.entries.length} entries (${Object.entries(index.counts).map(([key,value]) => `${key}=${value}`).join(", ")})${write ? ", index written" : ""}`);
}
