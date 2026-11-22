import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const readText = async path => readFile(new URL(path, import.meta.url), "utf8");

test("Codex plugin manifest exposes the Skill + CLI package without MCP", async () => {
  const manifest = await readJson("../.codex-plugin/plugin.json");
  assert.equal(manifest.name, "agentscene-builder");
  assert.equal(manifest.skills, "./skills/");
  assert.equal(manifest.mcpServers, undefined);
  assert.equal(manifest.apps, undefined);
  assert.ok(manifest.interface.capabilities.includes("Local CLI"));
  assert.ok(manifest.interface.longDescription.includes("without MCP"));
});

test("plugin skill wrapper delegates to the root AgentSceneBuilder skill", async () => {
  const wrapper = await readText("../skills/agentscene-builder/SKILL.md");
  const rootSkill = await readText("../SKILL.md");
  assert.ok(wrapper.includes("../../SKILL.md"));
  assert.ok(wrapper.includes("Do not add MCP"));
  assert.match(rootSkill, /name: agentscene-builder/);
  assert.ok(rootSkill.includes("Current product route is Skill + CLI"));
});
