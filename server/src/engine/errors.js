"use strict";

class GameRuleError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "GameRuleError";
    this.code = code;
  }
}

module.exports = { GameRuleError };
