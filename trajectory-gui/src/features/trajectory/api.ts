import type { CamerasDocument, TrajectoryDocument, VipeDocument } from "./types";

export type PlyCleanPreset = "light" | "medium" | "strong";

export type PlyCleanOptions = {
  preset: PlyCleanPreset;
  opacityThreshold: number;
  scaleQuantile: number;
  epsRatio: number;
  eps?: number | null;
  minSamples: number;
  minClusterRatio: number;
  enableSor: boolean;
  sorNeighbors: number;
  sorStdRatio: number;
};

export type PlyCleanStats = {
  inputPoints: number;
  outputPoints: number;
  removedOpacity: number;
  removedScale: number;
  removedSor: number;
  removedDbscan: number;
  eps: number;
};

export type PlyProgressPhase = "waiting" | "uploading" | "uploaded" | "processing" | "downloading" | "complete" | "error" | "saving";

export type PlyProgressEvent = {
  jobId: string;
  phase: PlyProgressPhase;
  message: string;
  startedAt: number;
  updatedAt: number;
  step?: string;
  inputPoints?: number;
  outputPoints?: number;
  removedPoints?: number;
  eps?: number | null;
  uploadedBytes?: number;
  totalBytes?: number;
  downloadedBytes?: number;
  downloadTotalBytes?: number;
  stats?: PlyCleanStats;
};

type SaveFilePicker = (options?: {
  suggestedName?: string;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<{
  createWritable: () => Promise<{
    write: (chunk: Uint8Array) => Promise<void>;
    close: () => Promise<void>;
    abort?: () => Promise<void>;
  }>;
}>;

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

export async function cleanPly(
  file: File,
  options: PlyCleanOptions,
  suggestedName = "cleaned.ply",
  onProgress?: (event: PlyProgressEvent) => void,
): Promise<{ blob: Blob | null; stats: PlyCleanStats; streamedToDisk: boolean }> {
  const jobId = crypto.randomUUID();
  const startedAt = Date.now();
  const events = new EventSource(`/api/ply/jobs/${jobId}/events`);
  events.onmessage = (message) => {
    onProgress?.(JSON.parse(message.data) as PlyProgressEvent);
  };
  const form = new FormData();
  form.append("file", file);
  form.append("preset", options.preset);
  form.append("opacityThreshold", String(options.opacityThreshold));
  form.append("scaleQuantile", String(options.scaleQuantile));
  form.append("epsRatio", String(options.epsRatio));
  if (options.eps !== null && options.eps !== undefined) {
    form.append("eps", String(options.eps));
  }
  form.append("minSamples", String(options.minSamples));
  form.append("minClusterRatio", String(options.minClusterRatio));
  form.append("enableSor", String(options.enableSor));
  form.append("sorNeighbors", String(options.sorNeighbors));
  form.append("sorStdRatio", String(options.sorStdRatio));

  try {
    const picker = "showSaveFilePicker" in window ? ((window as unknown as { showSaveFilePicker: SaveFilePicker }).showSaveFilePicker) : null;
    onProgress?.({
      jobId,
      phase: "waiting",
      message: picker ? "Choose where to save the cleaned PLY." : "Preparing upload.",
      startedAt,
      updatedAt: Date.now(),
    });
    const writable = picker
      ? await picker({
          suggestedName,
          types: [{ description: "PLY data", accept: { "application/octet-stream": [".ply"] } }],
        }).then((handle) => handle.createWritable())
      : null;

    const response = await fetch(`/api/ply/clean?jobId=${encodeURIComponent(jobId)}`, { method: "POST", body: form });
    if (!response.ok) {
      await writable?.abort?.();
      throw new Error(await response.text());
    }
    const encodedStats = response.headers.get("x-ply-clean-stats");
    const stats = encodedStats
      ? (JSON.parse(decodeURIComponent(encodedStats)) as PlyCleanStats)
      : {
          inputPoints: 0,
          outputPoints: 0,
          removedOpacity: 0,
          removedScale: 0,
          removedSor: 0,
          removedDbscan: 0,
          eps: 0,
        };
    if (writable && response.body) {
      const reader = response.body.getReader();
      const downloadTotalBytes = Number(response.headers.get("content-length") ?? 0) || undefined;
      let downloadedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          downloadedBytes += value.length;
          await writable.write(value);
          onProgress?.({
            jobId,
            phase: "saving",
            message: "Saving cleaned PLY to disk.",
            startedAt,
            updatedAt: Date.now(),
            downloadedBytes,
            downloadTotalBytes,
            stats,
          });
        }
      }
      await writable.close();
      onProgress?.({
        jobId,
        phase: "complete",
        message: "Cleaned PLY saved to disk.",
        startedAt,
        updatedAt: Date.now(),
        downloadedBytes,
        downloadTotalBytes,
        stats,
      });
      return { blob: null, stats, streamedToDisk: true };
    }

    onProgress?.({
      jobId,
      phase: "saving",
      message: "Preparing browser download.",
      startedAt,
      updatedAt: Date.now(),
      stats,
    });
    return { blob: await response.blob(), stats, streamedToDisk: false };
  } catch (error) {
    onProgress?.({
      jobId,
      phase: "error",
      message: error instanceof Error ? error.message : String(error),
      startedAt,
      updatedAt: Date.now(),
    });
    throw error;
  } finally {
    events.close();
  }
}
