export const SELECTED = 1 << 0;
export const DELETED = 1 << 1;
export const HIDDEN = 1 << 2;
export const LOCKED = 1 << 3;

export class SplatEditState {
  #flags;
  #selectedCount = 0;
  #deletedCount = 0;
  #hiddenCount = 0;
  #lockedCount = 0;

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

  get hiddenCount() {
    return this.#hiddenCount;
  }

  get lockedCount() {
    return this.#lockedCount;
  }

  selectOnly(indices) {
    this.clearSelection();
    this.addSelection(indices);
  }

  addSelection(indices) {
    for (const index of uniqueValidIndices(indices, this.splatCount)) {
      if (this.#isUnavailableForSelection(index)) continue;
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
      if ((this.#flags[index] & LOCKED) !== 0) continue;
      if ((this.#flags[index] & DELETED) === 0) {
        this.#flags[index] |= DELETED;
        this.#deletedCount += 1;
      }
    }
    this.#selectedCount = 0;
  }

  hideSelection() {
    if (this.#selectedCount === 0) return;
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & SELECTED) === 0) continue;
      this.#flags[index] &= ~SELECTED;
      if ((this.#flags[index] & LOCKED) !== 0) continue;
      if ((this.#flags[index] & HIDDEN) === 0) {
        this.#flags[index] |= HIDDEN;
        this.#hiddenCount += 1;
      }
    }
    this.#selectedCount = 0;
  }

  lockSelection() {
    if (this.#selectedCount === 0) return;
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & SELECTED) === 0) continue;
      this.#flags[index] &= ~SELECTED;
      if ((this.#flags[index] & LOCKED) === 0) {
        this.#flags[index] |= LOCKED;
        this.#lockedCount += 1;
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

  restoreAll() {
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & DELETED) !== 0) {
        this.#flags[index] &= ~DELETED;
      }
      if ((this.#flags[index] & HIDDEN) !== 0) {
        this.#flags[index] &= ~HIDDEN;
      }
    }
    this.#deletedCount = 0;
    this.#hiddenCount = 0;
    this.clearSelection();
  }

  unlockAll() {
    for (let index = 0; index < this.#flags.length; index += 1) {
      if ((this.#flags[index] & LOCKED) !== 0) {
        this.#flags[index] &= ~LOCKED;
      }
    }
    this.#lockedCount = 0;
  }

  isSelected(index) {
    return this.#isFlagged(index, SELECTED);
  }

  isDeleted(index) {
    return this.#isFlagged(index, DELETED);
  }

  isHidden(index) {
    return this.#isFlagged(index, HIDDEN);
  }

  isLocked(index) {
    return this.#isFlagged(index, LOCKED);
  }

  isSelectable(index) {
    return Number.isInteger(index) && index >= 0 && index < this.splatCount && !this.#isUnavailableForSelection(index);
  }

  selectedIndices() {
    return this.#indicesForFlag(SELECTED);
  }

  deletedIndices() {
    return this.#indicesForFlag(DELETED);
  }

  hiddenIndices() {
    return this.#indicesForFlag(HIDDEN);
  }

  lockedIndices() {
    return this.#indicesForFlag(LOCKED);
  }

  deletedIndexSet() {
    return new Set(this.deletedIndices());
  }

  #isFlagged(index, flag) {
    return Number.isInteger(index) && index >= 0 && index < this.splatCount && (this.#flags[index] & flag) !== 0;
  }

  #isUnavailableForSelection(index) {
    return (this.#flags[index] & (DELETED | HIDDEN | LOCKED)) !== 0;
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
