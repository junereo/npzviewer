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

test("SplatEditState hides selection without deleting it", () => {
  const state = new SplatEditState(5);

  state.selectOnly([1, 3]);
  state.hideSelection();

  assert.equal(state.selectedCount, 0);
  assert.equal(state.hiddenCount, 2);
  assert.equal(state.deletedCount, 0);
  assert.deepEqual(state.hiddenIndices(), [1, 3]);
});

test("SplatEditState locked splats are protected from selection and delete", () => {
  const state = new SplatEditState(5);

  state.selectOnly([2]);
  state.lockSelection();
  state.selectOnly([2, 3]);
  state.markDeletedSelection();

  assert.equal(state.lockedCount, 1);
  assert.deepEqual(state.lockedIndices(), [2]);
  assert.deepEqual(state.deletedIndices(), [3]);
});

test("SplatEditState restoreAll clears deleted and hidden but keeps locks explicit until unlockAll", () => {
  const state = new SplatEditState(6);

  state.selectOnly([1, 2]);
  state.hideSelection();
  state.selectOnly([3]);
  state.markDeletedSelection();
  state.selectOnly([4]);
  state.lockSelection();
  state.restoreAll();

  assert.equal(state.hiddenCount, 0);
  assert.equal(state.deletedCount, 0);
  assert.equal(state.lockedCount, 1);

  state.unlockAll();
  assert.equal(state.lockedCount, 0);
});
