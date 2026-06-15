const { WebSocketServer } = require("ws");

const PORT = Number(process.env.PORT || 8080);
const ROOM_CODE_LENGTH = 6;
const LOBBY_TIMEOUT_MS = 120000;
const DUEL_MAX_ROUNDS = 5;
const PLAYER_MAX_HEALTH = 100;
const STATE_TICK_MS = 80;

const rooms = new Map();
const sockets = new Map();
let nextSocketId = 1;

function createRoomCode() {
  for (let i = 0; i < 1000; i += 1) {
    const code = Array.from({ length: ROOM_CODE_LENGTH }, () =>
      Math.floor(Math.random() * 10),
    ).join("");
    if (!rooms.has(code)) {
      return code;
    }
  }
  throw new Error("Unable to generate room code");
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

function makePlayerState(x, z) {
  return {
    x,
    y: 1.65,
    z,
    yaw: 0,
    pitch: 0,
    health: PLAYER_MAX_HEALTH,
    ammo: 30,
    isReloading: false,
    deaths: 0,
    updatedAt: Date.now(),
  };
}

function makeRoom(code, hostSocket) {
  return {
    code,
    createdAt: Date.now(),
    hostSocket,
    guestSocket: null,
    players: {
      host: makePlayerState(-13, -6),
      guest: makePlayerState(13, 6),
    },
    duel: {
      running: false,
      roundsPlayed: 0,
      maxRounds: DUEL_MAX_ROUNDS,
      replayVotes: {
        host: false,
        guest: false,
      },
    },
  };
}

function resetSpawn(room) {
  room.players.host.x = -13;
  room.players.host.y = 1.65;
  room.players.host.z = -6;
  room.players.host.yaw = 0;
  room.players.host.pitch = 0;
  room.players.host.health = PLAYER_MAX_HEALTH;

  room.players.guest.x = 13;
  room.players.guest.y = 1.65;
  room.players.guest.z = 6;
  room.players.guest.yaw = Math.PI;
  room.players.guest.pitch = 0;
  room.players.guest.health = PLAYER_MAX_HEALTH;
}

function buildDuelState(room) {
  return {
    roomCode: room.code,
    running: room.duel.running,
    roundsPlayed: room.duel.roundsPlayed,
    maxRounds: room.duel.maxRounds,
    players: {
      host: room.players.host,
      guest: room.players.guest,
    },
    at: Date.now(),
  };
}

function broadcastState(room) {
  broadcast(room, {
    type: "duel_state",
    state: buildDuelState(room),
  });
}

function startRound(room) {
  resetSpawn(room);
  room.duel.running = true;
  broadcast(room, {
    type: "duel_round_start",
    state: buildDuelState(room),
  });
}

function startMatch(room) {
  room.players.host.deaths = 0;
  room.players.guest.deaths = 0;
  room.duel.roundsPlayed = 0;
  room.duel.replayVotes.host = false;
  room.duel.replayVotes.guest = false;
  startRound(room);
  broadcast(room, {
    type: "duel_match_start",
    state: buildDuelState(room),
  });
}

function endMatch(room) {
  room.duel.running = false;
  const hostDeaths = room.players.host.deaths;
  const guestDeaths = room.players.guest.deaths;

  let winner = "draw";
  if (hostDeaths < guestDeaths) {
    winner = "host";
  } else if (guestDeaths < hostDeaths) {
    winner = "guest";
  }

  broadcast(room, {
    type: "duel_match_over",
    winner,
    hostDeaths,
    guestDeaths,
    maxRounds: room.duel.maxRounds,
    roomCode: room.code,
  });
}

function resolveRoundKill(room, victimRole) {
  const killerRole = victimRole === "host" ? "guest" : "host";
  room.players[victimRole].deaths += 1;
  room.duel.roundsPlayed += 1;
  room.duel.running = false;

  broadcast(room, {
    type: "duel_round_over",
    victim: victimRole,
    killer: killerRole,
    roundsPlayed: room.duel.roundsPlayed,
    maxRounds: room.duel.maxRounds,
    hostDeaths: room.players.host.deaths,
    guestDeaths: room.players.guest.deaths,
  });

  if (room.duel.roundsPlayed >= room.duel.maxRounds) {
    endMatch(room);
    return;
  }

  setTimeout(() => {
    if (!rooms.has(room.code) || !roomHasTwoPlayers(room)) {
      return;
    }
    startRound(room);
  }, 1300);
}

function closeRoom(room, reason = "room_closed") {
  broadcast(room, { type: "room_closed", reason });
  rooms.delete(room.code);
}

const MAX_SHOT_RANGE = 80;

function rayHitsPlayer(origin, direction, player) {
  const ox = origin[0], oy = origin[1], oz = origin[2];
  const dx = direction[0], dy = direction[1], dz = direction[2];
  const groundY = player.y - 1.65;

  // Body cylinder: radius 0.55, height groundY to groundY+1.4
  const rx = ox - player.x, rz = oz - player.z;
  const a = dx * dx + dz * dz;
  if (a > 0) {
    const b = 2 * (rx * dx + rz * dz);
    const c = rx * rx + rz * rz - 0.55 * 0.55;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
        if (t > 0 && t < MAX_SHOT_RANGE) {
          const hitY = oy + dy * t;
          if (hitY >= groundY && hitY <= groundY + 1.4) return { hit: true, headshot: false };
        }
      }
    }
  }

  // Head sphere: center at (player.x, groundY+1.55, player.z), radius 0.28
  const headY = groundY + 1.55;
  const hx = ox - player.x, hy = oy - headY, hz = oz - player.z;
  const a2 = dx * dx + dy * dy + dz * dz;
  if (a2 > 0) {
    const b2 = 2 * (hx * dx + hy * dy + hz * dz);
    const c2 = hx * hx + hy * hy + hz * hz - 0.28 * 0.28;
    const disc2 = b2 * b2 - 4 * a2 * c2;
    if (disc2 >= 0) {
      const t = (-b2 - Math.sqrt(disc2)) / (2 * a2);
      if (t > 0 && t < MAX_SHOT_RANGE) return { hit: true, headshot: true };
    }
  }

  return { hit: false };
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
        role: "host",
        socketId: getSocketId(ws),
      });
      return;
    }

    if (message.type === "join_room") {
      const code = String(message.code || "").trim();
      const room = rooms.get(code);
      if (!room || !room.hostSocket || room.guestSocket) {
        send(ws, { type: "room_error", error: "ROOM_NOT_AVAILABLE" });
        return;
      }

      room.guestSocket = ws;
      ws.coopRole = "guest";
      ws.roomCode = code;

      send(ws, {
        type: "room_joined",
        code,
        role: "guest",
        socketId: getSocketId(ws),
      });

      send(room.hostSocket, {
        type: "guest_joined",
        code,
        socketId: getSocketId(ws),
      });

      if (roomHasTwoPlayers(room)) {
        startMatch(room);
      }
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

    if (message.type === "request_start") {
      if (!roomHasTwoPlayers(room)) {
        send(ws, { type: "start_error", error: "WAITING_FOR_PLAYER" });
        return;
      }
      if (!room.duel.running) {
        startMatch(room);
      }
      return;
    }

    if (message.type === "snapshot") {
      const role = ws.coopRole;
      if (role !== "host" && role !== "guest") {
        return;
      }
      const snapshotPlayer = message.snapshot?.player;
      if (!snapshotPlayer) {
        return;
      }
      const player = room.players[role];
      player.x = Number.isFinite(Number(snapshotPlayer.x))
        ? Number(snapshotPlayer.x)
        : player.x;
      player.y = Number.isFinite(Number(snapshotPlayer.y))
        ? Number(snapshotPlayer.y)
        : player.y;
      player.z = Number.isFinite(Number(snapshotPlayer.z))
        ? Number(snapshotPlayer.z)
        : player.z;
      player.yaw = Number.isFinite(Number(snapshotPlayer.yaw))
        ? Number(snapshotPlayer.yaw)
        : player.yaw;
      player.pitch = Number.isFinite(Number(snapshotPlayer.pitch))
        ? Number(snapshotPlayer.pitch)
        : player.pitch;
      player.ammo = Number.isFinite(Number(snapshotPlayer.ammo))
        ? Number(snapshotPlayer.ammo)
        : player.ammo;
      player.isReloading = Boolean(snapshotPlayer.isReloading);
      player.updatedAt = Date.now();
      return;
    }

    if (message.type === "ping") {
      send(ws, { type: "pong" });
      return;
    }

    if (message.type === "shot") {
      const targetRole = ws.coopRole === "host" ? "guest" : "host";
      const targetSocket = ws.coopRole === "host" ? room.guestSocket : room.hostSocket;

      send(targetSocket, { type: "duel_shot", shot: message.shot });

      if (!room.duel.running) return;

      const shot = message.shot;
      if (!Array.isArray(shot?.origin) || !Array.isArray(shot?.direction)) return;

      const target = room.players[targetRole];
      const result = rayHitsPlayer(shot.origin, shot.direction, target);
      if (!result.hit) return;

      const damage = result.headshot ? 60 : 34;
      target.health = Math.max(0, target.health - damage);
      broadcast(room, { type: "player_health", role: targetRole, health: target.health });

      if (target.health <= 0) {
        resolveRoundKill(room, targetRole);
      }
      return;
    }

    if (message.type === "replay_ready") {
      const role = ws.coopRole;
      if (role !== "host" && role !== "guest") {
        return;
      }
      room.duel.replayVotes[role] = true;
      broadcast(room, {
        type: "duel_replay_status",
        hostReady: room.duel.replayVotes.host,
        guestReady: room.duel.replayVotes.guest,
      });

      if (room.duel.replayVotes.host && room.duel.replayVotes.guest) {
        startMatch(room);
      }
      return;
    }

    if (message.type === "disconnect_room") {
      closeRoom(room, "player_left");
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomCode || "");
    if (!room) {
      return;
    }
    closeRoom(room, "player_left");
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
  for (const room of rooms.values()) {
    if (!roomHasTwoPlayers(room)) {
      if (now - room.createdAt > LOBBY_TIMEOUT_MS) {
        closeRoom(room, "timeout");
      }
      continue;
    }
    broadcastState(room);
  }
}, STATE_TICK_MS);

wss.on("error", (error) => {
  console.error("WebSocket Server Error:", error);
});

const host = process.env.HOST || "0.0.0.0";
console.log(`Duel server listening on ${host}:${PORT}`);
console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`Rooms: ${rooms.size}, Connections: ${wss.clients.size}`);
