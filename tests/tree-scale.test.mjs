import assert from "node:assert/strict";
import { test } from "node:test";
import { clampTreeScale, fitTreeScale } from "../src/lib/tree-scale.ts";

test("fit accounts for both dimensions and never enlarges a smaller tree", () => {
  assert.equal(fitTreeScale(1000, 100, 500, 400), 0.5);
  assert.equal(fitTreeScale(100, 1000, 500, 400), 0.4);
  assert.equal(fitTreeScale(100, 100, 500, 400), 1);
  assert.ok(fitTreeScale(18546, 1000, 320, 500) < 0.02);
});

test("zoom bounds and invalid measurements are handled explicitly", () => {
  assert.equal(clampTreeScale(4), 2);
  assert.equal(clampTreeScale(0.001), 0.005);
  assert.throws(() => clampTreeScale(NaN), RangeError);
  assert.throws(() => fitTreeScale(0, 100, 500, 400), RangeError);
});
