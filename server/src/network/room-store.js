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
    this.memberships.set(socketId, { roomId: room.id, playerId });
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
    const claim = room?.game?.pendingClaim;
    if (!claim || claim.id !== claimId || claim.stage !== "challenge-window") {
      return null;
    }
    resolveClaimWithoutChallenge(room.game);
    return room;
  }

  expireReaction(roomId, expiresAt) {
    const room = this.rooms.get(roomId);
    const reaction = room?.game?.pendingReaction;
    if (!reaction || reaction.expiresAt !== expiresAt) return null;
    resolveReactionWithoutClaim(room.game);
    return room;
  }

  disconnect(socketId) {
    // Reconexão persistente será adicionada junto de autenticação/sessões.
    this.memberships.delete(socketId);
  }

  getMembership(socketId) {
    const membership = this.memberships.get(socketId);
    if (!membership) {
      throw new GameRuleError("Você não está em uma sala.", "NOT_IN_ROOM");
    }
    const room = this.rooms.get(membership.roomId);
    if (!room) {
      throw new GameRuleError("Sala não encontrada.", "ROOM_NOT_FOUND");
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
