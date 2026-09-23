"use strict";

const { GAME_RULES } = require("../config/game-constants");
const { GameRuleError } = require("./errors");
const { assertCardIntegrity } = require("./game-state");

function collectCoin(state, playerId) {
  const player = requireCurrentPlayer(state, playerId);
  requireCoupIsNotMandatory(player);

  player.coins += GAME_RULES.collectCoinsAmount;
  recordEvent(state, {
    type: "coins-collected",
    playerId,
    amount: GAME_RULES.collectCoinsAmount,
  });
  finishTurn(state);
  return { amount: GAME_RULES.collectCoinsAmount, coins: player.coins };
}

function performCoup(state, { playerId, targetPlayerId, guessedCharacterId }) {
  const player = requireCurrentPlayer(state, playerId);
  const target = state.players.find(({ id }) => id === targetPlayerId);

  if (!target || target.eliminated) {
    throw new GameRuleError("O alvo do Golpe não está ativo.", "INVALID_COUP_TARGET");
  }
  if (target.id === player.id) {
    throw new GameRuleError(
      "Um jogador não pode dar Golpe em si mesmo.",
      "SELF_TARGETED_COUP",
    );
  }
  if (!state.characterPool.includes(guessedCharacterId)) {
    throw new GameRuleError(
      "O palpite deve ser um personagem presente no pool da partida.",
      "CHARACTER_OUTSIDE_POOL",
    );
  }
  if (player.coins < GAME_RULES.coupCost) {
    throw new GameRuleError(
      `O Golpe custa ${GAME_RULES.coupCost} moedas.`,
      "NOT_ENOUGH_COINS_FOR_COUP",
    );
  }

  player.coins -= GAME_RULES.coupCost;
  const matchingCard = target.hand.find(
    ({ characterId }) => characterId === guessedCharacterId,
  );

  let result;
  if (matchingCard) {
    loseInfluence(state, {
      playerId: target.id,
      instanceId: matchingCard.instanceId,
      reason: "coup-hit",
    });
    result = {
      hit: true,
      lostCharacterId: matchingCard.characterId,
      targetEliminated: target.eliminated,
    };
  } else {
    const handSizeBeforeExchange = target.hand.length;
    const revealed = target.hand.splice(0, handSizeBeforeExchange);
    recordRevealedCards(state, target.id, revealed, "coup-miss");
    state.deck.returnAndShuffle(revealed);
    target.hand.push(...state.deck.draw(handSizeBeforeExchange));
    result = {
      hit: false,
      revealedCharacterIds: revealed.map(({ characterId }) => characterId),
      exchangedCardCount: handSizeBeforeExchange,
    };
  }

  recordEvent(state, {
    type: "coup-resolved",
    playerId,
    targetPlayerId,
    guessedCharacterId,
    ...result,
  });
  assertCardIntegrity(state);

  if (!finishGameIfThereIsAWinner(state)) finishTurn(state);
  return result;
}

function loseInfluence(state, { playerId, instanceId, reason }) {
  const player = state.players.find(({ id }) => id === playerId);
  if (!player || player.eliminated) {
    throw new GameRuleError(
      "O jogador que perderia a carta não está ativo.",
      "INVALID_INFLUENCE_LOSS_PLAYER",
    );
  }

  const cardIndex = player.hand.findIndex((card) => card.instanceId === instanceId);
  if (cardIndex === -1) {
    throw new GameRuleError(
      "A carta escolhida não pertence ao jogador.",
      "CARD_NOT_OWNED_BY_PLAYER",
    );
  }

  const [lostCard] = player.hand.splice(cardIndex, 1);
  recordRevealedCards(state, player.id, [lostCard], reason);
  state.deck.returnAndShuffle([lostCard]);

  if (player.hand.length === 0) {
    player.eliminated = true;
    recordEvent(state, { type: "player-eliminated", playerId: player.id });
  }

  assertCardIntegrity(state);
  return lostCard;
}

function requireCurrentPlayer(state, playerId) {
  if (state.phase !== "playing") {
    throw new GameRuleError("A partida não está em andamento.", "GAME_NOT_PLAYING");
  }
  const player = state.players[state.currentPlayerIndex];
  if (!player || player.id !== playerId) {
    throw new GameRuleError("Não é o turno desse jogador.", "NOT_PLAYERS_TURN");
  }
  if (player.eliminated) {
    throw new GameRuleError("O jogador foi eliminado.", "PLAYER_ELIMINATED");
  }
  return player;
}

function requireCoupIsNotMandatory(player) {
  if (player.coins >= GAME_RULES.mandatoryCoupThreshold) {
    throw new GameRuleError(
      `Com ${GAME_RULES.mandatoryCoupThreshold} ou mais moedas, o Golpe é obrigatório.`,
      "COUP_IS_MANDATORY",
    );
  }
}

function recordRevealedCards(state, playerId, cards, reason) {
  for (const card of cards) {
    state.revealedCards.push(
      Object.freeze({
        sequence: state.revealedCards.length + 1,
        turnNumber: state.turnNumber,
        playerId,
        reason,
        instanceId: card.instanceId,
        characterId: card.characterId,
      }),
    );
  }
}

function recordEvent(state, event) {
  state.events.push(
    Object.freeze({
      sequence: state.events.length + 1,
      turnNumber: state.turnNumber,
      ...event,
    }),
  );
}

function finishTurn(state) {
  const playerCount = state.players.length;
  for (let offset = 1; offset <= playerCount; offset += 1) {
    const candidateIndex = (state.currentPlayerIndex + offset) % playerCount;
    if (!state.players[candidateIndex].eliminated) {
      state.currentPlayerIndex = candidateIndex;
      state.turnNumber += 1;
      return;
    }
  }
}

function finishGameIfThereIsAWinner(state) {
  const activePlayers = state.players.filter(({ eliminated }) => !eliminated);
  if (activePlayers.length !== 1) return false;

  state.phase = "finished";
  state.winnerPlayerId = activePlayers[0].id;
  state.currentPlayerIndex = null;
  recordEvent(state, { type: "game-finished", winnerPlayerId: activePlayers[0].id });
  return true;
}

module.exports = {
  collectCoin,
  finishGameIfThereIsAWinner,
  loseInfluence,
  performCoup,
};
