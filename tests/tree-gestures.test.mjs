import assert from "node:assert/strict";
import { test } from "node:test";
import { pinchGeometry, wheelZoomFactor } from "../src/lib/tree-gestures.ts";

test("wheel zoom normalizes pixel, line, and page deltas", () => {
  assert.equal(wheelZoomFactor(1, 1, 600), wheelZoomFactor(16, 0, 600));
  assert.equal(wheelZoomFactor(1, 2, 300), wheelZoomFactor(300, 0, 300));
  assert.equal(wheelZoomFactor(0, 0, 600), 1);
  assert.ok(wheelZoomFactor(120, 0, 600) < 1);
  assert.ok(wheelZoomFactor(-120, 0, 600) > 1);
});

test("large wheel deltas produce bounded, reversible factors", () => {
  const out = wheelZoomFactor(Number.MAX_VALUE, 1, 600);
  const inward = wheelZoomFactor(-Number.MAX_VALUE, 1, 600);
  assert.ok(Number.isFinite(out) && out > 0 && out < 1);
  assert.ok(Number.isFinite(inward) && inward > 1);
  assert.ok(Math.abs(out * inward - 1) < 1e-12);
});

test("small pinch deltas stay proportional while a wheel notch is limited to one zoom step", () => {
  assert.ok(
    Math.abs(wheelZoomFactor(-100 * Math.log(1.2), 0, 600) - 1.2) < 1e-12,
  );
  assert.equal(wheelZoomFactor(-120, 0, 600), 1.25);
  assert.equal(wheelZoomFactor(120, 0, 600), 0.8);
});

test("pinching uses both axes and the midpoint, including coincident contacts", () => {
  assert.deepEqual(pinchGeometry({ x: 10, y: 20 }, { x: 70, y: 100 }), {
    distance: 100,
    point: { x: 40, y: 60 },
  });
  assert.deepEqual(pinchGeometry({ x: 20, y: 30 }, { x: 20, y: 30 }), {
    distance: 0,
    point: { x: 20, y: 30 },
  });
});
