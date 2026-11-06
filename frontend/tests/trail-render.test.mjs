import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

async function load(file, globals = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const evaluated = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports: evaluated.exports, ...globals });
  return evaluated.exports;
}

test("trail draws every vertex with contrasting lines and breadcrumbs, without joining gaps", async () => {
  const { drawTrail } = await load("../components/maps/trail-layer.ts");
  const layers = [];
  const shape = (kind) => (coordinates, options) => ({
    kind, coordinates, options,
    addTo() { layers.push(this); return this; }, bindTooltip(label) { this.label = label; return this; },
  });
  const segments = [{ coordinates: [[122, 10], [122.000001, 10], [122.000002, 10]], distanceMeters: 0.2 },
    { coordinates: [[123, 11]], distanceMeters: 0 }];
  drawTrail({ polyline: shape("line"), circleMarker: shape("dot") }, {}, {}, segments, (text) => ({ text }));
  const lines = layers.filter((layer) => layer.kind === "line");
  assert.equal(lines.length, 4);
  assert.equal(lines[0].coordinates.length, 3);
  assert.equal(lines[2].coordinates.length, 1);
  assert.equal(lines[0].options.color, "#ffffff");
  assert.equal(lines[1].options.smoothFactor, 0);
  assert.equal(layers.filter((layer) => layer.kind === "dot" && layer.options.radius === 2.5).length, 4);
});

test("marker easing stays between measured points and lands exactly on the endpoint", async () => {
  const frames = new Map(); let id = 0;
  const { animateMarker } = await load("../components/maps/marker-motion.ts", {
    performance: { now: () => 0 }, requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
  });
  const positions = [];
  animateMarker({ setLatLng: (point) => positions.push(point) }, [[10, 122], [10.0001, 122.0001]], 1000);
  for (const time of [0, 100, 250, 500, 750, 1000]) {
    const [key, frame] = frames.entries().next().value; frames.delete(key); frame(time);
  }
  assert.ok(positions.every(([lat, lng]) => lat >= 10 && lat <= 10.0001 && lng >= 122 && lng <= 122.0001));
  assert.equal(positions.at(-1)[0], 10.0001); assert.equal(positions.at(-1)[1], 122.0001);
  assert.equal(frames.size, 0);
});

test("live readings extend existing lines, and historical replacement requests a full redraw", async () => {
  const { drawTrail, extendTrail } = await load("../components/maps/trail-layer.ts");
  const lines = [], dots = [];
  const L = {
    polyline: (coordinates) => {
      const line = { coordinates: [...coordinates], addTo() { lines.push(this); return this; },
        bindTooltip() { return this; }, addLatLng(point) { this.coordinates.push(point); } };
      return line;
    },
    circleMarker: () => ({ addTo() { dots.push(this); return this; }, bindTooltip() { return this; } }),
  };
  const first = [122, 10], second = [122.00001, 10];
  const drawings = drawTrail(L, {}, {}, [{ coordinates: [first], distanceMeters: 0 }], () => ({}));
  const next = [{ coordinates: [first, second], distanceMeters: 1 }];
  assert.ok(extendTrail(L, {}, {}, drawings, next, () => ({})));
  assert.equal(lines.length, 2); assert.equal(lines[0].coordinates.length, 2); assert.equal(dots.length, 3);
  const replaced = [{ coordinates: [[122, 10], [122.00001, 10]], distanceMeters: 1 }];
  assert.equal(extendTrail(L, {}, {}, drawings, replaced, () => ({})), null);
});
