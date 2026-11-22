import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { generateHumanPart, generateLowPolyWorkerHuman } from "../packages/core/src/human-geometry.js";

const compositionRoot = join("registry", "compositions");

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeHumanPartManifest(entry) {
  const dir = join(compositionRoot, entry.dir);
  mkdirSync(dir, { recursive: true });
  entry.manifest.visibility = "internal";
  entry.manifest.editor = { document: generateHumanPart(entry.request).composition };
  writeJson(join(dir, "manifest.json"), entry.manifest);
}

function syncBasicHumanFigure() {
  const path = join(compositionRoot, "basic-human-figure", "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.visibility = "internal";
  manifest.editor = manifest.editor ?? {};
  manifest.editor.document = generateLowPolyWorkerHuman({ id: "basic-human-figure", title: manifest.title }).composition;
  manifest.capabilities = [...new Set([...(manifest.capabilities ?? []), "human-part-generation", "axis-lofted-footwear", "facial-feature-lofting", "limb-profile-lofting", "worker-silhouette-v3"].filter((item) => item !== "worker-silhouette-v2"))];
  writeJson(path, manifest);
}

function syncHumanSurfaceMethod() {
  const path = join("registry", "methods", "human-surface-lowpoly", "manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.visibility = "internal";
  manifest.capabilities = [...new Set([...(manifest.capabilities ?? []), "human-part-generation", "human-head-module", "human-hand-module", "human-foot-module"])];
  manifest.ai.editableParts = [...new Set([...(manifest.ai.editableParts ?? []), "headModule", "handModule", "footModule"])];
  manifest.guide.contract = manifest.guide.contract.replace(
    "generateLowPolyWorkerHuman(request) returns a complete core.composition document.",
    "generateHumanPart(request) returns a reusable head/hand/foot core.composition module. generateLowPolyWorkerHuman(request) returns a complete core.composition document assembled from the same human surface grammar.",
  );
  const partCli = 'node packages/cli/src/agentscene.mjs human-geometry generate-part {"part":"hand","side":"right"}';
  if (!manifest.guide.cli.includes(partCli)) manifest.guide.cli.splice(2, 0, partCli);
  const qualityCli = "node packages/cli/src/agentscene.mjs composition analyze-human-quality registry/compositions/basic-human-figure/manifest.json";
  if (!manifest.guide.cli.includes(qualityCli)) manifest.guide.cli.splice(3, 0, qualityCli);
  writeJson(path, manifest);
}

const partManifests = [
  {
    dir: "human-head-module",
    request: { part: "head", id: "human-head-module", title: "人体头部子构件" },
    manifest: {
      schemaVersion: "0.1",
      id: "character.human-head-module",
      version: "0.1.0",
      kind: "composition",
      title: "人体头部子构件",
      summary: "由参数化几何生成的可编辑人体头部模块，包含头部轮廓、鼻梁、脸颊、眼睛、眼镜、安全帽、颈部与视线锚点，可作为完整数字人或工人角色的头部子构件复用。",
      license: "Apache-2.0",
      semanticType: "character.human.part.head",
      capabilities: ["inspect-structure", "anchors", "human-part", "human-head-module", "facial-feature-lofting", "section-loft-head", "helmet", "glasses", "no-glb"],
      tags: ["人物", "头部", "脸部", "安全帽", "参数化模型", "无GLB"],
      parameters: {
        height: { type: "number", unit: "m", default: 1.74 },
        part: { type: "enum", values: ["head"], default: "head" },
      },
      dependencies: ["character.human-surface-lowpoly@0.1.0", "primitive.sphere@0.1.0", "primitive.box@0.1.0", "primitive.torus@0.1.0"],
      ai: {
        intent: "给 Agent 一个可单独复用的人体头部数字构件，避免每次用球体、锥体和盒子临时堆出玩偶感头部。",
        useWhen: ["需要给工人、讲师、司机、操作员等人形角色添加可编辑头部时使用。", "需要测试或改进脸部、头盔、眼镜、视线锚点等头部细节时使用。"],
        avoidWhen: ["需要真实人脸扫描、表情绑定、毛发系统或影视级角色资产时不要把它当最终美术模型。"],
        editableParts: ["head-root", "neck", "head-pivot", "head", "nose", "left-cheek-facet", "right-cheek-facet", "left-eye", "right-eye", "glasses", "safety-helmet"],
        qualityChecks: ["鼻子和脸颊应是贴合头部的低浮雕构件，不应像独立玩具零件漂在外面。", "安全帽应作为头部外层装备，不应遮挡眼睛和视线锚点。"],
        commonVariants: ["安全帽工人头部", "普通人头部", "佩戴眼镜的讲师或工程师头部"],
      },
    },
  },
  {
    dir: "human-right-hand-module",
    request: { part: "hand", side: "right", id: "human-right-hand-module", title: "人体右手子构件" },
    manifest: {
      schemaVersion: "0.1",
      id: "character.human-right-hand-module",
      version: "0.1.0",
      kind: "composition",
      title: "人体右手子构件",
      summary: "由参数化几何生成的可编辑右手模块，包含手腕、袖口、手掌、拇指、四指、指尖与抓取锚点，可作为完整数字人或设备操作场景中的手部子构件复用。",
      license: "Apache-2.0",
      semanticType: "character.human.part.hand.right",
      capabilities: ["inspect-structure", "anchors", "human-part", "human-hand-module", "semantic-fingers", "finger-chain", "finger-pivots", "fine-hand-anchors", "section-loft-hands", "grasp-pose-ready", "no-glb"],
      tags: ["人物", "手", "右手", "手指", "抓取锚点", "参数化模型", "无GLB"],
      parameters: {
        height: { type: "number", unit: "m", default: 1.74 },
        part: { type: "enum", values: ["hand"], default: "hand" },
        side: { type: "enum", values: ["right"], default: "right" },
      },
      dependencies: ["character.human-surface-lowpoly@0.1.0", "character.human-pose-rig@0.1.0", "primitive.sphere@0.1.0", "primitive.box@0.1.0", "primitive.cylinder@0.1.0"],
      ai: {
        intent: "给 Agent 一个可单独复用的人体手部数字构件，保留手掌、拇指、四指、指尖和抓取锚点，减少每次重写手指结构的工作。",
        useWhen: ["需要表达抓取、指向、操作按钮、握持工具等手部动作前的基础几何时使用。", "需要把手作为独立模块放到机械臂、人形角色或教学示意中时使用。"],
        avoidWhen: ["需要真实皮肤褶皱、指甲、手掌纹理或完整手部骨骼蒙皮时不要把它当最终高精模型。"],
        editableParts: ["right-hand-root", "right-wrist-pivot", "right-sleeve-cuff", "right-hand", "right-thumb-pivot", "right-thumb", "right-index-finger", "right-middle-finger", "right-ring-finger", "right-little-finger"],
        qualityChecks: ["手指应保持语义链和指尖锚点，不能合并成一个不可编辑整体。", "手掌应使用掌形轮廓，不应退回球体或方块。"],
        commonVariants: ["右手抓取姿态基础", "右手指向姿态基础", "戴手套工人右手"],
      },
    },
  },
  {
    dir: "human-right-foot-module",
    request: { part: "foot", side: "right", id: "human-right-foot-module", title: "人体右脚子构件" },
    manifest: {
      schemaVersion: "0.1",
      id: "character.human-right-foot-module",
      version: "0.1.0",
      kind: "composition",
      title: "人体右脚子构件",
      summary: "由参数化几何生成的可编辑右脚与工靴模块，包含脚踝、轴向 loft 靴体、鞋头、鞋底、鞋带与地面接触锚点，可作为完整数字人或施工角色的脚部子构件复用。",
      license: "Apache-2.0",
      semanticType: "character.human.part.foot.right",
      capabilities: ["inspect-structure", "anchors", "human-part", "human-foot-module", "axis-lofted-footwear", "foot-contact-anchor", "boot-layer", "no-glb"],
      tags: ["人物", "脚", "右脚", "工靴", "地面接触点", "参数化模型", "无GLB"],
      parameters: {
        height: { type: "number", unit: "m", default: 1.74 },
        part: { type: "enum", values: ["foot"], default: "foot" },
        side: { type: "enum", values: ["right"], default: "right" },
      },
      dependencies: ["character.human-surface-lowpoly@0.1.0", "primitive.box@0.1.0", "primitive.lofted-surface@0.1.0"],
      ai: {
        intent: "给 Agent 一个可单独复用的人体脚部/工靴数字构件，用轴向 loft 表达鞋体和地面接触，而不是盒子加球形鞋头。",
        useWhen: ["需要让人形角色站在地面、踏板、设备平台或施工场景中时使用。", "需要单独检查脚底接触、工靴鞋体、鞋带和朝向时使用。"],
        avoidWhen: ["需要真实鞋面纹理、软体鞋带、足部解剖或运动鞋高精模型时不要把它当最终资产。"],
        editableParts: ["right-foot-root", "right-ankle-pivot", "right-shoe", "right-toe-cap", "right-boot-sole", "right-boot-lace-a", "right-boot-lace-b"],
        qualityChecks: ["鞋体应沿脚长方向 loft，不应退回简单盒子。", "foot-contact 锚点必须保持在鞋底下方，方便放置到地面或设备踏板。"],
        commonVariants: ["工人右脚", "设备操作员右脚", "站立角色地面接触脚"],
      },
    },
  },
];

syncBasicHumanFigure();
for (const entry of partManifests) writeHumanPartManifest(entry);
syncHumanSurfaceMethod();
