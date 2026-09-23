"use strict";

const { GameRuleError } = require("./errors");

function createPlayer({ id, name, initialCoins }) {
  if (typeof id !== "string" || id.trim() === "") {
    throw new GameRuleError("O jogador precisa de um id.", "INVALID_PLAYER_ID");
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new GameRuleError("O jogador precisa de um nome.", "INVALID_PLAYER_NAME");
  }
  if (!Number.isInteger(initialCoins) || initialCoins < 0) {
    throw new GameRuleError(
      "initialCoins deve ser um inteiro não negativo.",
      "INVALID_INITIAL_COINS",
    );
  }

  return {
    id,
    name: name.trim(),
    coins: initialCoins,
    repositoryCoins: 0,
    totalCoinsGained: 0,
    hand: [],
    eliminated: false,
  };
}

module.exports = { createPlayer };
