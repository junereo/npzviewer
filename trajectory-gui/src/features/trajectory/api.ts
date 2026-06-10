import type { CamerasDocument, TrajectoryDocument, VipeDocument } from "./types";

export async function inspectTrajectory(file: File): Promise<TrajectoryDocument> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/trajectory/inspect", { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function exportTrajectory(document: TrajectoryDocument): Promise<Blob> {
  const response = await fetch("/api/trajectory/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(document),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.blob();
}

export async function inspectCameras(file: File): Promise<CamerasDocument> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/cameras/inspect", { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function inspectVipe(file: File): Promise<VipeDocument> {
  const form = new FormData();
  form.append("file", file);
  const response = await fetch("/api/vipe/inspect", { method: "POST", body: form });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}
