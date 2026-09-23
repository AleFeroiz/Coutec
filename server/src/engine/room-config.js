"use strict";

const { hasCharacter } = require("../cards/catalog");
const { DEFAULT_ROOM_CONFIG } = require("../config/game-constants");
const { GameRuleError } = require("./errors");

const POOL_MODES = new Set(["random", "manual"]);

function createRoomConfig(input = {}) {
  const config = {
    ...DEFAULT_ROOM_CONFIG,
    ...input,
    bannedCharacters: [...(input.bannedCharacters ?? DEFAULT_ROOM_CONFIG.bannedCharacters)],
    selectedCharacters: input.selectedCharacters
      ? [...input.selectedCharacters]
      : undefined,
  };

  requirePositiveInteger(config.poolSize, "poolSize");
  requirePositiveInteger(config.copiesPerCharacter, "copiesPerCharacter");
  requireNonNegativeInteger(config.initialCoins, "initialCoins");
  requirePositiveInteger(config.challengeSeconds, "challengeSeconds");

  if (!POOL_MODES.has(config.poolMode)) {
    throw new GameRuleError(
      'poolMode deve ser "random" ou "manual".',
      "INVALID_POOL_MODE",
    );
  }

  requireKnownUniqueCharacters(config.bannedCharacters, "bannedCharacters");

  if (config.poolMode === "manual") {
    if (!config.selectedCharacters) {
      throw new GameRuleError(
        "O modo manual exige selectedCharacters.",
        "MISSING_MANUAL_POOL",
      );
    }
    requireKnownUniqueCharacters(config.selectedCharacters, "selectedCharacters");
    if (config.selectedCharacters.length !== config.poolSize) {
      throw new GameRuleError(
        "selectedCharacters deve ter exatamente poolSize personagens.",
        "MANUAL_POOL_SIZE_MISMATCH",
      );
    }
    const selectedBannedCharacter = config.selectedCharacters.find((id) =>
      config.bannedCharacters.includes(id),
    );
    if (selectedBannedCharacter) {
      throw new GameRuleError(
        `O personagem ${selectedBannedCharacter} foi banido e não pode entrar no pool manual.`,
        "BANNED_CHARACTER_SELECTED",
      );
    }
  } else if (config.selectedCharacters) {
    throw new GameRuleError(
      "selectedCharacters só pode ser usado no modo manual.",
      "MANUAL_POOL_IN_RANDOM_MODE",
    );
  }

  return Object.freeze({
    ...config,
    bannedCharacters: Object.freeze(config.bannedCharacters),
    selectedCharacters: config.selectedCharacters
      ? Object.freeze(config.selectedCharacters)
      : undefined,
  });
}

function requirePositiveInteger(value, field) {
  if (!Number.isInteger(value) || value < 1) {
    throw new GameRuleError(
      `${field} deve ser um inteiro positivo. Os limites de balanceamento ainda não foram definidos.`,
      "INVALID_POSITIVE_INTEGER",
    );
  }
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    throw new GameRuleError(
      `${field} deve ser um inteiro não negativo.`,
      "INVALID_NON_NEGATIVE_INTEGER",
    );
  }
}

function requireKnownUniqueCharacters(ids, field) {
  if (!Array.isArray(ids)) {
    throw new GameRuleError(`${field} deve ser uma lista.`, "INVALID_CHARACTER_LIST");
  }
  if (new Set(ids).size !== ids.length) {
    throw new GameRuleError(
      `${field} não pode conter personagens repetidos.`,
      "DUPLICATE_CHARACTER",
    );
  }
  const unknown = ids.find((id) => !hasCharacter(id));
  if (unknown) {
    throw new GameRuleError(
      `Personagem desconhecido em ${field}: ${unknown}.`,
      "UNKNOWN_CHARACTER",
    );
  }
}

module.exports = { createRoomConfig };
