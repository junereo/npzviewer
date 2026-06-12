import * as pc from "playcanvas";

export type PlayCanvasAppHandle = {
  app: pc.Application;
  camera: pc.Entity;
  destroy: () => void;
};

export function createPlayCanvasApp(canvas: HTMLCanvasElement): PlayCanvasAppHandle {
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: {
      antialias: true,
      deviceTypes: ["webgl2"],
    },
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    keyboard: new pc.Keyboard(window),
  });

  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.setCanvasFillMode(pc.FILLMODE_NONE);

  const camera = new pc.Entity("Splat Editor Camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.02, 0.03, 0.05),
    fov: 55,
    nearClip: 0.001,
    farClip: 10000,
  });
  camera.setPosition(0, 1.5, 4);
  camera.lookAt(0, 0, 0);
  app.root.addChild(camera);

  const light = new pc.Entity("Editor Light");
  light.addComponent("light", { type: "directional", intensity: 1.2 });
  light.setEulerAngles(45, 35, 0);
  app.root.addChild(light);

  app.start();

  return {
    app,
    camera,
    destroy: () => {
      app.destroy();
    },
  };
}
