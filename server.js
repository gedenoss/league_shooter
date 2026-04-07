const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const LOBBY_TIMEOUT_MS = 120_000;
const PAUSE_TIMEOUT_MS = 10_000;
const ROOM_CODE_LENGTH = 6;

const rooms = new Map();
const sockets = new Map();
let nextSocketId = 1;

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
    zombieHealth: new Map(),
    deadZombieIds: new Set(),
    gameStarted: false,
  };
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
      const inputSnapshot = message.snapshot || {};
      const zombies = Array.isArray(inputSnapshot.zombies)
        ? inputSnapshot.zombies
        : [];

      const reconciledZombies = [];
      for (const zombie of zombies) {
        const id = zombie?.id;
        if (!id || room.deadZombieIds.has(id)) {
          continue;
        }

        const serverHealth = room.zombieHealth.get(id);
        const clientHealth = Number(zombie.health);
        const health = Number.isFinite(serverHealth)
          ? Math.min(serverHealth, clientHealth)
          : clientHealth;

        room.zombieHealth.set(id, health);
        reconciledZombies.push({ ...zombie, health });
      }

      room.snapshot = {
        ...inputSnapshot,
        zombies: reconciledZombies,
        from: ws.coopRole,
        at: Date.now(),
      };
      if (ws.coopRole === "host") {
        send(room.guestSocket, { type: "snapshot", snapshot: room.snapshot });
      } else {
        send(room.hostSocket, { type: "guest_state", snapshot: room.snapshot });
      }
      return;
    }

    if (message.type === "zombie_hit") {
      const zombieId = String(message.zombieId || "").trim();
      const damage = Math.max(0, Number(message.damage) || 0);
      if (!zombieId || damage <= 0 || room.deadZombieIds.has(zombieId)) {
        return;
      }

      const currentHealth = Number(room.zombieHealth.get(zombieId));
      if (!Number.isFinite(currentHealth)) {
        return;
      }

      const nextHealth = currentHealth - damage;
      if (nextHealth <= 0) {
        room.deadZombieIds.add(zombieId);
        room.zombieHealth.delete(zombieId);
        broadcast(room, {
          type: "zombie_killed",
          zombieId,
        });
      } else {
        room.zombieHealth.set(zombieId, nextHealth);
        broadcast(room, {
          type: "zombie_damaged",
          zombieId,
          health: nextHealth,
        });
      }
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

    if (message.type === "remote_damage") {
      if (ws.coopRole === "host") {
        send(room.guestSocket, {
          type: "remote_damage",
          amount: Number(message.amount) || 0,
        });
      }
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
  }
}, 1000);

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

const host = process.env.HOST || "0.0.0.0";
console.log(`✓ Coop server listening on ${host}:${PORT}`);
console.log(`  Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`  Rooms: ${rooms.size}, Connections: ${wss.clients.size}`);
