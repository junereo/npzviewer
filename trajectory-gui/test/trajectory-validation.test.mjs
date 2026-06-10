import test from "node:test";
import assert from "node:assert/strict";
import { validateTrajectory } from "../src/features/trajectory/validation.mjs";

test("validateTrajectory accepts a Lyra-compatible trajectory", () => {
  const result = validateTrajectory({
    meta: { frameCount: 1, imageWidth: 1280, imageHeight: 720 },
    frames: [
      {
        w2c: [
          [1, 0, 0, 0],
          [0, 1, 0, 0],
          [0, 0, 1, 0],
          [0, 0, 0, 1],
        ],
        intrinsics: [
          [804, 0, 640],
          [0, 804, 360],
          [0, 0, 1],
        ],
      },
    ],
  });

  assert.equal(result.errors.length, 0);
});

test("validateTrajectory reports invalid shape, focal length, and Lyra frame-count warning", () => {
  const result = validateTrajectory({
    meta: { frameCount: 2, imageWidth: 1280, imageHeight: 720 },
    frames: [
      {
        w2c: [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
        intrinsics: [
          [-1, 0, 640],
          [0, 0, 360],
          [0, 0, 1],
        ],
      },
    ],
  });

  assert.equal(result.errors.some((issue) => issue.code === "W2C_SHAPE"), true);
  assert.equal(result.errors.some((issue) => issue.code === "FOCAL_LENGTH"), true);
  assert.equal(result.warnings.some((issue) => issue.code === "FRAME_COUNT_PATTERN"), true);
});

