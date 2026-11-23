import { assertFiniteNumber } from "./math.js";

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function horizontalSection(length, profile, anchors) {
  return {
    points: [[0,0,0],[length,0,0]], up: [0,1,0], closedProfile: true, profile,
    anchors: {
      start: { position: [0,0,0], direction: [-1,0,0] },
      end: { position: [length,0,0], direction: [1,0,0] },
      ...anchors,
    },
  };
}

function stud(geometry) {
  const length = positive(geometry, "length"), halfDepth = positive(geometry, "webDepth") / 2;
  const halfFlange = positive(geometry, "flangeWidth") / 2;
  const t = positive(geometry, "thickness"), lip = positive(geometry, "lipLength");
  if (t >= Math.min(halfFlange, lip)) invalid("thickness", "The profile must retain an open, folded section");
  if (lip >= halfDepth) invalid("lipLength", "The two lips must leave a service opening");
  const f = halfFlange, d = halfDepth;
  const profile = [[-f,-d],[f,-d],[f,d],[-f,d],[-f,d-lip],[-f+t,d-lip],[-f+t,d-t],[f-t,d-t],
    [f-t,-d+t],[-f+t,-d+t],[-f+t,-d+lip],[-f,-d+lip]];
  return {
    points: [[0,0,0],[0,length,0]], up: [0,0,1], closedProfile: true, profile,
    anchors: {
      foot: { position: [0,0,0], direction: [0,-1,0] },
      head: { position: [0,length,0], direction: [0,1,0] },
      front: { position: [0,length/2,d], direction: [0,0,1] },
      back: { position: [0,length/2,-d], direction: [0,0,-1] },
    },
  };
}

function track(geometry) {
  const length = positive(geometry, "length"), w = positive(geometry, "trackWidth") / 2;
  const h = positive(geometry, "sideHeight"), t = positive(geometry, "thickness");
  if (t >= Math.min(w, h)) invalid("thickness", "The track must retain a seat between open sides");
  return horizontalSection(length, [[-w,0],[w,0],[w,h],[w-t,h],[w-t,t],[-w+t,t],[-w+t,h],[-w,h]], {
    mount: { position: [length/2,0,0], direction: [0,-1,0] },
    "stud-seat": { position: [length/2,t,0], direction: [0,1,0] },
  });
}

function hat(geometry) {
  const length = positive(geometry, "length"), half = positive(geometry, "channelWidth") / 2;
  const crown = positive(geometry, "crownWidth") / 2;
  const rise = positive(geometry, "standoff"), t = positive(geometry, "thickness");
  if (half - crown <= t) invalid("crownWidth", "The channel crown must leave a mounting flange on each side");
  if (t >= Math.min(crown, rise)) invalid("thickness", "The hat profile must retain its open section");
  return horizontalSection(length, [[-half,0],[-crown,0],[-crown,rise-t],[crown,rise-t],[crown,0],[half,0],
    [half,t],[crown+t,t],[crown+t,rise],[-crown-t,rise],[-crown-t,t],[-half,t]], {
    base: { position: [length/2,0,0], direction: [0,-1,0] },
    "board-seat": { position: [length/2,rise,0], direction: [0,1,0] },
  });
}

function gypsum(geometry) {
  const half = positive(geometry, "boardWidth") / 2, h = positive(geometry, "boardHeight");
  const t = positive(geometry, "thickness"), edge = positive(geometry, "taperWidth");
  const relief = positive(geometry, "taperDepth");
  if (edge >= half) invalid("taperWidth", "The taper must leave a flat center field");
  if (relief >= t) invalid("taperDepth", "The recessed edge must retain material");
  return {
    points: [[0,0,0],[0,h,0]], up: [0,0,1], closedProfile: true,
    profile: [[-half,0],[half,0],[half,t-relief],[half-edge,t],[-half+edge,t],[-half,t-relief]],
    anchors: {
      mount: { position: [0,h/2,0], direction: [0,0,-1] },
      left: { position: [-half,0,0], direction: [-1,0,0] },
      right: { position: [half,0,0], direction: [1,0,0] },
      bottom: { position: [0,0,0], direction: [0,-1,0] },
      top: { position: [0,h,0], direction: [0,1,0] },
    },
  };
}

const types = new Map([
  ["lipped-drywall-stud", stud], ["u-drywall-track", track], ["hat-furring-channel", hat], ["tapered-gypsum-sheet", gypsum],
]);

export function drywallSweep(geometry) {
  return types.get(geometry?.type)?.(geometry);
}
