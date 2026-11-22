# @agentscene/cli

AgentSceneBuilder 的 Agent 优先命令行入口。

## Contract

- stdout 只输出一个 JSON 对象；
- 成功返回 `{ "ok": true, ... }`；
- 失败返回 `{ "ok": false, "error": ... }`，退出码为 2；
- proposal 只是可审阅建议，不应被视为自动领域决策。

## Commands

```powershell
node packages/cli/src/agentscene.mjs component list
node packages/cli/src/agentscene.mjs component describe core.composition
node packages/cli/src/agentscene.mjs component build examples/digital-modeling/independent-foundation.json
node packages/cli/src/agentscene.mjs reference analyze-glb path/to/reference.glb
node packages/cli/src/agentscene.mjs scene build examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene query examples/digital-modeling/composed-scene.json examples/digital-modeling/queries/rebar.json
node packages/cli/src/agentscene.mjs scene analyze-spatial examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene propose-align examples/digital-modeling/alignment-source.json examples/digital-modeling/proposals/align-pipes.json
node packages/cli/src/agentscene.mjs scene propose-distribute examples/digital-modeling/alignment-source.json examples/digital-modeling/proposals/distribute-instances.json
node packages/cli/src/agentscene.mjs scene apply-proposal examples/digital-modeling/alignment-source.json proposal.json
node packages/cli/src/agentscene.mjs path analyze examples/digital-modeling/paths/analyze-water-pipe.json
node packages/cli/src/agentscene.mjs path orthogonal-candidates examples/digital-modeling/paths/orthogonal-candidates.json
node packages/cli/src/agentscene.mjs path sample examples/digital-modeling/paths/sample-supports.json
node packages/cli/src/agentscene.mjs mep route-with-clips examples/digital-modeling/mep/route-with-clips.json
node packages/cli/src/agentscene.mjs mep drain-slope-check examples/digital-modeling/mep/drain-slope-check.json
node packages/cli/src/agentscene.mjs mep pressure-test-loop examples/digital-modeling/mep/pressure-test-loop.json
```

`scripts/model.mjs` 是兼容包装器，保留给旧文档和历史任务使用。
