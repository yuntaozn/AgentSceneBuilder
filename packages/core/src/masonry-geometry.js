import { assertFiniteNumber } from "./math.js";

function positive(geometry, field) {
  return assertFiniteNumber(geometry[field], field, { min: 0, exclusiveMin: true });
}

function invalid(field, message) {
  throw Object.assign(new RangeError(message), { field });
}

function count(geometry, field, max) {
  const value = geometry[field];
  if (!Number.isInteger(value) || value < 1 || value > max) {
    invalid(field, `${field} must be an integer between 1 and ${max}`);
  }
  return value;
}

function masonryBlock(geometry, section) {
  const length = positive(geometry, "length"), width = positive(geometry, "width"), height = positive(geometry, "height");
  const half = width / 2;
  const sectionProfile = [[0,-half],[-length,-half],[-length,half],[0,half]];
  const { profile = sectionProfile, holes } = section(geometry, length, width);
  return {
    points: [[0,0,0],[0,height,0]], up: [0,0,1], closedProfile: true, profile, ...(holes ? { holes } : {}),
    anchors: {
      start: { position: [0,0,0], direction: [-1,0,0] },
      end: { position: [length,0,0], direction: [1,0,0] },
      bottom: { position: [length/2,0,0], direction: [0,-1,0] },
      top: { position: [length/2,height,0], direction: [0,1,0] },
      "outer-face": { position: [length/2,height/2,half], direction: [0,0,1] },
    },
  };
}

function hollowCores(geometry, length, width) {
  const web = positive(geometry, "webThickness"), number = count(geometry, "coreCount", 6);
  const cell = (length - (number + 1) * web) / number, half = width / 2 - web;
  if (cell <= 0 || half <= 0) invalid("webThickness", "The webs must leave room for each hollow cell");
  return { holes: Array.from({ length: number }, (_, i) => {
    const right = -web - i * (cell + web), left = right - cell;
    return [[left,-half],[right,-half],[right,half],[left,half]];
  }) };
}

function brickHoles(geometry, length, width) {
  const radius = positive(geometry, "holeDiameter") / 2;
  const columns = count(geometry, "columnCount", 8), rows = count(geometry, "rowCount", 5);
  const dx = length / (columns + 1), dz = width / (rows + 1);
  if (2 * radius >= Math.min(dx, dz)) invalid("holeDiameter", "Perforations must stay separate inside the brick");
  const holes = [];
  for (let i = 1; i <= columns; i += 1) {
    for (let j = 1; j <= rows; j += 1) {
      holes.push(Array.from({ length: 16 }, (_, k) => {
        const theta = k * Math.PI / 8;
        return [-i * dx + radius * Math.cos(theta), j * dz - width / 2 + radius * Math.sin(theta)];
      }));
    }
  }
  return { holes };
}

function tongueAndGroove(geometry, length, width) {
  const key = positive(geometry, "keyWidth") / 2, depth = positive(geometry, "keyDepth");
  const clearance = assertFiniteNumber(geometry.clearance, "clearance", { min: 0 });
  const half = width / 2, groove = key + clearance, recess = depth + clearance;
  if (groove >= half) invalid("keyWidth", "The groove must leave a wall on both sides");
  if (recess >= length / 2) invalid("keyDepth", "The groove must fit inside the block end");
  return { profile: [[0,-half],[-length,-half],[-length,-key],[-length-depth,-key],[-length-depth,key],
    [-length,key],[-length,half],[0,half],[0,groove],[-recess,groove],[-recess,-groove],[0,-groove]] };
}

const types = new Map([
  ["hollow-masonry-block", hollowCores], ["perforated-clay-brick", brickHoles], ["tongue-groove-masonry-block", tongueAndGroove],
]);

export function masonrySweep(geometry) {
  const section = types.get(geometry?.type);
  if (section) return masonryBlock(geometry, section);
}
