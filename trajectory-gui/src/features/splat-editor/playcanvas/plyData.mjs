export function parsePlySceneData(sourceBuffer) {
  const source = sourceBuffer instanceof Uint8Array ? sourceBuffer : new Uint8Array(sourceBuffer);
  const header = parseHeader(source);
  const centers = new Float32Array(header.vertexCount * 3);

  if (header.format === "ascii") {
    readAsciiCenters(source, header, centers);
  } else if (header.format === "binary_little_endian") {
    readBinaryCenters(source, header, centers);
  } else {
    throw new Error(`Unsupported PLY format: ${header.format}`);
  }

  return {
    splatCount: header.vertexCount,
    centers,
    bounds: boundsFromCenters(centers),
    format: header.format,
  };
}

function readAsciiCenters(source, header, centers) {
  const text = new TextDecoder().decode(source);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const vertexStart = lines.findIndex((line) => line === "end_header") + 1;

  for (let index = 0; index < header.vertexCount; index += 1) {
    const values = lines[vertexStart + index].trim().split(/\s+/).map(Number);
    centers[index * 3] = values[header.x.propertyIndex];
    centers[index * 3 + 1] = values[header.y.propertyIndex];
    centers[index * 3 + 2] = values[header.z.propertyIndex];
  }
}

function readBinaryCenters(source, header, centers) {
  const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  for (let index = 0; index < header.vertexCount; index += 1) {
    const row = header.headerByteLength + index * header.vertexStride;
    centers[index * 3] = readScalar(view, row + header.x.byteOffset, header.x.type);
    centers[index * 3 + 1] = readScalar(view, row + header.y.byteOffset, header.y.type);
    centers[index * 3 + 2] = readScalar(view, row + header.z.byteOffset, header.z.type);
  }
}

function parseHeader(source) {
  const marker = new TextEncoder().encode("end_header\n");
  const markerStart = findSubarray(source, marker);
  if (markerStart < 0) throw new Error("Invalid PLY: missing end_header.");

  const headerByteLength = markerStart + marker.length;
  const headerText = new TextDecoder().decode(source.subarray(0, headerByteLength));
  const lines = headerText.trimEnd().split("\n");
  const format = lines.find((line) => line.startsWith("format "))?.split(/\s+/)[1];
  const vertexLine = lines.find((line) => line.startsWith("element vertex "));
  if (!format || !vertexLine) throw new Error("Invalid PLY header.");

  const properties = [];
  let inVertex = false;
  let vertexStride = 0;
  for (const line of lines) {
    if (line.startsWith("element ")) {
      inVertex = line.startsWith("element vertex ");
      continue;
    }
    if (!inVertex || !line.startsWith("property ")) continue;
    const [, type, name] = line.split(/\s+/);
    const size = scalarSize(type);
    properties.push({ name, type, byteOffset: vertexStride, propertyIndex: properties.length });
    vertexStride += size;
  }

  const byName = new Map(properties.map((property) => [property.name, property]));
  const x = byName.get("x");
  const y = byName.get("y");
  const z = byName.get("z");
  if (!x || !y || !z) throw new Error("Invalid PLY: missing x/y/z vertex properties.");

  return {
    format,
    headerByteLength,
    vertexCount: Number.parseInt(vertexLine.slice("element vertex ".length), 10),
    vertexStride,
    x,
    y,
    z,
  };
}

function boundsFromCenters(centers) {
  if (centers.length === 0) return null;
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

  for (let cursor = 0; cursor < centers.length; cursor += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const value = centers[cursor + axis];
      min[axis] = Math.min(min[axis], value);
      max[axis] = Math.max(max[axis], value);
    }
  }

  return { min, max };
}

function readScalar(view, offset, type) {
  switch (type) {
    case "char":
    case "int8":
      return view.getInt8(offset);
    case "uchar":
    case "uint8":
      return view.getUint8(offset);
    case "short":
    case "int16":
      return view.getInt16(offset, true);
    case "ushort":
    case "uint16":
      return view.getUint16(offset, true);
    case "int":
    case "int32":
      return view.getInt32(offset, true);
    case "uint":
    case "uint32":
      return view.getUint32(offset, true);
    case "float":
    case "float32":
      return view.getFloat32(offset, true);
    case "double":
    case "float64":
      return view.getFloat64(offset, true);
    default:
      throw new Error(`Unsupported PLY scalar type: ${type}`);
  }
}

function scalarSize(type) {
  switch (type) {
    case "char":
    case "uchar":
    case "int8":
    case "uint8":
      return 1;
    case "short":
    case "ushort":
    case "int16":
    case "uint16":
      return 2;
    case "int":
    case "uint":
    case "float":
    case "int32":
    case "uint32":
    case "float32":
      return 4;
    case "double":
    case "float64":
      return 8;
    default:
      throw new Error(`Unsupported PLY scalar type: ${type}`);
  }
}

function findSubarray(source, needle) {
  outer: for (let index = 0; index <= source.length - needle.length; index += 1) {
    for (let cursor = 0; cursor < needle.length; cursor += 1) {
      if (source[index + cursor] !== needle[cursor]) continue outer;
    }
    return index;
  }
  return -1;
}
