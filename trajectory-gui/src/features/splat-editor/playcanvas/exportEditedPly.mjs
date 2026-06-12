export function exportEditedAsciiPly(sourceText, deletedIndices) {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const formatLine = lines.find((line) => line.startsWith("format "));
  if (formatLine !== "format ascii 1.0") {
    throw new Error("Only ascii PLY export is supported in the browser path.");
  }

  const headerEnd = lines.indexOf("end_header");
  if (headerEnd < 0) throw new Error("Invalid PLY: missing end_header.");

  const vertexLineIndex = lines.findIndex((line) => line.startsWith("element vertex "));
  if (vertexLineIndex < 0 || vertexLineIndex > headerEnd) throw new Error("Invalid PLY: missing vertex element.");

  const vertexCount = Number.parseInt(lines[vertexLineIndex].slice("element vertex ".length), 10);
  if (!Number.isFinite(vertexCount) || vertexCount < 0) throw new Error("Invalid PLY: invalid vertex count.");

  const vertexStart = headerEnd + 1;
  const vertices = lines.slice(vertexStart, vertexStart + vertexCount);
  const keptVertices = vertices.filter((_, index) => !deletedIndices.has(index));
  const header = lines.slice(0, headerEnd + 1);
  header[vertexLineIndex] = `element vertex ${keptVertices.length}`;

  return [...header, ...keptVertices, ""].join("\n");
}

export function exportEditedPlyBytes(sourceBuffer, deletedIndices) {
  const source = sourceBuffer instanceof Uint8Array ? sourceBuffer : new Uint8Array(sourceBuffer);
  const header = parsePlyHeader(source);

  if (header.format === "ascii") {
    const exported = exportEditedAsciiPly(new TextDecoder().decode(source), deletedIndices);
    return new TextEncoder().encode(exported).buffer;
  }

  if (header.format !== "binary_little_endian") {
    throw new Error(`Unsupported PLY format: ${header.format}`);
  }

  const keptVertexCount = header.vertexCount - countDeletedVertices(deletedIndices, header.vertexCount);
  const nextHeaderText = header.headerText.replace(/element vertex \d+/, `element vertex ${keptVertexCount}`);
  const nextHeader = new TextEncoder().encode(nextHeaderText);
  const vertexBytes = new Uint8Array(keptVertexCount * header.vertexStride);
  let cursor = 0;

  for (let index = 0; index < header.vertexCount; index += 1) {
    if (deletedIndices.has(index)) continue;
    const start = header.headerByteLength + index * header.vertexStride;
    const end = start + header.vertexStride;
    vertexBytes.set(source.subarray(start, end), cursor);
    cursor += header.vertexStride;
  }

  const vertexDataEnd = header.headerByteLength + header.vertexCount * header.vertexStride;
  const tail = source.subarray(vertexDataEnd);
  const result = new Uint8Array(nextHeader.length + vertexBytes.length + tail.length);
  result.set(nextHeader, 0);
  result.set(vertexBytes, nextHeader.length);
  result.set(tail, nextHeader.length + vertexBytes.length);
  return result.buffer;
}

function parsePlyHeader(source) {
  const marker = new TextEncoder().encode("end_header\n");
  const headerEnd = findSubarray(source, marker);
  if (headerEnd < 0) throw new Error("Invalid PLY: missing end_header.");

  const headerByteLength = headerEnd + marker.length;
  const headerText = new TextDecoder().decode(source.subarray(0, headerByteLength));
  const lines = headerText.trimEnd().split("\n");
  const format = lines.find((line) => line.startsWith("format "))?.split(/\s+/)[1];
  const vertexLine = lines.find((line) => line.startsWith("element vertex "));
  if (!format) throw new Error("Invalid PLY: missing format.");
  if (!vertexLine) throw new Error("Invalid PLY: missing vertex element.");

  const vertexCount = Number.parseInt(vertexLine.slice("element vertex ".length), 10);
  if (!Number.isFinite(vertexCount) || vertexCount < 0) throw new Error("Invalid PLY: invalid vertex count.");

  let inVertex = false;
  let vertexStride = 0;
  for (const line of lines) {
    if (line.startsWith("element ")) {
      inVertex = line.startsWith("element vertex ");
      continue;
    }
    if (inVertex && line.startsWith("property ")) {
      const [, type] = line.split(/\s+/);
      vertexStride += plyScalarByteSize(type);
    }
  }

  if (format === "binary_little_endian" && vertexStride <= 0) throw new Error("Invalid PLY: empty vertex layout.");
  return { format, headerText, headerByteLength, vertexCount, vertexStride };
}

function plyScalarByteSize(type) {
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
      throw new Error(`Unsupported PLY vertex property type: ${type}`);
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

function countDeletedVertices(deletedIndices, vertexCount) {
  let count = 0;
  for (const index of deletedIndices) {
    if (Number.isInteger(index) && index >= 0 && index < vertexCount) count += 1;
  }
  return count;
}
