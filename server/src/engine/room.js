"use strict";

const { GameRuleError } = require("./errors");
const { createGameState } = require("./game-state");
const { createRoomConfig } = require("./room-config");

function createRoom({ id, hostPlayerId, config }) {
  if (!id || !hostPlayerId) {
    throw new GameRuleError(
      "A sala precisa de id e hostPlayerId.",
      "INVALID_ROOM_IDENTITY",
    );
  }
  return {
    id,
    hostPlayerId,
    phase: "lobby",
    config: createRoomConfig(config),
    players: [],
    game: null,
  };
}

function addPlayer(room, player) {
  if (room.phase !== "lobby") {
    throw new GameRuleError(
      "Não é possível entrar depois do início da partida.",
      "GAME_ALREADY_STARTED",
    );
  }
  if (room.players.some(({ id }) => id === player.id)) {
    throw new GameRuleError("Esse jogador já está na sala.", "DUPLICATE_PLAYER_ID");
  }
  room.players.push({ id: player.id, name: player.name });
  return room;
}

function startGame(room, { requestingPlayerId, rng = Math.random }) {
  if (requestingPlayerId !== room.hostPlayerId) {
    throw new GameRuleError(
      "Somente o host pode iniciar a partida.",
      "ONLY_HOST_CAN_START",
    );
  }
  if (room.phase !== "lobby") {
    throw new GameRuleError("A partida já foi iniciada.", "GAME_ALREADY_STARTED");
  }

  room.game = createGameState({
    config: room.config,
    players: room.players,
    rng,
  });
  room.phase = "playing";
  return room.game;
}

module.exports = { addPlayer, createRoom, startGame };
