"use strict";

const cards = require("./cards/catalog");
const constants = require("./config/game-constants");
const deck = require("./engine/deck");
const { GameRuleError } = require("./engine/errors");
const gameState = require("./engine/game-state");
const player = require("./engine/player");
const room = require("./engine/room");
const roomConfig = require("./engine/room-config");
const turnActions = require("./engine/turn-actions");

module.exports = {
  ...cards,
  ...constants,
  ...deck,
  ...gameState,
  ...player,
  ...room,
  ...roomConfig,
  ...turnActions,
  GameRuleError,
};
