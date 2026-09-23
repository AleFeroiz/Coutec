"use strict";

const DEFAULT_ROOM_CONFIG = Object.freeze({
  poolSize: 5,
  copiesPerCharacter: 3,
  poolMode: "random",
  bannedCharacters: Object.freeze([]),
  initialCoins: 0,
  challengeSeconds: 5,
});

const HAND_SIZE = 2;

// Valores confirmados no Documento Mestre. Todos os números usados pelo motor
// devem morar em configuração para facilitar o balanceamento futuro.
const GAME_RULES = Object.freeze({
  handSize: HAND_SIZE,
  collectCoinsAmount: 1,
  coupCost: 7,
  mandatoryCoupThreshold: 10,
});

module.exports = { DEFAULT_ROOM_CONFIG, GAME_RULES };
