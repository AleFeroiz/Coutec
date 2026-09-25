"use strict";

const { GAME_RULES } = require("../config/game-constants");
const { buildDeck, resolveCharacterPool } = require("./deck");
const { GameRuleError } = require("./errors");
const { createPlayer } = require("./player");

function createGameState({ config, players, rng = Math.random }) {
  if (!Array.isArray(players) || players.length < 2) {
    throw new GameRuleError(
      "O COUTEC precisa de pelo menos 2 jogadores.",
      "NOT_ENOUGH_PLAYERS",
    );
  }
  const uniqueIds = new Set(players.map(({ id }) => id));
  if (uniqueIds.size !== players.length) {
    throw new GameRuleError(
      "Os jogadores precisam ter ids diferentes.",
      "DUPLICATE_PLAYER_ID",
    );
  }

  const characterPool = resolveCharacterPool(config, rng);
  const deck = buildDeck(characterPool, config.copiesPerCharacter, rng);
  const requiredCards = players.length * GAME_RULES.handSize;
  if (deck.size < requiredCards) {
    throw new GameRuleError(
      `São necessárias ${requiredCards} cartas para ${players.length} jogadores, mas o baralho tem ${deck.size}.`,
      "DECK_TOO_SMALL_FOR_PLAYERS",
    );
  }

  const gamePlayers = players.map(({ id, name }) =>
    createPlayer({ id, name, initialCoins: config.initialCoins }),
  );
  for (const player of gamePlayers) {
    player.hand.push(...deck.draw(GAME_RULES.handSize));
  }

  const state = {
    phase: "playing",
    characterPool,
    deck,
    players: gamePlayers,
    currentPlayerIndex: Math.floor(rng() * gamePlayers.length),
    turnNumber: 1,
    revealedCards: [],
    events: [],
    pendingClaim: null,
    pendingReaction: null,
    activeEffects: [],
    nextEffectId: 1,
    pendingEffectChoice: null,
    totalCardCount: config.poolSize * config.copiesPerCharacter,
    config,
    winnerPlayerId: null,
  };

  assertCardIntegrity(state);
  return state;
}

function assertCardIntegrity(state) {
  const cards = [
    ...state.deck.cards,
    ...state.players.flatMap((player) => player.hand),
  ];
  const ids = cards.map(({ instanceId }) => instanceId);

  if (cards.length !== state.totalCardCount) {
    throw new GameRuleError(
      `Integridade quebrada: existem ${cards.length} cartas, mas deveriam existir ${state.totalCardCount}.`,
      "CARD_COUNT_INTEGRITY_FAILURE",
    );
  }
  if (new Set(ids).size !== ids.length) {
    throw new GameRuleError(
      "Integridade quebrada: há cópias físicas de carta duplicadas.",
      "DUPLICATE_CARD_INSTANCE",
    );
  }
  return true;
}

module.exports = { assertCardIntegrity, createGameState };
