"use strict";

const http = require("node:http");
const path = require("node:path");
const cors = require("cors");
const express = require("express");
const { Server } = require("socket.io");
const { RoomStore } = require("./network/room-store");
const { serializeRoomForPlayer } = require("./network/serialize-room");

function createCoutecServer({
  allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  rng = Math.random,
} = {}) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: allowedOrigins, methods: ["GET", "POST"] },
  });
  const roomStore = new RoomStore({ rng });

  app.use(cors({ origin: allowedOrigins }));
  app.use(express.json());
  app.get("/health", (_request, response) => {
    response.json({ service: "coutec-server", status: "ok" });
  });
  // Conveniência para playtest local; o mesmo /client pode ir para a Vercel.
  app.use(express.static(path.resolve(__dirname, "../../client"), {
    etag: false,
    setHeaders(response) {
      response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    },
  }));

  io.on("connection", (socket) => registerSocket(socket, io, roomStore));
  return { app, io, roomStore, server };
}

function registerSocket(socket, io, roomStore) {
  socket.on("room:create", (payload, reply) => {
    handle(reply, () => {
      const { room, playerId } = roomStore.create({
        socketId: socket.id,
        playerName: payload?.playerName,
        config: payload?.config,
      });
      socket.join(room.id);
      emitRoom(room);
      return { roomId: room.id, playerId };
    });
  });

  socket.on("room:join", (payload, reply) => {
    handle(reply, () => {
      const { room, playerId } = roomStore.join({
        socketId: socket.id,
        roomId: payload?.roomId,
        playerName: payload?.playerName,
      });
      socket.join(room.id);
      emitRoom(room);
      return { roomId: room.id, playerId };
    });
  });

  socket.on("room:resume", (payload, reply) => {
    handle(reply, () => {
      const { room, playerId } = roomStore.resume({
        socketId: socket.id,
        roomId: payload?.roomId,
        playerId: payload?.playerId,
      });
      socket.join(room.id);
      emitRoom(room);
      return { roomId: room.id, playerId };
    });
  });

  socket.on("room:start", (_payload, reply) => {
    handle(reply, () => {
      const room = roomStore.start(socket.id);
      emitRoom(room);
      return {};
    });
  });

  socket.on("action:collect", (_payload, reply) => {
    handle(reply, () => {
      const room = roomStore.collect(socket.id);
      emitRoom(room);
      return {};
    });
  });

  socket.on("action:coup", (payload, reply) => {
    handle(reply, () => {
      const room = roomStore.coup(socket.id, payload ?? {});
      emitRoom(room);
      return {};
    });
  });

  socket.on("action:declare-character", (payload, reply) => {
    handle(reply, () => {
      const room = roomStore.declareCharacter(socket.id, payload ?? {});
      emitRoom(room);
      const claimId = room.game.pendingClaim.id;
      const challengeTimer = setTimeout(() => {
        const changedRoom = roomStore.expireClaim(room.id, claimId);
        if (changedRoom) emitRoom(changedRoom);
      }, room.config.challengeSeconds * 1000);
      challengeTimer.unref?.();
      return {};
    });
  });

  socket.on("challenge:contest", (_payload, reply) => {
    handle(reply, () => {
      const room = roomStore.challenge(socket.id);
      emitRoom(room);
      return {};
    });
  });

  socket.on("challenge:choose-loss", (payload, reply) => {
    handle(reply, () => {
      const room = roomStore.chooseChallengeLoss(socket.id, payload ?? {});
      emitRoom(room);
      return {};
    });
  });

  socket.on("challenge:pass", (_payload, reply) => {
    handle(reply, () => {
      const room = roomStore.passChallenge(socket.id);
      emitRoom(room);
      return {};
    });
  });

  socket.on("effect:choose", (payload, reply) => {
    handle(reply, () => {
      const room = roomStore.chooseEffect(socket.id, payload ?? {});
      emitRoom(room);
      return {};
    });
  });

  socket.on("disconnect", () => roomStore.disconnect(socket.id));

  function emitRoom(room) {
    for (const [socketId, membership] of roomStore.memberships) {
      if (membership.roomId !== room.id) continue;
      io.to(socketId).emit(
        "room:state",
        serializeRoomForPlayer(room, membership.playerId),
      );
    }
  }
}

function handle(reply, operation) {
  const safeReply = typeof reply === "function" ? reply : () => {};
  try {
    safeReply({ ok: true, ...operation() });
  } catch (error) {
    safeReply({
      ok: false,
      error: {
        code: error.code ?? "INTERNAL_ERROR",
        message: error.code ? error.message : "Erro interno do servidor.",
      },
    });
    if (!error.code) console.error(error);
  }
}

if (require.main === module) {
  const port = Number(process.env.PORT ?? 3000);
  const { server } = createCoutecServer();
  server.listen(port, () => {
    console.log(`COUTEC ouvindo na porta ${port}`);
  });
}

module.exports = { createCoutecServer };
