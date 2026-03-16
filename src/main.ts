import "./style.css";

import * as THREE from "three";
import { Renderer } from "./rendering/renderer";

import { chairAssembly, type ChairParams } from "./model/manifold";
import { mesh2geometry } from "./model/export";
import { TMFLoader } from "./model/load";
import { Animate, immediate } from "./animate";

import { Dyn } from "twrl";

import { rangeControl, angleControl } from "./controls";

/// CONSTANTS

// Align axes with 3D printer (Z-up)
THREE.Object3D.DEFAULT_UP = new THREE.Vector3(0, 0, 1);

const PARAM_KEYS = [
  "seatWidth",
  "seatDepth",
  "seatHeight",
  "seatThickness",
  "backrestHeight",
  "backrestTilt",
  "legThickness",
  "armrestHeight",
  "armrestThickness",
  "radius",
] as const;

type ParamKey = (typeof PARAM_KEYS)[number];

const DEFAULTS: Record<ParamKey, number> = {
  seatWidth: 440,
  seatDepth: 360,
  seatHeight: 450,
  seatThickness: 20,
  backrestHeight: 520,
  backrestTilt: 8,
  legThickness: 30,
  armrestHeight: 0,
  armrestThickness: 22,
  radius: 3,
};

const LIMITS: Record<ParamKey, [number, number]> = {
  seatWidth: [300, 600],
  seatDepth: [300, 550],
  seatHeight: [380, 520],
  seatThickness: [15, 40],
  backrestHeight: [200, 700],
  backrestTilt: [0, 25],
  legThickness: [20, 60],
  armrestHeight: [0, 300],
  armrestThickness: [15, 40],
  radius: [0, 20],
};

const PRESETS: Record<string, Record<ParamKey, number>> = {
  dining: {
    seatWidth: 440,
    seatDepth: 360,
    seatHeight: 450,
    seatThickness: 20,
    backrestHeight: 520,
    backrestTilt: 8,
    legThickness: 30,
    armrestHeight: 0,
    armrestThickness: 22,
    radius: 3,
  },
};

/// STATE

const modelParams: Record<ParamKey, Dyn<number>> = {
  seatWidth: new Dyn(DEFAULTS.seatWidth),
  seatDepth: new Dyn(DEFAULTS.seatDepth),
  seatHeight: new Dyn(DEFAULTS.seatHeight),
  seatThickness: new Dyn(DEFAULTS.seatThickness),
  backrestHeight: new Dyn(DEFAULTS.backrestHeight),
  backrestTilt: new Dyn(DEFAULTS.backrestTilt),
  legThickness: new Dyn(DEFAULTS.legThickness),
  armrestHeight: new Dyn(DEFAULTS.armrestHeight),
  armrestThickness: new Dyn(DEFAULTS.armrestThickness),
  radius: new Dyn(DEFAULTS.radius),
};

// Current state of part positioning (3D rotation via mouse drag)
type PartPositionStatic = Extract<PartPosition, { tag: "static" }>;
type PartPosition =
  | { tag: "static"; position: -1 | 0 | 1 }
  | {
      tag: "will-move";
      startRot: number;
      startPos: [number, number];
      clock: THREE.Clock;
      lastStatic: PartPositionStatic;
    }
  | {
      tag: "moving";
      startRot: number;
      startPos: [number, number];
      lastStatic: PartPositionStatic;
      clock: THREE.Clock;
      x: number;
    };
const partPositioning = new Dyn<PartPosition>({ tag: "static", position: 0 });

/// MODEL

const tmfLoader = new TMFLoader();

// Reloads the model seen on page
async function reloadModel() {
  const params: ChairParams = {
    seatWidth: animations.seatWidth.current,
    seatDepth: animations.seatDepth.current,
    seatHeight: animations.seatHeight.current,
    seatThickness: animations.seatThickness.current,
    backrestHeight: animations.backrestHeight.current,
    backrestTilt: animations.backrestTilt.current,
    legThickness: animations.legThickness.current,
    armrestHeight: animations.armrestHeight.current,
    armrestThickness: animations.armrestThickness.current,
    radius: animations.radius.current,
  };

  const model = await chairAssembly(params);
  const geometry = mesh2geometry(model);
  geometry.computeVertexNormals();
  mesh.geometry = geometry;
  mesh.clear();

  // Hide validity indicator (chair is always valid)
  const indicator = document.getElementById("validity");
  if (indicator) {
    indicator.style.display = "none";
  }
}

// When target dimensions change, update the 3MF download
Dyn.sequence([
  modelParams.seatWidth,
  modelParams.seatDepth,
  modelParams.seatHeight,
  modelParams.seatThickness,
  modelParams.backrestHeight,
  modelParams.backrestTilt,
  modelParams.legThickness,
  modelParams.armrestHeight,
  modelParams.armrestThickness,
  modelParams.radius,
] as const).addListener(
  ([
    seatWidth,
    seatDepth,
    seatHeight,
    seatThickness,
    backrestHeight,
    backrestTilt,
    legThickness,
    armrestHeight,
    armrestThickness,
    radius,
  ]) => {
    const params: ChairParams = {
      seatWidth,
      seatDepth,
      seatHeight,
      seatThickness,
      backrestHeight,
      backrestTilt,
      legThickness,
      armrestHeight,
      armrestThickness,
      radius,
    };
    const basename = `chair-${seatWidth}x${seatDepth}x${seatHeight}`;
    const assembly = chairAssembly(params).catch((e) => {
      console.error("assembly failed:", e);
      throw e;
    });
    tmfLoader.load(assembly, basename);
  },
);

/// RENDER

let centerCameraNeeded = true;

const mesh: THREE.Mesh = new THREE.Mesh(
  new THREE.BoxGeometry(100, 100, 10),
  new THREE.Material(),
);

async function centerCamera() {
  const mat = new THREE.Matrix4();
  const rotX = new THREE.Matrix4().makeRotationX(-1.1);
  const rotZ = new THREE.Matrix4().makeRotationZ(0.3);
  mat.multiplyMatrices(rotZ, rotX);
  renderer.centerCameraAround(mesh, mat);
}

const MESH_ROTATION_DELTA = 0.3;
mesh.rotation.x = -1.1;
mesh.rotation.z = MESH_ROTATION_DELTA;

const canvas = document.querySelector("canvas") as HTMLCanvasElement;
const renderer = new Renderer(canvas, mesh);

let reloadModelNeeded = true;

const rotation = new Animate(0);

const bound = (v: number, [lo, hi]: [number, number]): number =>
  ((v - lo) % (hi - lo)) + lo;

partPositioning.addListener((val) => {
  if (val.tag === "static") {
    rotation.startAnimationTo(val.position);
  } else if (val.tag === "moving") {
    const dwdx = 2 / renderer.canvasWidth;
    const v = (val.x - val.startPos[0]) * dwdx - val.startRot;
    rotation.startAnimationTo(bound(v, [-1, 1]), immediate);
  } else {
    val.tag satisfies "will-move";
  }
});

/// ANIMATIONS

const animations: Record<ParamKey, Animate> = {} as Record<ParamKey, Animate>;
for (const key of PARAM_KEYS) {
  animations[key] = new Animate(DEFAULTS[key]);
}

PARAM_KEYS.forEach((key) =>
  modelParams[key].addListener((val) => {
    animations[key].startAnimationTo(val);
  }),
);

/// DOM

const link3mf = document.getElementById("download-3mf") as HTMLAnchorElement;
const linkStl = document.getElementById("download-stl") as HTMLAnchorElement;
const linkObj = document.getElementById("download-obj") as HTMLAnchorElement;
const controls = document.querySelector("#controls") as HTMLDivElement;

// Helper: section header
const sectionHeader = (text: string): HTMLElement => {
  const el = document.createElement("h3");
  el.className = "section-header";
  el.textContent = text;
  return el;
};

// --- Preset buttons ---
const presetsWrapper = document.createElement("div");
presetsWrapper.className = "presets-wrapper";
for (const [name, values] of Object.entries(PRESETS)) {
  const btn = document.createElement("button");
  btn.className = "preset-btn";
  btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
  btn.addEventListener("click", () => {
    for (const key of PARAM_KEYS) {
      modelParams[key].send(values[key]);
    }
  });
  presetsWrapper.append(btn);
}
controls.append(presetsWrapper);

// --- Seat section ---
controls.append(sectionHeader("Seat"));

const seatWidthControl = rangeControl("seatWidth", {
  name: "Width",
  min: String(LIMITS.seatWidth[0]),
  max: String(LIMITS.seatWidth[1]),
  sliderMin: String(LIMITS.seatWidth[0]),
  sliderMax: String(LIMITS.seatWidth[1]),
});
controls.append(seatWidthControl.wrapper);

const seatDepthControl = rangeControl("seatDepth", {
  name: "Depth",
  min: String(LIMITS.seatDepth[0]),
  max: String(LIMITS.seatDepth[1]),
  sliderMin: String(LIMITS.seatDepth[0]),
  sliderMax: String(LIMITS.seatDepth[1]),
});
controls.append(seatDepthControl.wrapper);

const seatHeightControl = rangeControl("seatHeight", {
  name: "Height",
  min: String(LIMITS.seatHeight[0]),
  max: String(LIMITS.seatHeight[1]),
  sliderMin: String(LIMITS.seatHeight[0]),
  sliderMax: String(LIMITS.seatHeight[1]),
});
controls.append(seatHeightControl.wrapper);

const seatThicknessControl = rangeControl("seatThickness", {
  name: "Thick",
  min: String(LIMITS.seatThickness[0]),
  max: String(LIMITS.seatThickness[1]),
  sliderMin: String(LIMITS.seatThickness[0]),
  sliderMax: String(LIMITS.seatThickness[1]),
});
controls.append(seatThicknessControl.wrapper);

// --- Backrest section ---
controls.append(sectionHeader("Backrest"));

const backrestHeightControl = rangeControl("backrestHeight", {
  name: "Height",
  min: String(LIMITS.backrestHeight[0]),
  max: String(LIMITS.backrestHeight[1]),
  sliderMin: String(LIMITS.backrestHeight[0]),
  sliderMax: String(LIMITS.backrestHeight[1]),
});
controls.append(backrestHeightControl.wrapper);

const backrestTiltControl = angleControl("backrestTilt", {
  name: "Tilt",
  min: String(LIMITS.backrestTilt[0]),
  max: String(LIMITS.backrestTilt[1]),
  sliderMin: String(LIMITS.backrestTilt[0]),
  sliderMax: String(LIMITS.backrestTilt[1]),
});
controls.append(backrestTiltControl.wrapper);

// --- Legs section ---
controls.append(sectionHeader("Legs"));

const legThicknessControl = rangeControl("legThickness", {
  name: "Thick",
  min: String(LIMITS.legThickness[0]),
  max: String(LIMITS.legThickness[1]),
  sliderMin: String(LIMITS.legThickness[0]),
  sliderMax: String(LIMITS.legThickness[1]),
});
controls.append(legThicknessControl.wrapper);

// --- Armrests section ---
controls.append(sectionHeader("Armrests"));

const armrestHeightControl = rangeControl("armrestHeight", {
  name: "Height",
  min: String(LIMITS.armrestHeight[0]),
  max: String(LIMITS.armrestHeight[1]),
  sliderMin: String(LIMITS.armrestHeight[0]),
  sliderMax: String(LIMITS.armrestHeight[1]),
});
controls.append(armrestHeightControl.wrapper);

const armrestThicknessControl = rangeControl("armrestThickness", {
  name: "Thick",
  min: String(LIMITS.armrestThickness[0]),
  max: String(LIMITS.armrestThickness[1]),
  sliderMin: String(LIMITS.armrestThickness[0]),
  sliderMax: String(LIMITS.armrestThickness[1]),
});
controls.append(armrestThicknessControl.wrapper);

// --- Style section ---
controls.append(sectionHeader("Style"));

const radiusControl = rangeControl("radius", {
  name: "Radius",
  min: String(LIMITS.radius[0]),
  max: String(LIMITS.radius[1]),
  sliderMin: String(LIMITS.radius[0]),
  sliderMax: String(LIMITS.radius[1]),
});
controls.append(radiusControl.wrapper);

// Input binding structure
const inputBindings: {
  key: ParamKey;
  input: HTMLInputElement;
  range: HTMLInputElement;
}[] = [
  {
    key: "seatWidth",
    input: seatWidthControl.input,
    range: seatWidthControl.range,
  },
  {
    key: "seatDepth",
    input: seatDepthControl.input,
    range: seatDepthControl.range,
  },
  {
    key: "seatHeight",
    input: seatHeightControl.input,
    range: seatHeightControl.range,
  },
  {
    key: "seatThickness",
    input: seatThicknessControl.input,
    range: seatThicknessControl.range,
  },
  {
    key: "backrestHeight",
    input: backrestHeightControl.input,
    range: backrestHeightControl.range,
  },
  {
    key: "backrestTilt",
    input: backrestTiltControl.input,
    range: backrestTiltControl.range,
  },
  {
    key: "legThickness",
    input: legThicknessControl.input,
    range: legThicknessControl.range,
  },
  {
    key: "armrestHeight",
    input: armrestHeightControl.input,
    range: armrestHeightControl.range,
  },
  {
    key: "armrestThickness",
    input: armrestThicknessControl.input,
    range: armrestThicknessControl.range,
  },
  { key: "radius", input: radiusControl.input, range: radiusControl.range },
];

// Wire up all inputs
for (const { key, input, range } of inputBindings) {
  const [min, max] = LIMITS[key];

  // Set initial values BEFORE adding event listeners
  const initialValue = String(DEFAULTS[key]);
  input.value = initialValue;
  range.value = initialValue;

  // Update display from model state
  modelParams[key].addListener((val) => {
    input.value = `${Math.round(val)}`;
    range.value = `${Math.round(val)}`;
  });

  // Number input → model
  input.addEventListener("change", () => {
    const n = parseInt(input.value);
    if (!Number.isNaN(n)) {
      modelParams[key].send(Math.max(min, Math.min(n, max)));
    }
  });

  // Range slider → model
  range.addEventListener("input", () => {
    const n = parseInt(range.value);
    if (!Number.isNaN(n)) {
      modelParams[key].send(Math.max(min, Math.min(n, max)));
    }
  });

  // Select all on focus
  input.addEventListener("focus", () => {
    input.select();
  });
}

/// MOUSE DRAG STATE MACHINE

const eventCoords = (e: MouseEvent | TouchEvent): [number, number] => {
  if (e instanceof MouseEvent) {
    return [e.offsetX, e.offsetY];
  }
  const target = e.target;
  if (!target || !(target instanceof HTMLElement)) {
    return [0, 0];
  }
  const rect = target.getBoundingClientRect();
  const x = e.targetTouches[0].clientX - rect.x;
  const y = e.targetTouches[0].clientY - rect.y;
  return [x, y];
};

const readyMouseTarget = canvas;
const readyMouseEvents = ["mousedown", "touchstart"] as const;
const readyMouse = (e: MouseEvent | TouchEvent) => {
  renderer.render();

  const [x, y] = eventCoords(e);
  const [r, g, b, a] = renderer.getCanvasPixelColor([x, y]);

  if (r === 0 && g === 0 && b === 0 && a === 0) {
    return;
  }

  e.preventDefault();
  partPositioning.update((val) => {
    if (val.tag === "will-move" || val.tag === "moving") {
      return val;
    } else {
      const clock = new THREE.Clock();
      clock.start();
      return {
        tag: "will-move",
        startRot: rotation.current,
        startPos: [x, y],
        clock,
        lastStatic: val,
      };
    }
  });

  trackMouseEvents.forEach((evt) =>
    trackMouseTarget.addEventListener(evt, trackMouse, { passive: false }),
  );
  forgetMouseEvents.forEach((evt) =>
    forgetMouseTarget.addEventListener(evt, forgetMouse),
  );
};

readyMouseEvents.forEach((evt) =>
  readyMouseTarget.addEventListener(evt, readyMouse),
);

const trackMouseTarget = window;
const trackMouseEvents = ["mousemove", "touchmove"] as const;
const trackMouse = (e: MouseEvent | TouchEvent) => {
  const [x] = eventCoords(e);

  partPositioning.update((val) => {
    if (val.tag === "will-move" || val.tag === "moving") {
      return {
        tag: "moving",
        x,
        startPos: val.startPos,
        startRot: val.startRot,
        lastStatic: val.lastStatic,
        clock: val.clock,
      };
    }
    val.tag satisfies "static";
    return val;
  });
};

const forgetMouseTarget = window;
const forgetMouseEvents = ["mouseup", "touchend"] as const;
const forgetMouse = () => {
  trackMouseEvents.forEach((evt) =>
    trackMouseTarget.removeEventListener(evt, trackMouse),
  );
  forgetMouseEvents.forEach((evt) =>
    forgetMouseTarget.removeEventListener(evt, forgetMouse),
  );

  const toggle = (p: PartPositionStatic): PartPositionStatic =>
    ({
      [-1]: { tag: "static", position: 0 } as const,
      [0]: { tag: "static", position: 1 } as const,
      [1]: { tag: "static", position: 0 } as const,
    })[p.position];

  partPositioning.update((was) => {
    if (was.tag === "will-move") {
      return toggle(was.lastStatic);
    } else if (was.tag === "static") {
      return toggle(was);
    } else {
      was.tag satisfies "moving";
      const elapsed = was.clock.getElapsedTime();
      const delta = Math.abs(was.x - was.startPos[0]);
      if (elapsed < 0.3 && delta < 15) {
        return toggle(was.lastStatic);
      }
      const rounded = Math.round(bound(rotation.current, [-1, 1]));
      if (rounded <= -1) {
        return { tag: "static", position: -1 };
      } else if (1 <= rounded) {
        return { tag: "static", position: 1 };
      } else {
        return { tag: "static", position: 0 };
      }
    }
  });
};

/// VIEW CONTROLS

let autoRotating = false;

const btnRotate = document.getElementById("btn-rotate") as HTMLButtonElement;
const btnResetView = document.getElementById(
  "btn-reset-view",
) as HTMLButtonElement;

btnRotate.addEventListener("click", () => {
  autoRotating = !autoRotating;
  btnRotate.classList.toggle("active", autoRotating);
});

btnResetView.addEventListener("click", () => {
  autoRotating = false;
  btnRotate.classList.remove("active");
  rotation.startAnimationTo(0, immediate);
  partPositioning.send({ tag: "static", position: 0 });
  centerCameraNeeded = true;
});

/// LOOP

let modelLoadStarted: undefined | DOMHighResTimeStamp;

function loop(nowMillis: DOMHighResTimeStamp) {
  requestAnimationFrame(loop);

  // Reload downloads if necessary
  const newExports = tmfLoader.take();
  if (newExports !== undefined) {
    if (link3mf.href.startsWith("blob:")) URL.revokeObjectURL(link3mf.href);
    link3mf.href = URL.createObjectURL(newExports.tmf.blob);
    link3mf.download = newExports.tmf.filename;

    if (linkStl.href.startsWith("blob:")) URL.revokeObjectURL(linkStl.href);
    linkStl.href = URL.createObjectURL(newExports.stl.blob);
    linkStl.download = newExports.stl.filename;

    if (linkObj.href.startsWith("blob:")) URL.revokeObjectURL(linkObj.href);
    linkObj.href = URL.createObjectURL(newExports.obj.blob);
    linkObj.download = newExports.obj.filename;
  }

  // Handle rotation animation
  const rotationUpdated = rotation.update();
  if (autoRotating) {
    rotation.current += 0.005;
    mesh.rotation.z = rotation.current * Math.PI + MESH_ROTATION_DELTA;
  } else if (rotationUpdated) {
    mesh.rotation.z = rotation.current * Math.PI + MESH_ROTATION_DELTA;
  }

  // Handle parameter animations
  const dimensionsUpdated = PARAM_KEYS.reduce(
    (acc, key) => animations[key].update() || acc,
    false,
  );

  if (dimensionsUpdated) {
    reloadModelNeeded = true;
  }

  const reloadModelNow =
    reloadModelNeeded &&
    (modelLoadStarted === undefined || nowMillis - modelLoadStarted > 100);

  if (reloadModelNow) {
    modelLoadStarted = nowMillis;
    reloadModelNeeded = false;
    reloadModel()
      .then(() => {
        modelLoadStarted = undefined;
        centerCameraNeeded = true;
      })
      .catch((e) => {
        console.error("reloadModel failed:", e);
        modelLoadStarted = undefined;
      });
  }

  const canvasResized = renderer.resizeCanvas();

  if (canvasResized) {
    centerCameraNeeded = true;
  }

  if (centerCameraNeeded) {
    centerCamera();
    centerCameraNeeded = false;
  }

  renderer.render();
}

loop(performance.now());
