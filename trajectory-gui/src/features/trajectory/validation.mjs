export function validateTrajectory(document) {
  const errors = [];
  const warnings = [];
  const frames = Array.isArray(document?.frames) ? document.frames : [];
  const meta = document?.meta ?? {};

  if (!Number.isInteger(meta.frameCount) || meta.frameCount <= 0) {
    errors.push(issue("FRAME_COUNT", "Frame count must be a positive integer."));
  } else if ((meta.frameCount - 1) % 80 !== 0) {
    warnings.push(issue("FRAME_COUNT_PATTERN", "Lyra custom trajectories usually work best with 1 + 80k frames."));
  }

  if (!Number.isInteger(meta.imageWidth) || meta.imageWidth <= 0) {
    errors.push(issue("IMAGE_WIDTH", "Image width must be a positive integer."));
  }
  if (!Number.isInteger(meta.imageHeight) || meta.imageHeight <= 0) {
    errors.push(issue("IMAGE_HEIGHT", "Image height must be a positive integer."));
  }
  if (frames.length !== meta.frameCount) {
    errors.push(issue("FRAME_ARRAY_LENGTH", "Frame array length must match frameCount."));
  }

  frames.forEach((frame, index) => {
    if (!isMatrix(frame.w2c, 4, 4)) {
      errors.push(issue("W2C_SHAPE", `Frame ${index} w2c must be 4x4.`, index));
    } else {
      if (!allFinite(frame.w2c)) {
        errors.push(issue("W2C_FINITE", `Frame ${index} w2c contains NaN or Infinity.`, index));
      }
      if (!rowClose(frame.w2c[3], [0, 0, 0, 1], 1e-5)) {
        errors.push(issue("W2C_BOTTOM_ROW", `Frame ${index} w2c bottom row must be [0, 0, 0, 1].`, index));
      }
      const det = det3(frame.w2c);
      if (Math.abs(det - 1) > 1e-3) {
        warnings.push(issue("ROTATION_DETERMINANT", `Frame ${index} rotation determinant is ${det.toFixed(6)}.`, index));
      }
    }

    if (!isMatrix(frame.intrinsics, 3, 3)) {
      errors.push(issue("INTRINSICS_SHAPE", `Frame ${index} intrinsics must be 3x3.`, index));
    } else {
      if (!allFinite(frame.intrinsics)) {
        errors.push(issue("INTRINSICS_FINITE", `Frame ${index} intrinsics contains NaN or Infinity.`, index));
      }
      const fx = frame.intrinsics[0][0];
      const fy = frame.intrinsics[1][1];
      if (!(fx > 0) || !(fy > 0)) {
        errors.push(issue("FOCAL_LENGTH", `Frame ${index} fx and fy must be positive.`, index));
      }
    }
  });

  return { errors, warnings };
}

function issue(code, message, frameIndex = null) {
  return { code, message, frameIndex };
}

function isMatrix(value, rows, cols) {
  return Array.isArray(value) && value.length === rows && value.every((row) => Array.isArray(row) && row.length === cols);
}

function allFinite(matrix) {
  return matrix.every((row) => row.every(Number.isFinite));
}

function rowClose(row, expected, eps) {
  return row.every((value, index) => Math.abs(value - expected[index]) <= eps);
}

function det3(w2c) {
  const a = w2c[0][0];
  const b = w2c[0][1];
  const c = w2c[0][2];
  const d = w2c[1][0];
  const e = w2c[1][1];
  const f = w2c[1][2];
  const g = w2c[2][0];
  const h = w2c[2][1];
  const i = w2c[2][2];
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}
