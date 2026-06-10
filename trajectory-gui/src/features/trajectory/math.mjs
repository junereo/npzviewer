export function cameraCenterFromW2c(w2c) {
  const rotation = [
    [w2c[0][0], w2c[0][1], w2c[0][2]],
    [w2c[1][0], w2c[1][1], w2c[1][2]],
    [w2c[2][0], w2c[2][1], w2c[2][2]],
  ];
  const t = [w2c[0][3], w2c[1][3], w2c[2][3]];
  return [
    -(rotation[0][0] * t[0] + rotation[1][0] * t[1] + rotation[2][0] * t[2]),
    -(rotation[0][1] * t[0] + rotation[1][1] * t[1] + rotation[2][1] * t[2]),
    -(rotation[0][2] * t[0] + rotation[1][2] * t[1] + rotation[2][2] * t[2]),
  ].map(cleanNumber);
}

export function applyTrajectoryTransform(frames, transform) {
  const scale = Number.isFinite(transform.scale) ? transform.scale : 1;
  const translate = transform.translate ?? [0, 0, 0];
  const rotation = eulerDegToMatrix(transform.rotateEulerDeg ?? [0, 0, 0]);

  return frames.map((frame) => {
    const center = cameraCenterFromW2c(frame.w2c);
    const transformedCenter = addVec3(mulMat3Vec3(rotation, scaleVec3(center, scale)), translate);
    const nextW2c = cloneMatrix(frame.w2c);
    const R = [
      [nextW2c[0][0], nextW2c[0][1], nextW2c[0][2]],
      [nextW2c[1][0], nextW2c[1][1], nextW2c[1][2]],
      [nextW2c[2][0], nextW2c[2][1], nextW2c[2][2]],
    ];
    const nextT = mulMat3Vec3(R, scaleVec3(transformedCenter, -1));
    nextW2c[0][3] = cleanNumber(nextT[0]);
    nextW2c[1][3] = cleanNumber(nextT[1]);
    nextW2c[2][3] = cleanNumber(nextT[2]);
    nextW2c[3] = [0, 0, 0, 1];
    return {
      ...frame,
      w2c: nextW2c,
      intrinsics: cloneMatrix(frame.intrinsics),
    };
  });
}

export function alignOverlayFrames(overlayFrames, trajectoryFrames, mode, axisRemap = "none") {
  const remappedFrames = applyAxisRemap(overlayFrames, axisRemap);
  if (mode === "raw" || !overlayFrames.length || !trajectoryFrames.length) {
    return remappedFrames;
  }
  const aligned = alignStartPose(remappedFrames, trajectoryFrames);
  if (mode !== "fit") {
    if (mode === "normalize") {
      return normalizePathRadius(aligned, trajectoryFrames);
    }
    return aligned;
  }
  return fitPathScale(aligned, trajectoryFrames);
}

export function applyAxisRemap(frames, axisRemap = "none") {
  const signs = axisSigns(axisRemap);
  return frames.map((frame) => ({
    ...frame,
    center: multiplyVec3(frame.center, signs).map(cleanNumber),
    forward: normalizeVec3(multiplyVec3(frame.forward, signs)).map(cleanNumber),
  }));
}

function axisSigns(axisRemap) {
  if (typeof axisRemap === "object" && axisRemap !== null) {
    return [axisRemap.x ? -1 : 1, axisRemap.y ? -1 : 1, axisRemap.z ? -1 : 1];
  }
  switch (axisRemap) {
    case "flip-x":
      return [-1, 1, 1];
    case "flip-y":
      return [1, -1, 1];
    case "flip-xy":
      return [-1, -1, 1];
    case "flip-z":
      return [1, 1, -1];
    default:
      return [1, 1, 1];
  }
}

function multiplyVec3(left, right) {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2]];
}

function alignStartPose(overlayFrames, trajectoryFrames) {
  const sourceFirst = overlayFrames[0];
  const targetFirst = trajectoryFrames[0];
  const sourceForward = normalizeVec3(sourceFirst.forward);
  const targetForward = normalizeVec3(extractForwardFromW2c(targetFirst.w2c));
  const rotation = rotationBetweenVectors(sourceForward, targetForward);
  const sourceOrigin = sourceFirst.center;
  const targetOrigin = targetFirst.center;

  return overlayFrames.map((frame) => {
    const relativeCenter = subVec3(frame.center, sourceOrigin);
    const nextCenter = addVec3(mulMat3Vec3(rotation, relativeCenter), targetOrigin);
    const nextForward = normalizeVec3(mulMat3Vec3(rotation, frame.forward));
    return {
      ...frame,
      center: nextCenter.map(cleanNumber),
      forward: nextForward.map(cleanNumber),
    };
  });
}

function fitPathScale(frames, trajectoryFrames) {
  const overlayLength = pathLength(frames.map((frame) => frame.center));
  const trajectoryLength = pathLength(trajectoryFrames.map((frame) => frame.center));
  if (overlayLength <= 1e-8 || trajectoryLength <= 1e-8) {
    return frames;
  }
  const scale = trajectoryLength / overlayLength;
  const origin = trajectoryFrames[0].center;
  return frames.map((frame) => ({
    ...frame,
    center: addVec3(scaleVec3(subVec3(frame.center, origin), scale), origin).map(cleanNumber),
  }));
}

function normalizePathRadius(frames, trajectoryFrames) {
  const overlayRadius = pathRadius(frames.map((frame) => frame.center), frames[0].center);
  const trajectoryRadius = pathRadius(trajectoryFrames.map((frame) => frame.center), trajectoryFrames[0].center);
  if (overlayRadius <= 1e-8 || trajectoryRadius <= 1e-8) {
    return frames;
  }
  const scale = trajectoryRadius / overlayRadius;
  const origin = trajectoryFrames[0].center;
  return frames.map((frame) => ({
    ...frame,
    center: addVec3(scaleVec3(subVec3(frame.center, origin), scale), origin).map(cleanNumber),
  }));
}

function pathRadius(points, origin) {
  return points.reduce((max, point) => Math.max(max, Math.hypot(point[0] - origin[0], point[1] - origin[1], point[2] - origin[2])), 0);
}

export function fovFromIntrinsics(intrinsics, width, height) {
  const fx = intrinsics?.[0]?.[0];
  const fy = intrinsics?.[1]?.[1];
  if (!(fx > 0) || !(fy > 0) || !(width > 0) || !(height > 0)) {
    return { horizontalDeg: null, verticalDeg: null };
  }
  return {
    horizontalDeg: cleanNumber((2 * Math.atan(width / (2 * fx)) * 180) / Math.PI),
    verticalDeg: cleanNumber((2 * Math.atan(height / (2 * fy)) * 180) / Math.PI),
  };
}

export function cameraAxesFromW2c(w2c, forwardConvention = "plus-z") {
  const rotation = [
    [w2c[0][0], w2c[0][1], w2c[0][2]],
    [w2c[1][0], w2c[1][1], w2c[1][2]],
    [w2c[2][0], w2c[2][1], w2c[2][2]],
  ];
  const sign = forwardConvention === "minus-z" ? -1 : 1;
  return {
    right: normalizeVec3([rotation[0][0], rotation[1][0], rotation[2][0]]).map(cleanNumber),
    up: normalizeVec3([rotation[0][1], rotation[1][1], rotation[2][1]]).map(cleanNumber),
    forward: normalizeVec3([sign * rotation[0][2], sign * rotation[1][2], sign * rotation[2][2]]).map(cleanNumber),
  };
}

export function cameraYawPitchFromW2c(w2c, forwardConvention = "plus-z") {
  const { forward } = cameraAxesFromW2c(w2c, forwardConvention);
  return yawPitchFromForward(forward);
}

export function yawPitchFromForward(forward) {
  const normalized = normalizeVec3(forward);
  return {
    yawDeg: cleanNumber((Math.atan2(normalized[0], normalized[2]) * 180) / Math.PI),
    pitchDeg: cleanNumber((Math.asin(clamp(normalized[1], -1, 1)) * 180) / Math.PI),
  };
}

export function forwardFromYawPitch(yawDeg, pitchDeg) {
  const yaw = degToRad(yawDeg);
  const pitch = degToRad(pitchDeg);
  const cp = Math.cos(pitch);
  return normalizeVec3([Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp]).map(cleanNumber);
}

export function describeDirection(vector) {
  const [x, y, z] = vector;
  const horizontal = Math.abs(x) < 0.15 ? "center" : x > 0 ? "right" : "left";
  const vertical = Math.abs(y) < 0.15 ? "level" : y > 0 ? "up" : "down";
  const depth = Math.abs(z) < 0.15 ? "flat" : z > 0 ? "forward(+Z)" : "backward(-Z)";
  const dominantAxis = dominantDirection(vector);
  return {
    horizontal,
    vertical,
    depth,
    dominantAxis,
    summary: [horizontal, vertical, depth].filter((part) => !["center", "level", "flat"].includes(part)).join(" / ") || "centered",
  };
}

export function toDisplayVec3(vector, displayAxisMode = "y-up") {
  if (displayAxisMode === "y-up") {
    return [vector[0], vector[1], vector[2]];
  }
  return [vector[0], -vector[2], vector[1]];
}

function dominantDirection(vector) {
  const labels = [
    vector[0] >= 0 ? "+X right" : "-X left",
    vector[1] >= 0 ? "+Y up" : "-Y down",
    vector[2] >= 0 ? "+Z forward" : "-Z backward",
  ];
  const values = vector.map(Math.abs);
  const maxIndex = values.indexOf(Math.max(...values));
  return labels[maxIndex];
}

export function cloneMatrix(matrix) {
  return matrix.map((row) => row.slice());
}

function eulerDegToMatrix([yawDeg, pitchDeg, rollDeg]) {
  const yaw = degToRad(yawDeg);
  const pitch = degToRad(pitchDeg);
  const roll = degToRad(rollDeg);
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);

  return [
    [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp],
    [cp * sr, cp * cr, -sp],
    [-sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp],
  ];
}

function degToRad(value) {
  return (value * Math.PI) / 180;
}

function mulMat3Vec3(matrix, vector) {
  return [
    matrix[0][0] * vector[0] + matrix[0][1] * vector[1] + matrix[0][2] * vector[2],
    matrix[1][0] * vector[0] + matrix[1][1] * vector[1] + matrix[1][2] * vector[2],
    matrix[2][0] * vector[0] + matrix[2][1] * vector[1] + matrix[2][2] * vector[2],
  ];
}

function extractForwardFromW2c(w2c) {
  const rotation = [
    [w2c[0][0], w2c[0][1], w2c[0][2]],
    [w2c[1][0], w2c[1][1], w2c[1][2]],
    [w2c[2][0], w2c[2][1], w2c[2][2]],
  ];
  return normalizeVec3([
    rotation[0][2],
    rotation[1][2],
    rotation[2][2],
  ]);
}

function rotationBetweenVectors(source, target) {
  const v = crossVec3(source, target);
  const c = clamp(dotVec3(source, target), -1, 1);
  if (c > 1 - 1e-8) {
    return [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
  }
  if (c < -1 + 1e-8) {
    return [
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, -1],
    ];
  }
  const k = 1 / (1 + c);
  return [
    [v[0] * v[0] * k + c, v[0] * v[1] * k - v[2], v[0] * v[2] * k + v[1]],
    [v[1] * v[0] * k + v[2], v[1] * v[1] * k + c, v[1] * v[2] * k - v[0]],
    [v[2] * v[0] * k - v[1], v[2] * v[1] * k + v[0], v[2] * v[2] * k + c],
  ];
}

function scaleVec3(vector, scale) {
  return [vector[0] * scale, vector[1] * scale, vector[2] * scale];
}

function addVec3(left, right) {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subVec3(left, right) {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function dotVec3(left, right) {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function crossVec3(left, right) {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

function normalizeVec3(vector) {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-8) return [0, 0, 1];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function pathLength(points) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1], points[index][2] - points[index - 1][2]);
  }
  return total;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function cleanNumber(value) {
  return Object.is(value, -0) ? 0 : Number(value.toFixed(12));
}
