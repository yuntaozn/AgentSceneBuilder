import {
  createBounds,
  identityMatrix,
  multiplyMatrices,
  transformPointMatrix,
  translationMatrix,
  unionBounds,
} from "./math.js";

const GLB_MAGIC = 0x46546c67;
const GLB_JSON_CHUNK = 0x4e4f534a;
const GLB_BIN_CHUNK = 0x004e4942;

const COMPONENT_SIZE = new Map([
  [5120, 1],
  [5121, 1],
  [5122, 2],
  [5123, 2],
  [5125, 4],
  [5126, 4],
]);

const COMPONENT_COUNT = new Map([
  ["SCALAR", 1],
  ["VEC2", 2],
  ["VEC3", 3],
  ["VEC4", 4],
  ["MAT2", 4],
  ["MAT3", 9],
  ["MAT4", 16],
]);

function toUint8Array(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new TypeError("GLB reference input must be a Uint8Array, Buffer, DataView, or ArrayBuffer");
}

function decodeUtf8(bytes) {
  if (!globalThis.TextDecoder) throw new Error("TextDecoder is required to parse GLB JSON chunks");
  return new TextDecoder("utf-8").decode(bytes);
}

function chunkTypeName(type) {
  return String.fromCharCode(type & 0xff, (type >> 8) & 0xff, (type >> 16) & 0xff, (type >> 24) & 0xff).replace(/\u0000+$/u, "");
}

function parseGlb(bytes) {
  if (bytes.byteLength < 20) throw new Error("GLB file is too small");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) throw new Error("Input is not a GLB file");
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version}`);
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.byteLength) throw new Error("GLB declared length exceeds provided byte length");

  let json = null;
  let binChunk = null;
  const chunks = [];
  let offset = 12;
  while (offset + 8 <= declaredLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkEnd > bytes.byteLength) throw new Error(`GLB chunk ${chunkTypeName(chunkType)} exceeds provided byte length`);
    const chunkBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + chunkStart, chunkLength);
    chunks.push({ type: chunkTypeName(chunkType), byteLength: chunkLength });
    if (chunkType === GLB_JSON_CHUNK) json = JSON.parse(decodeUtf8(chunkBytes).trim());
    if (chunkType === GLB_BIN_CHUNK) binChunk = chunkBytes;
    offset = chunkEnd;
  }
  if (!json) throw new Error("GLB JSON chunk is missing");
  return { gltf: json, binChunk, chunks };
}

function roundedNumber(value, precision) {
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundedVec3(value, precision) {
  return value.map((item) => roundedNumber(item, precision));
}

function summarizeBounds(bounds, precision) {
  if (!bounds) return null;
  return {
    min: roundedVec3(bounds.min, precision),
    max: roundedVec3(bounds.max, precision),
    size: roundedVec3(bounds.size, precision),
    center: roundedVec3(bounds.center, precision),
  };
}

function createAccumulator() {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
    vertexCount: 0,
  };
}

function expandAccumulator(accumulator, point) {
  for (let axis = 0; axis < 3; axis += 1) {
    accumulator.min[axis] = Math.min(accumulator.min[axis], point[axis]);
    accumulator.max[axis] = Math.max(accumulator.max[axis], point[axis]);
  }
  accumulator.vertexCount += 1;
}

function boundsFromAccumulator(accumulator) {
  if (!accumulator || accumulator.vertexCount === 0) return null;
  return createBounds(accumulator.min, accumulator.max);
}

function scaleMatrix(scale = [1, 1, 1]) {
  return [
    [scale[0], 0, 0, 0],
    [0, scale[1], 0, 0],
    [0, 0, scale[2], 0],
    [0, 0, 0, 1],
  ];
}

function quaternionMatrix(rotation = [0, 0, 0, 1]) {
  const [x, y, z, w] = rotation;
  const magnitude = Math.hypot(x, y, z, w) || 1;
  const nx = x / magnitude;
  const ny = y / magnitude;
  const nz = z / magnitude;
  const nw = w / magnitude;
  const xx = nx * nx;
  const yy = ny * ny;
  const zz = nz * nz;
  const xy = nx * ny;
  const xz = nx * nz;
  const yz = ny * nz;
  const wx = nw * nx;
  const wy = nw * ny;
  const wz = nw * nz;
  return [
    [1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy), 0],
    [2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx), 0],
    [2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy), 0],
    [0, 0, 0, 1],
  ];
}

function gltfColumnMajorMatrix(values) {
  if (!Array.isArray(values) || values.length !== 16) throw new TypeError("glTF node matrix must contain 16 numbers");
  return [
    [values[0], values[4], values[8], values[12]],
    [values[1], values[5], values[9], values[13]],
    [values[2], values[6], values[10], values[14]],
    [values[3], values[7], values[11], values[15]],
  ];
}

function nodeLocalMatrix(node = {}) {
  if (node.matrix) return gltfColumnMajorMatrix(node.matrix);
  return multiplyMatrices(
    translationMatrix(node.translation ?? [0, 0, 0]),
    multiplyMatrices(quaternionMatrix(node.rotation ?? [0, 0, 0, 1]), scaleMatrix(node.scale ?? [1, 1, 1])),
  );
}

function sceneRootNodeIndices(gltf) {
  const sceneIndex = Number.isInteger(gltf.scene) ? gltf.scene : 0;
  const scene = gltf.scenes?.[sceneIndex];
  if (Array.isArray(scene?.nodes) && scene.nodes.length > 0) return scene.nodes;
  const childIndices = new Set();
  for (const node of gltf.nodes ?? []) for (const child of node.children ?? []) childIndices.add(child);
  return (gltf.nodes ?? []).map((_, index) => index).filter((index) => !childIndices.has(index));
}

function computeWorldMatrices(gltf, warnings) {
  const matrices = new Map();
  const visiting = new Set();
  function visit(index, parentMatrix) {
    const node = gltf.nodes?.[index];
    if (!node) {
      warnings.push({ code: "missing-node", message: `Scene references missing node ${index}` });
      return;
    }
    if (visiting.has(index)) {
      warnings.push({ code: "node-cycle", message: `Node hierarchy contains a cycle at ${index}` });
      return;
    }
    visiting.add(index);
    const matrix = multiplyMatrices(parentMatrix, nodeLocalMatrix(node));
    matrices.set(index, matrix);
    for (const child of node.children ?? []) visit(child, matrix);
    visiting.delete(index);
  }

  for (const index of sceneRootNodeIndices(gltf)) visit(index, identityMatrix());
  for (let index = 0; index < (gltf.nodes ?? []).length; index += 1) {
    if (!matrices.has(index)) {
      warnings.push({ code: "unreferenced-node-included", message: `Node ${index} is not in the active scene and was analyzed as a root` });
      visit(index, identityMatrix());
    }
  }
  return matrices;
}

function readComponent(view, byteOffset, componentType) {
  if (componentType === 5120) return view.getInt8(byteOffset);
  if (componentType === 5121) return view.getUint8(byteOffset);
  if (componentType === 5122) return view.getInt16(byteOffset, true);
  if (componentType === 5123) return view.getUint16(byteOffset, true);
  if (componentType === 5125) return view.getUint32(byteOffset, true);
  if (componentType === 5126) return view.getFloat32(byteOffset, true);
  throw new Error(`Unsupported accessor componentType: ${componentType}`);
}

function normalizeComponent(value, componentType) {
  if (componentType === 5120) return Math.max(value / 127, -1);
  if (componentType === 5121) return value / 255;
  if (componentType === 5122) return Math.max(value / 32767, -1);
  if (componentType === 5123) return value / 65535;
  if (componentType === 5125) return value / 4294967295;
  return value;
}

function visitAccessorVec3(gltf, binChunk, accessorIndex, onPoint, warnings) {
  const accessor = gltf.accessors?.[accessorIndex];
  if (!accessor) {
    warnings.push({ code: "missing-position-accessor", message: `POSITION accessor ${accessorIndex} is missing` });
    return 0;
  }
  if (accessor.type !== "VEC3") {
    warnings.push({ code: "unsupported-position-accessor", message: `POSITION accessor ${accessorIndex} is ${accessor.type}, expected VEC3` });
    return 0;
  }
  if (accessor.sparse) {
    warnings.push({ code: "sparse-accessor-ignored", message: `Sparse overrides on POSITION accessor ${accessorIndex} are not applied` });
  }
  const bufferView = gltf.bufferViews?.[accessor.bufferView];
  if (!bufferView) {
    warnings.push({ code: "missing-position-buffer-view", message: `POSITION accessor ${accessorIndex} does not have a readable bufferView` });
    return 0;
  }
  if ((bufferView.buffer ?? 0) !== 0) {
    warnings.push({ code: "external-buffer-unsupported", message: `BufferView ${accessor.bufferView} uses external buffer ${bufferView.buffer}; only embedded GLB BIN data is analyzed` });
    return 0;
  }
  if (!binChunk) {
    warnings.push({ code: "missing-bin-chunk", message: "GLB BIN chunk is missing" });
    return 0;
  }
  const componentSize = COMPONENT_SIZE.get(accessor.componentType);
  const componentCount = COMPONENT_COUNT.get(accessor.type);
  if (!componentSize || componentCount !== 3) {
    warnings.push({ code: "unsupported-position-component", message: `POSITION accessor ${accessorIndex} has unsupported component metadata` });
    return 0;
  }

  const stride = bufferView.byteStride ?? componentSize * componentCount;
  const startOffset = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const view = new DataView(binChunk.buffer, binChunk.byteOffset, binChunk.byteLength);
  let visited = 0;
  for (let index = 0; index < accessor.count; index += 1) {
    const base = startOffset + index * stride;
    const local = [];
    for (let axis = 0; axis < 3; axis += 1) {
      const raw = readComponent(view, base + axis * componentSize, accessor.componentType);
      local.push(accessor.normalized ? normalizeComponent(raw, accessor.componentType) : raw);
    }
    onPoint(local);
    visited += 1;
  }
  return visited;
}

function materialColor(material) {
  return material?.pbrMetallicRoughness?.baseColorFactor
    ?? material?.extensions?.KHR_materials_pbrSpecularGlossiness?.diffuseFactor
    ?? null;
}

function groupKey(prefix, index) {
  return `${prefix}:${index ?? "none"}`;
}

function ensureGroup(groups, key, create) {
  if (!groups.has(key)) groups.set(key, create());
  return groups.get(key);
}

function maxAbsCoordinate(bounds) {
  return Math.max(...bounds.min.map(Math.abs), ...bounds.max.map(Math.abs));
}

function isOutlierBounds(bounds, options) {
  if (!bounds) return false;
  const sizeLimit = options.outlierSizeLimit ?? 10000;
  const coordinateLimit = options.outlierCoordinateLimit ?? 100000;
  return Math.max(...bounds.size) > sizeLimit || maxAbsCoordinate(bounds) > coordinateLimit;
}

function boundsVolume(bounds) {
  if (!bounds) return 0;
  return bounds.size.reduce((product, value) => product * Math.max(value, 1e-9), 1);
}

function summarizeMaterialGroup(group, options) {
  const bounds = boundsFromAccumulator(group.accumulator);
  return {
    materialIndex: group.materialIndex,
    name: group.name,
    baseColorFactor: group.baseColorFactor,
    primitiveCount: group.primitiveCount,
    vertexCount: group.accumulator.vertexCount,
    bounds: summarizeBounds(bounds, options.precision),
    outlier: isOutlierBounds(bounds, options),
  };
}

function summarizeNodeGroup(group, options) {
  const bounds = boundsFromAccumulator(group.accumulator);
  return {
    nodeIndex: group.nodeIndex,
    name: group.name,
    meshIndex: group.meshIndex,
    primitiveCount: group.primitiveCount,
    vertexCount: group.accumulator.vertexCount,
    bounds: summarizeBounds(bounds, options.precision),
    outlier: isOutlierBounds(bounds, options),
  };
}

function proportionHints(bounds, precision) {
  if (!bounds) return null;
  const [width, height, depth] = bounds.size;
  if (height <= 0) return null;
  return {
    width: roundedNumber(width, precision),
    height: roundedNumber(height, precision),
    depth: roundedNumber(depth, precision),
    widthToHeight: roundedNumber(width / height, precision),
    depthToHeight: roundedNumber(depth / height, precision),
  };
}

/**
 * Analyze a binary GLB as reference evidence for a digital CompositionSpec.
 *
 * This does not import a mesh model into AgentSceneBuilder. It extracts stable,
 * reviewable facts such as material groups, node groups, transformed bounds,
 * colors, and outlier warnings so an Agent can rebuild the object as editable
 * renderer-neutral geometry.
 */
export function analyzeGlbReferenceBytes(input, options = {}) {
  const safeOptions = {
    precision: options.precision ?? 6,
    topMaterialGroupCount: options.topMaterialGroupCount ?? 16,
    topNodeGroupCount: options.topNodeGroupCount ?? 16,
    outlierSizeLimit: options.outlierSizeLimit ?? 10000,
    outlierCoordinateLimit: options.outlierCoordinateLimit ?? 100000,
  };
  const warnings = [];
  const bytes = toUint8Array(input);
  const { gltf, binChunk, chunks } = parseGlb(bytes);
  const worldMatrices = computeWorldMatrices(gltf, warnings);

  const rawAccumulator = createAccumulator();
  const primitiveSummaries = [];
  const materialGroups = new Map();
  const nodeGroups = new Map();

  for (const [nodeIndex, node] of (gltf.nodes ?? []).entries()) {
    const meshIndex = node.mesh;
    if (!Number.isInteger(meshIndex)) continue;
    const mesh = gltf.meshes?.[meshIndex];
    if (!mesh) {
      warnings.push({ code: "missing-mesh", message: `Node ${nodeIndex} references missing mesh ${meshIndex}` });
      continue;
    }
    const nodeMatrix = worldMatrices.get(nodeIndex) ?? identityMatrix();
    for (const [primitiveIndex, primitive] of (mesh.primitives ?? []).entries()) {
      const positionAccessor = primitive.attributes?.POSITION;
      if (!Number.isInteger(positionAccessor)) continue;
      const materialIndex = primitive.material;
      const material = Number.isInteger(materialIndex) ? gltf.materials?.[materialIndex] : null;
      const materialGroup = ensureGroup(materialGroups, groupKey("material", materialIndex), () => ({
        materialIndex: Number.isInteger(materialIndex) ? materialIndex : null,
        name: material?.name ?? (Number.isInteger(materialIndex) ? `material-${materialIndex}` : "unassigned-material"),
        baseColorFactor: materialColor(material),
        primitiveCount: 0,
        accumulator: createAccumulator(),
      }));
      const nodeGroup = ensureGroup(nodeGroups, groupKey("node", nodeIndex), () => ({
        nodeIndex,
        name: node.name ?? `node-${nodeIndex}`,
        meshIndex,
        primitiveCount: 0,
        accumulator: createAccumulator(),
      }));
      const primitiveAccumulator = createAccumulator();
      const vertexCount = visitAccessorVec3(gltf, binChunk, positionAccessor, (point) => {
        const worldPoint = transformPointMatrix(point, nodeMatrix);
        expandAccumulator(rawAccumulator, worldPoint);
        expandAccumulator(primitiveAccumulator, worldPoint);
        expandAccumulator(materialGroup.accumulator, worldPoint);
        expandAccumulator(nodeGroup.accumulator, worldPoint);
      }, warnings);
      if (vertexCount === 0) continue;
      materialGroup.primitiveCount += 1;
      nodeGroup.primitiveCount += 1;
      const bounds = boundsFromAccumulator(primitiveAccumulator);
      primitiveSummaries.push({
        nodeIndex,
        nodeName: node.name ?? `node-${nodeIndex}`,
        meshIndex,
        meshName: mesh.name ?? `mesh-${meshIndex}`,
        primitiveIndex,
        materialIndex: Number.isInteger(materialIndex) ? materialIndex : null,
        materialName: material?.name ?? null,
        vertexCount,
        bounds,
        outlier: isOutlierBounds(bounds, safeOptions),
      });
    }
  }

  const rawBounds = boundsFromAccumulator(rawAccumulator);
  const effectiveBounds = unionBounds(primitiveSummaries.filter((item) => !item.outlier).map((item) => item.bounds));
  if (primitiveSummaries.some((item) => item.outlier)) {
    warnings.push({
      code: "reference-outlier-bounds",
      message: "One or more GLB primitives exceed the outlier limits and were excluded from effectiveBounds.",
    });
  }

  const materialGroupSummaries = [...materialGroups.values()]
    .map((group) => summarizeMaterialGroup(group, safeOptions))
    .sort((a, b) => b.vertexCount - a.vertexCount)
    .slice(0, safeOptions.topMaterialGroupCount);
  const nodeGroupSummaries = [...nodeGroups.values()]
    .map((group) => summarizeNodeGroup(group, safeOptions))
    .sort((a, b) => boundsVolume(b.bounds) - boundsVolume(a.bounds))
    .slice(0, safeOptions.topNodeGroupCount);

  return {
    kind: "glb-reference-analysis",
    source: {
      byteLength: bytes.byteLength,
      assetVersion: gltf.asset?.version ?? null,
      generator: gltf.asset?.generator ?? null,
      chunks,
    },
    counts: {
      scenes: gltf.scenes?.length ?? 0,
      nodes: gltf.nodes?.length ?? 0,
      meshes: gltf.meshes?.length ?? 0,
      materials: gltf.materials?.length ?? 0,
      accessors: gltf.accessors?.length ?? 0,
      skins: gltf.skins?.length ?? 0,
      animations: gltf.animations?.length ?? 0,
      analyzedPrimitives: primitiveSummaries.length,
      analyzedVertices: primitiveSummaries.reduce((sum, item) => sum + item.vertexCount, 0),
    },
    rawBounds: summarizeBounds(rawBounds, safeOptions.precision),
    effectiveBounds: summarizeBounds(effectiveBounds, safeOptions.precision),
    proportionHints: proportionHints(effectiveBounds, safeOptions.precision),
    materialGroups: materialGroupSummaries,
    nodeGroups: nodeGroupSummaries,
    outlierPrimitives: primitiveSummaries
      .filter((item) => item.outlier)
      .map((item) => ({
        nodeIndex: item.nodeIndex,
        nodeName: item.nodeName,
        meshIndex: item.meshIndex,
        materialIndex: item.materialIndex,
        materialName: item.materialName,
        vertexCount: item.vertexCount,
        bounds: summarizeBounds(item.bounds, safeOptions.precision),
      })),
    warnings,
    limitations: [
      "Reference analysis reads geometry facts; it does not import the mesh as AgentSceneBuilder source geometry.",
      "Sparse accessor overrides and external buffers are reported but not fully reconstructed.",
      "Materials are summarized as source colors and grouping evidence, not renderer-specific shading.",
    ],
  };
}
