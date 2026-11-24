# @agentscene/cli

供 AI 大模型通过宿主 Agent 调用的命令行入口。Agent 可检索和构建模型，根据 JSON 诊断修正源稿，并复核空间计算与连接结果。

## Contract

- stdout 只输出一个 JSON 对象；
- 成功返回 `{ "ok": true, ... }`；
- 失败返回 `ok: false`，退出码为 2。检查命令以 `issues` 返回批量诊断，其他命令的执行错误通常通过 `error` 返回；
- proposal 提供可审阅的变更建议，应用由 Agent 或宿主决定。

### 一次检查多个建模错误

`composition check <文件或 ->` 接受原始 CompositionSpec、`core.composition` 实例或组合模型的 registry manifest。`-` 表示从 stdin 读取。命令只读，stdout 始终是一个 JSON 对象。通过时返回 `{"ok":true,"issues":[]}` 并退出 0；检查失败时返回 `ok: false` 和 `issues` 数组并退出 2。

每个问题带有稳定的 `code`、原因 `message`、指向实际输入的 JSON Pointer `path`；能识别所属节点时包含 `nodeId`。例如同一节点可以同时出现以下两项。

```json
{
  "ok": false,
  "issues": [
    {"code":"NODE_ID_DUPLICATE","nodeId":"tray","path":"/parameters/nodes/2/id","message":"ID also used at /parameters/nodes/0/id","relatedLocations":[{"path":"/parameters/nodes/0/id","kind":"first-declaration"}]},
    {"code":"PARENT_MISSING","nodeId":"tray","path":"/parameters/nodes/2/parent","message":"Parent node does not exist: rack"}
  ]
}
```

检查覆盖源节点及展开实例的 ID、父子层级、几何、变换、重复、朝向、灯光、包围盒与世界坐标下的锚点。父节点缺失或变换无效时，其他独立分支仍会完成检查。修复后可重跑以检查此前缺少前提的分支。无效 JSON 或无法读取的文件产生文档级问题，路径为空字符串。

### 检查多构件装配

`composition check` 也可直接读取内嵌组合模型的 method 或 component manifest。例如 `composition check registry/methods/anchor-attachment/manifest.json` 会检查示例中的两个本地端口。内部连接的类型、端点和约束分别定位到对应字段。只有可选连接的物理不匹配时，命令返回 `ok: true` 和警告，退出 0。

`scene check <文件或 ->` 读取带有 `instances` 的场景，检查实例 ID、组件参数、组合模型内部字段、连接端点和连接约束。可把场景 JSON 通过 stdin 传入。stdout 返回一个 `{ok, issues}` 对象。任何错误都使退出码为 2，只有警告或完全通过时退出 0。

每项问题含 `code`、`path`（从场景根开始的 JSON Pointer）、`message` 和 `level`。实例问题带 `instanceId`，组合模型内的节点问题还可带 `nodeId`。间隙、方向、外径问题带有 `from`、`to` 和涉及的 `instanceIds`。显式命名的连接还会返回 `relationId`。例如 `/attachments/0/to` 可定位拼错的锚点，`/instances/2/parameters/diameter` 可定位无效管径。

端点能唯一解析时，检查器会继续比较两端。必需连接的物理不匹配是错误，`required: false` 时是警告。拼错引用、重复实例 ID 或无效约束字段属于输入错误。修正阻断引用的问题后，再次运行即可检查依赖该引用的连接。

连接不匹配时可直接读取 `issues[].measurement`。`scene check`、`composition check` 和场景构建的连接诊断使用相同字段。

| 问题 | 测量字段 | 单位 |
| --- | --- | --- |
| 间隙 | `fromPoint`、`toPoint` 是世界坐标。`gap` 是端点距离，`effectiveGap` 是扣除 `embed` 后的剩余间隙，允许值为 `gapTolerance`。 | `meter` |
| 方向 | `fromDirection`、`toDirection` 是世界方向。`angle` 是实际夹角，`deviation` 是相对 `direction` 要求的偏差，允许值为 `angularTolerance`。 | `radian` |
| 外径 | `from`、`to` 是两端声明的外径，`difference` 是绝对差，允许值为 `diameterTolerance`。 | `meter` |

缺少方向或外径时，对应端点值及依赖它的测量结果为 `null`，另一端的已知值仍可读取。

```powershell
node packages/cli/src/agentscene.mjs scene check examples/digital-modeling/mep/pipe-reducer-connection.json
```

### 定位到 JSON 原文

需要对照其他字段的建模错误会带 `relatedLocations`。每项包含 `path` 和 `kind`。重复节点或实例 ID 的 `first-declaration` 指向首次声明，歧义父节点、锚点或接头引用的 `candidate-declaration` 列出所有候选 ID。多节点循环中的 `cycle-edge` 指向下一条父引用。这些路径都从当前输入的根开始，可直接用于 manifest 和场景中的嵌套组合。

父节点、锚点所属节点或接头端点写错时，诊断可附上 `suggestedValues`，给出最多三个最接近且可解析的字段值。例如 `samll-pipe#end` 可以建议 `small-pipe#end`，前提是候选实例唯一且确实提供 `end` 锚点。父节点候选限于可用的父级，重复节点须有可用的 occurrence 才会作为锚点所属节点候选。可结合 `path` 核对后替换并复查。

`composition check` 和 `scene check` 均支持 `--source-ranges`，输入可以是文件或 stdin。启用后，能定位的问题会带上 `sourceRange`。其中 `offset` 从 0 开始，`line`、`column`、`endLine` 和 `endColumn` 从 1 开始。偏移、`length` 和列以 UTF-16 代码单元计，范围采用前闭后开区间。

字段存在时，范围选中原文中的值。`relatedLocations` 中的每个位置也会附上各自的 `sourceRange`。字段缺失时，`path` 仍指向要补充的字段，`sourceRange.matchedPath` 指向范围所选中的最近已有值。输入无法读取或原文位置无法计算时，仍会返回原有诊断。警告级别和退出码沿用两条命令原有的约定。

启用 `--source-ranges` 时，语法错误以 `JSON_INVALID` 和空 `path` 返回。每项带 `syntaxCode`，例如 `CommaExpected`、`ColonExpected` 或 `TrailingComma`。缺少分隔符时，范围指向插入位置之后的记号。尾逗号的范围直接选中逗号。文末截断的范围为零长度。同一位置只保留一项诊断，遇到失配括号等无法可靠继续解析的情况，报告会保留此前的错误和阻断位置。

补逗号、补冒号和删除尾逗号的明确情形会附上 `fix`。它用 `text` 替换原文从 `offset` 开始、长度为 `length` 的区间，坐标同样使用 UTF-16 代码单元。插入时 `length` 为 0，删除时 `text` 为空字符串。插入点在前一个记号的末尾，以保留原有换行和缩进。批量应用时，按原文的 `offset` 从大到小处理，再运行检查确认结果。遇到缺值、失配括号或有歧义的数字时，诊断仍提供位置，供进一步判断。检查命令本身是只读的。

```powershell
node packages/cli/src/agentscene.mjs composition check model.json --source-ranges
node packages/cli/src/agentscene.mjs scene check - --source-ranges
```

### 检查重复的 JSON 键

`composition check` 和 `scene check` 都可以加上 `--reject-duplicate-keys`。同一个对象中，键名解码后相同的每次后续声明都会产生 `JSON_KEY_DUPLICATE`，报告给出 `key` 和 `path`，命令退出 2。例如 `"diameter"` 和 `"diam\u0065ter"` 会被识别为同一个键。建模检查仍按 JSON 解析得到的有效值运行，因此可在同一份报告中看到独立的建模问题。

同时启用 `--source-ranges` 时，`firstSourceRange` 选中首次声明的键，`sourceRange` 选中本次重复的键。两者都包括原文引号，可用来区分指向同一个 JSON Pointer 的不同声明。

```powershell
node packages/cli/src/agentscene.mjs scene check scene.json --reject-duplicate-keys --source-ranges
```

### 分析空间关系

`scene analyze-spatial` 比较具有世界坐标包围盒的实例。`instanceCount` 包含全部实例，`pairs` 和 `pairCount` 只统计实际比较的实例对。`skippedInstanceIds` 列出缺少几何包围盒的实例，例如纯定位锚点。当只有定位实例时，分析成功并返回零组结果。

对于矩形梁、板等 `box` 节点，世界包围盒按八个角点经过节点、父级和实例变换后的位置计算。例如一根 4 米长的梁，节点绕 Z 轴旋转 45°，实例再绕同轴旋转 −45°，它在世界 X 轴上仍占 4 米。`scene propose-distribute` 使用同一范围安排间距。空间分析比较的是世界轴对齐包围盒，斜放或带空隙的构件仍可能出现包围盒重叠。

球体和圆环按曲面在世界坐标轴上的投影计算范围，扫掠构件（如桥架弯头）按截面顶点计算。一个直径 2 米的球体和一个外径 2 米的水平圆环，中心沿 X 轴相距 2.1 米时，绕各自竖轴旋转后，X 向净距仍为 0.1 米。若需判断构件能否穿过环孔，包围盒重叠本身不足以确定两者接触。

对于 `mep.pipe-run` 和 `tube-along`，每段管子按两个平端圆面的投影计算范围，弯折处合并相邻管段的范围。两根外径 20 厘米的同轴直管，端面相隔 5 厘米时，`scene analyze-spatial` 返回 `separated` 和 0.05 米的间距。沿管轴执行排列时，`gap: 0` 可将相邻端面贴合。旧提案若引用了包含额外半径的范围，应用时会返回 `bounds-changed`，可按当前场景重新生成。

### 应用场景提案

`scene apply-proposal` 可接收 `scene propose-align` 或 `scene propose-distribute` 的 JSON 输出。命令将结果场景写到 stdout，按实例核对提案的 `before` 和当前的位置、旋转、缩放。省略的变换字段按场景默认值比较。

排列提案按请求顺序测量相邻构件。查看 `facts.gapMeasurements` 可读到每对构件的 ID、排列轴、请求间距 `expected` 和实测间距 `actual`。间距按后一个包围盒的下界减去前一个的上界计算，负值表示两者在该轴上重叠。`facts.end` 是最后一个构件的实测上界。若拟议变换使包围盒范围、轴向尺寸或间距偏离目标超过 `1e-9` 米，`scene propose-distribute` 会退出 2，返回 `SCENE_DISTRIBUTION_TARGET_MISSED` 和 `error.measurement`。例如在 X 坐标 `1e16` 米处请求 0.5 米间距时，测量可能显示两面实际相距 0 米。

应用和重试会复核当前几何，包括已就位的实例。`bounds-changed` 给出实例 ID、轴，以及预期和实际的 `{min, max}`，尺寸变化时另附 `expectedSize` 和 `actualSize`。若相邻构件分别满足边界容差，但间距超出容差，`distribution-gap-missed` 会给出该对构件的最新测量。旧提案只要保留有序的 `facts.placements`、`facts.axis` 和 `facts.gap`，也会执行这些检查。可根据冲突在当前场景重新生成提案。若选中的实例本身缺少包围盒，生成提案时会返回 `SCENE_BOUNDS_MISSING` 和实例 ID 列表 `instanceIds`。

审阅 `scene propose-align` 或 `scene propose-distribute` 时，读取 `proposal.facts.connectionImpact`。每项对应一个端点属于移动实例的场景连接，包括 `relations` 中的连接和 `attachments`。用 `path` 定位声明，有名称时还会返回 `relationId`。`from`、`to`、`required` 和 `contract` 描述端点与生效的约束。`before` 和 `after` 均提供 `connected`、以米为单位的 `gap` 和 `effectiveGap`，以及与 `scene check` 一致的问题代码、级别和测量值。例如把 B 管左移 1 米，可以同时看到 A–B 的间隙由 1 米降至 0，B–C 的间隙由 0 增至 1 米。两个位置重合后，外径不匹配仍会列在 `after.issues` 中。

排列提案使用整批实例的最终位置计算 `after`。例如 A、B、C 依次接通，B 和 C 一起向右平移 2 米，B–C 的间隙仍为 0，A–B 的间隙增至 2 米。两个端点都移动的连接在预览里只列一次。若选中的实例均已就位，排列预览的 `connectionImpact` 为空数组。

应用或重试时，CLI 会逐行检查接头预览。若 `after.connected` 被写成字符串 `"true"`，`connection-preview-invalid` 会指出提案中的具体路径，如 `/facts/connectionImpact/0/after/connected`。同一声明在预览中出现两次时，`connection-preview-duplicate` 会给出重复项的 `path` 和首次出现的 `firstPath`。两个端点相同的独立接头声明可以各占一行。其他有效记录仍参与复核，新增必需接头将被拉开时也会一并报告。

`before` 和 `after` 的间距按 `scene check` 的规则复核。`effectiveGap` 为 `max(0, gap - embed)`，恰好等于容差时通过间距检查。例如原始间距为 1 米、插入量为 0.08 米、容差为 0.02 米时，剩余的 0.92 米要求 `connected` 为 `false`，且 `issues` 中须有一条 `SCENE_CONNECTION_GAP`。若预览写成已连接且问题列表为空，CLI 会同时指出这两个字段。间距合格时，方向或外径问题仍可使接头处于断开状态。

间距问题中的 `measurement.fromPoint` 和 `toPoint` 使用世界坐标，单位为米。CLI 会用这两个端点复算间距，并核对测量记录中的插入量与容差。数值矛盾会返回具体路径和可比较的 `expected`、`actual`。若两个端点与记录间距不符且无法确定哪个坐标有误，路径指向这组 `measurement`。

CLI 也会用方向问题中记录的世界坐标系单位向量复算夹角和偏差（弧度），用外径问题中记录的两个外径复算差值（米），并与预览约束对照。缺失的方向或外径用 `null` 表示。例如任一端外径缺失时，应使用 `SCENE_CONNECTION_DIAMETER_UNAVAILABLE`。两端外径都存在且差值超限时，应使用 `SCENE_CONNECTION_DIAMETER_MISMATCH`。若测量符合约束却列了问题，冲突会定位到该问题的 `code`，此时 `expected: null` 表示应移除此问题。若连接状态也随之矛盾，同一响应会指出 `connected`。

新提案在有方向或等外径约束时，会在 `before.portMeasurements` 和 `after.portMeasurements` 保存对应的端口数据，包括通过检查的端口。`direction` 中的 `fromDirection` 与 `toDirection` 是世界坐标系的单位向量，`outsideDiameter` 中的 `from` 与 `to` 以米为单位。端口缺少相应数据时使用 `null`。即使 `issues` 为空，CLI 也会复算这些约束。若预览漏掉问题，冲突指向该阶段的 `issues`，并在 `expected` 中给出缺失的问题代码，在 `actual` 中返回 `null`。

早期提案可以省略 `connectionImpact`。显式提供该字段时须使用数组，每行的 `required` 与生效约束一致。若生成预览时接头距离超出有限数值范围，命令返回 `SCENE_CONNECTION_MEASUREMENT_INVALID`，`error.measurement` 给出声明路径、端点及测量阶段 `before` 或 `after`。

如果同一条预览的两个阶段都没有 `portMeasurements`，CLI 会沿用旧版校验，依据已有问题中的端口测量复核。任一阶段提供该字段时，另一阶段也须提供。

应用对齐或排列提案时，CLI 会按当前场景和拟应用的最终变换重新比较必需连接。如果一个当前已接通的必需接头将断开，且该断开未出现在提案预览中，整批退出 2。`SCENE_PROPOSAL_CONFLICT` 的对应冲突项带有 `reason: "required-connection-disconnected"`、接头路径、端点和最新的 `before`、`after`。在当前场景重新生成提案即可审阅这项变化。相关必需接头无法求值时，原因是 `connection-unavailable`。重试部分完成的排列时，CLI 依据剩余移动复核接头。

如果必需接头在移动前已经未接通，CLI 仍会比较移动前后的问题代码。例如现场只剩外径不匹配，移动会再次拉开端点时，即使接头状态一直是未接通，也需要审阅这次新增的间距问题。若提案缺少对应的审阅，整批返回 `required-connection-new-issues`，`addedIssueCodes` 给出移动引入的问题。

提案提供接头预览时，CLI 还会比较剩余移动前后同一失败检查的可测偏差。若预览中间距始终为 0.50 米，当前移动却会把间距从 0.25 米增至 0.75 米，CLI 会返回 `required-connection-measurement-increased`。`increasedMeasurements` 给出问题代码、字段、单位和实测 `before`、`after`。如果偏差在现场本来就较大且移动前后相同，这项检查通过。原预览已审阅同一检查的偏差增加时，仍须通过审阅值上限检查。

已审阅的断开或新增问题也会在应用和重试时复核。当前最终姿态出现未审阅的问题代码，或移动重新引入了审阅时两个姿态都已有的问题，CLI 会返回 `reviewed-disconnection-changed`。比较 `reviewedBefore`、`reviewedAfter` 与当前的 `before`、`after`，并用 `addedIssueCodes` 找到需要重新审阅的问题。`reviewedPath` 保留审阅时的声明路径，`path` 指向当前声明。若接头在现场已修复接通，随后再次断开须有对应的断开审阅。

预览中的问题新增或偏差变化若有数值测量，CLI 会在应用与重试时用审阅过的最终值作上限。比较的量包括有效间距（扣除插入量后，单位为米）、方向偏差（弧度）和外径差（米）。例如预览预计把有效间距从 1.00 米降到 0.20 米，当前最终姿态仍有 0.70 米，即使间距有所缩小也会返回 `reviewed-connection-measurement-exceeded`。`exceededMeasurements` 给出每项超出的 `code`、`field`、`unit`、`expected` 和 `actual`。对应约束通过，或实际偏差等于或小于审阅值时，这项检查通过。

如果预览预计缩小偏差，而对应约束在最终姿态仍失败且缺少可比较的数值，CLI 会返回 `reviewed-connection-measurement-unavailable`。`unavailableMeasurements` 中的 `expected` 是审阅目标，`actual` 为 `null`，`actualCode` 是当前的问题代码。例如外径差预计缩小，但现场缺少一端的外径数据。

若预览显示某个必需接头将从断开变为接通，应用和重试都会复核这项修复，包括排列中已经就位的实例。最终仍未接通时，冲突原因为 `required-connection-not-restored`。`reviewedAfter` 是审阅时的预期，`before` 与 `after` 是按当前场景得到的测量。例如一端外径从 50 毫米改为 75 毫米时，`after.gap` 可以是 0，`after.issues` 会给出 0.025 米的外径差。可修正管径后重试，或按现状重新生成提案并审阅剩余问题。

若预览预计只消除部分故障，CLI 也会在应用和重试时复核这些约束。比如预览预计消除间距、保留外径不匹配，当前最终姿态若仍有间距问题，CLI 会返回 `required-connection-issues-not-resolved`。`unresolvedIssueCodes` 列出预览预计消除却仍未通过的检查，当前 `after.issues` 提供实际测量。外径不匹配和缺少外径数据都表示外径检查未通过。

如果预计修复或缩小偏差的必需接头已删除、改为可选，或端点和生效约束发生了变化，`reviewed-connection-missing` 表示原声明已无法匹配。`path` 指向当前声明列表，`reviewedPath` 保留审阅时的位置。可在当前场景重新生成提案。预览里原本为可选的接头只影响警告。

复核按声明所属列表、ID、端点和生效的物理约束匹配，等价声明按条数匹配。列表重排不影响匹配。可选接头的断开显示为警告。缺少接头预览的旧提案仍可应用，若移动会断开必需接头或给已断开的必需接头引入新问题，则须重新审阅。Core 调用方如有随实例位姿重新计算局部锚点的自定义构件，生成及应用提案时均传入构建场景所用的注册表作为第三个参数。

对齐提案的 `alignmentAnchors` 记录源锚点的实例局部坐标和目标锚点的世界坐标。源锚点须属于要移动的实例。`scene propose-align` 会按拟议变换重建源锚点，并在 `facts.alignmentResult` 返回目标世界坐标 `expected`、实测世界坐标 `actual` 和两点的直线距离 `gap`。只要任一坐标轴的误差超过 `tolerancePerAxis`（`1e-9` 米），命令即退出 2，通过 `SCENE_ALIGNMENT_TARGET_MISSED` 的 `error.measurement` 返回测量值。

应用和重试都会先复核锚点记录。若锚点偏离记录，冲突项会给出 `anchor-moved`、引用、坐标系及预期和实际位置。随后，CLI 按当前几何重算对齐步骤后的落点，并与具名目标锚点的实际位置或固定的 `targetPoint` 比较。例如，缩放把一个容差内的局部改动放大成 0.5 米的落点偏差时，冲突项会返回 `alignment-target-missed` 和对应的 `measurement`。可用当前场景重新执行 `scene propose-align`。包含 `alignmentAnchors` 的旧提案同样会复核落点。缺少这组记录的旧提案会返回 `alignment-references-missing`。

任一目标存在冲突时，整批退出 2，返回 `error.code = "SCENE_PROPOSAL_CONFLICT"`。读取整个 `error.conflicts` 数组，每项给出 `path` 和 `reason`，能定位到实例时也给出 `instanceId`。同一次检查可以同时报告尺寸已变的构件和会被拉开的必需接头。例如，`/instances/0` 的 `bounds-changed` 指出构件宽度从 1 米变为 2 米，`/attachments/0` 的 `required-connection-disconnected` 指出另一构件的接头间距将从 0 米变为 1 米。可据此一次修正场景或重新生成提案。

编辑过的提案若有字段错误，查看带 `source: "proposal"` 的冲突项。`path` 是相对于提案对象的 JSON Pointer，传入 `{"proposal": ...}` 包装时路径也从内层开始。例如，`/changes/0/after/position/2` 指向第一步目标位置的 Z 坐标，`/changes/2/operation` 指向第三步的操作名。向量需要三个有限数值。重复的排列实例还会给出首次出现的 `firstPath`。这些字段错误可与其他实例的场景冲突一并返回。执行到一半再重试时，已经就位的步骤可以省略 `before`，待执行步骤仍需提供它。

`transform-changed` 会给出 `expected`、`actual` 和 `proposed`。当前变换字段无效时，`transform-invalid` 会定位到具体字段，例如 `/instances/0/transform/rotation/1`。某实例的变换步骤中途发生冲突时，CLI 只对两端最终位置均可确定的接头计算间距。重试时同样会复核已就位实例上原计划修复的接头。整批成功且实际发生变换时，`revision` 增加 1。

### 搜索公开模型库

`registry search <关键词>` 按 ID、名称、简介、语义类型、标签和能力搜索。多个关键词需全部匹配，英文忽略大小写。返回 `count` 和 `results`，每项包含 `id`、`kind`、`title`、`summary` 和本机绝对路径 `manifestPath`。无匹配时返回空数组并退出 0。

在 PowerShell 中可将组合模型的搜索结果直接交给检查和构建命令。

```powershell
$cli = 'packages/cli/src/agentscene.mjs'
$tray = (node $cli registry search 桥架 | ConvertFrom-Json).results | Where-Object id -eq 'mep.cable-tray-elbow'
node $cli composition check $tray.manifestPath
node $cli component build $tray.manifestPath
```

## Commands

```powershell
node packages/cli/src/agentscene.mjs component list
node packages/cli/src/agentscene.mjs composition check registry/compositions/cable-tray-elbow/manifest.json
node packages/cli/src/agentscene.mjs component describe core.composition
node packages/cli/src/agentscene.mjs component build examples/digital-modeling/independent-foundation.json
node packages/cli/src/agentscene.mjs reference analyze-glb path/to/reference.glb
node packages/cli/src/agentscene.mjs scene build examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene query examples/digital-modeling/composed-scene.json examples/digital-modeling/queries/rebar.json
node packages/cli/src/agentscene.mjs scene analyze-spatial examples/digital-modeling/composed-scene.json
node packages/cli/src/agentscene.mjs scene propose-align examples/digital-modeling/alignment-source.json examples/digital-modeling/proposals/align-pipes.json
node packages/cli/src/agentscene.mjs scene propose-distribute examples/digital-modeling/composed-scene.json examples/digital-modeling/proposals/distribute-instances.json
node packages/cli/src/agentscene.mjs scene apply-proposal examples/digital-modeling/composed-scene.json proposal.json
node packages/cli/src/agentscene.mjs path analyze examples/digital-modeling/paths/analyze-water-pipe.json
node packages/cli/src/agentscene.mjs path orthogonal-candidates examples/digital-modeling/paths/orthogonal-candidates.json
node packages/cli/src/agentscene.mjs path sample examples/digital-modeling/paths/sample-supports.json
node packages/cli/src/agentscene.mjs mep route-with-clips examples/digital-modeling/mep/route-with-clips.json
node packages/cli/src/agentscene.mjs mep drain-slope-check examples/digital-modeling/mep/drain-slope-check.json
node packages/cli/src/agentscene.mjs mep pressure-test-loop examples/digital-modeling/mep/pressure-test-loop.json
```

`mep route-with-clips` 将可编辑模型放在 `result.composition`。修改管线节点的 `geometry.points` 后，可用 `composition check` 检查模型，用 `component build` 读取更新后的端口、管卡和总管长。实际管卡原型 ID 见 `result.routes[].clipPrototypeId`。

管线请求校验失败时退出码为 2。顶层 `issues` 数组一次列出各条管线可独立判断的问题，`error` 保留首项供已有调用方使用。每项包含 `code: "MEP_ROUTE_INVALID"`、字段的 JSON Pointer 和原因，管线字段还带有 `routeId`。例如 `/routes/2/points/1/0` 指向第三条管线第二个路径点的 X 坐标。

重复 ID 的 `firstPath` 指向首次声明的位置。两端预留超过管长时，返回 `length`、`startOffset`、`endOffset`，单位为米。短管可以缩小预留，或设置 `generateClips: false`。Agent 可按 `issues[].path` 一次修正请求，通过 `mep route-with-clips -` 从标准输入重新生成。

`scripts/model.mjs` 是兼容包装器，保留给旧文档和历史任务使用。
