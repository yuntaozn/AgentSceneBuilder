import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const readText = async path => readFile(new URL(path, import.meta.url), "utf8");
const exists = async path => access(new URL(path, import.meta.url)).then(() => true, () => false);

test("open source release files are present", async () => {
  for (const path of [
    "../LICENSE",
    "../CONTRIBUTING.md",
    "../SECURITY.md",
    "../CODE_OF_CONDUCT.md",
    "../CHANGELOG.md",
    "../docs/open-source-release.md",
    "../.github/workflows/ci.yml",
    "../.github/pull_request_template.md",
    "../.github/ISSUE_TEMPLATE/bug_report.yml",
    "../.github/ISSUE_TEMPLATE/model_contribution.yml",
    "../.github/ISSUE_TEMPLATE/feature_request.yml",
  ]) {
    assert.equal(await exists(path), true, `${path} should exist`);
  }
});

test("workspace package metadata uses Apache-2.0 consistently before GitHub release", async () => {
  const root = await readJson("../package.json");
  const core = await readJson("../packages/core/package.json");
  const cli = await readJson("../packages/cli/package.json");
  const adapter = await readJson("../adapters/three/package.json");
  const editor = await readJson("../apps/editor/package.json");
  const plugin = await readJson("../.codex-plugin/plugin.json");

  for (const pkg of [root, core, cli, adapter, editor, plugin]) {
    assert.equal(pkg.license, "Apache-2.0");
  }
  assert.equal(root.private, true, "workspace root should stay private for npm publishing");
});

test("open source release plan preserves current product boundary", async () => {
  const plan = await readText("../docs/open-source-release.md");
  const ci = await readText("../.github/workflows/ci.yml");
  const gitignore = await readText("../.gitignore");
  assert.ok(plan.includes("Avoid positioning it as"));
  assert.ok(plan.includes("an MCP service"));
  assert.ok(plan.includes("License choice confirmed: Apache-2.0"));
  assert.ok(plan.includes("Do not upload installed dependency folders"));
  assert.ok(gitignore.includes("node_modules/"));
  assert.ok(gitignore.includes(".npm/"));
  assert.ok(gitignore.includes(".yarn/"));
  assert.ok(ci.includes("npm run registry:check"));
  assert.ok(ci.includes("node --test tests/*.test.js"));
});
