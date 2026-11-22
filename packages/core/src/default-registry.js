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
