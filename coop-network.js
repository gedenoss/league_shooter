export function createCoopClient({ url, onMessage, onOpen, onClose, onError }) {
  let socket = null;
  let socketId = null;
  let role = null;
  let roomCode = null;
  const pendingMessages = [];

  function flushPendingMessages() {
    while (
      pendingMessages.length > 0 &&
      socket &&
      socket.readyState === WebSocket.OPEN
    ) {
      socket.send(pendingMessages.shift());
    }
  }

  function connect() {
    if (
      socket &&
      (socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      flushPendingMessages();
      onOpen?.();
    });
    socket.addEventListener("message", (event) => {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }

      if (message?.socketId) {
        socketId = message.socketId;
      }
      if (message?.role) {
        role = message.role;
      }
      if (message?.code) {
        roomCode = message.code;
      }

      onMessage?.(message);
    });
    socket.addEventListener("close", () => {
      onClose?.();
    });
    socket.addEventListener("error", (event) => {
      onError?.(event);
    });
  }

  function send(type, payload = {}) {
    const message = JSON.stringify({ type, ...payload });

    if (!socket) {
      return false;
    }

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      return true;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      pendingMessages.push(message);
      return true;
    }

    return true;
  }

  return {
    connect,
    close() {
      pendingMessages.length = 0;
      socket?.close();
      socket = null;
    },
    hostRoom() {
      return send("host_room");
    },
    joinRoom(code) {
      return send("join_room", { code });
    },
    lobbyReady() {
      return send("lobby_ready");
    },
    openPauseMenu() {
      return send("pause_open");
    },
    choosePauseCard(choice) {
      return send("pause_choice", { choice });
    },
    sendSnapshot(snapshot) {
      return send("snapshot", { snapshot });
    },
    sendShot(shot) {
      return send("shot", { shot });
    },
    disconnectRoom() {
      return send("disconnect_room");
    },
    getSocketId() {
      return socketId;
    },
    getRole() {
      return role;
    },
    getRoomCode() {
      return roomCode;
    },
    isConnected() {
      return Boolean(socket && socket.readyState === WebSocket.OPEN);
    },
    getSocket() {
      return socket;
    },
  };
}
