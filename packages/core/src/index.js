export * from "./math.js";
export * from "./geometry.js";
export * from "./component.js";
export * from "./scene.js";
export * from "./spatial.js";
export * from "./path.js";
export * from "./mep.js";
export * from "./method-contract.js";
export * from "./composition.js";
export * from "./human-pose.js";
export * from "./human-geometry.js";
export * from "./glb-reference.js";
export { independentFoundation } from "./components/independent-foundation.js";
export { pipeRun } from "./components/pipe-run.js";
export { compositionComponent } from "./components/composition.js";

import { ComponentRegistry } from "./component.js";
import { independentFoundation } from "./components/independent-foundation.js";
import { pipeRun } from "./components/pipe-run.js";
import { compositionComponent } from "./components/composition.js";

export function createDefaultRegistry() {
  return new ComponentRegistry()
    .register(compositionComponent)
    .register(independentFoundation)
    .register(pipeRun);
}
