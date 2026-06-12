export const SELECTED = 1 << 0;
export const DELETED = 1 << 1;

export class SplatEditState {
  #flags;
  #selectedCount = 0;
  #deletedCount = 0;

  constructor(splatCount) {
    if (!Number.isInteger(splatCount) || splatCount < 0) {
      throw new Error(`Invalid splat count: ${splatCount}`);
    }
    this.splatCount = splatCount;
    this.#flags = new Uint8Array(splatCount);
  }

  get selectedCount() {
    return this.#selectedCount;
  }

  get deletedCount() {
    return this.#deletedCount;
  }

  selectOnly(indices) {
    this.clearSelection();
    this.addSelection(indices);
  }

  addSelection(indices) {
    for (const index of uniqueValidIndices(indices, this.splatCount)) {
      if ((this.#flags[index] & SELECTED) === 0) {
        this.#flags[index] |= SELECTED;
        this.#selectedCount += 1;
      }
    }
  }

  removeSelection(indices) {
    for (const index of uniqueValidIndices(indices, this.splatCount)) {
      if ((this.#flags[index] & SELECTED) !== 0) {
        this.#flags[index] &= ~SELECTED;
        this.#selectedCount -= 1;
      }
    }
  }

  clearSelection() {
    if (this.#selectedCount === 0) return;
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & SELECTED) !== 0) {
        this.#flags[index] &= ~SELECTED;
      }
    }
    this.#selectedCount = 0;
  }

  markDeletedSelection() {
    if (this.#selectedCount === 0) return;
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & SELECTED) === 0) continue;
      this.#flags[index] &= ~SELECTED;
      if ((this.#flags[index] & DELETED) === 0) {
        this.#flags[index] |= DELETED;
        this.#deletedCount += 1;
      }
    }
    this.#selectedCount = 0;
  }

  restoreDeleted(indices) {
    for (const index of uniqueValidIndices(indices, this.splatCount)) {
      if ((this.#flags[index] & DELETED) !== 0) {
        this.#flags[index] &= ~DELETED;
        this.#deletedCount -= 1;
      }
    }
  }

  isSelected(index) {
    return this.#isFlagged(index, SELECTED);
  }

  isDeleted(index) {
    return this.#isFlagged(index, DELETED);
  }

  selectedIndices() {
    return this.#indicesForFlag(SELECTED);
  }

  deletedIndices() {
    return this.#indicesForFlag(DELETED);
  }

  deletedIndexSet() {
    return new Set(this.deletedIndices());
  }

  #isFlagged(index, flag) {
    return Number.isInteger(index) && index >= 0 && index < this.splatCount && (this.#flags[index] & flag) !== 0;
  }

  #indicesForFlag(flag) {
    const indices = [];
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & flag) !== 0) indices.push(index);
    }
    return indices;
  }
}

function uniqueValidIndices(indices, max) {
  const valid = [];
  const seen = new Set();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= max || seen.has(index)) continue;
    seen.add(index);
    valid.push(index);
  }
  return valid;
}
