import * as THREE from "https://esm.sh/three";
import { GLTFLoader } from "https://esm.sh/three/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.getElementById("webgl");
const scene = new THREE.Scene();

// ------------------- CAMERA FPS SETUP -------------------

const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  2000
);

const cameraContainer = new THREE.Object3D();
cameraContainer.position.set(15, 3, 0);
window.player = cameraContainer;

camera.position.set(0, 0, 0);
cameraContainer.add(camera);
scene.add(cameraContainer);

// ------------------- RENDERER -------------------

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;

scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
const dir = new THREE.DirectionalLight(0xffffff, 1.5);
dir.position.set(5, 10, 7);
scene.add(dir);

// ------------------- WORLD / COLLISIONS -------------------

let colliders = [];
let floorMeshes = [];
let collisionsEnabled = false;

// límites invisibles
const STAIRS_Z_LIMIT = 37.0;
const EXTRA_WALL_Z = -16.97;
const EXTRA_WALL_X1 = 6.3887;
const EXTRA_WALL_X2 = 18.5848;
const STAIRS_MAX_Y = 3.2;

// ------------------- TRAIN DOORWAY (puerta abierta del tren) -------------------

// Ajusta estas coords a la puerta abierta del vagón
const TRAIN_DOOR_CENTER = new THREE.Vector3(15.0, 3.0, 5.0);
// tamaño de la “ventana” de paso
const TRAIN_DOOR_HALF_SIZE_X = 1.2;
const TRAIN_DOOR_HALF_SIZE_Z = 1.0;

function isInsideTrainDoorway(pos) {
  return (
    Math.abs(pos.x - TRAIN_DOOR_CENTER.x) < TRAIN_DOOR_HALF_SIZE_X &&
    Math.abs(pos.z - TRAIN_DOOR_CENTER.z) < TRAIN_DOOR_HALF_SIZE_Z
  );
}

// ------------------- JUMP / SALTO -------------------

let isJumping = false;
let jumpProgress = 0;
let jumpStartY = 0;
const JUMP_DURATION_FRAMES = 30;
const JUMP_HEIGHT = 0.6;
const RAILWAY_LEVEL_MAX_Y_FOR_JUMP = 2.0;

// ------------------- INTERACTABLES -------------------

const interactableConfig = [
  {
    name: "metro_map",
    description: "Mapa del metro. Muestra las estaciones y conexiones principales.",
    bottomText: "y cómo salgo de aquí...?",
  },
  {
    name: "Vending_machine",
    description: "Máquina expendedora. Ideal para comprar snacks antes del viaje.",
    bottomText: "y si me alcanza para un snack...",
  },
  {
    name: "St_02_4",
    description: "Un tramo del andén de la estación del metro.",
    bottomText: "no sé si este sea mi andén...",
  },
  {
    name: "ticket_machine",
    description: "Máquina de boletos. Aquí puedes comprar tu entrada al metro.",
  },
  {
    name: "automatic_ticket_gate",
    description: "Torniquete automático que controla el acceso a los andenes.",
  },
  {
    name: "St_02001_6",
    description: "Otra sección del andén, algo más alejada del flujo principal.",
    bottomText: "¿de verdad debería estar aquí...?",
  },
  {
    name: "St_02_6",
    description: "Un segmento del andén que conecta distintas partes de la estación.",
    bottomText: "parece que todos los andenes se parecen...",
  },
  {
    name: "subway_car001_1",
    description: "Uno de los vagones del metro. Silencioso, como si esperara algo.",
    bottomText: "no sé si debería subir a este...",
  },
];

let interactables = []; // { mesh, description, bottomText, isGlitch? }

// ------------------- UI ELEMENTS -------------------

const glitchDialogue = document.getElementById("glitchDialogue");
const interactHint = document.getElementById("interactHint");
const inspectPanel = document.getElementById("inspectPanel");
const inspectText = document.getElementById("inspectText");
const closeInspect = document.getElementById("closeInspect");
const inspectBottom = document.getElementById("inspectBottom");
const introDialogue = document.getElementById("introDialogue");
const bottomHint = document.getElementById("bottomHint");

// audios
const glitchAudio = document.getElementById("glitchSfx");
const stairsBlockAudio = document.getElementById("stairsBlockSfx");
const ambienceAudio = document.getElementById("ambienceSfx");
const foundAudio = document.getElementById("foundSfx");

if (introDialogue) {
  introDialogue.style.display = "none";
  introDialogue.style.opacity = "0";
}

if (closeInspect) {
  closeInspect.addEventListener("click", () => stopInspect());
}

let keys = {};
let pitch = 0;
let yaw = 0;
let noclip = false;
let menuVisible = true;
let inspecting = false;
let currentInteract = null;
let prevFov = camera.fov;
let onStairs = false;

// glitch trigger area (override manual)
let glitchCenter = new THREE.Vector3(
  12.028076814739617,
  2.996876314663927,
  15.729824064364227
);
let isPlayerInGlitchArea = false;

// ------------------- GLITCH DIALOG -------------------

const GLITCH_TEXT = "qué cojones?";
let glitchTypingTimer = null;
let glitchHideTimeout = null;
let glitchDialogueVisible = false;

function hideGlitchDialogue() {
  glitchDialogueVisible = false;
  if (glitchTypingTimer) {
    clearInterval(glitchTypingTimer);
    glitchTypingTimer = null;
  }
  if (glitchHideTimeout) {
    clearTimeout(glitchHideTimeout);
    glitchHideTimeout = null;
  }
  if (glitchDialogue) glitchDialogue.style.display = "none";
}

function showGlitchDialogue() {
  if (!glitchDialogue) return;
  hideGlitchDialogue();
  glitchDialogueVisible = true;

  glitchDialogue.style.display = "block";
  glitchDialogue.textContent = "";

  let index = 0;
  const speed = 50;

  glitchTypingTimer = setInterval(() => {
    glitchDialogue.textContent = GLITCH_TEXT.slice(0, index);
    index++;
    if (index > GLITCH_TEXT.length) {
      clearInterval(glitchTypingTimer);
      glitchTypingTimer = null;
    }
  }, speed);

  if (glitchAudio) {
    glitchAudio.currentTime = 0;
    glitchAudio
      .play()
      .catch((e) => console.warn("No se pudo reproducir glitchSfx:", e));
  }

  glitchHideTimeout = setTimeout(() => {
    hideGlitchDialogue();
  }, 3000);
}

function triggerGlitch() {
  showGlitchDialogue();
}

// ------------------- STAIRS BLOCK DIALOG -------------------

const STAIRS_WARNING_TEXT = "no creo que sea seguro ir ahi...";
let lastStairsWarningTime = 0;
const STAIRS_WARNING_COOLDOWN = 4000;

function showStairsWarning() {
  const now = performance.now();
  if (now - lastStairsWarningTime < STAIRS_WARNING_COOLDOWN) return;
  lastStairsWarningTime = now;

  runTypewriter(STAIRS_WARNING_TEXT, 6000);

  if (stairsBlockAudio) {
    stairsBlockAudio.currentTime = 0;
    stairsBlockAudio
      .play()
      .catch((e) => console.warn("No se pudo reproducir scary:", e));
  }
}

// ------------------- INVENTARIO & PICKUP UI -------------------

const inventory = {
  soda: false,
};

const pickupOverlay = document.getElementById("pickupOverlay");
const pickupText = document.getElementById("pickupText");
const pickupImg = document.getElementById("pickupImg");
const inventorySoda = document.getElementById("inventorySoda");
let pickupTimeout = null;

function updateInventoryUI() {
  if (inventorySoda) {
    inventorySoda.classList.toggle("hidden", !inventory.soda);
  }
}
updateInventoryUI();

function showSodaPickup() {
  if (!pickupOverlay || !pickupText || !pickupImg) return;

  pickupText.textContent = "found a soda";
  pickupImg.src = "/sodapop.png";

  if (foundAudio) {
    foundAudio.currentTime = 0;
    foundAudio
      .play()
      .catch((e) => console.warn("No se pudo reproducir found:", e));
  }

  pickupOverlay.classList.add("visible");

  if (pickupTimeout) clearTimeout(pickupTimeout);
  pickupTimeout = setTimeout(() => {
    pickupOverlay.classList.remove("visible");
  }, 2500);
}

// ------------------- HELPERS -------------------

function addInteractableFromTemplate(mesh, templateName) {
  const t = interactableConfig.find((cfg) => cfg.name === templateName);
  if (!t) return;
  interactables.push({
    mesh,
    description: t.description,
    bottomText: t.bottomText || "",
    isGlitch: false,
  });
}

// ------------------- LOAD GLB -------------------

const loader = new GLTFLoader();
loader.load(
  `${import.meta.env.BASE_URL}metrito.glb`,
  (gltf) => {
    const model = gltf.scene;
    scene.add(model);

    model.updateWorldMatrix(true, true);

    const stMeshes = [];

    model.traverse((child) => {
      if (!child.isMesh) return;

      child.geometry.computeBoundingBox();
      const rawName = child.name || "";
      const lowerName = rawName.toLowerCase();

      const isStLike = lowerName.startsWith("st_");
      const isFloorLike =
        lowerName.includes("floor") ||
        lowerName.includes("piso") ||
        isStLike ||
        lowerName.includes("stairs") ||
        lowerName.includes("stair") ||
        lowerName.includes("rail");

      if (isFloorLike) floorMeshes.push(child);
      else colliders.push(child);

      if (isStLike) stMeshes.push(child);

      // Exact config
      let cfg = interactableConfig.find((x) => x.name === rawName);
      if (cfg) {
        interactables.push({
          mesh: child,
          description: cfg.description,
          bottomText: cfg.bottomText || "",
          isGlitch: false,
        });
      } else {
        // Copias tipo Vending_machine001, automatic_ticket_gate001, metro_map002, etc.
        if (rawName.startsWith("Vending_machine")) {
          addInteractableFromTemplate(child, "Vending_machine");
        } else if (rawName.startsWith("ticket_machine")) {
          addInteractableFromTemplate(child, "ticket_machine");
        } else if (rawName.startsWith("automatic_ticket_gate")) {
          addInteractableFromTemplate(child, "automatic_ticket_gate");
        } else if (rawName.startsWith("metro_map")) {
          addInteractableFromTemplate(child, "metro_map");
        }
      }
    });

    // detectar "St_" encimados (para marcar como glitch si quieres)
    const glitchSet = new Set();
    for (let i = 0; i < stMeshes.length; i++) {
      for (let j = i + 1; j < stMeshes.length; j++) {
        const a = stMeshes[i];
        const b = stMeshes[j];
        const boxA = new THREE.Box3().setFromObject(a);
        const boxB = new THREE.Box3().setFromObject(b);
        if (boxA.intersectsBox(boxB)) {
          glitchSet.add(a);
          glitchSet.add(b);
        }
      }
    }

    glitchSet.forEach((mesh) => {
      const existing = interactables.find((i) => i.mesh === mesh);
      if (existing) {
        existing.isGlitch = true;
        existing.bottomText = existing.bottomText || "qué cojones?";
      } else {
        interactables.push({
          mesh,
          description: "",
          bottomText: "qué cojones?",
          isGlitch: true,
        });
      }
    });

    collisionsEnabled = true;

    const loading = document.getElementById("loading");
    if (loading) loading.style.display = "none";
  },
  undefined,
  (err) => console.error("Error loading GLB:", err)
);

// ------------------- INTRO & DREAM DIALOGS -------------------

const INTRO_TEXT = "¿qué?... ¿dónde estoy?...";
const DREAM_TEXT = "esto tiene que ser un sueño";
let introTypingTimer = null;

function runTypewriter(text, visibleMs) {
  if (!introDialogue) return;

  if (introTypingTimer) {
    clearInterval(introTypingTimer);
    introTypingTimer = null;
  }

  introDialogue.style.display = "block";
  introDialogue.style.opacity = "1";
  introDialogue.textContent = "";

  let index = 0;
  const typingSpeed = 60;

  introTypingTimer = setInterval(() => {
    introDialogue.textContent = text.slice(0, index);
    index++;
    if (index > text.length) {
      clearInterval(introTypingTimer);
      introTypingTimer = null;
    }
  }, typingSpeed);

  setTimeout(() => {
    if (!introDialogue) return;
    introDialogue.style.opacity = "0";
  }, visibleMs - 1500);

  setTimeout(() => {
    if (!introDialogue) return;
    introDialogue.style.display = "none";
  }, visibleMs);
}

function showIntroIntro() {
  runTypewriter(INTRO_TEXT, 11500);
}

function showDreamDialogue() {
  runTypewriter(DREAM_TEXT, 9000);
}

// ------------------- AUDIO UNLOCK + AMBIENTE -------------------

document.body.addEventListener(
  "click",
  () => {
    const toPrime = [glitchAudio, stairsBlockAudio, foundAudio];
    toPrime.forEach((a) => {
      if (!a) return;
      a.muted = false;
      a
        .play()
        .then(() => a.pause())
        .catch(() => {});
    });

    if (ambienceAudio) {
      ambienceAudio.muted = false;
      ambienceAudio.loop = true;
      ambienceAudio.volume = 0.4;
      ambienceAudio
        .play()
        .catch((e) => console.warn("No se pudo reproducir ambience:", e));
    }
  },
  { once: true }
);

// ------------------- INPUT -------------------

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  if (key === "y") {
    // glitch por coordenada
    if (isPlayerInGlitchArea) {
      if (bottomHint) bottomHint.style.display = "none";
      triggerGlitch();
      return;
    }

    // resto de objetos: inspección normal
    if (inspecting) {
      stopInspect();
    } else if (currentInteract) {
      startInspect(currentInteract);
    }
  }

  if (key === "x") {
    if (currentInteract && currentInteract.mesh.name.startsWith("Vending_machine")) {
      if (!inventory.soda) {
        inventory.soda = true;
        updateInventoryUI();
        showSodaPickup();
      }
    }
  }

  if (key === "b") {
    noclip = !noclip;
  }

  if (e.code === "Space") {
    if (
      !isJumping &&
      cameraContainer.position.y < RAILWAY_LEVEL_MAX_Y_FOR_JUMP &&
      !noclip
    ) {
      isJumping = true;
      jumpProgress = 0;
      jumpStartY = cameraContainer.position.y;
    }
  }

  if (key === "escape" && !menuVisible) {
    showMenu();
  }
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

// ------------------- MOUSE -------------------

document.body.addEventListener("click", () => {
  if (!menuVisible) document.body.requestPointerLock();
});

document.addEventListener("mousemove", (e) => {
  if (inspecting) return;
  if (document.pointerLockElement !== document.body) return;

  yaw -= e.movementX * 0.002;
  pitch -= e.movementY * 0.002;

  pitch = Math.max(-1.4, Math.min(1.4, pitch));
});

// ------------------- COLLISION & FLOOR -------------------

const playerBB = new THREE.Box3();
const downRay = new THREE.Raycaster();

function tryMove(delta) {
  const currentPos = cameraContainer.position.clone();
  const target = currentPos.clone().add(delta);

  if (noclip || !collisionsEnabled) {
    cameraContainer.position.copy(target);
    return;
  }

  // muros invisibles en Z -> muestran texto
  if (currentPos.z <= STAIRS_Z_LIMIT && target.z > STAIRS_Z_LIMIT) {
    showStairsWarning();
    return;
  }

  if (
    (currentPos.z < EXTRA_WALL_Z && target.z >= EXTRA_WALL_Z) ||
    (currentPos.z > EXTRA_WALL_Z && target.z <= EXTRA_WALL_Z)
  ) {
    showStairsWarning();
    return;
  }

  // muros invisibles en X -> solo bloquean, sin texto
  if (
    (currentPos.x < EXTRA_WALL_X1 && target.x >= EXTRA_WALL_X1) ||
    (currentPos.x > EXTRA_WALL_X1 && target.x <= EXTRA_WALL_X1)
  ) {
    return;
  }

  if (
    (currentPos.x < EXTRA_WALL_X2 && target.x >= EXTRA_WALL_X2) ||
    (currentPos.x > EXTRA_WALL_X2 && target.x <= EXTRA_WALL_X2)
  ) {
    return;
  }

  if (!checkCollision(target)) {
    cameraContainer.position.copy(target);
  }
}

function checkCollision(pos) {
  if (!collisionsEnabled || noclip || colliders.length === 0) return false;

  const inDoorArea = isInsideTrainDoorway(pos);

  playerBB.setFromCenterAndSize(
    new THREE.Vector3(pos.x, pos.y, pos.z),
    new THREE.Vector3(0.6, 1.6, 0.6)
  );

  for (const c of colliders) {
    const name = (c.name || "").toLowerCase();

    const isTrain =
      name.includes("subway_car") || name.includes("subway_car001");

    // si estamos en la zona de la puerta y el collider es del tren,
    // lo ignoramos para poder entrar al vagón
    if (inDoorArea && isTrain) {
      continue;
    }

    const box = new THREE.Box3().setFromObject(c);
    if (playerBB.intersectsBox(box)) {
      return true;
    }
  }

  return false;
}

function updateHeight() {
  if (floorMeshes.length === 0 || noclip || isJumping) return;

  downRay.set(
    cameraContainer.position.clone(),
    new THREE.Vector3(0, -1, 0)
  );
  const hits = downRay.intersectObjects(floorMeshes, true);
  if (hits.length === 0) {
    onStairs = false;
    return;
  }

  let best = hits[0];
  for (const h of hits) {
    if (h.point.y < best.point.y) best = h;
  }

  let finalY = best.point.y + 1.6;

  const obj = best.object;
  const objName =
    (obj?.name || obj?.parent?.name || "").toLowerCase();

  onStairs =
    objName.includes("stairs") ||
    objName.includes("stair");

  if (onStairs) {
    finalY = Math.min(finalY, STAIRS_MAX_Y);
  }

  cameraContainer.position.y = finalY;
}

// ------------------- INTERACCIÓN (RAYCAST) -------------------

const interactRay = new THREE.Raycaster();
const tempWorldPos = new THREE.Vector3();
const tempNDC = new THREE.Vector3();
const camWorldPos = new THREE.Vector3();
const camWorldDir = new THREE.Vector3();

function updateInteraction() {
  if (inspecting || interactables.length === 0) {
    if (interactHint) interactHint.classList.remove("visible");
    currentInteract = null;
    return;
  }

  camera.getWorldPosition(camWorldPos);
  camera.getWorldDirection(camWorldDir);
  interactRay.set(camWorldPos, camWorldDir);

  // raycast solo contra objetos NO glitch
  const normalMeshes = interactables
    .filter((i) => !i.isGlitch)
    .map((i) => i.mesh);

  const hits = interactRay.intersectObjects(normalMeshes, true);

  if (hits.length === 0) {
    if (interactHint) interactHint.classList.remove("visible");
    currentInteract = null;
    return;
  }

  const hit = hits[0];

  const found = interactables.find(
    (i) =>
      !i.isGlitch &&
      (i.mesh === hit.object ||
        i.mesh === hit.object.parent ||
        i.mesh === hit.object.parent?.parent)
  );

  if (!found) {
    if (interactHint) interactHint.classList.remove("visible");
    currentInteract = null;
    return;
  }

  const maxDist = 3;
  if (hit.distance > maxDist) {
    if (interactHint) interactHint.classList.remove("visible");
    currentInteract = null;
    return;
  }

  currentInteract = found;

  if (!interactHint) return;

  if (found.mesh.name.startsWith("Vending_machine")) {
    if (inventory.soda) {
      interactHint.textContent = "Y para inspeccionar";
    } else {
      interactHint.textContent =
        "Y para inspeccionar\nX para tomar un refresco";
    }
  } else {
    interactHint.textContent = "Y para interactuar";
  }

  interactHint.classList.add("visible");
}

function updateHintPosition() {
  if (!interactHint) return;

  if (!currentInteract || inspecting) {
    interactHint.classList.remove("visible");
    return;
  }

  const mesh = currentInteract.mesh;
  mesh.getWorldPosition(tempWorldPos);
  tempNDC.copy(tempWorldPos).project(camera);

  if (tempNDC.z > 1) {
    interactHint.classList.remove("visible");
    return;
  }

  const x = (tempNDC.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-tempNDC.y * 0.5 + 0.5) * window.innerHeight;

  const offsetX = 0;
  const offsetY = -40;

  interactHint.style.left = `${x + offsetX}px`;
  interactHint.style.top = `${y + offsetY}px`;
}

// ------------------- GLITCH AREA (POR COORDENADA) -------------------

function updateGlitchArea() {
  if (!glitchCenter || !bottomHint) {
    isPlayerInGlitchArea = false;
    return;
  }

  const p = cameraContainer.position;
  const dx = p.x - glitchCenter.x;
  const dz = p.z - glitchCenter.z;
  const dy = p.y - glitchCenter.y;

  const horizDist = Math.sqrt(dx * dx + dz * dz);

  const RADIUS = 2.0;
  const MAX_VERTICAL_DIFF = 1.5;

  if (horizDist < RADIUS && Math.abs(dy) < MAX_VERTICAL_DIFF) {
    isPlayerInGlitchArea = true;
    if (!glitchDialogueVisible) {
      bottomHint.textContent = "Y para inspeccionar";
      bottomHint.style.display = "block";
    }
  } else {
    isPlayerInGlitchArea = false;
    if (!glitchDialogueVisible) {
      bottomHint.style.display = "none";
    }
  }
}

// ------------------- INSPECT MODE -------------------

function startInspect(obj) {
  if (!obj) return;

  inspecting = true;

  prevFov = camera.fov;
  camera.fov = 30;
  camera.updateProjectionMatrix();

  hideGlitchDialogue();

  if (inspectPanel) {
    if (obj.description && obj.description.trim() !== "") {
      if (inspectText) inspectText.textContent = obj.description;
      inspectPanel.style.display = "block";
    } else {
      inspectPanel.style.display = "none";
    }
  }

  if (inspectBottom) {
    if (obj.bottomText && obj.bottomText.trim() !== "") {
      inspectBottom.textContent = obj.bottomText;
      inspectBottom.style.display = "block";
    } else {
      inspectBottom.style.display = "none";
    }
  }
}

function stopInspect() {
  inspecting = false;

  camera.fov = prevFov;
  camera.updateProjectionMatrix();

  if (inspectPanel) inspectPanel.style.display = "none";
  if (inspectBottom) inspectBottom.style.display = "none";
}

// ------------------- ANIMATION LOOP -------------------

function animate() {
  requestAnimationFrame(animate);

  if (!inspecting) {
    const speed = noclip ? 0.25 : 0.12;
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

    if (keys["w"]) tryMove(forward.clone().multiplyScalar(-speed));
    if (keys["s"]) tryMove(forward.clone().multiplyScalar(speed));
    if (keys["d"]) tryMove(right.clone().multiplyScalar(speed));
    if (keys["a"]) tryMove(right.clone().multiplyScalar(-speed));

    camera.rotation.x = pitch;
    cameraContainer.rotation.y = yaw;
  }

  if (isJumping) {
    jumpProgress++;
    const t = Math.min(jumpProgress / JUMP_DURATION_FRAMES, 1);
    const h = 4 * JUMP_HEIGHT * t * (1 - t);
    cameraContainer.position.y = jumpStartY + h;

    if (t >= 1) {
      isJumping = false;
      updateHeight();
    }
  } else {
    updateHeight();
  }

  updateInteraction();
  updateHintPosition();
  updateGlitchArea();

  renderer.render(scene, camera);
}

animate();

// ------------------- RESIZE -------------------

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------- MENU -------------------

let menu, continueBtn, settingsBtn;
let menuTitle, mainOptions, settingsOptions;
let igBtn, ghBtn, backBtn;
let menuState = "main"; // "main" | "settings"

function setMenuSelection(element) {
  if (!element) return;
  if (continueBtn) continueBtn.classList.remove("selected");
  if (settingsBtn) settingsBtn.classList.remove("selected");
  element.classList.add("selected");
}

function showMainMenuPage() {
  menuState = "main";
  if (menuTitle) menuTitle.textContent = "SUBWAY NIGHTMARE";

  if (mainOptions) mainOptions.classList.remove("hidden");
  if (settingsOptions) settingsOptions.classList.add("hidden");

  setMenuSelection(continueBtn);
}

function showSettingsPage() {
  menuState = "settings";
  if (menuTitle) menuTitle.textContent = "links";

  if (mainOptions) mainOptions.classList.add("hidden");
  if (settingsOptions) settingsOptions.classList.remove("hidden");

  if (continueBtn) continueBtn.classList.remove("selected");
  if (settingsBtn) settingsBtn.classList.remove("selected");
}

function showMenu() {
  if (menu) {
    menu.style.display = "flex";
    showMainMenuPage();
  }
  menuVisible = true;
  if (document.pointerLockElement === document.body) {
    document.exitPointerLock();
  }
}

function hideMenu() {
  if (menu) menu.style.display = "none";
  menuVisible = false;
  document.body.requestPointerLock();
}

window.addEventListener("load", () => {
  menu = document.getElementById("menu");
  continueBtn = document.getElementById("continueBtn");
  settingsBtn = document.getElementById("settingsBtn");
  menuTitle = document.getElementById("menuTitle");
  mainOptions = document.getElementById("mainOptions");
  settingsOptions = document.getElementById("settingsOptions");
  igBtn = document.getElementById("igBtn");
  ghBtn = document.getElementById("ghBtn");
  backBtn = document.getElementById("backBtn");

  showMainMenuPage();

  // hover solo en el menú principal
  [continueBtn, settingsBtn].forEach((opt) => {
    if (!opt) return;
    opt.addEventListener("mouseenter", () => {
      if (menuState === "main") setMenuSelection(opt);
    });
  });

  if (continueBtn) {
    continueBtn.addEventListener("click", () => {
      hideMenu();
      showIntroIntro();
      setTimeout(() => {
        showDreamDialogue();
      }, 40000);
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      showSettingsPage();
    });
  }

  if (backBtn) {
    backBtn.addEventListener("click", () => {
      showMainMenuPage();
    });
  }

  // BOTONES DE LINKS
  if (igBtn) {
    igBtn.addEventListener("click", () => {
      window.open("https://instagram.com/tu_usuario", "_blank");
    });
  }

  if (ghBtn) {
    ghBtn.addEventListener("click", () => {
      window.open("https://github.com/tu_usuario", "_blank");
    });
  }

  showMenu();
});
