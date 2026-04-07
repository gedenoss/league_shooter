const { WebSocketServer } = require("ws");
const gameCoreConfig = require("./game-core-config.json");

const PORT = Number(process.env.PORT || 8080);
const LOBBY_TIMEOUT_MS = 120_000;
const PAUSE_TIMEOUT_MS = Number(gameCoreConfig.coop.pauseTimeoutMs || 10_000);
const ROOM_CODE_LENGTH = 6;
const PLAYER_MAX_HEALTH = 100;
const SNAPSHOT_TICK_MS = 80;
const WAVE_CLEAR_DELAY_MS = 1500;
const SHARED_ZOMBIE = gameCoreConfig.zombie;
const SHARED_ZOMBIE_VARIANTS = SHARED_ZOMBIE.variants;
const ZOMBIE_PLAYER_MIN_SEPARATION = SHARED_ZOMBIE.playerMinSeparation;
const ZOMBIE_BASE_SPEED = SHARED_ZOMBIE.baseSpeed;
const ZOMBIE_SPEED_PER_WAVE = SHARED_ZOMBIE.speedPerWave;
const ZOMBIE_SPECIAL_CHANCE = SHARED_ZOMBIE.specialChanceBase;

const rooms = new Map();
const sockets = new Map();
let nextSocketId = 1;
let nextZombieId = 1;

const ZOMBIE_VARIANTS = [
  {
    key: "base",
    health: SHARED_ZOMBIE_VARIANTS.base.health,
    damage: SHARED_ZOMBIE_VARIANTS.base.damage,
    contactRange: SHARED_ZOMBIE_VARIANTS.base.contactRange,
    speedMultiplier: SHARED_ZOMBIE_VARIANTS.base.speedMultiplier,
  },
  {
    key: "dog",
    health: SHARED_ZOMBIE_VARIANTS.dog.health,
    damage: SHARED_ZOMBIE_VARIANTS.dog.damage,
    contactRange: SHARED_ZOMBIE_VARIANTS.dog.contactRange,
    speedMultiplier: SHARED_ZOMBIE_VARIANTS.dog.speedMultiplier,
  },
  {
    key: "tank",
    health: SHARED_ZOMBIE_VARIANTS.tank.health,
    damage: SHARED_ZOMBIE_VARIANTS.tank.damage,
    contactRange: SHARED_ZOMBIE_VARIANTS.tank.contactRange,
    speedMultiplier: SHARED_ZOMBIE_VARIANTS.tank.speedMultiplier,
  },
];

const COOP_UPGRADE_IDS = Array.isArray(gameCoreConfig.coop.upgradeIds)
  ? gameCoreConfig.coop.upgradeIds
  : [
      "attack-speed",
      "double-jump",
      "extra-life",
      "run-speed",
      "heal-50",
      "damage-up",
    ];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createRoomCode() {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
      Math.floor(Math.random() * 10),
    ).join("");
    if (!rooms.has(code)) {
      return code;
    }
  }

  throw new Error("Unable to generate room code");
}

function makeRoom(code, hostSocket) {
  return {
    code,
    hostSocket,
    guestSocket: null,
    createdAt: Date.now(),
    menuOpenAt: null,
    menuDeadlineAt: null,
    hostReady: false,
    guestReady: false,
    hostChoice: null,
    guestChoice: null,
    pauseCards: [],
    snapshot: null,
    gameStarted: false,
    players: {
      host: {
        x: -13,
        y: 1.65,
        z: 0,
        yaw: 0,
        pitch: 0,
        health: PLAYER_MAX_HEALTH,
        ammo: 30,
        isReloading: false,
        updatedAt: Date.now(),
      },
      guest: {
        x: -13,
        y: 1.65,
        z: 0,
        yaw: 0,
        pitch: 0,
        health: PLAYER_MAX_HEALTH,
        ammo: 30,
        isReloading: false,
        updatedAt: Date.now(),
      },
    },
    playerUpgrades: {
      host: {
        extraLives: 0,
      },
      guest: {
        extraLives: 0,
      },
    },
    zombies: [],
    currentWave: 0,
    nextWaveAt: 0,
    pendingWave: 0,
    lastTickAt: Date.now(),
    gameOver: false,
  };
}

function pickPauseCards() {
  const pool = [...COOP_UPGRADE_IDS];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

function applyServerUpgrade(room, role, cardId) {
  if (!room.players[role]) {
    return;
  }

  if (cardId === "heal-50") {
    room.players[role].health = Math.min(
      PLAYER_MAX_HEALTH,
      room.players[role].health + 50,
    );
    return;
  }

  if (cardId === "extra-life") {
    room.playerUpgrades[role].extraLives += 1;
  }
}

function resolvePause(room, now) {
  const offered =
    room.pauseCards.length > 0 ? room.pauseCards : pickPauseCards();
  const fallback = offered[0] || COOP_UPGRADE_IDS[0];

  const hostChoice = offered.includes(room.hostChoice)
    ? room.hostChoice
    : fallback;
  const guestChoice = offered.includes(room.guestChoice)
    ? room.guestChoice
    : offered[1] || fallback;

  applyServerUpgrade(room, "host", hostChoice);
  applyServerUpgrade(room, "guest", guestChoice);

  const waveToStart = room.pendingWave;
  room.menuOpenAt = null;
  room.menuDeadlineAt = null;
  room.hostChoice = null;
  room.guestChoice = null;
  room.pauseCards = [];
  room.pendingWave = 0;

  broadcast(room, {
    type: "pause_resolve",
    hostChoice,
    guestChoice,
    resolvedAt: now,
  });

  send(room.hostSocket, {
    type: "player_health",
    role: "host",
    health: room.players.host.health,
  });
  send(room.guestSocket, {
    type: "player_health",
    role: "guest",
    health: room.players.guest.health,
  });

  if (waveToStart > 0) {
    spawnWave(room, waveToStart);
  }
}

function openPauseForWave(room, nextWave, now) {
  room.pendingWave = Math.max(1, Number(nextWave) || 1);
  room.menuOpenAt = now;
  room.menuDeadlineAt = now + PAUSE_TIMEOUT_MS;
  room.hostChoice = null;
  room.guestChoice = null;
  room.pauseCards = pickPauseCards();

  broadcast(room, {
    type: "pause_open",
    deadlineMs: PAUSE_TIMEOUT_MS,
    deadlineAt: room.menuDeadlineAt,
    nextWave: room.pendingWave,
    cards: room.pauseCards,
  });
}

function toFiniteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getZombieSpecialChance(waveIndex) {
  return Math.min(
    1,
    ZOMBIE_SPECIAL_CHANCE + Math.floor((waveIndex - 1) / 10) * 0.1,
  );
}

function chooseVariant(waveIndex) {
  const base = ZOMBIE_VARIANTS[0];
  const dog = ZOMBIE_VARIANTS[1];
  const tank = ZOMBIE_VARIANTS[2];

  if (Math.random() >= getZombieSpecialChance(waveIndex)) {
    return base;
  }

  return Math.random() < 0.5 ? dog : tank;
}

function spawnWave(room, waveIndex) {
  room.currentWave = Math.max(1, waveIndex);
  room.zombies = [];
  room.pendingWave = 0;
  const count = room.currentWave;
  const waveSpeed =
    ZOMBIE_BASE_SPEED + (room.currentWave - 1) * ZOMBIE_SPEED_PER_WAVE;
  for (let i = 0; i < count; i += 1) {
    const variant = chooseVariant(room.currentWave);
    room.zombies.push({
      id: `z${nextZombieId++}`,
      x: randomBetween(-14.5, 14.5),
      y: 1.1,
      z: randomBetween(-8.8, 8.8),
      health: variant.health,
      variant: variant.key,
      speed: waveSpeed * variant.speedMultiplier,
      contactDamage: variant.damage,
      contactRange: variant.contactRange,
      contactCooldownMs: 0,
    });
  }
  room.nextWaveAt = 0;
}

function getNearestPlayer(room, zombie) {
  let bestRole = null;
  let bestPlayer = null;
  let bestDistSq = Number.POSITIVE_INFINITY;

  for (const role of ["host", "guest"]) {
    const player = room.players[role];
    if (!player || player.health <= 0) {
      continue;
    }
    const dx = player.x - zombie.x;
    const dz = player.z - zombie.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestRole = role;
      bestPlayer = player;
    }
  }

  return {
    role: bestRole,
    player: bestPlayer,
    distSq: bestDistSq,
  };
}

function broadcastSnapshot(room) {
  room.snapshot = {
    players: {
      host: room.players.host,
      guest: room.players.guest,
    },
    zombies: room.zombies.map((z) => ({
      id: z.id,
      x: z.x,
      y: z.y,
      z: z.z,
      health: z.health,
      variant: z.variant,
      contactCooldown: z.contactCooldownMs / 1000,
    })),
    currentWave: room.currentWave,
    nextWaveTimer:
      room.nextWaveAt > 0
        ? Math.max(0, (room.nextWaveAt - Date.now()) / 1000)
        : 0,
    gameOverActive: room.gameOver,
    upgradeMenuActive: false,
    at: Date.now(),
  };

  broadcast(room, {
    type: "snapshot",
    snapshot: room.snapshot,
  });
}

function applyZombieHit(room, zombieId, damage) {
  if (isRoomPaused(room)) {
    return;
  }

  const zombie = room.zombies.find((item) => item.id === zombieId);
  if (!zombie) {
    return;
  }

  zombie.health = Math.max(0, zombie.health - damage);
  if (zombie.health <= 0) {
    room.zombies = room.zombies.filter((item) => item.id !== zombieId);
    broadcast(room, {
      type: "zombie_killed",
      zombieId,
    });
    return;
  }

  broadcast(room, {
    type: "zombie_damaged",
    zombieId,
    health: zombie.health,
  });
}

function endRoomRound(room) {
  room.gameStarted = false;
  room.gameOver = false;
  room.zombies = [];
  room.currentWave = 0;
  room.nextWaveAt = 0;
  room.pendingWave = 0;
  room.menuOpenAt = null;
  room.menuDeadlineAt = null;
  room.hostChoice = null;
  room.guestChoice = null;
  room.pauseCards = [];
  room.players.host.health = PLAYER_MAX_HEALTH;
  room.players.guest.health = PLAYER_MAX_HEALTH;
  room.playerUpgrades.host.extraLives = 0;
  room.playerUpgrades.guest.extraLives = 0;
  room.lastTickAt = Date.now();
}

function tickRoom(room, now) {
  if (!room.gameStarted || room.gameOver) {
    return;
  }

  if (isRoomPaused(room)) {
    return;
  }

  const dt = Math.max(0.016, (now - room.lastTickAt) / 1000);
  room.lastTickAt = now;

  for (const zombie of room.zombies) {
    zombie.contactCooldownMs = Math.max(
      0,
      zombie.contactCooldownMs - dt * 1000,
    );

    const target = getNearestPlayer(room, zombie);
    if (!target.player || !Number.isFinite(target.distSq)) {
      continue;
    }

    const distance = Math.sqrt(target.distSq);
    if (distance > 0.0001) {
      const step = zombie.speed * dt;
      zombie.x += ((target.player.x - zombie.x) / distance) * step;
      zombie.z += ((target.player.z - zombie.z) / distance) * step;
      zombie.x = clamp(zombie.x, -15.2, 15.2);
      zombie.z = clamp(zombie.z, -9.4, 9.4);
    }

    const sepX = zombie.x - target.player.x;
    const sepZ = zombie.z - target.player.z;
    const separationDistance = Math.hypot(sepX, sepZ);
    const minSeparation = Math.max(
      ZOMBIE_PLAYER_MIN_SEPARATION,
      zombie.contactRange * 0.7,
    );
    if (separationDistance > 0.0001 && separationDistance < minSeparation) {
      const inv = 1 / separationDistance;
      zombie.x = target.player.x + sepX * inv * minSeparation;
      zombie.z = target.player.z + sepZ * inv * minSeparation;
      zombie.x = clamp(zombie.x, -15.2, 15.2);
      zombie.z = clamp(zombie.z, -9.4, 9.4);
    }

    const contactDistance = Math.hypot(
      zombie.x - target.player.x,
      zombie.z - target.player.z,
    );

    if (
      contactDistance <= zombie.contactRange &&
      zombie.contactCooldownMs <= 0
    ) {
      const victim = room.players[target.role];
      victim.health = Math.max(0, victim.health - zombie.contactDamage);
      zombie.contactCooldownMs = 700;

      if (
        victim.health <= 0 &&
        room.playerUpgrades[target.role].extraLives > 0
      ) {
        room.playerUpgrades[target.role].extraLives -= 1;
        victim.health = PLAYER_MAX_HEALTH;
      }

      broadcast(room, {
        type: "player_health",
        role: target.role,
        health: victim.health,
      });

      if (victim.health <= 0) {
        room.gameOver = true;
        broadcast(room, {
          type: "coop_game_over",
          by: "server",
        });
        endRoomRound(room);
        break;
      }
    }
  }

  if (room.zombies.length === 0) {
    if (!room.nextWaveAt) {
      room.nextWaveAt = now + WAVE_CLEAR_DELAY_MS;
    } else if (now >= room.nextWaveAt) {
      const nextWave = room.currentWave + 1;
      room.nextWaveAt = 0;

      if (nextWave % 5 === 0) {
        openPauseForWave(room, nextWave, now);
      } else {
        spawnWave(room, nextWave);
      }
    }
  }
}

function getSocketId(socket) {
  if (!sockets.has(socket)) {
    sockets.set(socket, `s${nextSocketId++}`);
  }
  return sockets.get(socket);
}

function send(socket, payload) {
  if (!socket || socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

function isRoomPaused(room) {
  return Boolean(room.menuOpenAt);
}

function broadcast(room, payload) {
  send(room.hostSocket, payload);
  send(room.guestSocket, payload);
}

function roomHasTwoPlayers(room) {
  return (
    room.hostSocket &&
    room.guestSocket &&
    room.hostSocket.readyState === 1 &&
    room.guestSocket.readyState === 1
  );
}

function closeRoom(room, reason = "room_closed") {
  broadcast(room, { type: "room_closed", reason });
  rooms.delete(room.code);
}

function attachSocketHandlers(ws) {
  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }

    if (!message || typeof message.type !== "string") {
      return;
    }

    if (message.type === "host_room") {
      const code = createRoomCode();
      const room = makeRoom(code, ws);
      rooms.set(code, room);
      ws.coopRole = "host";
      ws.roomCode = code;
      send(ws, {
        type: "room_created",
        code,
        socketId: getSocketId(ws),
        deadlineMs: LOBBY_TIMEOUT_MS,
      });
      return;
    }

    if (message.type === "join_room") {
      const code = String(message.code || "").trim();
      const room = rooms.get(code);
      if (!room || room.guestSocket || room.hostSocket.readyState !== 1) {
        send(ws, { type: "room_error", error: "ROOM_NOT_AVAILABLE" });
        return;
      }

      room.guestSocket = ws;
      room.menuOpenAt = null;
      room.menuDeadlineAt = null;
      ws.coopRole = "guest";
      ws.roomCode = code;
      ws.coopReady = false;
      // Keep host readiness if host already acknowledged lobby before guest joined.
      room.guestReady = false;
      room.hostChoice = null;
      room.guestChoice = null;
      send(ws, {
        type: "room_joined",
        code,
        socketId: getSocketId(ws),
        role: "guest",
        deadlineMs: LOBBY_TIMEOUT_MS,
      });
      send(room.hostSocket, {
        type: "guest_joined",
        code,
        socketId: getSocketId(ws),
      });
      return;
    }

    const code = ws.roomCode;
    if (!code) {
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      return;
    }

    if (message.type === "lobby_ready") {
      // Kept for backward compatibility with older clients.
      return;
    }

    if (message.type === "request_start") {
      if (
        !room.hostSocket ||
        !room.guestSocket ||
        room.hostSocket.readyState !== 1 ||
        room.guestSocket.readyState !== 1
      ) {
        send(ws, { type: "start_error", error: "WAITING_FOR_PLAYER" });
        return;
      }

      if (!room.gameStarted) {
        room.gameStarted = true;
        room.gameOver = false;
        room.players.host.health = PLAYER_MAX_HEALTH;
        room.players.guest.health = PLAYER_MAX_HEALTH;
        room.menuOpenAt = null;
        room.menuDeadlineAt = null;
        room.hostChoice = null;
        room.guestChoice = null;
        room.pauseCards = [];
        room.pendingWave = 0;
        room.playerUpgrades.host.extraLives = 0;
        room.playerUpgrades.guest.extraLives = 0;
        room.lastTickAt = Date.now();
        room.currentWave = 0;
        room.nextWaveAt = 0;
        room.zombies = [];
      }

      const startAt = Date.now() + 250;
      broadcast(room, {
        type: "game_start",
        startAt,
        roomCode: room.code,
      });
      openPauseForWave(room, 1, Date.now());
      return;
    }

    if (message.type === "pause_open") {
      room.menuOpenAt = Date.now();
      room.menuDeadlineAt = Date.now() + PAUSE_TIMEOUT_MS;
      room.hostChoice = null;
      room.guestChoice = null;
      room.pauseCards = pickPauseCards();
      room.pendingWave = Math.max(
        room.pendingWave || 0,
        Number(message.nextWave) || room.currentWave + 1,
      );
      broadcast(room, {
        type: "pause_open",
        deadlineMs: PAUSE_TIMEOUT_MS,
        deadlineAt: room.menuDeadlineAt,
        nextWave: room.pendingWave || room.currentWave + 1,
        cards: room.pauseCards,
      });
      return;
    }

    if (message.type === "pause_choice") {
      const selectedChoice = String(message.choice || "");
      const normalizedChoice = room.pauseCards.includes(selectedChoice)
        ? selectedChoice
        : null;

      if (ws.coopRole === "host") {
        room.hostChoice = normalizedChoice;
      } else if (ws.coopRole === "guest") {
        room.guestChoice = normalizedChoice;
      }

      broadcast(room, {
        type: "pause_progress",
        hostChoice: room.hostChoice,
        guestChoice: room.guestChoice,
        deadlineAt: room.menuDeadlineAt,
      });

      if (room.hostChoice && room.guestChoice) {
        resolvePause(room, Date.now());
      }
      return;
    }

    if (message.type === "snapshot") {
      const player = message.snapshot?.player;
      if (player && (ws.coopRole === "host" || ws.coopRole === "guest")) {
        const role = ws.coopRole;
        room.players[role] = {
          ...room.players[role],
          x: toFiniteNumber(player.x, room.players[role].x),
          y: toFiniteNumber(player.y, room.players[role].y),
          z: toFiniteNumber(player.z, room.players[role].z),
          yaw: toFiniteNumber(player.yaw, room.players[role].yaw),
          pitch: toFiniteNumber(player.pitch, room.players[role].pitch),
          ammo: toFiniteNumber(player.ammo, room.players[role].ammo),
          isReloading: Boolean(player.isReloading),
          updatedAt: Date.now(),
        };
      }
      return;
    }

    if (message.type === "zombie_hit") {
      if (isRoomPaused(room)) {
        return;
      }

      const zombieId = String(message.zombieId || "").trim();
      const damage = Math.max(0, Number(message.damage) || 0);
      if (!zombieId || damage <= 0) {
        return;
      }
      applyZombieHit(room, zombieId, damage);
      return;
    }

    if (message.type === "shot") {
      if (isRoomPaused(room)) {
        return;
      }

      if (ws.coopRole === "guest") {
        send(room.hostSocket, {
          type: "shot",
          shot: message.shot,
        });
      } else {
        send(room.guestSocket, {
          type: "shot",
          shot: message.shot,
        });
      }
      return;
    }

    if (message.type === "game_over") {
      if (!room.gameStarted || room.gameOver) {
        return;
      }

      room.gameOver = true;

      broadcast(room, {
        type: "coop_game_over",
        by: ws.coopRole || "unknown",
      });
      endRoomRound(room);
      return;
    }

    if (message.type === "disconnect_room") {
      closeRoom(room, "player_left");
    }
  });

  ws.on("close", () => {
    const code = ws.roomCode;
    if (!code) {
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      return;
    }

    if (room.hostSocket === ws || room.guestSocket === ws) {
      closeRoom(room, "player_left");
    }
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  getSocketId(ws);
  attachSocketHandlers(ws);
  send(ws, { type: "hello", socketId: getSocketId(ws) });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    tickRoom(room, now);

    if (
      room.gameStarted &&
      room.menuOpenAt &&
      room.menuDeadlineAt &&
      now > room.menuDeadlineAt
    ) {
      broadcast(room, {
        type: "pause_timeout",
        roomCode: code,
      });
      resolvePause(room, now);
    }

    if (now - room.createdAt > LOBBY_TIMEOUT_MS && !room.gameStarted) {
      closeRoom(room, "timeout");
    }

    if (roomHasTwoPlayers(room)) {
      broadcastSnapshot(room);
    }
  }
}, SNAPSHOT_TICK_MS);

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

const host = process.env.HOST || "0.0.0.0";
console.log(`✓ Coop server listening on ${host}:${PORT}`);
console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`  Rooms: ${rooms.size}, Connections: ${wss.clients.size}`);
