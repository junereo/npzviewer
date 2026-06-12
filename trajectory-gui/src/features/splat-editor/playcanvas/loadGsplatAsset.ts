import * as pc from "playcanvas";

export async function loadGsplatAsset(app: pc.Application, file: File): Promise<pc.Asset> {
  const url = URL.createObjectURL(file);
  const asset = new pc.Asset(file.name, "gsplat", { url, filename: file.name });
  app.assets.add(asset);

  try {
    await new Promise<void>((resolve, reject) => {
      asset.once("load", () => resolve());
      asset.once("error", (error: unknown) => reject(error instanceof Error ? error : new Error(String(error))));
      app.assets.load(asset);
    });
    return asset;
  } finally {
    URL.revokeObjectURL(url);
  }
}
