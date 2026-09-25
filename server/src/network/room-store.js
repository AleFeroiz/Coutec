"use strict";

const crypto = require("node:crypto");
const {
  addPlayer,
  challengeCharacterAction,
  claimReaction,
  chooseChallengeLoss,
  chooseCharacterEffect,
  collectCoin,
  collectCoinForcedByWave,
  createRoom,
  declareCharacterAction,
  declareForcedWaveCharacter,
  performCoup,
  removePlayerFromGame,
  passCharacterChallenge,
  passReaction,
  resolveReactionWithoutClaim,
  resolveClaimWithoutChallenge,
  respondAndreiaOffer,
  startGame,
} = require("../index");
const { GameRuleError } = require("../engine/errors");

class RoomStore {
  constructor({ rng = Math.random } = {}) {
    this.rooms = new Map();
    this.memberships = new Map();
    this.rng = rng;
  }

  create({ socketId, playerName, config }) {
    this.requireSocketOutsideRoom(socketId);
    const playerId = crypto.randomUUID();
    const room = createRoom({
      id: this.createRoomCode(),
      hostPlayerId: playerId,
      config,
    });
    addPlayer(room, { id: playerId, name: playerName });
    this.rooms.set(room.id, room);
    this.memberships.set(socketId, { roomId: room.id, playerId });
    return { room, playerId };
  }

  join({ socketId, roomId, playerName }) {
    this.requireSocketOutsideRoom(socketId);
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    const room = this.rooms.get(normalizedRoomId);
    if (!room) {
      throw new GameRuleError("Sala não encontrada.", "ROOM_NOT_FOUND");
    }

    const playerId = crypto.randomUUID();
    addPlayer(room, { id: playerId, name: playerName });
    this.memberships.set(socketId, { roomId: room.id, playerId });
    return { room, playerId };
  }

  resume({ socketId, roomId, playerId }) {
    this.requireSocketOutsideRoom(socketId);
    const room = this.rooms.get(String(roomId ?? "").trim().toUpperCase());
    if (!room || !room.players.some(({ id }) => id === playerId)) {
      throw new GameRuleError("A sessão dessa sala expirou.", "SESSION_NOT_FOUND");
    }
    for (const [existingSocketId, membership] of this.memberships) {
      if (membership.roomId === room.id && membership.playerId === playerId) {
        this.memberships.delete(existingSocketId);
      }
    }
    this.memberships.set(socketId, { roomId: room.id, playerId });
    room.disconnectedPlayers = (room.disconnectedPlayers ?? []).filter(({ playerId: id }) => id !== playerId);
    this.refreshPause(room);
    return { room, playerId };
  }

  leave(socketId) {
    const { room, playerId } = this.getMembership(socketId, { allowPaused: true });
    this.memberships.delete(socketId);
    room.disconnectedPlayers = (room.disconnectedPlayers ?? []).filter(({ playerId: id }) => id !== playerId);
    this.removePlayer(room, playerId);
    this.refreshPause(room);
    return { room, playerId };
  }

  start(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    startGame(room, { requestingPlayerId: playerId, rng: this.rng });
    return room;
  }

  collect(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    collectCoin(room.game, playerId);
    return room;
  }

  coup(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    performCoup(room.game, {
      playerId,
      targetPlayerId: payload.targetPlayerId,
      guessedCharacterId: payload.guessedCharacterId,
    });
    return room;
  }

  respondAndreia(socketId, use) {
    const { room, playerId } = this.getMembership(socketId);
    respondAndreiaOffer(room.game, { playerId, use });
    if (room.game.pendingClaim) {
      room.game.pendingClaim.expiresAt = Date.now() + room.config.challengeSeconds * 1000;
    }
    return room;
  }

  andreiaCoup(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    performCoup(room.game, { playerId, targetPlayerId: payload.targetPlayerId, guessedCharacterId: payload.guessedCharacterId, freeAndreia: true });
    return room;
  }

  waveCollect(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    collectCoinForcedByWave(room.game, playerId);
    return room;
  }

  waveCoup(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    performCoup(room.game, { playerId, targetPlayerId: payload.targetPlayerId, guessedCharacterId: payload.guessedCharacterId, forcedByWave: true });
    return room;
  }

  waveCharacter(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    declareForcedWaveCharacter(room.game, { playerId, characterId: payload.characterId, parameters: payload.parameters ?? {} });
    room.game.pendingClaim.expiresAt = Date.now() + room.config.challengeSeconds * 1000;
    return room;
  }

  declareCharacter(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    declareCharacterAction(room.game, {
      playerId,
      characterId: payload.characterId,
      parameters: payload.parameters ?? {},
    });
    room.game.pendingClaim.expiresAt =
      Date.now() + room.config.challengeSeconds * 1000;
    return room;
  }

  challenge(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    challengeCharacterAction(room.game, { challengerPlayerId: playerId });
    return room;
  }

  chooseChallengeLoss(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    chooseChallengeLoss(room.game, { playerId, instanceId: payload.instanceId });
    return room;
  }

  passChallenge(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    passCharacterChallenge(room.game, { playerId });
    return room;
  }

  claimReaction(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    claimReaction(room.game, { playerId });
    room.game.pendingClaim.expiresAt = Date.now() + room.config.challengeSeconds * 1000;
    return room;
  }

  passReaction(socketId) {
    const { room, playerId } = this.getMembership(socketId);
    passReaction(room.game, { playerId });
    return room;
  }

  chooseEffect(socketId, payload) {
    const { room, playerId } = this.getMembership(socketId);
    chooseCharacterEffect(room.game, { playerId, choice: payload });
    return room;
  }

  expireClaim(roomId, claimId) {
    const room = this.rooms.get(roomId);
    if (room?.connectionPause) return null;
    const claim = room?.game?.pendingClaim;
    if (!claim || claim.id !== claimId || claim.stage !== "challenge-window") {
      return null;
    }
    resolveClaimWithoutChallenge(room.game);
    return room;
  }

  expireReaction(roomId, expiresAt) {
    const room = this.rooms.get(roomId);
    if (room?.connectionPause) return null;
    const reaction = room?.game?.pendingReaction;
    if (!reaction || reaction.expiresAt !== expiresAt) return null;
    resolveReactionWithoutClaim(room.game);
    return room;
  }

  disconnect(socketId) {
    const membership = this.memberships.get(socketId);
    if (!membership) return null;
    this.memberships.delete(socketId);
    const stillConnected = [...this.memberships.values()].some(
      (candidate) => candidate.roomId === membership.roomId && candidate.playerId === membership.playerId,
    );
    const room = this.rooms.get(membership.roomId);
    if (!room || stillConnected) return null;
    const player = room.players.find(({ id }) => id === membership.playerId);
    if (!player) return null;
    room.pauseStartedAt ??= Date.now();
    room.disconnectedPlayers ??= [];
    room.disconnectedPlayers = room.disconnectedPlayers.filter(({ playerId }) => playerId !== player.id);
    const disconnected = {
      playerId: player.id,
      playerName: player.name,
      startedAt: Date.now(),
      expiresAt: Date.now() + 30_000,
    };
    room.disconnectedPlayers.push(disconnected);
    this.refreshPause(room);
    return { room, disconnected };
  }

  expireDisconnect(roomId, playerId, expiresAt) {
    const room = this.rooms.get(roomId);
    const disconnected = room?.disconnectedPlayers?.find((entry) => entry.playerId === playerId && entry.expiresAt === expiresAt);
    if (!disconnected) return null;
    room.disconnectedPlayers = room.disconnectedPlayers.filter((entry) => entry !== disconnected);
    this.removePlayer(room, playerId);
    this.refreshPause(room);
    return room;
  }

  removePlayer(room, playerId) {
    if (room.game) {
      const gamePlayer = room.game.players.find(({ id }) => id === playerId);
      if (gamePlayer) gamePlayer.departed = true;
      removePlayerFromGame(room.game, playerId);
    }
    room.players = room.players.filter(({ id }) => id !== playerId);
    if (room.hostPlayerId === playerId) room.hostPlayerId = room.players[0]?.id ?? null;
    for (const [socketId, membership] of this.memberships) {
      if (membership.roomId === room.id && membership.playerId === playerId) this.memberships.delete(socketId);
    }
    if (!room.players.length) this.rooms.delete(room.id);
  }

  refreshPause(room) {
    const disconnected = room.disconnectedPlayers ?? [];
    if (disconnected.length) {
      const next = [...disconnected].sort((a, b) => a.expiresAt - b.expiresAt)[0];
      room.connectionPause = {
        ...next,
        playerName: disconnected.map(({ playerName }) => playerName).join(", "),
        disconnectedCount: disconnected.length,
      };
      return;
    }
    if (room.connectionPause && room.pauseStartedAt) {
      const pausedFor = Date.now() - room.pauseStartedAt;
      if (room.game?.pendingClaim?.expiresAt) room.game.pendingClaim.expiresAt += pausedFor;
      if (room.game?.pendingReaction?.expiresAt) room.game.pendingReaction.expiresAt += pausedFor;
    }
    room.connectionPause = null;
    room.pauseStartedAt = null;
  }

  getMembership(socketId, { allowPaused = false } = {}) {
    const membership = this.memberships.get(socketId);
    if (!membership) {
      throw new GameRuleError("Você não está em uma sala.", "NOT_IN_ROOM");
    }
    const room = this.rooms.get(membership.roomId);
    if (!room) {
      throw new GameRuleError("Sala não encontrada.", "ROOM_NOT_FOUND");
    }
    if (room.connectionPause && !allowPaused) {
      throw new GameRuleError("A partida está aguardando um jogador reconectar.", "ROOM_PAUSED");
    }
    return { ...membership, room };
  }

  requireSocketOutsideRoom(socketId) {
    if (this.memberships.has(socketId)) {
      throw new GameRuleError("Você já está em uma sala.", "ALREADY_IN_ROOM");
    }
  }

  createRoomCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let attempt = 0; attempt < 100; attempt += 1) {
      let code = "";
      for (let index = 0; index < 6; index += 1) {
        code += alphabet[Math.floor(this.rng() * alphabet.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new GameRuleError(
      "Não foi possível gerar um código de sala.",
      "ROOM_CODE_EXHAUSTED",
    );
  }
}

module.exports = { RoomStore };
