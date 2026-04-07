const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const LOBBY_TIMEOUT_MS = 120_000;
const PAUSE_TIMEOUT_MS = 10_000;
const ROOM_CODE_LENGTH = 6;
const PLAYER_MAX_HEALTH = 100;
const SNAPSHOT_TICK_MS = 80;
const WAVE_CLEAR_DELAY_MS = 1500;

const rooms = new Map();
const sockets = new Map();
let nextSocketId = 1;
let nextZombieId = 1;

const ZOMBIE_VARIANTS = [
  {
    key: "walker",
    speed: 2.2,
    hpBase: 22,
    contactDamage: 8,
    contactRange: 1.25,
  },
  {
    key: "brute",
    speed: 1.55,
    hpBase: 40,
    contactDamage: 12,
    contactRange: 1.4,
  },
  {
    key: "sprinter",
    speed: 3.3,
    hpBase: 16,
    contactDamage: 7,
    contactRange: 1.1,
  },
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
    zombies: [],
    currentWave: 0,
    nextWaveAt: 0,
    lastTickAt: Date.now(),
  };
}

function chooseVariant() {
  const idx = Math.floor(Math.random() * ZOMBIE_VARIANTS.length);
  return ZOMBIE_VARIANTS[idx];
}

function spawnWave(room, waveIndex) {
  room.currentWave = Math.max(1, waveIndex);
  room.zombies = [];
  const count = room.currentWave;
  for (let i = 0; i < count; i += 1) {
    const variant = chooseVariant();
    const health = variant.hpBase + Math.floor(room.currentWave * 2.5);
    room.zombies.push({
      id: `z${nextZombieId++}`,
      x: randomBetween(-14.5, 14.5),
      y: 1.1,
      z: randomBetween(-8.8, 8.8),
      health,
      variant: variant.key,
      speed: variant.speed,
      contactDamage: variant.contactDamage,
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
    gameOverActive:
      room.players.host.health <= 0 || room.players.guest.health <= 0,
    upgradeMenuActive: false,
    at: Date.now(),
  };

  broadcast(room, {
    type: "snapshot",
    snapshot: room.snapshot,
  });
}

function applyZombieHit(room, zombieId, damage) {
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

function tickRoom(room, now) {
  if (!room.gameStarted) {
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

    if (distance <= zombie.contactRange && zombie.contactCooldownMs <= 0) {
      const victim = room.players[target.role];
      victim.health = Math.max(0, victim.health - zombie.contactDamage);
      zombie.contactCooldownMs = 700;

      broadcast(room, {
        type: "player_health",
        role: target.role,
        health: victim.health,
      });

      if (victim.health <= 0) {
        broadcast(room, {
          type: "coop_game_over",
          by: "server",
        });
      }
    }
  }

  if (room.zombies.length === 0) {
    if (!room.nextWaveAt) {
      room.nextWaveAt = now + WAVE_CLEAR_DELAY_MS;
    } else if (now >= room.nextWaveAt) {
      spawnWave(room, room.currentWave + 1);
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
        room.players.host.health = PLAYER_MAX_HEALTH;
        room.players.guest.health = PLAYER_MAX_HEALTH;
        room.lastTickAt = Date.now();
        spawnWave(room, 1);
      }

      const startAt = Date.now() + 250;
      broadcast(room, {
        type: "game_start",
        startAt,
        roomCode: room.code,
      });
      return;
    }

    if (message.type === "pause_open") {
      room.menuOpenAt = Date.now();
      room.menuDeadlineAt = Date.now() + PAUSE_TIMEOUT_MS;
      room.hostChoice = null;
      room.guestChoice = null;
      broadcast(room, {
        type: "pause_open",
        deadlineMs: PAUSE_TIMEOUT_MS,
      });
      return;
    }

    if (message.type === "pause_choice") {
      if (ws.coopRole === "host") {
        room.hostChoice = message.choice || null;
      } else if (ws.coopRole === "guest") {
        room.guestChoice = message.choice || null;
      }

      broadcast(room, {
        type: "pause_progress",
        hostChoice: room.hostChoice,
        guestChoice: room.guestChoice,
        deadlineAt: room.menuDeadlineAt,
      });

      if (room.hostChoice && room.guestChoice) {
        room.menuDeadlineAt = null;
        broadcast(room, {
          type: "pause_resolve",
          hostChoice: room.hostChoice,
          guestChoice: room.guestChoice,
          resolvedAt: Date.now(),
        });
      }
      return;
    }

    if (message.type === "snapshot") {
      const player = message.snapshot?.player;
      if (player && (ws.coopRole === "host" || ws.coopRole === "guest")) {
        const role = ws.coopRole;
        room.players[role] = {
          ...room.players[role],
          x: Number(player.x) || room.players[role].x,
          y: Number(player.y) || room.players[role].y,
          z: Number(player.z) || room.players[role].z,
          yaw: Number(player.yaw) || 0,
          pitch: Number(player.pitch) || 0,
          ammo: Number(player.ammo) || room.players[role].ammo,
          isReloading: Boolean(player.isReloading),
          updatedAt: Date.now(),
        };
      }
      return;
    }

    if (message.type === "zombie_hit") {
      const zombieId = String(message.zombieId || "").trim();
      const damage = Math.max(0, Number(message.damage) || 0);
      if (!zombieId || damage <= 0) {
        return;
      }
      applyZombieHit(room, zombieId, damage);
      return;
    }

    if (message.type === "shot") {
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
      if (!room.gameStarted) {
        return;
      }

      broadcast(room, {
        type: "coop_game_over",
        by: ws.coopRole || "unknown",
      });
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
      room.menuOpenAt = null;
      room.menuDeadlineAt = null;
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
