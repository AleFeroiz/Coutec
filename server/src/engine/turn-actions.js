"use strict";

const { GAME_RULES } = require("../config/game-constants");
const { GameRuleError } = require("./errors");
const { assertCardIntegrity } = require("./game-state");
const {
  cancelEffectsFromSource,
  expireEffectsForTurnStart,
  grantCoins,
} = require("./character-effects");

function collectCoin(state, playerId) {
  const player = requireCurrentPlayer(state, playerId);
  requireNoPendingClaim(state);
  requireCoupIsNotMandatory(player);

  const gain = grantCoins(
    state,
    player,
    GAME_RULES.collectCoinsAmount,
    "collect",
  );
  recordEvent(state, {
    type: "coins-collected",
    playerId,
    amount: gain.received,
    eatenByDinosaur: gain.eaten,
  });
  finishTurn(state);
  return { amount: gain.received, eatenByDinosaur: gain.eaten, coins: player.coins };
}

function performCoup(state, { playerId, targetPlayerId, guessedCharacterId, freeAndreia = false, forcedByWave = false }) {
  let forbiddenTargetPlayerId = null;
  if (freeAndreia) {
    const pending = state.pendingEffectChoice;
    if (!pending || pending.type !== "andreia-coup" || pending.actorPlayerId !== playerId) {
      throw new GameRuleError("Não há Golpe adicional disponível.", "NO_FREE_COUP_AVAILABLE");
    }
    state.pendingEffectChoice = null;
  } else if (forcedByWave) {
    const pending = state.pendingEffectChoice;
    if (!pending || pending.type !== "wave-action" || pending.targetPlayerId !== playerId || pending.forcedAction !== "coup") {
      throw new GameRuleError("Este jogador não foi obrigado a dar um Golpe.", "NO_FORCED_COUP");
    }
    forbiddenTargetPlayerId = pending.actorPlayerId;
    state.pendingEffectChoice = null;
  } else {
    requireCurrentPlayer(state, playerId);
    requireNoPendingClaim(state);
  }
  const player = state.players.find(({ id, eliminated }) => id === playerId && !eliminated);
  if (!player) throw new GameRuleError("O jogador não está ativo.", "PLAYER_NOT_ACTIVE");
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
  if (target.id === forbiddenTargetPlayerId) {
    throw new GameRuleError("O alvo forçado não pode escolher o usuário do Wave.", "WAVE_USER_CANNOT_BE_TARGETED");
  }
  if (!state.characterPool.includes(guessedCharacterId)) {
    throw new GameRuleError(
      "O palpite deve ser um personagem presente no pool da partida.",
      "CHARACTER_OUTSIDE_POOL",
    );
  }
  if (!freeAndreia && player.coins < GAME_RULES.coupCost) {
    throw new GameRuleError(
      `O Golpe custa ${GAME_RULES.coupCost} moedas.`,
      "NOT_ENOUGH_COINS_FOR_COUP",
    );
  }

  if (!freeAndreia) player.coins -= GAME_RULES.coupCost;
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

  if (!finishGameIfThereIsAWinner(state)) {
    if (result.hit && state.characterPool.includes("andreia")) {
      state.pendingEffectChoice = { type: "andreia-offer", actorPlayerId: playerId };
      recordEvent(state, { type: "andreia-offered", playerId });
    } else {
      finishTurn(state);
    }
  }
  return result;
}

function collectCoinForcedByWave(state, playerId) {
  const pending = state.pendingEffectChoice;
  if (!pending || pending.type !== "wave-action" || pending.targetPlayerId !== playerId || pending.forcedAction !== "collect") {
    throw new GameRuleError("Este jogador não foi obrigado a coletar.", "NO_FORCED_COLLECTION");
  }
  state.pendingEffectChoice = null;
  const player = state.players.find(({ id, eliminated }) => id === playerId && !eliminated);
  if (!player) throw new GameRuleError("O jogador não está ativo.", "PLAYER_NOT_ACTIVE");
  const gain = grantCoins(state, player, GAME_RULES.collectCoinsAmount, "wave-forced-collect");
  recordEvent(state, { type: "wave-collection-completed", playerId, sourcePlayerId: pending.actorPlayerId, amount: gain.received });
  finishTurn(state);
  return gain;
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
    cancelEffectsFromSource(state, player.id);
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

function requireNoPendingClaim(state) {
  if (state.pendingClaim || state.pendingReaction || state.pendingEffectChoice) {
    throw new GameRuleError(
      "Resolva a alegação pendente antes de fazer outra ação.",
      "CLAIM_ALREADY_PENDING",
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
      expireEffectsForTurnStart(state, state.players[candidateIndex].id);
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

function removePlayerFromGame(state, playerId) {
  const player = state.players.find(({ id }) => id === playerId);
  if (!player || player.eliminated) return false;
  const wasCurrent = state.players[state.currentPlayerIndex]?.id === playerId;
  const returnedCards = player.hand.splice(0);
  if (returnedCards.length) state.deck.returnAndShuffle(returnedCards);
  player.eliminated = true;
  cancelEffectsFromSource(state, playerId);
  state.activeEffects = state.activeEffects.filter(({ targetPlayerId }) => targetPlayerId !== playerId);
  state.pendingClaim = null;
  state.pendingReaction = null;
  state.pendingEffectChoice = null;
  recordEvent(state, { type: "player-left", playerId });
  assertCardIntegrity(state);
  if (!finishGameIfThereIsAWinner(state) && wasCurrent) finishTurn(state);
  return true;
}

module.exports = {
  collectCoin,
  collectCoinForcedByWave,
  finishGameIfThereIsAWinner,
  finishTurn,
  loseInfluence,
  removePlayerFromGame,
  performCoup,
  recordEvent,
  recordRevealedCards,
  requireCoupIsNotMandatory,
  requireCurrentPlayer,
};
