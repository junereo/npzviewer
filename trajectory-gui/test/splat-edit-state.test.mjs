import test from "node:test";
import assert from "node:assert/strict";
import { SplatEditState } from "../src/features/splat-editor/playcanvas/SplatEditState.mjs";

test("SplatEditState starts with empty counts", () => {
  const state = new SplatEditState(5);

  assert.equal(state.splatCount, 5);
  assert.equal(state.selectedCount, 0);
  assert.equal(state.deletedCount, 0);
  assert.deepEqual(state.selectedIndices(), []);
  assert.deepEqual(state.deletedIndices(), []);
});

test("SplatEditState replaces, adds, and removes selection", () => {
  const state = new SplatEditState(6);

  state.selectOnly([1, 2]);
  assert.equal(state.selectedCount, 2);
  assert.deepEqual(state.selectedIndices(), [1, 2]);

  state.addSelection([3]);
  assert.equal(state.selectedCount, 3);
  assert.deepEqual(state.selectedIndices(), [1, 2, 3]);

  state.removeSelection([2]);
  assert.equal(state.selectedCount, 2);
  assert.deepEqual(state.selectedIndices(), [1, 3]);
});

test("SplatEditState delete marks selection non-destructively and restore clears the mark", () => {
  const state = new SplatEditState(6);

  state.selectOnly([1, 2, 4]);
  state.markDeletedSelection();

  assert.equal(state.selectedCount, 0);
  assert.equal(state.deletedCount, 3);
  assert.deepEqual(state.deletedIndices(), [1, 2, 4]);

  state.restoreDeleted([2]);
  assert.equal(state.deletedCount, 2);
  assert.deepEqual(state.deletedIndices(), [1, 4]);
});

test("SplatEditState ignores out-of-range and duplicate indices", () => {
  const state = new SplatEditState(3);

  state.selectOnly([-1, 1, 1, 5]);
  state.markDeletedSelection();

  assert.equal(state.selectedCount, 0);
  assert.equal(state.deletedCount, 1);
  assert.deepEqual(state.deletedIndices(), [1]);
});
