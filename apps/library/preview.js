import { drawModelPreview, modelMaterialPalette } from "../shared/model-preview.js";

export const libraryPreviewView = { yaw: -.72, pitch: .52, zoom: 100 };

function fitZoom([x, y, z], { yaw, pitch, zoom }, width, height, padding) {
  const cosYaw = Math.abs(Math.cos(yaw));
  const sinYaw = Math.abs(Math.sin(yaw));
  const projectedWidth = x * cosYaw + z * sinYaw;
  const projectedHeight = y * Math.abs(Math.cos(pitch))
    + (x * sinYaw + z * cosYaw) * Math.abs(Math.sin(pitch));
  return Math.min(width / Math.max(.001, projectedWidth), height / Math.max(.001, projectedHeight)) * padding * zoom / 100;
}

export function createLibraryPreview() {
  // Render once into a shared surface, then copy the frame to its card or the detail dialog.
  const surface = document.createElement("canvas");
  let engine, initialization;

  function prepare() {
    initialization ??= import("../../adapters/three/src/renderer.js").then(({ createThreeRenderer }) => {
      engine = createThreeRenderer(surface);
    }).catch(error => console.warn("GPU model preview unavailable; using Canvas", error));
    return initialization;
  }

  function draw(canvas, build, view = libraryPreviewView, { thumbnail = false } = {}) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    if (!build) {
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      delete canvas.dataset.renderer;
      return;
    }

    if (engine && build?.bounds && !engine.renderer.getContext().isContextLost()) {
      try {
        engine.render(build, {
          viewport: { width, height, pixelRatio: thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2) },
          view: { ...view, zoom: fitZoom(build.bounds.size, view, width, height, thumbnail ? .76 : .80) },
          palette: modelMaterialPalette,
          lighting: build.instance?.parameters?.lighting,
          showGrid: false,
          showLightHelpers: false,
        });
        const context = canvas.getContext("2d");
        if (canvas.width !== surface.width) canvas.width = surface.width;
        if (canvas.height !== surface.height) canvas.height = surface.height;
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.drawImage(surface, 0, 0);
        canvas.dataset.renderer = "gpu";
        return;
      } catch (error) {
        console.warn("GPU model preview failed; using Canvas", error);
      }
    }
    canvas.dataset.renderer = "canvas";
    drawModelPreview(canvas, build.nodes.filter(node => node.kind !== "light"), view);
  }

  return { prepare, draw };
}
