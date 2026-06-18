import test from "node:test";
import assert from "node:assert/strict";
import { cameraCenterFromW2c, applyTrajectoryTransform, alignOverlayFrames, applyAxisRemap, fovFromIntrinsics, cameraAxesFromW2c, cameraYawPitchFromW2c, describeDirection, forwardFromYawPitch, generatePathFrames, normalizePathDistance, pathLengthMeters, toDisplayVec3, yawPitchFromForward } from "../src/features/trajectory/math.mjs";

test("cameraCenterFromW2c returns -R^T t", () => {
  const w2c = [
    [1, 0, 0, -2],
    [0, 1, 0, 3],
    [0, 0, 1, -4],
    [0, 0, 0, 1],
  ];

  assert.deepEqual(cameraCenterFromW2c(w2c), [2, -3, 4]);
});

test("applyTrajectoryTransform scales and translates camera centers while preserving valid 4x4 rows", () => {
  const frames = [
    {
      w2c: [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      intrinsics: [
        [800, 0, 640],
        [0, 800, 360],
        [0, 0, 1],
      ],
    },
    {
      w2c: [
        [1, 0, 0, -1],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1],
      ],
      intrinsics: [
        [800, 0, 640],
        [0, 800, 360],
        [0, 0, 1],
      ],
    },
  ];

  const transformed = applyTrajectoryTransform(frames, {
    scale: 2,
    translate: [0, 1, -1],
    rotateEulerDeg: [0, 0, 0],
  });

  assert.deepEqual(cameraCenterFromW2c(transformed[0].w2c), [0, 1, -1]);
  assert.deepEqual(cameraCenterFromW2c(transformed[1].w2c), [2, 1, -1]);
  assert.deepEqual(transformed[1].w2c[3], [0, 0, 0, 1]);
  assert.deepEqual(transformed[1].intrinsics, frames[1].intrinsics);
});

test("alignOverlayFrames raw keeps overlay coordinates unchanged", () => {
  const overlay = [{ index: 0, center: [1, 2, 3], forward: [1, 0, 0], w2c: identityW2c() }];
  const trajectory = [{ index: 0, center: [0, 0, 0], w2c: identityW2c() }];

  assert.deepEqual(alignOverlayFrames(overlay, trajectory, "raw")[0].center, [1, 2, 3]);
});

test("alignOverlayFrames align-start matches first trajectory center and forward", () => {
  const overlay = [
    { index: 0, center: [5, 0, 0], forward: [1, 0, 0], w2c: identityW2c() },
    { index: 1, center: [6, 0, 0], forward: [1, 0, 0], w2c: identityW2c() },
  ];
  const trajectory = [{ index: 0, center: [0, 0, 0], w2c: identityW2c() }];

  const aligned = alignOverlayFrames(overlay, trajectory, "align-start");

  assert.deepEqual(aligned[0].center, [0, 0, 0]);
  assert.deepEqual(aligned[0].forward, [0, 0, 1]);
  assert.deepEqual(aligned[1].center, [0, 0, 1]);
});

test("alignOverlayFrames fit scales overlay path length to trajectory path length", () => {
  const overlay = [
    { index: 0, center: [0, 0, 0], forward: [0, 0, 1], w2c: identityW2c() },
    { index: 1, center: [0, 0, 1], forward: [0, 0, 1], w2c: identityW2c() },
  ];
  const trajectory = [
    { index: 0, center: [0, 0, 0], w2c: identityW2c() },
    { index: 1, center: [0, 0, 4], w2c: identityW2c() },
  ];

  const fitted = alignOverlayFrames(overlay, trajectory, "fit");

  assert.deepEqual(fitted[1].center, [0, 0, 4]);
});

test("alignOverlayFrames normalize scales overlay path radius to trajectory path radius", () => {
  const overlay = [
    { index: 0, center: [0, 0, 0], forward: [0, 0, 1], w2c: identityW2c() },
    { index: 1, center: [0, 0, 2], forward: [0, 0, 1], w2c: identityW2c() },
  ];
  const trajectory = [
    { index: 0, center: [0, 0, 0], w2c: identityW2c() },
    { index: 1, center: [0, 0, 10], w2c: identityW2c() },
  ];

  const normalized = alignOverlayFrames(overlay, trajectory, "normalize");

  assert.deepEqual(normalized[1].center, [0, 0, 10]);
});

test("applyAxisRemap flips requested global axes for center and forward", () => {
  const remapped = applyAxisRemap([{ index: 0, center: [1, 2, 3], forward: [0.2, 0.3, 0.4], w2c: identityW2c() }], "flip-xy");

  assert.deepEqual(remapped[0].center, [-1, -2, 3]);
  assert.deepEqual(remapped[0].forward.map((value) => Number(value.toFixed(6))), [-0.371391, -0.557086, 0.742781]);
});

test("applyAxisRemap supports independent combined axis toggles", () => {
  const remapped = applyAxisRemap([{ index: 0, center: [1, 2, 3], forward: [0, 0, 1], w2c: identityW2c() }], {
    x: true,
    y: false,
    z: true,
  });

  assert.deepEqual(remapped[0].center, [-1, 2, -3]);
  assert.deepEqual(remapped[0].forward, [0, 0, -1]);
});

test("fovFromIntrinsics derives horizontal and vertical fov from image size", () => {
  const fov = fovFromIntrinsics(
    [
      [804.4567, 0, 640],
      [0, 804.371, 360],
      [0, 0, 1],
    ],
    1280,
    720,
  );

  assert.equal(Math.round(fov.horizontalDeg), 77);
  assert.equal(Math.round(fov.verticalDeg), 48);
});

test("cameraAxesFromW2c returns forward using selected camera z convention", () => {
  const plus = cameraAxesFromW2c(identityW2c(), "plus-z");
  const minus = cameraAxesFromW2c(identityW2c(), "minus-z");

  assert.deepEqual(plus.right, [1, 0, 0]);
  assert.deepEqual(plus.up, [0, 1, 0]);
  assert.deepEqual(plus.forward, [0, 0, 1]);
  assert.deepEqual(minus.forward, [0, 0, -1]);
});

test("yawPitchFromForward uses negative yaw for left-looking forward vectors", () => {
  const forward = [-0.6699, -0.0764, 0.7385];
  const pose = yawPitchFromForward(forward);
  const reconstructed = forwardFromYawPitch(pose.yawDeg, pose.pitchDeg);

  assert.equal(Math.round(pose.yawDeg), -42);
  assert.equal(Math.round(pose.pitchDeg), -4);
  assert.equal(Math.round(reconstructed[0] * 1000), -670);
  assert.equal(Math.abs(reconstructed[2] - 0.7385) < 0.002, true);
});

test("cameraYawPitchFromW2c returns zero yaw pitch for identity", () => {
  assert.deepEqual(cameraYawPitchFromW2c(identityW2c(), "plus-z"), { yawDeg: 0, pitchDeg: 0 });
});

test("describeDirection summarizes forward vector components and dominant axis", () => {
  const description = describeDirection([-0.024, 0.001, -1]);

  assert.equal(description.horizontal, "center");
  assert.equal(description.vertical, "level");
  assert.equal(description.depth, "backward(-Z)");
  assert.equal(description.dominantAxis, "-Z backward");
  assert.equal(description.summary, "backward(-Z)");
});

test("toDisplayVec3 maps Y-up data into Z-up display coordinates", () => {
  assert.deepEqual(toDisplayVec3([1, 2, 3], "y-up"), [1, 2, 3]);
  assert.deepEqual(toDisplayVec3([1, 2, 3], "z-up"), [1, -3, 2]);
});

test("generatePathFrames creates an 81 sample trajectory for an 80 frame interval", () => {
  const frames = generatePathFrames(defaultPathDraft(), defaultIntrinsics());

  assert.equal(frames.length, 81);
  assert.deepEqual(frames[0].center, [0, 0, 0]);
  assert.deepEqual(frames[80].center, [0, 0, 3]);
  assert.equal(pathLengthMeters(frames[0].center, frames[80].center), 3);
  assert.deepEqual(cameraCenterFromW2c(frames[80].w2c), [0, 0, 3]);
  assert.deepEqual(cameraAxesFromW2c(frames[0].w2c, "plus-z").forward, [0, 0, 1]);
});

test("generatePathFrames keeps +Y as downward movement in meter coordinates", () => {
  const draft = { ...defaultPathDraft(), end: [0, 1.2, 3] };
  const frames = generatePathFrames(draft, defaultIntrinsics());

  assert.deepEqual(frames[80].center, [0, 1.2, 3]);
});

test("generatePathFrames supports manual yaw pitch POV", () => {
  const draft = { ...defaultPathDraft(), povMode: "manual", yawDeg: 90, pitchDeg: 0 };
  const frames = generatePathFrames(draft, defaultIntrinsics());
  const axes = cameraAxesFromW2c(frames[0].w2c, "plus-z");

  assert.equal(Math.round(axes.forward[0]), 1);
  assert.equal(Math.round(axes.forward[2]), 0);
});

test("normalizePathDistance scales endpoint to the requested meter length", () => {
  const draft = { ...defaultPathDraft(), end: [0, 0, 6] };
  const normalized = normalizePathDistance(draft, 3);

  assert.deepEqual(normalized.end, [0, 0, 3]);
  assert.equal(normalized.expectedMeters, 3);
});

function identityW2c() {
  return [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
  ];
}

function defaultIntrinsics() {
  return [
    [800, 0, 640],
    [0, 800, 360],
    [0, 0, 1],
  ];
}

function defaultPathDraft() {
  return {
    fps: 16,
    durationSec: 5,
    frameCount: 80,
    start: [0, 0, 0],
    end: [0, 0, 3],
    projection: "xz",
    yawDeg: 0,
    pitchDeg: 0,
    povMode: "follow-path",
    easing: "linear",
    expectedMeters: 3,
    observedMeters: 3,
  };
}
