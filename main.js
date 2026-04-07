import {
  AmbientLight,
  BackSide,
  Box3,
  BoxGeometry,
  Clock,
  Color,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PerspectiveCamera,
  Raycaster,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  RepeatWrapping,
  SRGBColorSpace,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createCoopClient } from "./coop-network.js";

console.log("Le jeu démarre !");

const scene = new Scene();
scene.background = new Color(0x8e98a8);

const camera = new PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.rotation.order = "YXZ";

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = SRGBColorSpace;
renderer.toneMappingExposure = 0.74;
document.body.style.margin = "0";
document.body.style.overflow = "hidden";
document.body.appendChild(renderer.domElement);

const hud = document.createElement("div");
hud.style.position = "fixed";
hud.style.inset = "0";
hud.innerHTML = `
  <div id="crosshair" style="
    position:absolute;
    left:50%;
    top:50%;
    width:12px;
    height:12px;
    transform:translate(-50%,-50%);
    z-index:30;
    opacity:1;
    mix-blend-mode:normal;
    filter:drop-shadow(0 0 1px rgba(255,255,255,0.9));">
    <div style="
      position:absolute;
      left:50%;
      top:0;
      width:1px;
      height:12px;
      transform:translateX(-50%);
      background:rgb(255,255,255) !important;
      opacity:1;"></div>
    <div style="
      position:absolute;
      left:0;
      top:50%;
      width:12px;
      height:1px;
      transform:translateY(-50%);
      background:rgb(255,255,255) !important;
      opacity:1;"></div>
  </div>
  <div id="damage-overlay" style="
    position:absolute;
    inset:0;
    pointer-events:none;
    border:8px solid rgba(255,40,40,0.85);
    box-shadow:inset 0 0 28px rgba(255,40,40,0.45);
    opacity:0;
    transition:opacity 0.16s ease-out;
    z-index:22;
  "></div>
  <div id="ammo-hud" style="
    position:absolute;
    right:14px;
    bottom:14px;
    color:#ffffff;
    background:rgba(0,0,0,.45);
    border:1px solid rgba(255,255,255,.25);
    border-radius:8px;
    padding:8px 10px;
    font:700 16px/1.1 monospace;
    text-align:right;
    white-space:pre-line;
    min-width:72px;">
    30/30
  </div>
  <div id="health-hud" style="
    position:absolute;
    left:14px;
    bottom:14px;
    width:190px;
    color:#ffffff;
    font:700 12px/1 monospace;
    letter-spacing:1px;">
    <div style="margin-bottom:6px; opacity:0.9;">VIE</div>
    <div style="
      width:100%;
      height:12px;
      padding:2px;
      border-radius:999px;
      background:rgba(0,0,0,.45);
      border:1px solid rgba(255,255,255,.2);">
      <div id="health-fill" style="
        width:100%;
        height:100%;
        border-radius:999px;
        background:linear-gradient(90deg, #6dff8f 0%, #f0ff75 55%, #ff6b6b 100%);
        box-shadow:0 0 10px rgba(255,255,255,0.08);
        transition:width 0.08s linear;
      "></div>
    </div>
    <div id="health-text" style="margin-top:6px; opacity:0.95;">100/100</div>
  </div>
  <div id="coop-room-hud" style="
    position:absolute;
    left:50%;
    top:14px;
    transform:translateX(-50%);
    display:none;
    align-items:center;
    gap:10px;
    color:#ffffff;
    background:rgba(0,0,0,.45);
    border:1px solid rgba(255,255,255,.25);
    border-radius:8px;
    padding:8px 10px;
    font:700 12px/1 monospace;
    letter-spacing:0.8px;
    pointer-events:auto;
    z-index:35;
  ">
    <span id="coop-room-label">ROOM ----</span>
    <button id="coop-leave-room-btn" type="button" style="
      appearance:none;
      border:1px solid rgba(255,255,255,.35);
      border-radius:6px;
      background:#111418;
      color:#fff;
      padding:6px 8px;
      font:700 11px/1 monospace;
      cursor:pointer;
    ">QUITTER ROOM</button>
  </div>
  <div id="reload-overlay" style="
    position:absolute;
    left:50%;
    top:50%;
    transform:translate(-50%,-50%);
    display:none;
    pointer-events:none;
    opacity:0.38;
    text-align:center;
    color:#ffffff;
    text-shadow:0 0 10px rgba(0,0,0,.45);">
    <div style="font:700 54px/1 monospace; letter-spacing:-2px;">↻</div>
    <div style="margin-top:6px; font:700 12px/1 monospace; letter-spacing:1.5px;">RECHARGEMENT</div>
  </div>
  <div id="gameover-overlay" style="
    position:absolute;
    left:50%;
    top:42%;
    transform:translate(-50%,-50%);
    display:none;
    pointer-events:none;
    text-align:center;
    color:#ffefef;
    text-shadow:0 0 12px rgba(0,0,0,.5);">
    <div style="font:800 52px/1 monospace; letter-spacing:2px; color:#ff7272;">GAME OVER</div>
  </div>
`;
document.body.appendChild(hud);
const crosshairEl = document.getElementById("crosshair");
const damageOverlayEl = document.getElementById("damage-overlay");
const ammoHudEl = document.getElementById("ammo-hud");
const healthFillEl = document.getElementById("health-fill");
const healthTextEl = document.getElementById("health-text");
const coopRoomHudEl = document.getElementById("coop-room-hud");
const coopRoomLabelEl = document.getElementById("coop-room-label");
const coopLeaveRoomBtnEl = document.getElementById("coop-leave-room-btn");
const reloadOverlayEl = document.getElementById("reload-overlay");
const gameOverOverlayEl = document.getElementById("gameover-overlay");
const upgradeMenuEl = document.createElement("div");
upgradeMenuEl.style.position = "fixed";
upgradeMenuEl.style.inset = "0";
upgradeMenuEl.style.display = "none";
upgradeMenuEl.style.alignItems = "center";
upgradeMenuEl.style.justifyContent = "center";
upgradeMenuEl.style.zIndex = "55";
upgradeMenuEl.style.background = "rgba(8, 10, 14, 0.88)";
upgradeMenuEl.style.pointerEvents = "auto";
upgradeMenuEl.style.userSelect = "none";
upgradeMenuEl.innerHTML = `
  <div id="upgrade-menu-panel" style="
    width:min(1040px, calc(100vw - 28px));
    padding:18px 16px 16px;
    border-radius:12px;
    background:#111418;
    border:1px solid #3a3f46;
    box-shadow:0 14px 28px rgba(0,0,0,0.35);
    color:#f1f1f1;
    text-align:center;
    font-family:system-ui, sans-serif;">
    <div style="font:700 16px/1 monospace; letter-spacing:1px; color:#d7d7d7; margin-bottom:8px;">PAUSE</div>
    <div style="font:700 28px/1.05 monospace; letter-spacing:0.5px; margin-bottom:8px;">CHOISIS UNE CARTE</div>
    <div style="font:400 13px/1.4 monospace; color:#b8bcc2; margin-bottom:16px;">Le jeu est arrete. Selectionne un boost pour continuer.</div>
    <div id="upgrade-card-grid" style="display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:12px;"></div>
  </div>
`;
document.body.appendChild(upgradeMenuEl);
const upgradeCardGridEl = upgradeMenuEl.querySelector("#upgrade-card-grid");

const coopMenuEl = document.createElement("div");
coopMenuEl.style.position = "fixed";
coopMenuEl.style.inset = "0";
coopMenuEl.style.display = "none";
coopMenuEl.style.alignItems = "center";
coopMenuEl.style.justifyContent = "center";
coopMenuEl.style.zIndex = "60";
coopMenuEl.style.background = "rgba(8, 10, 14, 0.95)";
coopMenuEl.style.pointerEvents = "auto";
coopMenuEl.style.userSelect = "none";
coopMenuEl.style.cursor = "auto";
coopMenuEl.innerHTML = `
  <div style="
    width:min(620px, calc(100vw - 28px));
    padding:18px 16px 16px;
    border-radius:12px;
    background:#111418;
    border:1px solid #3a3f46;
    box-shadow:0 14px 28px rgba(0,0,0,0.35);
    color:#f1f1f1;
    text-align:center;
    font-family:system-ui, sans-serif;">
    <div style="font:700 16px/1 monospace; letter-spacing:1px; color:#d7d7d7; margin-bottom:8px;">CO-OP</div>
    <div style="font:700 28px/1.05 monospace; letter-spacing:0.5px; margin-bottom:8px;">PARTIE COOP</div>

    <div id="coop-choice-screen" style="display:block;">
      <div style="font:400 13px/1.4 monospace; color:#b8bcc2; margin-bottom:16px;">Choisis ton role pour la partie.</div>
      <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
        <button id="coop-host-btn" type="button" style="flex:1 1 220px; padding:14px 16px; border:1px solid #58789a; border-radius:8px; background:#17314a; color:#fff; font:700 16px/1 monospace; cursor:pointer;">HEBERGER</button>
        <button id="coop-join-btn" type="button" style="flex:1 1 220px; padding:14px 16px; border:1px solid #6b7b8b; border-radius:8px; background:#1a1d22; color:#fff; font:700 16px/1 monospace; cursor:pointer;">REJOINDRE</button>
      </div>
      <button id="coop-close-btn" type="button" style="padding:12px 16px; border:1px solid #4a4f57; border-radius:8px; background:#111418; color:#fff; font:700 14px/1 monospace; cursor:pointer;">FERMER</button>
    </div>

    <div id="coop-code-screen" style="display:none;">
      <div id="coop-status" style="font:700 14px/1.2 monospace; color:#8fd2ff; margin-bottom:12px;">En attente...</div>
      <div id="coop-code-row" style="display:none; margin-bottom:12px; font:700 26px/1 monospace; letter-spacing:4px; color:#fff;"></div>
      <div id="coop-code-input-row" style="display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; margin-bottom:12px;">
        <input id="coop-code-input" maxlength="6" inputmode="numeric" placeholder="ENTRER LE CODE" style="width:100%; padding:14px 16px; border-radius:8px; border:1px solid #4a4f57; background:#1a1d22; color:#fff; font:700 18px/1 monospace; letter-spacing:4px; text-transform:uppercase;" />
        <button id="coop-submit-btn" type="button" style="padding:14px 16px; border:1px solid #58789a; border-radius:8px; background:#17314a; color:#fff; font:700 14px/1 monospace; cursor:pointer;">VALIDER</button>
      </div>
      <div style="display:grid; grid-template-columns:1fr auto; gap:10px; align-items:center; margin-bottom:12px;">
        <div id="coop-timer" style="font:700 12px/1 monospace; letter-spacing:1.2px; color:#b6bcc7; text-align:left;">Attente joueur...</div>
        <button id="coop-back-btn" type="button" style="padding:12px 16px; border:1px solid #4a4f57; border-radius:8px; background:#111418; color:#fff; font:700 13px/1 monospace; cursor:pointer;">RETOUR</button>
      </div>
    </div>
  </div>
`;
document.body.appendChild(coopMenuEl);
const coopChoiceScreenEl = coopMenuEl.querySelector("#coop-choice-screen");
const coopCodeScreenEl = coopMenuEl.querySelector("#coop-code-screen");
const coopCodeInputRowEl = coopMenuEl.querySelector("#coop-code-input-row");
const coopStatusEl = coopMenuEl.querySelector("#coop-status");
const coopCodeRowEl = coopMenuEl.querySelector("#coop-code-row");
const coopHostBtnEl = coopMenuEl.querySelector("#coop-host-btn");
const coopJoinBtnEl = coopMenuEl.querySelector("#coop-join-btn");
const coopCodeInputEl = coopMenuEl.querySelector("#coop-code-input");
const coopSubmitBtnEl = coopMenuEl.querySelector("#coop-submit-btn");
const coopCloseBtnEl = coopMenuEl.querySelector("#coop-close-btn");
const coopBackBtnEl = coopMenuEl.querySelector("#coop-back-btn");
const coopTimerEl = coopMenuEl.querySelector("#coop-timer");
let coopMenuMode = "choice";

function setCoopScreen(mode) {
  coopMenuMode = mode;
  if (coopChoiceScreenEl) {
    coopChoiceScreenEl.style.display = mode === "choice" ? "block" : "none";
  }
  if (coopCodeScreenEl) {
    coopCodeScreenEl.style.display = mode === "code" ? "block" : "none";
  }
}

function setCoopHostView(enabled) {
  if (coopCodeInputRowEl) {
    coopCodeInputRowEl.style.display = enabled ? "none" : "grid";
  }
}

function submitJoinCode() {
  coopClient.connect();
  const code = String(coopCodeInputEl?.value || "")
    .replace(/\D/g, "")
    .slice(0, 6);
  if (code.length !== 6) {
    setCoopStatus("Entre un code a 6 chiffres valide.");
    return;
  }
  setCoopStatus(`Connexion au code ${code}...`);
  coopClient.joinRoom(code);
}

if (coopHostBtnEl) {
  coopHostBtnEl.addEventListener("click", () => {
    setCoopScreen("code");
    setCoopHostView(true);
    if (coopCodeInputEl) {
      coopCodeInputEl.value = "";
      coopCodeInputEl.disabled = true;
      coopCodeInputEl.placeholder = "CODE GENERE AUTOMATIQUEMENT";
    }
    if (coopSubmitBtnEl) {
      coopSubmitBtnEl.disabled = true;
      coopSubmitBtnEl.textContent = "EN ATTENTE";
    }
    setCoopCode("");
    if (coopTimerEl) {
      coopTimerEl.textContent = "Attente du 2e joueur...";
    }
    coopClient.connect();
    setCoopStatus("Generation du code. Attends...");
    coopClient.hostRoom();
  });
}

if (coopJoinBtnEl) {
  coopJoinBtnEl.addEventListener("click", () => {
    setCoopScreen("code");
    setCoopHostView(false);
    if (coopCodeInputEl) {
      coopCodeInputEl.disabled = false;
      coopCodeInputEl.placeholder = "ENTRER LE CODE";
      coopCodeInputEl.value = "";
      coopCodeInputEl.focus();
    }
    if (coopSubmitBtnEl) {
      coopSubmitBtnEl.disabled = false;
      coopSubmitBtnEl.textContent = "REJOINDRE";
    }
    setCoopCode("");
    if (coopTimerEl) {
      coopTimerEl.textContent = "Attente code...";
    }
    setCoopStatus("Entre un code puis valide.");
  });
}

if (coopSubmitBtnEl) {
  coopSubmitBtnEl.addEventListener("click", () => {
    submitJoinCode();
  });
}

if (coopCodeInputEl) {
  coopCodeInputEl.addEventListener("input", () => {
    coopCodeInputEl.value = coopCodeInputEl.value
      .replace(/\D/g, "")
      .slice(0, 6);
  });

  coopCodeInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitJoinCode();
    }
  });
}

if (coopCloseBtnEl) {
  coopCloseBtnEl.addEventListener("click", () => {
    closeCoopMenu();
  });
}

if (coopBackBtnEl) {
  coopBackBtnEl.addEventListener("click", () => {
    setCoopScreen("choice");
    setCoopStatus("Choisis une action.");
    setCoopCode("");
    if (coopTimerEl) {
      coopTimerEl.textContent = "Attente joueur...";
    }
  });
}

if (coopLeaveRoomBtnEl) {
  coopLeaveRoomBtnEl.addEventListener("click", () => {
    leaveCoopRoom();
  });
}

function makePatternTexture(width, height, drawFn) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  drawFn(context, width, height);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function applyTextureRepeat(texture, repeatX = 1, repeatY = 1) {
  if (!texture) {
    return texture;
  }

  const repeatedTexture = texture.clone();
  repeatedTexture.wrapS = RepeatWrapping;
  repeatedTexture.wrapT = RepeatWrapping;
  repeatedTexture.colorSpace = texture.colorSpace;
  repeatedTexture.repeat.set(repeatX, repeatY);
  repeatedTexture.needsUpdate = true;
  return repeatedTexture;
}

function setCoopStatus(message) {
  if (coopStatusEl) {
    coopStatusEl.textContent = message;
  }
}

function updateCoopRoomHud() {
  if (!coopRoomHudEl || !coopRoomLabelEl) {
    return;
  }

  const isInRoom = Boolean(coopState.roomCode && coopState.role);
  coopRoomHudEl.style.display = isInRoom ? "flex" : "none";
  if (!isInRoom) {
    return;
  }

  coopRoomLabelEl.textContent = `ROOM ${coopState.roomCode} | ${String(
    coopState.role,
  ).toUpperCase()}`;
}

function isCoopRoomLinked() {
  return Boolean(coopState.roomCode && coopState.role);
}

function leaveCoopRoom() {
  coopClient.disconnectRoom();
  coopState.active = false;
  coopState.role = null;
  coopState.roomCode = "";
  coopState.waitingForGuest = false;
  coopState.pauseOpen = false;
  updateCoopRoomHud();
  refreshCoopButtonState();
  resetRun();
}

function setCoopCode(code) {
  if (coopCodeRowEl) {
    coopCodeRowEl.style.display = code ? "block" : "none";
    coopCodeRowEl.textContent = code ? code.split("").join(" ") : "";
  }
}

function setCoopTimer(seconds) {
  if (coopTimerEl) {
    coopTimerEl.textContent = `Pause: ${seconds.toFixed(1)}s`;
  }
}

function isCoopMenuOpen() {
  return Boolean(coopMenuEl && coopMenuEl.style.display !== "none");
}

function showCoopMenu() {
  if (coopMenuEl) {
    coopMenuEl.style.display = "flex";
  }
}

function hideCoopMenu() {
  if (coopMenuEl) {
    coopMenuEl.style.display = "none";
  }
}

function openCoopMenu() {
  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }
  leftMouseHeld = false;
  holdShotCount = 0;
  coopClient.connect();
  showCoopMenu();
  setCoopScreen("choice");
  setCoopHostView(false);
  if (coopHostBtnEl) {
    coopHostBtnEl.disabled = false;
  }
  if (coopJoinBtnEl) {
    coopJoinBtnEl.disabled = false;
  }
  setCoopStatus("Choisis une action.");
  setCoopCode("");
  if (coopCodeInputEl) {
    coopCodeInputEl.disabled = false;
    coopCodeInputEl.placeholder = "ENTRER LE CODE";
    coopCodeInputEl.value = "";
  }
  if (coopSubmitBtnEl) {
    coopSubmitBtnEl.disabled = false;
    coopSubmitBtnEl.textContent = "REJOINDRE";
  }
  if (coopTimerEl) {
    coopTimerEl.textContent = "Attente joueur...";
  }
}

function closeCoopMenu() {
  leftMouseHeld = false;
  holdShotCount = 0;
  hideCoopMenu();
}

function enableCoopMode(role, roomCode) {
  coopState.active = true;
  coopState.role = role;
  coopState.roomCode = roomCode || coopState.roomCode;
  coopState.waitingForGuest = false;
  updateCoopRoomHud();
  refreshCoopButtonState();
  setCoopStatus(
    role === "host" ? "Partie coop hebergee." : "Partie coop rejointe.",
  );
  setCoopCode(coopState.roomCode);
  closeCoopMenu();
  resetRun(true);
  coopState.selectedCardId = null;
  coopState.pauseOpen = false;
  coopState.lastSentAt = 0;
  zombieModeActive = true;
  updateModeButtonVisual("disabled");
  updateCoopButtonVisual("active");
  startWave(1);
}

function handleCoopMessage(message) {
  if (!message || typeof message.type !== "string") {
    return;
  }

  console.log("[COOP] Message recu:", message.type, message);

  if (message.type === "hello") {
    console.log("[COOP] Serveur connecté.");
    return;
  }

  if (message.type === "room_created") {
    console.log("[COOP] Room créée avec code:", message.code);
    coopState.roomCode = message.code;
    coopState.role = "host";
    coopState.waitingForGuest = true;
    updateCoopRoomHud();
    refreshCoopButtonState();
    setCoopScreen("code");
    setCoopHostView(true);
    setCoopStatus("Code genere. En attente d'un autre joueur.");
    setCoopCode(message.code);
    if (coopCodeInputEl) {
      coopCodeInputEl.disabled = true;
      coopCodeInputEl.placeholder = "CODE GENERE AUTOMATIQUEMENT";
    }
    if (coopSubmitBtnEl) {
      coopSubmitBtnEl.disabled = true;
      coopSubmitBtnEl.textContent = "EN ATTENTE";
    }
    if (coopTimerEl) {
      coopTimerEl.textContent = "Attente du 2e joueur...";
    }
    if (coopHostBtnEl) {
      coopHostBtnEl.disabled = true;
    }
    if (coopJoinBtnEl) {
      coopJoinBtnEl.disabled = true;
    }
    return;
  }

  if (message.type === "room_joined") {
    coopState.roomCode = message.code;
    coopState.role = "guest";
    coopState.pauseOpen = false;
    coopState.waitingForGuest = false;
    updateCoopRoomHud();
    refreshCoopButtonState();
    setCoopScreen("code");
    setCoopHostView(true);
    setCoopStatus("Connecte. Clique le bouton zombie pour lancer les vagues.");
    setCoopCode(message.code);
    if (coopCodeInputEl) {
      coopCodeInputEl.disabled = true;
    }
    if (coopSubmitBtnEl) {
      coopSubmitBtnEl.disabled = true;
      coopSubmitBtnEl.textContent = "EN ATTENTE";
    }
    if (coopTimerEl) {
      coopTimerEl.textContent = "Pret a lancer.";
    }
    closeCoopMenu();
    return;
  }

  if (message.type === "guest_joined") {
    coopState.waitingForGuest = false;
    setCoopStatus(
      "Ami connecte. Clique le bouton zombie pour lancer les vagues.",
    );
    closeCoopMenu();
    return;
  }

  if (message.type === "start_error") {
    if (message.error === "WAITING_FOR_PLAYER") {
      setCoopStatus("Attends qu'un 2e joueur rejoigne la room.");
    } else {
      setCoopStatus("Impossible de lancer maintenant.");
    }
    return;
  }

  if (message.type === "game_start") {
    coopState.pendingStartAt = message.startAt || Date.now();
    enableCoopMode(
      coopState.role || "host",
      message.roomCode || coopState.roomCode,
    );
    return;
  }

  if (message.type === "snapshot") {
    applyCoopSnapshot(message.snapshot);
    coopState.lastSnapshotAt = Date.now();
    return;
  }

  if (message.type === "guest_state") {
    if (coopState.role === "host") {
      updateRemotePlayerProxy(message.snapshot?.player);
      coopState.lastSnapshotAt = Date.now();
    }
    return;
  }

  if (message.type === "pause_open") {
    coopState.pauseOpen = true;
    coopState.pauseDeadlineAt = Date.now() + (message.deadlineMs || 10_000);
    if (coopClient.getSocket()) {
      const nextWave = Number(message.nextWave) || currentWave + 1;
      openUpgradeMenu(nextWave, true);
    }
    return;
  }

  if (message.type === "pause_progress") {
    if (coopTimerEl && message.deadlineAt) {
      const remaining = Math.max(0, (message.deadlineAt - Date.now()) / 1000);
      setCoopTimer(remaining);
    }
    return;
  }

  if (message.type === "pause_resolve") {
    resolveCoopPause(message.hostChoice, message.guestChoice);
    setCoopStatus("Pauses synchronisees. Reprise.");
    return;
  }

  if (message.type === "pause_timeout") {
    if (!coopState.pauseOpen && !upgradeMenuActive) {
      return;
    }
    resolveCoopPause(coopState.selectedCardId, null);
    setCoopStatus("Pause terminee par timeout.");
    return;
  }

  if (message.type === "shot" && coopState.role === "host") {
    applyRemoteShot(message.shot);
    return;
  }

  if (message.type === "remote_damage" && coopState.role === "guest") {
    applyPlayerDamage(message.amount || 1);
    triggerDamageOverlay();
    updateHealthHud();
    return;
  }

  if (message.type === "player_health") {
    const role = String(message.role || "").toLowerCase();
    const health = Number(message.health);
    if (!Number.isFinite(health)) {
      return;
    }

    if (role === coopState.role) {
      playerHealth = Math.max(0, health);
      updateHealthHud();
      if (playerHealth <= 0) {
        triggerGameOver(false);
      }
    } else {
      coopState.remotePlayer.health = Math.max(0, health);
    }
    return;
  }

  if (message.type === "zombie_damaged") {
    applyServerZombieDamage(message.zombieId, message.health);
    return;
  }

  if (message.type === "zombie_killed") {
    applyServerZombieKill(message.zombieId);
    return;
  }

  if (message.type === "coop_game_over") {
    triggerGameOver(false);
    setCoopStatus("Ton allie est KO. Fin de partie synchronisee.");
    return;
  }

  if (message.type === "room_error") {
    setCoopScreen("code");
    if (coopCodeInputEl) {
      coopCodeInputEl.disabled = false;
      coopCodeInputEl.focus();
    }
    if (coopSubmitBtnEl) {
      coopSubmitBtnEl.disabled = false;
      coopSubmitBtnEl.textContent = "REJOINDRE";
    }
    setCoopStatus("Code invalide ou partie indisponible.");
    return;
  }

  if (message.type === "room_closed") {
    coopState.active = false;
    coopState.role = null;
    coopState.roomCode = "";
    coopState.waitingForGuest = false;
    updateCoopRoomHud();
    refreshCoopButtonState();
    setCoopStatus("Connexion coupee.");
    setCoopCode("");
    if (coopHostBtnEl) {
      coopHostBtnEl.disabled = false;
    }
    if (coopJoinBtnEl) {
      coopJoinBtnEl.disabled = false;
    }
    refreshCoopButtonState();
    return;
  }
}

function makeConcreteTexture() {
  return makePatternTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#6c7480";
    context.fillRect(0, 0, width, height);

    for (let y = 0; y < height; y += 64) {
      for (let x = 0; x < width; x += 64) {
        const shade = 92 + Math.floor(Math.random() * 26);
        context.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 10})`;
        context.fillRect(x, y, 64, 64);
      }
    }

    context.strokeStyle = "rgba(255,255,255,0.12)";
    context.lineWidth = 3;
    for (let i = 0; i <= width; i += 64) {
      context.beginPath();
      context.moveTo(i, 0);
      context.lineTo(i, height);
      context.stroke();
      context.beginPath();
      context.moveTo(0, i);
      context.lineTo(width, i);
      context.stroke();
    }

    for (let i = 0; i < 1200; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const alpha = 0.05 + Math.random() * 0.08;
      const size = 1 + Math.random() * 2;
      context.fillStyle = `rgba(255,255,255,${alpha})`;
      context.fillRect(x, y, size, size);
    }
  });
}

function makeWallTexture() {
  return makePatternTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#8a95a4";
    context.fillRect(0, 0, width, height);

    for (let y = 0; y < height; y += 64) {
      const tint = 120 + Math.floor(Math.random() * 20);
      context.fillStyle = `rgb(${tint}, ${tint + 4}, ${tint + 12})`;
      context.fillRect(0, y, width, 64);
    }

    context.fillStyle = "rgba(255,255,255,0.14)";
    for (let y = 0; y < height; y += 32) {
      context.fillRect(0, y, width, 2);
    }

    context.fillStyle = "rgba(0,0,0,0.1)";
    for (let i = 0; i < 900; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 1 + Math.random() * 3;
      context.fillRect(x, y, size, size);
    }

    context.strokeStyle = "rgba(0,0,0,0.08)";
    context.lineWidth = 4;
    for (let i = 0; i <= width; i += 128) {
      context.beginPath();
      context.moveTo(i, 0);
      context.lineTo(i, height);
      context.stroke();
    }
  });
}

function makeMetalTexture() {
  return makePatternTexture(512, 512, (context, width, height) => {
    context.fillStyle = "#a56d4e";
    context.fillRect(0, 0, width, height);

    const grad = context.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "rgba(255,255,255,0.12)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.04)");
    grad.addColorStop(1, "rgba(255,255,255,0.08)");
    context.fillStyle = grad;
    context.fillRect(0, 0, width, height);

    for (let y = 0; y < height; y += 48) {
      context.fillStyle = `rgba(${156 + Math.random() * 18}, ${112 + Math.random() * 18}, ${82 + Math.random() * 12}, 0.92)`;
      context.fillRect(0, y, width, 48);
    }

    context.strokeStyle = "rgba(0,0,0,0.1)";
    context.lineWidth = 2;
    for (let x = 0; x <= width; x += 96) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }

    context.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 900; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const size = 1 + Math.random() * 2;
      context.fillRect(x, y, size, size);
    }
  });
}

function makeStarSkyTexture() {
  return makePatternTexture(1024, 1024, (context, width, height) => {
    const gradient = context.createRadialGradient(
      width * 0.52,
      height * 0.46,
      90,
      width * 0.52,
      height * 0.46,
      width * 0.72,
    );
    gradient.addColorStop(0, "#162546");
    gradient.addColorStop(0.55, "#0c1630");
    gradient.addColorStop(1, "#03070f");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
  });
}

const textures = {
  floor: makeConcreteTexture(),
  wall: makeWallTexture(),
  cover: makeMetalTexture(),
  ceiling: makeWallTexture(),
  sky: makeStarSkyTexture(),
  target: makePatternTexture(256, 256, (context, width, height) => {
    context.fillStyle = "#df5a5a";
    context.fillRect(0, 0, width, height);

    const stripe = context.createLinearGradient(0, 0, width, 0);
    stripe.addColorStop(0, "rgba(255,255,255,0.14)");
    stripe.addColorStop(0.5, "rgba(0,0,0,0.05)");
    stripe.addColorStop(1, "rgba(255,255,255,0.1)");
    context.fillStyle = stripe;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = "rgba(255,255,255,0.18)";
    context.lineWidth = 4;
    for (let y = 0; y <= height; y += 32) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
  }),
};

const shootingStars = [];
let shootingStarSpawnTimer = 0;

function createSkyDecor() {
  const skyDome = new Mesh(
    new SphereGeometry(130, 48, 28),
    new MeshBasicMaterial({
      map: textures.sky,
      side: BackSide,
    }),
  );
  skyDome.position.set(0, 12, 0);
  scene.add(skyDome);
}

function spawnShootingStar() {
  const star = new Mesh(
    new BoxGeometry(0.06, 0.06, 1.2),
    new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
    }),
  );

  const startX = -95 + Math.random() * 190;
  const startY = 16 + Math.random() * 56;
  const startZ = -95 + Math.random() * 190;
  star.position.set(startX, startY, startZ);

  const velocity = new Vector3(
    (Math.random() - 0.5) * 2,
    -(0.28 + Math.random() * 0.72),
    (Math.random() - 0.5) * 2,
  );
  velocity.normalize().multiplyScalar(3 + Math.random() * 2.5);

  star.lookAt(star.position.clone().add(velocity));
  scene.add(star);
  shootingStars.push({
    mesh: star,
    velocity,
    life: 0,
    maxLife: 0.7 + Math.random() * 0.45,
  });
}

function updateShootingStars(dt) {
  shootingStarSpawnTimer -= dt;
  if (shootingStarSpawnTimer <= 0) {
    const burstCount = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < burstCount; i += 1) {
      spawnShootingStar();
    }
    shootingStarSpawnTimer = 0.12 + Math.random() * 0.14;
  }

  for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
    const star = shootingStars[i];
    star.life += dt;
    star.mesh.position.addScaledVector(star.velocity, dt);

    const lifeRatio = 1 - star.life / star.maxLife;
    star.mesh.material.opacity = Math.max(0, lifeRatio * 0.95);

    if (star.life >= star.maxLife) {
      scene.remove(star.mesh);
      star.mesh.geometry.dispose();
      star.mesh.material.dispose();
      shootingStars.splice(i, 1);
    }
  }
}

createSkyDecor();

const ambient = new AmbientLight(0xffffff, 0.54);
scene.add(ambient);
const sky = new HemisphereLight(0xd8e5ff, 0xc8b08d, 0.46);
scene.add(sky);
const sun = new DirectionalLight(0xffffff, 0.92);
sun.position.set(12, 24, 10);
scene.add(sun);

const player = new Object3D();
player.position.set(-13, 1.65, 0);
scene.add(player);
player.add(camera);
camera.position.set(0, 0, 0);

const remotePlayerProxy = new Mesh(
  new BoxGeometry(0.7, 1.3, 0.48),
  new MeshStandardMaterial({
    color: 0x58a8ff,
    roughness: 0.62,
    metalness: 0.05,
    emissive: 0x143b6f,
    emissiveIntensity: 0.28,
  }),
);
const remotePlayerHead = new Mesh(
  new SphereGeometry(0.23, 14, 12),
  new MeshStandardMaterial({
    color: 0xaed4ff,
    roughness: 0.55,
    metalness: 0.08,
    emissive: 0x1f4e84,
    emissiveIntensity: 0.2,
  }),
);
remotePlayerHead.position.set(0, 0.95, 0);
remotePlayerProxy.add(remotePlayerHead);

const remotePlayerChestMark = new Mesh(
  new BoxGeometry(0.22, 0.22, 0.03),
  new MeshBasicMaterial({
    color: 0xffffff,
  }),
);
remotePlayerChestMark.position.set(0, 0.25, 0.26);
remotePlayerProxy.add(remotePlayerChestMark);

const remotePlayerEyeLeft = new Mesh(
  new SphereGeometry(0.03, 10, 8),
  new MeshBasicMaterial({ color: 0x111111 }),
);
remotePlayerEyeLeft.position.set(-0.08, 0.99, 0.2);
remotePlayerProxy.add(remotePlayerEyeLeft);

const remotePlayerEyeRight = new Mesh(
  new SphereGeometry(0.03, 10, 8),
  new MeshBasicMaterial({ color: 0x111111 }),
);
remotePlayerEyeRight.position.set(0.08, 0.99, 0.2);
remotePlayerProxy.add(remotePlayerEyeRight);

const remotePlayerSmileMid = new Mesh(
  new SphereGeometry(0.022, 10, 8),
  new MeshBasicMaterial({ color: 0x111111 }),
);
remotePlayerSmileMid.position.set(0, 0.88, 0.205);
remotePlayerProxy.add(remotePlayerSmileMid);

const remotePlayerSmileLeft = new Mesh(
  new SphereGeometry(0.018, 10, 8),
  new MeshBasicMaterial({ color: 0x111111 }),
);
remotePlayerSmileLeft.position.set(-0.055, 0.9, 0.2);
remotePlayerProxy.add(remotePlayerSmileLeft);

const remotePlayerSmileRight = new Mesh(
  new SphereGeometry(0.018, 10, 8),
  new MeshBasicMaterial({ color: 0x111111 }),
);
remotePlayerSmileRight.position.set(0.055, 0.9, 0.2);
remotePlayerProxy.add(remotePlayerSmileRight);

const REMOTE_PLAYER_BODY_HALF_HEIGHT = 0.65;

remotePlayerProxy.position.set(0, -1000, 0);
remotePlayerProxy.visible = false;
scene.add(remotePlayerProxy);

const GUN_HOLDER_BASE = { x: 0.13, y: -0.19, z: -0.42 };
const gunHolder = new Object3D();
gunHolder.position.set(GUN_HOLDER_BASE.x, GUN_HOLDER_BASE.y, GUN_HOLDER_BASE.z);
camera.add(gunHolder);
const muzzleAnchor = new Object3D();
muzzleAnchor.position.set(0.13, 0.055, -0.9);
gunHolder.add(muzzleAnchor);

const muzzleFlash = new Mesh(
  new SphereGeometry(0.045, 8, 8),
  new MeshBasicMaterial({
    color: 0xffd38a,
    transparent: true,
    opacity: 0,
  }),
);
muzzleFlash.position.set(0, 0, -0.02);
muzzleAnchor.add(muzzleFlash);
let muzzleFlashTimeout = null;

function triggerMuzzleFlash() {
  if (muzzleFlashTimeout) {
    clearTimeout(muzzleFlashTimeout);
  }

  const flashScale = 0.8 + Math.random() * 0.45;
  muzzleFlash.scale.set(flashScale, flashScale * 0.9, flashScale * 0.8);
  muzzleFlash.material.opacity = 0.95;

  muzzleFlashTimeout = setTimeout(() => {
    muzzleFlash.material.opacity = 0;
    muzzleFlashTimeout = null;
  }, 42);
}

const GUN_MODEL_OFFSET = { x: -0.03, y: -0.145, z: 0.045 };
const GUN_MODEL_ROTATION = {
  x: 0.085,
  y: Math.PI / 2 - 0.035,
  z: -0.03,
};

const aimFromCrosshairNdc = { x: 0, y: 0 };

function getCrosshairAimNdc(out) {
  if (!crosshairEl) {
    out.x = 0;
    out.y = 0;
    return out;
  }

  const canvasRect = renderer.domElement.getBoundingClientRect();
  const crosshairRect = crosshairEl.getBoundingClientRect();
  const crosshairCenterX = crosshairRect.left + crosshairRect.width / 2;
  const crosshairCenterY = crosshairRect.top + crosshairRect.height / 2;

  out.x = MathUtils.clamp(
    ((crosshairCenterX - canvasRect.left) / canvasRect.width) * 2 - 1,
    -1,
    1,
  );
  out.y = MathUtils.clamp(
    -(((crosshairCenterY - canvasRect.top) / canvasRect.height) * 2 - 1),
    -1,
    1,
  );

  return out;
}

const loader = new GLTFLoader();
const gunUrl = new URL("./FpsRig.glb", import.meta.url).href;
loader.load(
  gunUrl,
  (gltf) => {
    const gun = gltf.scene;
    gun.scale.set(0.08, 0.08, 0.08);
    gun.position.set(
      GUN_MODEL_OFFSET.x,
      GUN_MODEL_OFFSET.y,
      GUN_MODEL_OFFSET.z,
    );
    gun.rotation.set(
      GUN_MODEL_ROTATION.x,
      GUN_MODEL_ROTATION.y,
      GUN_MODEL_ROTATION.z,
    );

    gun.traverse((child) => {
      if (!child.isMesh || !child.material) {
        return;
      }

      child.material = child.material.clone();
      child.material.color?.multiplyScalar(0.38);
      child.material.color?.lerp(new Color(0x262626), 0.45);
      child.material.emissive?.setRGB(0, 0, 0);
      child.material.emissiveIntensity = 0;
      child.material.roughness = 1;
      child.material.metalness = 0;
      child.material.envMapIntensity = 0;
      child.material.needsUpdate = true;
    });

    gunHolder.add(gun);
  },
  undefined,
  (error) => {
    console.error("Erreur de chargement du modèle FpsRig.glb:", error);
  },
);

const worldColliders = [];
const shootTargets = [];
const zombies = [];
const wavePanelCanvas = document.createElement("canvas");
wavePanelCanvas.width = 512;
wavePanelCanvas.height = 256;
const wavePanelContext = wavePanelCanvas.getContext("2d");
const wavePanelTexture = new CanvasTexture(wavePanelCanvas);
wavePanelTexture.colorSpace = SRGBColorSpace;
wavePanelTexture.needsUpdate = true;
const WAVE_PANEL_WIDTH = 0.48;
const WAVE_PANEL_HEIGHT = 0.16;
const WAVE_PANEL_DISTANCE = 1.08;

const PLAYER_MAX_HEALTH = 100;
const ZOMBIE_HP = 5;
const ZOMBIE_DAMAGE = 9;
const ZOMBIE_CONTACT_RANGE = 1.1;
const ZOMBIE_CONTACT_COOLDOWN = 0.55;
const ZOMBIE_BASE_SPEED = 2.05;
const ZOMBIE_SPEED_PER_WAVE = 0.12;
const ZOMBIE_SPECIAL_CHANCE = 0.2;
const WAVE_CLEAR_DELAY = 1.35;
const GAME_OVER_DELAY = 2.2;
const FLOOR_Y = 0;
const ZOMBIE_CENTER_Y = 0.85;
const ZOMBIE_HALF_EXTENTS = new Vector3(0.56, 1.05, 0.45);

const ZOMBIE_VARIANTS = {
  base: {
    key: "base",
    bodySize: new Vector3(0.62, 1.02, 0.46),
    centerY: ZOMBIE_CENTER_Y,
    halfExtents: new Vector3(0.4, 0.85, 0.35),
    headRadius: 0.23,
    headOffsetY: 0.73,
    legHeight: 0.58,
    legOffsetY: -0.8,
    health: ZOMBIE_HP,
    damage: ZOMBIE_DAMAGE,
    contactRange: ZOMBIE_CONTACT_RANGE,
    speedMultiplier: 1,
    bodyColor: 0x4ea35d,
    headColor: 0x6bb878,
    legColor: 0x355c3f,
  },
  dog: {
    key: "dog",
    bodySize: new Vector3(0.88, 0.42, 0.32),
    centerY: 0.45,
    halfExtents: new Vector3(0.48, 0.45, 0.25),
    headRadius: 0.16,
    headOffsetY: 0.18,
    legHeight: 0.2,
    legOffsetY: -0.3,
    health: 2.8,
    damage: 3.5,
    contactRange: 0.92,
    speedMultiplier: 2.2,
    bodyColor: 0x6f7a46,
    headColor: 0x93a15e,
    legColor: 0x3e4727,
  },
  tank: {
    key: "tank",
    bodySize: new Vector3(0.92, 1.4, 0.74),
    centerY: 1.0,
    halfExtents: new Vector3(0.56, 1.05, 0.45),
    headRadius: 0.31,
    headOffsetY: 0.95,
    legHeight: 0.74,
    legOffsetY: -1.07,
    health: 15,
    damage: 11,
    contactRange: 1.28,
    speedMultiplier: 0.52,
    bodyColor: 0x3f8051,
    headColor: 0x5f9f70,
    legColor: 0x2d5738,
  },
};

let modeButtonMesh = null;
let coopButtonMesh = null;
let modeButtonState = "ready";
let coopButtonState = "ready";
let zombieModeActive = false;
let currentWave = 0;
let nextWaveTimer = 0;
let playerHealth = PLAYER_MAX_HEALTH;
let playerDamageMultiplier = 1;
let attackSpeedMultiplier = 1;
let moveSpeedMultiplier = 1;
let bonusJumpCharges = 0;
let extraLives = 0;
let jumpCharges = 1;
let gameOverActive = false;
let gameOverTimer = 0;
let upgradeMenuActive = false;
let pendingWaveToStart = 0;
let wavePanelMesh = null;
let navGraphReady = false;
const navNodes = [];
const navLinks = [];
const navProbeHalfExtents = new Vector3(0.22, 0.85, 0.22);
const navProbeBox = new Box3();
const zombieSpawnProbeBox = new Box3();
const upgradeCatalog = [
  {
    id: "attack-speed",
    title: "+5% VITESSE D'ATTAQUE",
    subtitle: "Tu tires un peu plus vite.",
    detail: "Reduce les delais entre les tirs de 5%.",
    color: [72, 218, 140],
    apply() {
      attackSpeedMultiplier *= 1.05;
    },
  },
  {
    id: "double-jump",
    title: "DOUBLE SAUT",
    subtitle: "Un saut supplementaire en l'air.",
    detail: "Ajoute +1 saut supplementaire a chaque selection.",
    color: [110, 184, 255],
    apply() {
      bonusJumpCharges += 1;
      jumpCharges = getMaxJumpCharges();
    },
  },
  {
    id: "extra-life",
    title: "+1 VIE",
    subtitle: "Une chance de plus.",
    detail: "Quand ta vie tombe a 0, tu reviens a 100 PV.",
    color: [255, 196, 92],
    apply() {
      extraLives += 1;
    },
  },
  {
    id: "run-speed",
    title: "+5% VITESSE DE COURSE",
    subtitle: "Tu te deplaces plus vite.",
    detail: "La vitesse de mouvement augmente de 5%.",
    color: [255, 122, 92],
    apply() {
      moveSpeedMultiplier *= 1.05;
    },
  },
  {
    id: "heal-50",
    title: "+50 PV",
    subtitle: "Coup de pouce immediate.",
    detail: "Regagne 50 points de vie instantanement.",
    color: [108, 255, 157],
    apply() {
      playerHealth = Math.min(PLAYER_MAX_HEALTH, playerHealth + 50);
    },
  },
  {
    id: "damage-up",
    title: "+5% DEGATS",
    subtitle: "Tes tirs frappent plus fort.",
    detail: "Tous tes degats infliges augmentent de 5%.",
    color: [255, 104, 168],
    apply() {
      playerDamageMultiplier *= 1.05;
    },
  },
];
const upgradeCatalogById = new Map(
  upgradeCatalog.map((card) => [card.id, card]),
);

function getMaxJumpCharges() {
  return 1 + bonusJumpCharges;
}

function getMoveSpeed() {
  return 7 * moveSpeedMultiplier;
}

function getAutoFireIntervalMs() {
  return 150 / attackSpeedMultiplier;
}

function getTapFireIntervalMs() {
  return 360 / attackSpeedMultiplier;
}

function shuffleArray(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function createBox(
  w,
  h,
  d,
  x,
  y,
  z,
  color = 0x6d7688,
  collides = true,
  options = {},
) {
  const material = new MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.9,
    metalness: options.metalness ?? 0.03,
    map: options.map ?? null,
  });

  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (collides) {
    const bounds = new Box3().setFromObject(mesh);
    worldColliders.push(bounds);
    shootTargets.push(mesh);
  }

  return mesh;
}

function build1v1Map() {
  createBox(36, 0.2, 22, 0, -0.1, 0, 0x2a3442, false, {
    map: applyTextureRepeat(textures.floor, 6, 4),
    roughness: 1,
    metalness: 0,
  });

  createBox(36, 4, 0.5, 0, 1.9, -11, 0x4b5568, true, {
    map: applyTextureRepeat(textures.wall, 6, 2),
    roughness: 0.95,
    metalness: 0.02,
  });
  createBox(36, 4, 0.5, 0, 1.9, 11, 0x4b5568, true, {
    map: applyTextureRepeat(textures.wall, 6, 2),
    roughness: 0.95,
    metalness: 0.02,
  });
  createBox(0.5, 4, 22, -18, 1.9, 0, 0x4b5568, true, {
    map: applyTextureRepeat(textures.wall, 4, 2),
    roughness: 0.95,
    metalness: 0.02,
  });
  createBox(0.5, 4, 22, 18, 1.9, 0, 0x4b5568, true, {
    map: applyTextureRepeat(textures.wall, 4, 2),
    roughness: 0.95,
    metalness: 0.02,
  });

  createBox(0.5, 4, 7, 0, 1.9, -7.5, 0x596378, true, {
    map: applyTextureRepeat(textures.wall, 2, 1.2),
    roughness: 0.9,
    metalness: 0.03,
  });
  createBox(0.5, 4, 7, 0, 1.9, 7.5, 0x596378, true, {
    map: applyTextureRepeat(textures.wall, 2, 1.2),
    roughness: 0.9,
    metalness: 0.03,
  });

  createBox(9, 2.5, 0.4, -4.5, 1.25, -5.2, 0x66738c, true, {
    map: applyTextureRepeat(textures.cover, 2.5, 1.4),
    roughness: 0.8,
    metalness: 0.18,
  });
  createBox(9, 2.5, 0.4, 4.5, 1.25, -8.8, 0x66738c, true, {
    map: applyTextureRepeat(textures.cover, 2.5, 1.4),
    roughness: 0.8,
    metalness: 0.18,
  });

  createBox(9, 2.5, 0.4, -4.5, 1.25, 5.2, 0x66738c, true, {
    map: applyTextureRepeat(textures.cover, 2.5, 1.4),
    roughness: 0.8,
    metalness: 0.18,
  });
  createBox(9, 2.5, 0.4, 4.5, 1.25, 8.8, 0x66738c, true, {
    map: applyTextureRepeat(textures.cover, 2.5, 1.4),
    roughness: 0.8,
    metalness: 0.18,
  });

  createBox(2.5, 4, 2.5, -9, 2, -3, 0x8f5a3f, true, {
    map: applyTextureRepeat(textures.cover, 1.2, 1.2),
    roughness: 0.75,
    metalness: 0.14,
  });
  createBox(2.5, 2.5, 2.5, -9, 1.25, 3, 0x8f5a3f, true, {
    map: applyTextureRepeat(textures.cover, 1.2, 1.2),
    roughness: 0.75,
    metalness: 0.14,
  });
  createBox(2.5, 2.5, 2.5, 9, 1.25, -3, 0x8f5a3f, true, {
    map: applyTextureRepeat(textures.cover, 1.2, 1.2),
    roughness: 0.75,
    metalness: 0.14,
  });
  createBox(2.5, 4, 2.5, 9, 2, 3, 0x8f5a3f, true, {
    map: applyTextureRepeat(textures.cover, 1.2, 1.2),
    roughness: 0.75,
    metalness: 0.14,
  });
}

build1v1Map();

modeButtonMesh = createBox(0.12, 1.25, 1.25, 17.62, 1.85, 0, 0xd7263d, false, {
  roughness: 0.45,
  metalness: 0.08,
});
const modeButtonPlate = createBox(
  0.06,
  1.65,
  1.65,
  17.69,
  1.85,
  0,
  0xf4f1e8,
  false,
  {
    roughness: 0.75,
    metalness: 0.02,
  },
);
const skullTexture = makePatternTexture(512, 512, (context, width, height) => {
  context.clearRect(0, 0, width, height);
  context.fillStyle = "rgba(0,0,0,0)";
  context.fillRect(0, 0, width, height);

  context.fillStyle = "#ffffff";
  context.beginPath();
  context.arc(width * 0.5, height * 0.42, width * 0.18, 0, Math.PI * 2);
  context.fill();
  context.fillRect(width * 0.36, height * 0.48, width * 0.28, height * 0.16);

  context.fillStyle = "#111111";
  context.beginPath();
  context.arc(width * 0.44, height * 0.4, width * 0.035, 0, Math.PI * 2);
  context.arc(width * 0.56, height * 0.4, width * 0.035, 0, Math.PI * 2);
  context.fill();
  context.fillRect(width * 0.49, height * 0.48, width * 0.02, height * 0.08);
  context.fillRect(width * 0.43, height * 0.58, width * 0.14, height * 0.02);
});
const skullMark = new Mesh(
  new BoxGeometry(0.02, 0.52, 0.52),
  new MeshBasicMaterial({
    map: skullTexture,
    transparent: true,
    color: 0xffffff,
  }),
);
skullMark.position.set(-0.065, 0.02, 0);
modeButtonMesh.add(skullMark);
modeButtonPlate.material.color.set(0xf4f1e8);
modeButtonPlate.material.emissive.set(0x1f1f1f);
modeButtonPlate.material.emissiveIntensity = 0.18;
modeButtonMesh.material.color.set(0xd7263d);
modeButtonMesh.position.set(17.62, 1.85, 0);
modeButtonMesh.material.emissive.set(0xb91d33);
modeButtonMesh.material.emissiveIntensity = 1.25;
modeButtonMesh.userData.isZombieModeButton = true;
modeButtonMesh.userData.isDisabled = false;
shootTargets.push(modeButtonMesh);

coopButtonMesh = createBox(
  0.12,
  1.25,
  1.25,
  17.62,
  1.85,
  -1.9,
  0x24435f,
  false,
  {
    roughness: 0.45,
    metalness: 0.08,
  },
);
const coopButtonPlate = createBox(
  0.06,
  1.65,
  1.65,
  17.69,
  1.85,
  -1.9,
  0xebf1f7,
  false,
  {
    roughness: 0.75,
    metalness: 0.02,
  },
);
const coopHeadsTexture = makePatternTexture(
  512,
  512,
  (context, width, height) => {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(0,0,0,0)";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#ffffff";
    context.beginPath();
    context.arc(width * 0.36, height * 0.42, width * 0.12, 0, Math.PI * 2);
    context.arc(width * 0.64, height * 0.42, width * 0.12, 0, Math.PI * 2);
    context.fill();
    context.fillRect(width * 0.25, height * 0.55, width * 0.22, height * 0.12);
    context.fillRect(width * 0.53, height * 0.55, width * 0.22, height * 0.12);

    context.fillStyle = "#111111";
    context.beginPath();
    context.arc(width * 0.33, height * 0.4, width * 0.02, 0, Math.PI * 2);
    context.arc(width * 0.39, height * 0.4, width * 0.02, 0, Math.PI * 2);
    context.arc(width * 0.61, height * 0.4, width * 0.02, 0, Math.PI * 2);
    context.arc(width * 0.67, height * 0.4, width * 0.02, 0, Math.PI * 2);
    context.fill();
  },
);
const coopHeadsMark = new Mesh(
  new BoxGeometry(0.02, 0.52, 0.52),
  new MeshBasicMaterial({
    map: coopHeadsTexture,
    transparent: true,
    color: 0xffffff,
  }),
);
coopHeadsMark.position.set(-0.065, 0.02, 0);
coopButtonMesh.add(coopHeadsMark);
coopButtonPlate.material.color.set(0xebf1f7);
coopButtonPlate.material.emissive.set(0x1d2430);
coopButtonPlate.material.emissiveIntensity = 0.18;
coopButtonMesh.material.color.set(0x24435f);
coopButtonMesh.position.set(17.62, 1.85, -1.9);
coopButtonMesh.material.emissive.set(0x12263a);
coopButtonMesh.material.emissiveIntensity = 1.1;
coopButtonMesh.userData.isCoopModeButton = true;
coopButtonMesh.userData.isDisabled = false;
shootTargets.push(coopButtonMesh);
initWavePanelInScene();

const clock = new Clock();
const raycaster = new Raycaster();

const pressed = {
  KeyW: false,
  KeyA: false,
  KeyS: false,
  KeyD: false,
  KeyZ: false,
  KeyQ: false,
};

let yaw = 0;
let pitch = 0;
const baseMoveSpeed = 7;
const jumpVelocity = 6.2;
const gravity = 16;
const groundY = 1.65;
let verticalVelocity = 0;
let isGrounded = true;
const playerHalfExtents = new Vector3(0.35, 0.8, 0.35);
const playerBox = new Box3();
const moveDir = new Vector3();
const forward = new Vector3();
const right = new Vector3();
const worldUp = new Vector3(0, 1, 0);
const muzzleWorld = new Vector3();
const shotAimNdc = { x: 0, y: 0 };
const MAGAZINE_SIZE = 30;
const RELOAD_DURATION_MS = 1200;
let ammoInMagazine = MAGAZINE_SIZE;
let isReloading = false;
let leftMouseHeld = false;
let nextAutoShotAt = 0;
let nextTapShotAt = 0;
let holdShotCount = 0;
const AUTO_FIRE_INTERVAL_MS = 150;
const TAP_FIRE_INTERVAL_MS = 360;
const SPREAD_GROWTH_PER_SHOT = 0.0042;
const MAX_SPREAD_NDC = 0.08;
let audioContext = null;
const SOUND_MASTER_VOLUME = 0.42;
const SHOT_SOUND_VOLUME = 0.22;
const RELOAD_SOUND_VOLUME = 0.18;
const ZOMBIE_SOUND_VOLUME = 0.16;
const HEADSHOT_BELL_VOLUME = 0.22;
const HEADSHOT_MULTIPLIER = 2.5;
let nextZombieSoundAt = 0;
let damageOverlayTimeout = null;

const coopState = {
  active: false,
  role: null,
  roomCode: "",
  connected: false,
  lobbyOpen: false,
  waitingForGuest: false,
  pauseOpen: false,
  pauseDeadlineAt: 0,
  selectedCardId: null,
  remotePlayer: {
    x: 0,
    y: groundY,
    z: 0,
    yaw: 0,
    pitch: 0,
    health: 100,
    ammo: 30,
  },
  lastSnapshotAt: 0,
  lastSentAt: 0,
  pendingStartAt: 0,
  hostSeed: 0,
};

const coopClient = createCoopClient({
  url:
    import.meta.env.VITE_COOP_SERVER_URL ||
    `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.hostname || "localhost"}:8080`,
  onOpen() {
    console.log("[COOP] CLIENT: WebSocket connecté au serveur.");
    setCoopStatus("Connecte au serveur coop.");
    coopState.connected = true;
  },
  onClose() {
    console.log("[COOP] CLIENT: WebSocket fermé.");
    coopState.connected = false;
    coopState.active = false;
    coopState.role = null;
    coopState.roomCode = "";
    coopState.waitingForGuest = false;
    updateCoopRoomHud();
    refreshCoopButtonState();
    setCoopStatus("Connexion coop fermee.");
    hideCoopMenu();
  },
  onError() {
    console.error("[COOP] CLIENT: Erreur WebSocket.");
    setCoopStatus("Erreur de connexion coop.");
  },
  onMessage(message) {
    handleCoopMessage(message);
  },
});

console.log("[COOP] Initialisation client COOP");
console.log(
  "[COOP] VITE_COOP_SERVER_URL env var:",
  import.meta.env.VITE_COOP_SERVER_URL,
);
console.log("[COOP] WebSocket URL connectant à:", coopClient.getUrl() || "??");

function ensureAudioContext() {
  if (audioContext) {
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
    return audioContext;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return null;
  }

  audioContext = new AudioContextClass();
  return audioContext;
}

function createNoiseBuffer(context, durationSeconds) {
  const sampleRate = context.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, frameCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  for (let i = 0; i < frameCount; i += 1) {
    channelData[i] = Math.random() * 2 - 1;
  }

  return buffer;
}

function playShotSound() {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(
    SOUND_MASTER_VOLUME * SHOT_SOUND_VOLUME,
    now + 0.003,
  );
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  const bodyOsc = context.createOscillator();
  bodyOsc.type = "square";
  bodyOsc.frequency.setValueAtTime(360, now);
  bodyOsc.frequency.exponentialRampToValueAtTime(160, now + 0.03);
  bodyOsc.frequency.exponentialRampToValueAtTime(110, now + 0.055);

  const snapOsc = context.createOscillator();
  snapOsc.type = "triangle";
  snapOsc.frequency.setValueAtTime(1400, now);
  snapOsc.frequency.exponentialRampToValueAtTime(280, now + 0.02);

  const clickNoise = context.createBufferSource();
  clickNoise.buffer = createNoiseBuffer(context, 0.018);

  const clickFilter = context.createBiquadFilter();
  clickFilter.type = "highpass";
  clickFilter.frequency.value = 2400;
  clickFilter.Q.value = 0.65;

  const bodyFilter = context.createBiquadFilter();
  bodyFilter.type = "highpass";
  bodyFilter.frequency.value = 180;
  bodyFilter.Q.value = 0.4;

  bodyOsc.connect(bodyFilter);
  bodyFilter.connect(master);
  snapOsc.connect(master);
  clickNoise.connect(clickFilter);
  clickFilter.connect(master);
  master.connect(context.destination);

  bodyOsc.start(now);
  bodyOsc.stop(now + 0.05);
  snapOsc.start(now);
  snapOsc.stop(now + 0.023);
  clickNoise.start(now);
  clickNoise.stop(now + 0.02);
}

function playReloadSound() {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(
    SOUND_MASTER_VOLUME * RELOAD_SOUND_VOLUME,
    now + 0.015,
  );
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);

  const mechOsc = context.createOscillator();
  mechOsc.type = "square";
  mechOsc.frequency.setValueAtTime(240, now);
  mechOsc.frequency.exponentialRampToValueAtTime(90, now + 0.35);

  const latchOsc = context.createOscillator();
  latchOsc.type = "triangle";
  latchOsc.frequency.setValueAtTime(880, now + 0.06);
  latchOsc.frequency.exponentialRampToValueAtTime(190, now + 0.14);

  const noise = context.createBufferSource();
  noise.buffer = createNoiseBuffer(context, 0.028);

  const clickHigh = context.createBiquadFilter();
  clickHigh.type = "highpass";
  clickHigh.frequency.value = 1200;
  clickHigh.Q.value = 0.8;

  const mechBand = context.createBiquadFilter();
  mechBand.type = "bandpass";
  mechBand.frequency.value = 320;
  mechBand.Q.value = 0.7;

  mechOsc.connect(mechBand);
  mechBand.connect(master);
  latchOsc.connect(master);
  noise.connect(clickHigh);
  clickHigh.connect(master);
  master.connect(context.destination);

  mechOsc.start(now);
  mechOsc.stop(now + 0.42);
  latchOsc.start(now + 0.06);
  latchOsc.stop(now + 0.16);
  noise.start(now + 0.02);
  noise.stop(now + 0.05);
}

function playZombieSound(isAttack = false) {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const nowMs = performance.now();
  if (nowMs < nextZombieSoundAt) {
    return;
  }
  nextZombieSoundAt = nowMs + (isAttack ? 170 : 320);

  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(
    SOUND_MASTER_VOLUME * ZOMBIE_SOUND_VOLUME,
    now + 0.02,
  );
  master.gain.exponentialRampToValueAtTime(
    0.0001,
    now + (isAttack ? 0.22 : 0.34),
  );

  const growl = context.createOscillator();
  growl.type = "sawtooth";
  growl.frequency.setValueAtTime(isAttack ? 135 : 95, now);
  growl.frequency.exponentialRampToValueAtTime(isAttack ? 75 : 60, now + 0.2);

  const raspNoise = context.createBufferSource();
  raspNoise.buffer = createNoiseBuffer(context, isAttack ? 0.14 : 0.2);
  const raspFilter = context.createBiquadFilter();
  raspFilter.type = "bandpass";
  raspFilter.frequency.value = isAttack ? 620 : 460;
  raspFilter.Q.value = 0.9;

  const lowPass = context.createBiquadFilter();
  lowPass.type = "lowpass";
  lowPass.frequency.value = 900;
  lowPass.Q.value = 0.5;

  growl.connect(lowPass);
  lowPass.connect(master);
  raspNoise.connect(raspFilter);
  raspFilter.connect(master);
  master.connect(context.destination);

  growl.start(now);
  growl.stop(now + (isAttack ? 0.22 : 0.3));
  raspNoise.start(now);
  raspNoise.stop(now + (isAttack ? 0.16 : 0.22));
}

function playHeadshotBell() {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(
    SOUND_MASTER_VOLUME * HEADSHOT_BELL_VOLUME,
    now + 0.004,
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.19);

  const osc = context.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(2450, now);
  osc.frequency.exponentialRampToValueAtTime(1620, now + 0.12);

  const shimmer = context.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.setValueAtTime(3200, now);
  shimmer.frequency.exponentialRampToValueAtTime(2200, now + 0.1);

  const click = context.createBufferSource();
  click.buffer = createNoiseBuffer(context, 0.012);
  const clickFilter = context.createBiquadFilter();
  clickFilter.type = "highpass";
  clickFilter.frequency.value = 2600;
  clickFilter.Q.value = 1.1;

  const bandPass = context.createBiquadFilter();
  bandPass.type = "bandpass";
  bandPass.frequency.value = 1850;
  bandPass.Q.value = 1.4;

  osc.connect(bandPass);
  shimmer.connect(bandPass);
  click.connect(clickFilter);
  clickFilter.connect(bandPass);
  bandPass.connect(gain);
  gain.connect(context.destination);

  osc.start(now);
  shimmer.start(now);
  click.start(now);
  osc.stop(now + 0.14);
  shimmer.stop(now + 0.12);
  click.stop(now + 0.012);
}

function triggerDamageOverlay() {
  if (!damageOverlayEl) {
    return;
  }

  if (damageOverlayTimeout) {
    clearTimeout(damageOverlayTimeout);
  }

  damageOverlayEl.style.opacity = "0.85";
  damageOverlayTimeout = setTimeout(() => {
    damageOverlayEl.style.opacity = "0";
    damageOverlayTimeout = null;
  }, 170);
}

function updateAmmoHud() {
  if (!ammoHudEl) {
    return;
  }

  if (reloadOverlayEl) {
    reloadOverlayEl.style.display = isReloading ? "block" : "none";
  }

  if (ammoHudEl) {
    ammoHudEl.style.color = ammoInMagazine <= 10 ? "#ff4d4d" : "#ffffff";
  }

  ammoHudEl.textContent = isReloading
    ? `RECH...\n${ammoInMagazine}/${MAGAZINE_SIZE}`
    : `${ammoInMagazine}/${MAGAZINE_SIZE}`;
}

updateAmmoHud();

function updateHealthHud() {
  if (healthFillEl) {
    const healthRatio = MathUtils.clamp(playerHealth / PLAYER_MAX_HEALTH, 0, 1);
    healthFillEl.style.width = `${healthRatio * 100}%`;
  }

  if (healthTextEl) {
    healthTextEl.textContent = `${Math.max(0, Math.ceil(playerHealth))}/${PLAYER_MAX_HEALTH} | VIES ${extraLives}`;
  }
}

function updateWaveHud() {
  if (!wavePanelContext || !wavePanelMesh) {
    return;
  }

  const isVisible = zombieModeActive && !gameOverActive && !upgradeMenuActive;
  wavePanelMesh.visible = isVisible;
  if (!isVisible) {
    return;
  }

  wavePanelContext.clearRect(
    0,
    0,
    wavePanelCanvas.width,
    wavePanelCanvas.height,
  );
  wavePanelContext.fillStyle = "#ffffff";
  wavePanelContext.font = "700 30px monospace";
  wavePanelContext.textAlign = "right";
  wavePanelContext.textBaseline = "top";
  wavePanelContext.fillText(
    `VAGUE ${currentWave}`,
    wavePanelCanvas.width - 8,
    6,
  );
  wavePanelContext.fillText(
    `ZOMBIES ${zombies.length}`,
    wavePanelCanvas.width - 8,
    52,
  );

  wavePanelTexture.needsUpdate = true;
}

function getPlayerSnapshot() {
  return {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    yaw,
    pitch,
    health: playerHealth,
    ammo: ammoInMagazine,
    isReloading,
  };
}

function updateRemotePlayerProxy(snapshot) {
  if (!snapshot || !remotePlayerProxy) {
    return;
  }

  coopState.remotePlayer.x = snapshot.x;
  coopState.remotePlayer.y = snapshot.y;
  coopState.remotePlayer.z = snapshot.z;
  coopState.remotePlayer.yaw = snapshot.yaw || 0;
  coopState.remotePlayer.pitch = snapshot.pitch || 0;
  coopState.remotePlayer.health =
    snapshot.health ?? coopState.remotePlayer.health;
  coopState.remotePlayer.ammo = snapshot.ammo ?? coopState.remotePlayer.ammo;

  remotePlayerProxy.visible = true;
  const remoteBodyY = snapshot.y - groundY + REMOTE_PLAYER_BODY_HALF_HEIGHT;
  remotePlayerProxy.position.set(snapshot.x, remoteBodyY, snapshot.z);
  remotePlayerProxy.rotation.y = snapshot.yaw || 0;
}

function getZombiePrimaryTarget(zombie) {
  const localTarget = {
    x: player.position.x,
    y: player.position.y,
    z: player.position.z,
    isRemote: false,
  };

  if (
    !coopState.active ||
    coopState.role !== "host" ||
    !remotePlayerProxy.visible
  ) {
    return localTarget;
  }

  const remoteTarget = {
    x: coopState.remotePlayer.x,
    y: coopState.remotePlayer.y,
    z: coopState.remotePlayer.z,
    isRemote: true,
  };

  const localDistSq =
    (localTarget.x - zombie.mesh.position.x) ** 2 +
    (localTarget.z - zombie.mesh.position.z) ** 2;
  const remoteDistSq =
    (remoteTarget.x - zombie.mesh.position.x) ** 2 +
    (remoteTarget.z - zombie.mesh.position.z) ** 2;

  return remoteDistSq < localDistSq ? remoteTarget : localTarget;
}

function upsertZombieFromSnapshot(zombieSnapshot) {
  const networkId = zombieSnapshot.id;
  let zombie = zombies.find((item) => item.networkId === networkId);

  if (!zombie) {
    zombie = createZombie(
      new Vector3(zombieSnapshot.x, zombieSnapshot.y, zombieSnapshot.z),
      Math.max(1, currentWave || 1),
      {
        networkId,
        variant: zombieSnapshot.variant,
        suppressSound: true,
      },
    );
  }

  zombie.mesh.position.set(
    zombieSnapshot.x,
    zombieSnapshot.y,
    zombieSnapshot.z,
  );
  zombie.mesh.position.y = zombieSnapshot.y;
  zombie.health = zombieSnapshot.health;
  zombie.variant = zombieSnapshot.variant || zombie.variant;
  zombie.contactCooldown = zombieSnapshot.contactCooldown || 0;
}

function findZombieByNetworkId(id) {
  if (!id) {
    return null;
  }
  return zombies.find((item) => item.networkId === id) || null;
}

function applyServerZombieDamage(zombieId, health) {
  const zombie = findZombieByNetworkId(zombieId);
  if (!zombie) {
    return;
  }

  zombie.health = Math.max(0, Number(health) || 0);
  if (zombie.health <= 0) {
    removeZombie(zombie);
  } else {
    updateWaveHud();
  }
}

function applyServerZombieKill(zombieId) {
  const zombie = findZombieByNetworkId(zombieId);
  if (!zombie) {
    return;
  }
  removeZombie(zombie);
}

function applyCoopSnapshot(snapshot) {
  if (!snapshot) {
    return;
  }

  if (snapshot.players && typeof snapshot.players === "object") {
    const localPlayerSnapshot = snapshot.players[coopState.role];
    if (
      localPlayerSnapshot &&
      Number.isFinite(Number(localPlayerSnapshot.health))
    ) {
      playerHealth = Math.max(0, Number(localPlayerSnapshot.health));
      updateHealthHud();
    }
    const remoteRole = coopState.role === "host" ? "guest" : "host";
    updateRemotePlayerProxy(snapshot.players[remoteRole]);
  } else {
    updateRemotePlayerProxy(snapshot.player);
  }

  if (Array.isArray(snapshot.zombies)) {
    for (const zombieSnapshot of snapshot.zombies) {
      upsertZombieFromSnapshot(zombieSnapshot);
    }

    for (let i = zombies.length - 1; i >= 0; i -= 1) {
      const zombie = zombies[i];
      const hasRemote = snapshot.zombies.some(
        (item) => item.id === zombie.networkId,
      );
      if (!hasRemote) {
        removeZombie(zombie);
      }
    }
  }

  if (typeof snapshot.currentWave === "number") {
    currentWave = snapshot.currentWave;
  }

  if (typeof snapshot.nextWaveTimer === "number") {
    nextWaveTimer = snapshot.nextWaveTimer;
  }

  if (snapshot.gameOverActive === true) {
    triggerGameOver(false);
  }

  if (typeof snapshot.upgradeMenuActive === "boolean") {
    upgradeMenuActive = snapshot.upgradeMenuActive;
  }

  updateWaveHud();
}

function sendCoopSnapshot() {
  if (!isCoopRoomLinked() || !coopClient.isConnected()) {
    return;
  }

  const now = Date.now();
  if (now - coopState.lastSentAt < 90) {
    return;
  }

  coopState.lastSentAt = now;
  coopClient.sendSnapshot({
    role: coopState.role,
    player: getPlayerSnapshot(),
  });
}

function renderUpgradeMenu(cards, waveIndex) {
  if (!upgradeCardGridEl) {
    return;
  }

  upgradeCardGridEl.innerHTML = "";

  for (const card of cards) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.upgradeId = card.id;
    button.style.cssText = `
      appearance:none;
      border:1px solid #4a4f57;
      border-radius:8px;
      padding:14px 14px 12px;
      text-align:left;
      cursor:pointer;
      color:#f1f1f1;
      background:#1a1d22;
      box-shadow:none;
      transform:translateY(8px);
      opacity:0;
      transition:transform 0.16s ease, border-color 0.16s ease, opacity 0.16s ease;
      min-height:220px;
      display:flex;
      flex-direction:column;
      gap:8px;
    `;

    button.innerHTML = `
      <div style="font:700 12px/1 monospace; letter-spacing:1px; color:rgb(${card.color[0]}, ${card.color[1]}, ${card.color[2]});">CARTE</div>
      <div style="font:700 22px/1.05 monospace; letter-spacing:0.2px;">${card.title}</div>
      <div style="font:400 13px/1.35 monospace; color:#c9c9c9;">${card.subtitle}</div>
      <div style="margin-top:auto; font:400 12px/1.4 monospace; color:#aab0b7;">${card.detail}</div>
      <div style="margin-top:8px; display:inline-flex; align-self:flex-start; padding:5px 8px; border:1px solid #5a6068; border-radius:4px; font:700 10px/1 monospace; letter-spacing:0.5px; color:#e7e7e7;">CHOISIR</div>
    `;

    button.addEventListener("mouseenter", () => {
      button.style.transform = "translateY(-1px)";
      button.style.borderColor = `rgb(${card.color[0]}, ${card.color[1]}, ${card.color[2]})`;
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.borderColor = "#4a4f57";
    });

    button.addEventListener("click", () => {
      if (!upgradeMenuActive) {
        return;
      }

      if (coopState.active) {
        coopState.selectedCardId = card.id;
        setCoopStatus("Carte choisie. Attente de l'autre joueur...");
        coopClient.choosePauseCard(card.id);
        button.style.borderColor = `rgb(${card.color[0]}, ${card.color[1]}, ${card.color[2]})`;
        button.style.transform = "translateY(-1px)";
        return;
      }

      const waveToStart = pendingWaveToStart;
      card.apply();
      closeUpgradeMenu();
      updateAmmoHud();
      updateHealthHud();
      updateWaveHud();
      if (waveToStart > 0) {
        startWave(waveToStart);
      }
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    });

    upgradeCardGridEl.appendChild(button);
    setTimeout(
      () => {
        button.style.opacity = "1";
        button.style.transform = "translateY(0)";
      },
      30 + Math.random() * 120,
    );
  }

  const panel = upgradeMenuEl.querySelector("#upgrade-menu-panel");
  if (panel) {
    const titleEl = panel.querySelector("div:nth-child(2)");
    if (titleEl) {
      titleEl.textContent = `CHOISIS UNE CARTE - FIN DE LA MANCHE ${waveIndex}`;
    }
  }
}

function openUpgradeMenu(nextWaveIndex, fromNetwork = false) {
  if (upgradeMenuActive) {
    return;
  }

  upgradeMenuActive = true;
  pendingWaveToStart = nextWaveIndex;
  nextWaveTimer = 0;
  leftMouseHeld = false;
  holdShotCount = 0;

  if (document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock();
  }

  if (coopState.active && coopState.role === "host" && !fromNetwork) {
    coopState.pauseOpen = true;
    coopState.pauseDeadlineAt = Date.now() + 10_000;
    coopClient.openPauseMenu();
  }

  const cards = shuffleArray(upgradeCatalog).slice(0, 3);
  renderUpgradeMenu(cards, currentWave);
  upgradeMenuEl.style.display = "flex";
  updateWaveHud();
  setCoopTimer(10);
}

function closeUpgradeMenu() {
  upgradeMenuActive = false;
  pendingWaveToStart = 0;
  upgradeMenuEl.style.display = "none";
  updateWaveHud();
}

function applyUpgradeById(cardId) {
  const card = upgradeCatalogById.get(cardId);
  if (card) {
    card.apply();
  }
}

function resolveCoopPause(hostChoice, guestChoice) {
  const choices = [hostChoice, guestChoice].filter(Boolean);
  if (choices.length === 0) {
    choices.push(upgradeCatalog[0].id);
  }

  const waveToStart = pendingWaveToStart;

  for (const choice of choices) {
    applyUpgradeById(choice);
  }

  coopState.pauseOpen = false;
  coopState.selectedCardId = null;
  closeUpgradeMenu();
  updateAmmoHud();
  updateHealthHud();
  updateWaveHud();

  if (waveToStart > 0) {
    startWave(waveToStart);
  }
}

function consumeExtraLife() {
  if (extraLives <= 0) {
    return false;
  }

  extraLives -= 1;
  playerHealth = PLAYER_MAX_HEALTH;
  verticalVelocity = 0;
  isGrounded = true;
  jumpCharges = getMaxJumpCharges();
  updateHealthHud();
  return true;
}

function applyPlayerDamage(amount) {
  playerHealth = Math.max(0, playerHealth - amount);
  if (playerHealth > 0) {
    updateHealthHud();
    return;
  }

  if (consumeExtraLife()) {
    return;
  }

  updateHealthHud();
  triggerGameOver();
}

function initWavePanelInScene() {
  wavePanelMesh = new Mesh(
    new PlaneGeometry(WAVE_PANEL_WIDTH, WAVE_PANEL_HEIGHT),
    new MeshBasicMaterial({
      map: wavePanelTexture,
      transparent: true,
      depthTest: false,
    }),
  );
  wavePanelMesh.position.set(0, 0, -WAVE_PANEL_DISTANCE);
  wavePanelMesh.renderOrder = 999;
  wavePanelMesh.visible = false;
  camera.add(wavePanelMesh);
  updateWavePanelAnchor();
  updateWaveHud();
}

function updateWavePanelAnchor() {
  if (!wavePanelMesh) {
    return;
  }

  const distance = WAVE_PANEL_DISTANCE;
  const halfHeight = Math.tan(MathUtils.degToRad(camera.fov * 0.5)) * distance;
  const halfWidth = halfHeight * camera.aspect;
  const marginX = halfWidth * 0.03;
  const marginY = halfHeight * 0.04;

  wavePanelMesh.position.set(
    halfWidth - WAVE_PANEL_WIDTH / 2 - marginX,
    halfHeight - WAVE_PANEL_HEIGHT / 2 - marginY,
    -distance,
  );
}

function spawnBloodBurst(position, directionHint = null) {
  const bloodPieces = [];
  const bloodCount = 8;

  for (let i = 0; i < bloodCount; i += 1) {
    const blood = new Mesh(
      new SphereGeometry(0.04 + Math.random() * 0.03, 6, 6),
      new MeshBasicMaterial({
        color: 0xb31217,
        transparent: true,
        opacity: 0.95,
      }),
    );
    blood.position.copy(position);

    const sprayDirection = directionHint
      ? directionHint.clone().normalize()
      : new Vector3(
          (Math.random() - 0.5) * 2,
          0.35 + Math.random() * 0.65,
          (Math.random() - 0.5) * 2,
        );

    sprayDirection.x += (Math.random() - 0.5) * 1.8;
    sprayDirection.y += Math.random() * 0.8;
    sprayDirection.z += (Math.random() - 0.5) * 1.8;
    sprayDirection.normalize().multiplyScalar(0.15 + Math.random() * 0.35);

    blood.userData.velocity = sprayDirection;
    blood.userData.life = 0;
    blood.userData.maxLife = 0.22 + Math.random() * 0.16;
    scene.add(blood);
    bloodPieces.push(blood);
  }

  const updateBlood = () => {
    for (let i = bloodPieces.length - 1; i >= 0; i -= 1) {
      const blood = bloodPieces[i];
      blood.userData.life += 0.016;
      blood.position.addScaledVector(blood.userData.velocity, 0.9);
      blood.userData.velocity.y -= 0.02;
      blood.material.opacity = Math.max(
        0,
        1 - blood.userData.life / blood.userData.maxLife,
      );

      if (blood.userData.life >= blood.userData.maxLife) {
        scene.remove(blood);
        blood.geometry.dispose();
        blood.material.dispose();
        bloodPieces.splice(i, 1);
      }
    }

    if (bloodPieces.length > 0) {
      requestAnimationFrame(updateBlood);
    }
  };

  requestAnimationFrame(updateBlood);
}

function updateModeButtonVisual(active) {
  if (!modeButtonMesh) {
    return;
  }

  modeButtonState =
    active === true ? "active" : active === false ? "ready" : active;
  modeButtonMesh.userData.isDisabled = modeButtonState === "disabled";

  if (modeButtonState === "active") {
    modeButtonMesh.material.color.set(0x38d96b);
    modeButtonMesh.material.emissive.set(0x0d4d23);
    modeButtonMesh.material.emissiveIntensity = 0.95;
  } else if (modeButtonState === "disabled") {
    modeButtonMesh.material.color.set(0x4d4d4d);
    modeButtonMesh.material.emissive.set(0x101010);
    modeButtonMesh.material.emissiveIntensity = 0.18;
  } else {
    modeButtonMesh.material.color.set(0xd7263d);
    modeButtonMesh.material.emissive.set(0x5b0d0d);
    modeButtonMesh.material.emissiveIntensity = 0.85;
  }

  modeButtonMesh.material.needsUpdate = true;
}

function updateCoopButtonVisual(active) {
  if (!coopButtonMesh) {
    return;
  }

  coopButtonState =
    active === true ? "active" : active === false ? "ready" : active;
  coopButtonMesh.userData.isDisabled = coopButtonState === "disabled";

  if (coopButtonState === "active") {
    coopButtonMesh.material.color.set(0x4d8cff);
    coopButtonMesh.material.emissive.set(0x18356c);
    coopButtonMesh.material.emissiveIntensity = 0.95;
  } else if (coopButtonState === "disabled") {
    coopButtonMesh.material.color.set(0x4d4d4d);
    coopButtonMesh.material.emissive.set(0x101010);
    coopButtonMesh.material.emissiveIntensity = 0.18;
  } else {
    coopButtonMesh.material.color.set(0x24435f);
    coopButtonMesh.material.emissive.set(0x12263a);
    coopButtonMesh.material.emissiveIntensity = 0.85;
  }

  coopButtonMesh.material.needsUpdate = true;
}

function refreshCoopButtonState() {
  const inRoom = Boolean(coopState.roomCode && coopState.role);
  const localRunActive =
    !coopState.active &&
    (zombieModeActive ||
      gameOverActive ||
      upgradeMenuActive ||
      currentWave > 0);

  if (inRoom || localRunActive) {
    updateCoopButtonVisual("disabled");
  } else {
    updateCoopButtonVisual("ready");
  }
}

function removeZombieFromTargets(zombieRef) {
  for (let i = shootTargets.length - 1; i >= 0; i -= 1) {
    if (shootTargets[i].userData?.zombieRef === zombieRef) {
      shootTargets.splice(i, 1);
    }
  }
}

function clearZombies() {
  for (const zombie of zombies) {
    removeZombieFromTargets(zombie);
    scene.remove(zombie.mesh);
    zombie.mesh.geometry.dispose();
    zombie.mesh.material.dispose();
  }

  zombies.length = 0;
  updateWaveHud();
}

function getZombieSpawnPosition(spawnIndex, waveIndex) {
  const side = spawnIndex % 4;
  const edgePadding = 0.9;
  const innerX = 14.6;
  const innerZ = 8.7;
  const spread = Math.min(4.5, 1.8 + waveIndex * 0.35);

  if (side === 0) {
    return new Vector3(
      -innerX,
      FLOOR_Y + ZOMBIE_CENTER_Y,
      MathUtils.clamp(
        (Math.random() - 0.5) * (16 - edgePadding),
        -innerZ,
        innerZ,
      ),
    );
  }

  if (side === 1) {
    return new Vector3(
      innerX,
      FLOOR_Y + ZOMBIE_CENTER_Y,
      MathUtils.clamp(
        (Math.random() - 0.5) * (16 - edgePadding),
        -innerZ,
        innerZ,
      ),
    );
  }

  if (side === 2) {
    return new Vector3(
      MathUtils.clamp((Math.random() - 0.5) * (28 - spread), -14.2, 14.2),
      FLOOR_Y + ZOMBIE_CENTER_Y,
      -8.95,
    );
  }

  return new Vector3(
    MathUtils.clamp((Math.random() - 0.5) * (28 - spread), -14.2, 14.2),
    FLOOR_Y + ZOMBIE_CENTER_Y,
    8.95,
  );
}

function collidesWithOtherZombiesAt(pos, minDistance = 1.0) {
  const minDistSq = minDistance * minDistance;
  for (const zombie of zombies) {
    const dx = zombie.mesh.position.x - pos.x;
    const dz = zombie.mesh.position.z - pos.z;
    if (dx * dx + dz * dz < minDistSq) {
      return true;
    }
  }
  return false;
}

function findValidZombieSpawn(baseSpawn) {
  initNavGraph();

  const candidates = [];
  const base = baseSpawn.clone();
  base.y = FLOOR_Y + ZOMBIE_CENTER_Y;
  candidates.push(base);

  for (let i = 0; i < 20; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.6 + i * 0.16;
    const candidate = new Vector3(
      MathUtils.clamp(base.x + Math.cos(angle) * radius, -15.4, 15.4),
      FLOOR_Y + ZOMBIE_CENTER_Y,
      MathUtils.clamp(base.z + Math.sin(angle) * radius, -9.6, 9.6),
    );
    candidates.push(candidate);
  }

  if (navNodes.length > 0) {
    const orderedNodes = [...navNodes]
      .map((node) => ({ node, distSq: node.distanceToSquared(base) }))
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, 24);
    for (const item of orderedNodes) {
      candidates.push(item.node.clone());
    }
  }

  for (const candidate of candidates) {
    if (
      !collidesWithWorldCenteredAt(
        candidate,
        ZOMBIE_HALF_EXTENTS,
        zombieSpawnProbeBox,
      ) &&
      !collidesWithOtherZombiesAt(candidate)
    ) {
      return candidate;
    }
  }

  return base;
}

function getZombieSpecialChance(waveIndex) {
  return Math.min(
    1,
    ZOMBIE_SPECIAL_CHANCE + Math.floor((waveIndex - 1) / 10) * 0.1,
  );
}

function pickZombieVariant(waveIndex) {
  if (Math.random() >= getZombieSpecialChance(waveIndex)) {
    return ZOMBIE_VARIANTS.base;
  }

  return Math.random() < 0.5 ? ZOMBIE_VARIANTS.dog : ZOMBIE_VARIANTS.tank;
}

function createZombie(spawnPosition, waveIndex, options = {}) {
  const variant = options.variant
    ? ZOMBIE_VARIANTS[options.variant] || ZOMBIE_VARIANTS.base
    : pickZombieVariant(waveIndex);
  const zombieMaterial = new MeshStandardMaterial({
    color: variant.bodyColor,
    roughness: 1,
    metalness: 0,
    emissive: 0x112211,
    emissiveIntensity: 0.25,
  });

  const zombieMesh = new Mesh(
    new BoxGeometry(variant.bodySize.x, variant.bodySize.y, variant.bodySize.z),
    zombieMaterial,
  );
  zombieMesh.position.y = FLOOR_Y + variant.centerY;

  const head = new Mesh(
    new SphereGeometry(variant.headRadius, 12, 10),
    new MeshStandardMaterial({
      color: variant.headColor,
      roughness: 0.95,
      metalness: 0,
      emissive: 0x0f1f12,
      emissiveIntensity: 0.2,
    }),
  );
  head.position.set(0, variant.headOffsetY, 0);
  head.userData.isZombieHead = true;
  shootTargets.push(head);
  zombieMesh.add(head);

  const legMaterial = new MeshStandardMaterial({
    color: variant.legColor,
    roughness: 1,
    metalness: 0,
  });
  const leftLeg = new Mesh(
    new BoxGeometry(0.18, variant.legHeight, 0.18),
    legMaterial,
  );
  leftLeg.position.set(-0.15, variant.legOffsetY, 0);
  zombieMesh.add(leftLeg);

  const rightLeg = new Mesh(
    new BoxGeometry(0.18, variant.legHeight, 0.18),
    legMaterial.clone(),
  );
  rightLeg.position.set(0.15, variant.legOffsetY, 0);
  zombieMesh.add(rightLeg);

  zombieMesh.position.copy(spawnPosition);
  zombieMesh.position.y = FLOOR_Y + variant.centerY;
  zombieMesh.userData.isZombie = true;
  scene.add(zombieMesh);
  shootTargets.push(zombieMesh);

  const waveSpeed = ZOMBIE_BASE_SPEED + (waveIndex - 1) * ZOMBIE_SPEED_PER_WAVE;
  const zombieState = {
    mesh: zombieMesh,
    networkId:
      options.networkId || `z-${Math.random().toString(36).slice(2, 10)}`,
    variant: variant.key,
    halfExtents: variant.halfExtents.clone(),
    centerY: variant.centerY,
    box: new Box3(),
    speed: waveSpeed * variant.speedMultiplier,
    contactCooldown: 0,
    health: variant.health,
    contactDamage: variant.damage,
    contactRange: variant.contactRange,
    turnSign: Math.random() > 0.5 ? 1 : -1,
    blockedTimer: 0,
    path: [],
    pathIndex: 0,
    repathTimer: 0,
  };

  zombieMesh.userData.zombieRef = zombieState;
  head.userData.zombieRef = zombieState;
  zombies.push(zombieState);

  if (!options.suppressSound) {
    playZombieSound(false);
  }

  return zombieState;
}

function startWave(waveIndex) {
  currentWave = waveIndex;
  nextWaveTimer = 0;

  if (coopState.active) {
    updateWaveHud();
    return;
  }

  for (let i = 0; i < waveIndex; i += 1) {
    const initialSpawn = getZombieSpawnPosition(i, waveIndex);
    const safeSpawn = findValidZombieSpawn(initialSpawn);
    createZombie(safeSpawn, waveIndex);
  }

  updateWaveHud();
}

function activateZombieMode() {
  if (zombieModeActive || gameOverActive) {
    return;
  }

  if (coopState.roomCode && coopState.role && !coopState.active) {
    if (coopState.waitingForGuest) {
      setCoopStatus("Attente du 2e joueur pour lancer la coop.");
      return;
    }

    setCoopStatus("Demarrage des vagues en coop...");
    coopClient.requestStart();
    return;
  }

  zombieModeActive = true;
  currentWave = 0;
  nextWaveTimer = 0;
  refreshCoopButtonState();
  updateModeButtonVisual("disabled");
  openUpgradeMenu(1);
}

function resetRun(preservePose = false) {
  const savedPos = player.position.clone();
  const savedYaw = yaw;
  const savedPitch = pitch;

  zombieModeActive = false;
  gameOverActive = false;
  gameOverTimer = 0;
  nextWaveTimer = 0;
  currentWave = 0;
  playerHealth = PLAYER_MAX_HEALTH;
  playerDamageMultiplier = 1;
  attackSpeedMultiplier = 1;
  moveSpeedMultiplier = 1;
  bonusJumpCharges = 0;
  extraLives = 0;
  jumpCharges = getMaxJumpCharges();
  ammoInMagazine = MAGAZINE_SIZE;
  isReloading = false;
  leftMouseHeld = false;
  holdShotCount = 0;
  nextAutoShotAt = performance.now();
  nextTapShotAt = nextAutoShotAt;
  verticalVelocity = 0;
  isGrounded = true;
  if (preservePose) {
    player.position.copy(savedPos);
    yaw = savedYaw;
    pitch = savedPitch;
  } else {
    player.position.set(-13, groundY, 0);
    yaw = 0;
    pitch = 0;
  }
  player.rotation.y = yaw;
  camera.rotation.x = pitch;
  gunHolder.position.z = GUN_HOLDER_BASE.z;
  if (muzzleFlashTimeout) {
    clearTimeout(muzzleFlashTimeout);
    muzzleFlashTimeout = null;
  }
  muzzleFlash.material.opacity = 0;
  clearZombies();
  if (remotePlayerProxy) {
    remotePlayerProxy.visible = false;
    remotePlayerProxy.position.set(0, -1000, 0);
  }
  updateModeButtonVisual("ready");
  if (gameOverOverlayEl) {
    gameOverOverlayEl.style.display = "none";
  }
  closeUpgradeMenu();
  refreshCoopButtonState();
  updateAmmoHud();
  updateHealthHud();
  updateWaveHud();
}

function triggerGameOver(notifyServer = true) {
  if (gameOverActive) {
    return;
  }

  closeUpgradeMenu();
  gameOverActive = true;
  zombieModeActive = false;
  leftMouseHeld = false;
  holdShotCount = 0;
  gameOverTimer = GAME_OVER_DELAY;
  if (gameOverOverlayEl) {
    gameOverOverlayEl.style.display = "block";
  }

  refreshCoopButtonState();

  if (notifyServer && coopState.active && coopClient.isConnected()) {
    coopClient.sendGameOver();
  }

  updateWaveHud();
}

function removeZombie(zombie) {
  removeZombieFromTargets(zombie);
  scene.remove(zombie.mesh);

  zombie.mesh.traverse((child) => {
    if (!child.isMesh) {
      return;
    }
    child.geometry?.dispose();
    if (Array.isArray(child.material)) {
      for (const mat of child.material) {
        mat?.dispose();
      }
    } else {
      child.material?.dispose();
    }
  });

  const zombieIndex = zombies.indexOf(zombie);
  if (zombieIndex !== -1) {
    zombies.splice(zombieIndex, 1);
  }

  updateWaveHud();
}

function collidesWithWorldAt(pos, halfExtents, box) {
  const center = new Vector3(pos.x, pos.y - halfExtents.y, pos.z);
  box.set(center.clone().sub(halfExtents), center.clone().add(halfExtents));

  for (const worldBox of worldColliders) {
    if (box.intersectsBox(worldBox)) {
      return true;
    }
  }

  return false;
}

function collidesWithWorldCenteredAt(pos, halfExtents, box) {
  box.set(pos.clone().sub(halfExtents), pos.clone().add(halfExtents));

  for (const worldBox of worldColliders) {
    if (box.intersectsBox(worldBox)) {
      return true;
    }
  }

  return false;
}

function isNavSegmentWalkable(from, to) {
  const distance = from.distanceTo(to);
  const steps = Math.max(2, Math.ceil(distance / 0.35));

  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const probe = from.clone().lerp(to, t);
    if (collidesWithWorldCenteredAt(probe, navProbeHalfExtents, navProbeBox)) {
      return false;
    }
  }

  return true;
}

function initNavGraph() {
  if (navGraphReady) {
    return;
  }

  navNodes.length = 0;
  navLinks.length = 0;

  const minX = -15.5;
  const maxX = 15.5;
  const minZ = -9.8;
  const maxZ = 9.8;
  const gridStep = 1.5;

  for (let x = minX; x <= maxX; x += gridStep) {
    for (let z = minZ; z <= maxZ; z += gridStep) {
      const point = new Vector3(x, FLOOR_Y + ZOMBIE_CENTER_Y, z);
      if (
        !collidesWithWorldCenteredAt(point, navProbeHalfExtents, navProbeBox)
      ) {
        navNodes.push(point);
      }
    }
  }

  for (let i = 0; i < navNodes.length; i += 1) {
    navLinks[i] = [];
  }

  for (let i = 0; i < navNodes.length; i += 1) {
    for (let j = i + 1; j < navNodes.length; j += 1) {
      const distance = navNodes[i].distanceTo(navNodes[j]);
      if (distance > 3.2) {
        continue;
      }

      if (!isNavSegmentWalkable(navNodes[i], navNodes[j])) {
        continue;
      }

      navLinks[i].push(j);
      navLinks[j].push(i);
    }
  }

  navGraphReady = true;
}

function findClosestNavNodeIndex(pos) {
  if (navNodes.length === 0) {
    return -1;
  }

  let bestIndex = 0;
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (let i = 0; i < navNodes.length; i += 1) {
    const dx = navNodes[i].x - pos.x;
    const dz = navNodes[i].z - pos.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function findNavPath(startIndex, endIndex) {
  if (startIndex < 0 || endIndex < 0 || startIndex === endIndex) {
    return [];
  }

  const queue = [startIndex];
  const visited = new Set([startIndex]);
  const parent = new Map();

  while (queue.length > 0) {
    const node = queue.shift();
    if (node === endIndex) {
      break;
    }

    for (const next of navLinks[node]) {
      if (visited.has(next)) {
        continue;
      }
      visited.add(next);
      parent.set(next, node);
      queue.push(next);
    }
  }

  if (!visited.has(endIndex)) {
    return [];
  }

  const path = [];
  let cursor = endIndex;
  while (cursor !== startIndex) {
    path.push(cursor);
    cursor = parent.get(cursor);
  }
  path.reverse();
  return path;
}

function updateZombie(zombie, dt) {
  zombie.mesh.position.y = FLOOR_Y + zombie.centerY;

  initNavGraph();

  const primaryTarget = getZombiePrimaryTarget(zombie);

  const toPlayer = new Vector3(
    primaryTarget.x - zombie.mesh.position.x,
    0,
    primaryTarget.z - zombie.mesh.position.z,
  );
  const playerDistance = toPlayer.length();

  zombie.repathTimer -= dt;
  if (zombie.repathTimer <= 0) {
    zombie.repathTimer = 0.35 + Math.random() * 0.15;
    const startNode = findClosestNavNodeIndex(zombie.mesh.position);
    const endNode = findClosestNavNodeIndex(
      new Vector3(primaryTarget.x, FLOOR_Y + zombie.centerY, primaryTarget.z),
    );
    zombie.path = findNavPath(startNode, endNode);
    zombie.pathIndex = 0;
  }

  let targetPos = new Vector3(
    primaryTarget.x,
    FLOOR_Y + zombie.centerY,
    primaryTarget.z,
  );
  if (zombie.path.length > 0 && zombie.pathIndex < zombie.path.length) {
    const currentNodeIndex = zombie.path[zombie.pathIndex];
    const nodePos = navNodes[currentNodeIndex];
    const nodeDistance = zombie.mesh.position.distanceTo(nodePos);
    if (nodeDistance < 0.8 && zombie.pathIndex < zombie.path.length - 1) {
      zombie.pathIndex += 1;
    }
    targetPos = navNodes[zombie.path[zombie.pathIndex]];
  }

  const toTarget = new Vector3(
    targetPos.x - zombie.mesh.position.x,
    0,
    targetPos.z - zombie.mesh.position.z,
  );
  const targetDistance = toTarget.length();

  if (targetDistance > 0.001) {
    toTarget.normalize();
    const baseStep = zombie.speed * dt;
    const turn = zombie.turnSign;
    const steerAngles = [
      0,
      (turn * Math.PI) / 6,
      (-turn * Math.PI) / 6,
      (turn * Math.PI) / 3,
      (-turn * Math.PI) / 3,
      (turn * Math.PI) / 2,
      (-turn * Math.PI) / 2,
      Math.PI,
    ];
    const stepScales = [1, 0.75, 0.5];

    let bestCandidate = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const angle of steerAngles) {
      const steerDir = toTarget.clone().applyAxisAngle(worldUp, angle);

      for (const scale of stepScales) {
        const tryPos = zombie.mesh.position
          .clone()
          .addScaledVector(steerDir, baseStep * scale);

        if (
          collidesWithWorldCenteredAt(tryPos, zombie.halfExtents, zombie.box)
        ) {
          continue;
        }

        const toTargetAfter = new Vector3(
          targetPos.x - tryPos.x,
          0,
          targetPos.z - tryPos.z,
        );
        const score = toTargetAfter.lengthSq() + Math.abs(angle) * 0.35;

        if (score < bestScore) {
          bestScore = score;
          bestCandidate = tryPos;
        }
      }
    }

    if (bestCandidate) {
      zombie.mesh.position.copy(bestCandidate);
      zombie.blockedTimer = Math.max(0, zombie.blockedTimer - dt * 2);
    } else {
      zombie.blockedTimer += dt;
      if (zombie.blockedTimer > 0.22) {
        zombie.turnSign *= -1;
        zombie.blockedTimer = 0;
      }
    }

    zombie.mesh.rotation.y = Math.atan2(
      primaryTarget.x - zombie.mesh.position.x,
      primaryTarget.z - zombie.mesh.position.z,
    );
  }

  zombie.contactCooldown = Math.max(0, zombie.contactCooldown - dt);
  if (playerDistance <= zombie.contactRange && zombie.contactCooldown <= 0) {
    if (
      primaryTarget.isRemote &&
      coopState.active &&
      coopState.role === "host"
    ) {
      coopClient.sendRemoteDamage(zombie.contactDamage);
    } else {
      applyPlayerDamage(zombie.contactDamage);
      triggerDamageOverlay();
      updateHealthHud();
    }
    zombie.contactCooldown = ZOMBIE_CONTACT_COOLDOWN;
    playZombieSound(true);
  }
}

function updateZombieWaves(dt) {
  if (!zombieModeActive || gameOverActive || upgradeMenuActive) {
    return;
  }

  if (coopState.active) {
    return;
  }

  if (coopState.active && coopState.role === "guest") {
    const snapshotStaleMs = Date.now() - (coopState.lastSnapshotAt || 0);
    if (snapshotStaleMs < 1200) {
      return;
    }
  }

  if (zombies.length > 0) {
    nextWaveTimer = 0;
    return;
  }

  if (nextWaveTimer <= 0) {
    nextWaveTimer = WAVE_CLEAR_DELAY;
    return;
  }

  nextWaveTimer -= dt;
  if (nextWaveTimer <= 0) {
    if (currentWave > 0 && currentWave % 5 === 0) {
      openUpgradeMenu(currentWave + 1);
    } else {
      startWave(currentWave + 1);
    }
  }
}

function updateZombies(dt) {
  if (!zombieModeActive || gameOverActive) {
    return;
  }

  if (coopState.active) {
    return;
  }

  for (const zombie of [...zombies]) {
    updateZombie(zombie, dt);
  }
}

resetRun();

function updatePlayerBox(pos) {
  const center = new Vector3(pos.x, pos.y - 0.8, pos.z);
  playerBox.set(
    center.clone().sub(playerHalfExtents),
    center.clone().add(playerHalfExtents),
  );
}

function collidesAt(pos) {
  updatePlayerBox(pos);
  for (const box of worldColliders) {
    if (playerBox.intersectsBox(box)) {
      return true;
    }
  }
  return false;
}

function shoot(spreadX = 0, spreadY = 0) {
  const origin = new Vector3();
  playShotSound();
  triggerMuzzleFlash();
  getCrosshairAimNdc(aimFromCrosshairNdc);
  shotAimNdc.x = MathUtils.clamp(aimFromCrosshairNdc.x + spreadX, -1, 1);
  shotAimNdc.y = MathUtils.clamp(aimFromCrosshairNdc.y + spreadY, -1, 1);
  raycaster.setFromCamera(shotAimNdc, camera);
  origin.copy(raycaster.ray.origin);
  muzzleAnchor.getWorldPosition(muzzleWorld);

  if (coopState.active && coopState.role === "guest") {
    coopClient.sendShot({
      origin: [origin.x, origin.y, origin.z],
      direction: [
        raycaster.ray.direction.x,
        raycaster.ray.direction.y,
        raycaster.ray.direction.z,
      ],
      spreadX,
      spreadY,
      player: getPlayerSnapshot(),
    });
  }

  const hits = raycaster.intersectObjects(shootTargets, false);
  if (hits.length > 0) {
    const hit = hits[0];
    const hitObject = hit.object;

    if (modeButtonState === "ready" && hitObject === modeButtonMesh) {
      activateZombieMode();
    } else if (hitObject === coopButtonMesh && coopButtonState === "ready") {
      openCoopMenu();
    } else if (hitObject.userData?.zombieRef) {
      const zombieRef = hitObject.userData.zombieRef;
      if (zombieRef) {
        spawnBloodBurst(
          hit.point.clone(),
          hit.face?.normal?.clone().transformDirection(hitObject.matrixWorld) ??
            null,
        );
        const isHeadshot = hitObject.userData?.isZombieHead === true;
        const dealtDamage =
          (isHeadshot ? HEADSHOT_MULTIPLIER : 1) * playerDamageMultiplier;

        if (coopState.active) {
          coopClient.sendZombieHit(zombieRef.networkId, dealtDamage);
        } else {
          zombieRef.health -= dealtDamage;
        }

        if (isHeadshot) {
          playHeadshotBell();
        }

        if (!coopState.active) {
          if (zombieRef.health <= 0) {
            removeZombie(zombieRef);
          } else {
            updateWaveHud();
          }
        }
      }
    }

    const impact = new Mesh(
      new SphereGeometry(0.08, 8, 8),
      new MeshStandardMaterial({
        color: 0xfff176,
        emissive: 0xffd54f,
        emissiveIntensity: 0.8,
      }),
    );
    impact.position.copy(hit.point);
    scene.add(impact);
    setTimeout(() => scene.remove(impact), 120);
  }

  gunHolder.position.z = GUN_HOLDER_BASE.z + 0.04;
  setTimeout(() => {
    gunHolder.position.z = GUN_HOLDER_BASE.z;
  }, 50);
}

function applyRemoteShot(shot) {
  if (!shot || !Array.isArray(shot.origin) || !Array.isArray(shot.direction)) {
    return;
  }

  const shotOrigin = new Vector3(
    shot.origin[0],
    shot.origin[1],
    shot.origin[2],
  );
  const shotDirection = new Vector3(
    shot.direction[0],
    shot.direction[1],
    shot.direction[2],
  ).normalize();
  raycaster.ray.origin.copy(shotOrigin);
  raycaster.ray.direction.copy(shotDirection);

  const hits = raycaster.intersectObjects(shootTargets, false);
  if (hits.length === 0) {
    return;
  }

  const hit = hits[0];
  if (hit.object?.userData?.zombieRef) {
    const zombieRef = hit.object.userData.zombieRef;
    spawnBloodBurst(
      hit.point.clone(),
      hit.face?.normal?.clone().transformDirection(hit.object.matrixWorld) ??
        null,
    );
    if (coopState.active) {
      coopClient.sendZombieHit(zombieRef.networkId, 1);
    } else {
      zombieRef.health -= 1;
      if (zombieRef.health <= 0) {
        removeZombie(zombieRef);
      } else {
        updateWaveHud();
      }
    }
  }
}

function startReload() {
  if (isReloading || ammoInMagazine === MAGAZINE_SIZE) {
    return;
  }

  isReloading = true;
  playReloadSound();
  holdShotCount = 0;
  nextAutoShotAt = performance.now() + RELOAD_DURATION_MS;
  nextTapShotAt = nextAutoShotAt;
  updateAmmoHud();

  setTimeout(() => {
    ammoInMagazine = MAGAZINE_SIZE;
    isReloading = false;
    holdShotCount = 0;
    nextAutoShotAt = performance.now();
    nextTapShotAt = nextAutoShotAt;
    updateAmmoHud();
  }, RELOAD_DURATION_MS);
}

function attemptFire() {
  if (isReloading) {
    return;
  }

  if (ammoInMagazine <= 0) {
    startReload();
    return;
  }

  const spread = getSpreadOffsetForShot(holdShotCount);
  shoot(spread.x, spread.y);
  ammoInMagazine -= 1;
  updateAmmoHud();

  if (ammoInMagazine <= 0) {
    startReload();
  }
}

function getSpreadOffsetForShot(shotIndex) {
  const radius = Math.min(MAX_SPREAD_NDC, shotIndex * SPREAD_GROWTH_PER_SHOT);
  const angle = shotIndex * 2.399963229728653;
  const jitter = 0.65 + Math.random() * 0.35;

  return {
    x: Math.cos(angle) * radius * jitter,
    y: Math.sin(angle) * radius * jitter,
  };
}

document.addEventListener("keydown", (e) => {
  ensureAudioContext();

  if (upgradeMenuActive || isCoopMenuOpen()) {
    return;
  }

  if (e.code in pressed) {
    pressed[e.code] = true;
  }

  if (
    e.code === "Space" &&
    jumpCharges > 0 &&
    !isReloading &&
    !gameOverActive
  ) {
    verticalVelocity = jumpVelocity;
    isGrounded = false;
    jumpCharges -= 1;
  }

  if (e.code === "KeyR") {
    startReload();
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code in pressed) {
    pressed[e.code] = false;
  }
});

document.addEventListener("mousemove", (e) => {
  if (upgradeMenuActive || isCoopMenuOpen()) {
    return;
  }

  if (document.pointerLockElement !== renderer.domElement) {
    return;
  }

  yaw -= e.movementX * 0.0023;
  pitch -= e.movementY * 0.0023;
  pitch = MathUtils.clamp(pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);

  player.rotation.y = yaw;
  camera.rotation.x = pitch;
});

document.addEventListener("mousedown", (e) => {
  ensureAudioContext();

  if (upgradeMenuActive || isCoopMenuOpen()) {
    return;
  }

  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
    return;
  }

  if (e.button === 0) {
    leftMouseHeld = true;
  }
});

document.addEventListener("mouseup", (e) => {
  if (upgradeMenuActive || isCoopMenuOpen()) {
    return;
  }

  if (e.button === 0) {
    leftMouseHeld = false;
    holdShotCount = 0;
  }
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement !== renderer.domElement) {
    leftMouseHeld = false;
    holdShotCount = 0;
  }
});

setInterval(() => {
  sendCoopSnapshot();
}, 250);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateWavePanelAnchor();
});

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  updateAmmoHud();

  if (gameOverActive) {
    gameOverTimer -= dt;
    if (gameOverTimer <= 0) {
      resetRun(coopState.active);
      if (coopState.active) {
        setCoopStatus("Clique le bouton zombie pour relancer une partie.");
      }
    }
    updateShootingStars(dt);
    renderer.render(scene, camera);
    return;
  }

  if (upgradeMenuActive) {
    updateShootingStars(dt);
    renderer.render(scene, camera);
    return;
  }

  if (isCoopMenuOpen()) {
    updateShootingStars(dt);
    renderer.render(scene, camera);
    return;
  }

  verticalVelocity -= gravity * dt;
  player.position.y += verticalVelocity * dt;

  if (player.position.y <= groundY) {
    player.position.y = groundY;
    verticalVelocity = 0;
    isGrounded = true;
    jumpCharges = getMaxJumpCharges();
  }

  const f = Number(pressed.KeyW || pressed.KeyZ) - Number(pressed.KeyS);
  const s = Number(pressed.KeyD) - Number(pressed.KeyA || pressed.KeyQ);

  moveDir.set(0, 0, 0);
  if (f !== 0 || s !== 0) {
    forward.set(0, 0, -1).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    right.set(1, 0, 0).applyAxisAngle(new Vector3(0, 1, 0), yaw);
    moveDir.addScaledVector(forward, f);
    moveDir.addScaledVector(right, s);
    moveDir.normalize();

    const step = moveDir.clone().multiplyScalar(getMoveSpeed() * dt);
    const tryX = player.position.clone().add(new Vector3(step.x, 0, 0));
    if (!collidesAt(tryX)) {
      player.position.x = tryX.x;
    }

    const tryZ = player.position.clone().add(new Vector3(0, 0, step.z));
    if (!collidesAt(tryZ)) {
      player.position.z = tryZ.z;
    }
  }

  updateZombies(dt);
  updateZombieWaves(dt);

  if (leftMouseHeld && document.pointerLockElement === renderer.domElement) {
    const now = performance.now();
    const canTapShot = holdShotCount > 0 || now >= nextTapShotAt;
    if (now >= nextAutoShotAt && canTapShot) {
      if (holdShotCount === 0) {
        nextTapShotAt = now + getTapFireIntervalMs();
      }
      attemptFire();
      if (!isReloading) {
        holdShotCount += 1;
      }
      nextAutoShotAt = now + getAutoFireIntervalMs();
    }
  }

  updateShootingStars(dt);
  sendCoopSnapshot();

  renderer.render(scene, camera);
}

animate();
