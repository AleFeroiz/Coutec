"use strict";

const { getCharacter } = require("../cards/catalog");
const { GameRuleError } = require("./errors");

const IMPLEMENTED_CHARACTERS = new Set([
  "jeff-dino", "silverio", "deivison", "paula-granada", "ademar",
  "sandra", "altimar", "luis-sapeca",
  "rodrigo", "marcelo-moreira", "andreia", "wave", "robertinho", "ze",
]);

function prepareCharacterAction(state, { playerId, characterId, parameters = {} }) {
  const player = getActivePlayer(state, playerId);
  const character = getCharacter(characterId);
  if (!character || !state.characterPool.includes(characterId)) {
    throw new GameRuleError(
      "Esse personagem não está no pool da partida.",
      "CHARACTER_OUTSIDE_POOL",
    );
  }
  const effectImplemented = IMPLEMENTED_CHARACTERS.has(characterId);
  if (!effectImplemented) {
    throw new GameRuleError(
      "O efeito desse personagem ainda não foi implementado.",
      "CHARACTER_EFFECT_NOT_IMPLEMENTED",
    );
  }
  validateParameters(state, player, characterId, parameters);
  const announcedCost = characterId === "paula-granada" ? 7
    : characterId === "rodrigo" ? 2
    : character.cost.type === "coins" ? character.cost.amount : 0;
  if (player.coins < announcedCost) {
    throw new GameRuleError(
      `São necessárias ${announcedCost} moedas para anunciar essa ação.`,
      "NOT_ENOUGH_COINS_FOR_CHARACTER",
    );
  }
  player.coins -= announcedCost;
  if (characterId === "rodrigo") {
    const target = getActivePlayer(state, parameters.targetPlayerId);
    grantCoins(state, target, 2, "rodrigo-loan");
  }
  return { announcedCost, effectImplemented, parameters: { ...parameters } };
}

function executeCharacterEffect(state, claim) {
  const player = getActivePlayer(state, claim.actorPlayerId);
  const { characterId, parameters } = claim;

  if (characterId === "jeff-dino") {
    const target = getActivePlayer(state, parameters.targetPlayerId);
    addEffect(state, {
      type: "dinosaur",
      sourcePlayerId: player.id,
      targetPlayerId: target.id,
      expiresAtStartOfPlayerId: player.id,
    });
    record(state, {
      type: "dinosaur-placed",
      playerId: player.id,
      targetPlayerId: target.id,
    });
  } else if (characterId === "silverio") {
    addEffect(state, {
      type: "cave",
      sourcePlayerId: player.id,
      targetPlayerId: player.id,
      expiresAtStartOfPlayerId: player.id,
    });
    record(state, { type: "cave-activated", playerId: player.id });
  } else if (characterId === "deivison") {
    const amount = parameters.amount;
    if (parameters.mode === "deposit") {
      player.coins -= amount;
      player.repositoryCoins += amount;
    } else {
      player.repositoryCoins -= amount;
      player.coins += amount;
    }
    record(state, {
      type: "repository-changed",
      playerId: player.id,
      mode: parameters.mode,
      amount,
    });
  } else if (characterId === "paula-granada") {
    applySocialism(state, player);
  } else if (characterId === "ademar") {
    addEffect(state, {
      type: "ademar",
      sourcePlayerId: player.id,
      targetPlayerId: null,
      expiresAtStartOfPlayerId: player.id,
      gainSnapshot: Object.fromEntries(
        state.players.map((candidate) => [candidate.id, candidate.totalCoinsGained]),
      ),
    });
    record(state, { type: "ademar-watching", playerId: player.id });
  } else if (characterId === "luis-sapeca") {
    const [first, second] = parameters.targetPlayerIds.map((id) =>
      getActivePlayer(state, id),
    );
    [first.hand, second.hand] = [second.hand, first.hand];
    record(state, {
      type: "hands-swapped",
      playerId: player.id,
      targetPlayerIds: [first.id, second.id],
    });
  } else if (characterId === "sandra" || characterId === "altimar") {
    state.pendingEffectChoice = {
      type: characterId,
      actorPlayerId: player.id,
    };
    record(state, {
      type: "effect-choice-opened",
      playerId: player.id,
      characterId,
    });
    return false;
  } else if (characterId === "rodrigo") {
    addEffect(state, {
      type: "rodrigo-debt",
      sourcePlayerId: player.id,
      targetPlayerId: parameters.targetPlayerId,
      nextCheckAtStartOfPlayerId: player.id,
      amountDue: 4,
      failedChecks: 0,
    });
    record(state, {
      type: "rodrigo-loan-created",
      playerId: player.id,
      targetPlayerId: parameters.targetPlayerId,
    });
  } else if (characterId === "marcelo-moreira") {
    addEffect(state, {
      type: "marcelo-requirement",
      sourcePlayerId: player.id,
      targetPlayerId: parameters.targetPlayerId,
      nextCheckAtStartOfPlayerId: player.id,
      threshold: parameters.threshold,
      comparison: parameters.comparison,
    });
    record(state, {
      type: "marcelo-requirement-created",
      playerId: player.id,
      targetPlayerId: parameters.targetPlayerId,
      threshold: parameters.threshold,
      comparison: parameters.comparison,
    });
  } else if (characterId === "andreia") {
    state.pendingEffectChoice = {
      type: "andreia-coup",
      actorPlayerId: player.id,
    };
    record(state, { type: "andreia-free-coup-ready", playerId: player.id });
    return false;
  } else if (characterId === "wave") {
    state.pendingEffectChoice = {
      type: "wave-action",
      actorPlayerId: player.id,
      targetPlayerId: parameters.targetPlayerId,
      forcedAction: parameters.forcedAction,
    };
    record(state, {
      type: "wave-action-forced",
      playerId: player.id,
      targetPlayerId: parameters.targetPlayerId,
      forcedAction: parameters.forcedAction,
    });
    return false;
  } else if (characterId === "ze") {
    addEffect(state, {
      type: "ze-delayed-action",
      sourcePlayerId: player.id,
      targetPlayerId: claim.reactionContext.actionClaim.actorPlayerId,
      nextCheckAtStartOfPlayerId: player.id,
      actionClaim: claim.reactionContext.actionClaim,
    });
    record(state, { type: "ze-action-delayed", playerId: player.id, targetPlayerId: claim.reactionContext.actionClaim.actorPlayerId });
  } else if (characterId === "robertinho") {
    const original = claim.reactionContext.actionClaim;
    const target = getActivePlayer(state, original.actorPlayerId);
    const targetCard = target.hand.find(({ characterId: id }) => id === original.characterId);
    if (!targetCard) {
      record(state, { type: "robertinho-no-card", playerId: player.id, targetPlayerId: target.id });
      return true;
    }
    state.pendingEffectChoice = {
      type: "robertinho-swap",
      actorPlayerId: player.id,
      targetPlayerId: target.id,
      targetCardInstanceId: targetCard.instanceId,
    };
    record(state, { type: "robertinho-swap-ready", playerId: player.id, targetPlayerId: target.id });
    return false;
  }
  return true;
}

function grantCoins(state, player, amount, reason) {
  const dinosaur = state.activeEffects.find(
    (effect) => effect.type === "dinosaur" && effect.targetPlayerId === player.id,
  );
  const eaten = dinosaur ? Math.min(1, amount) : 0;
  const received = amount - eaten;
  player.coins += received;
  player.totalCoinsGained += received;
  if (eaten) {
    record(state, {
      type: "dinosaur-ate-coin",
      playerId: player.id,
      sourcePlayerId: dinosaur.sourcePlayerId,
      amount: eaten,
      reason,
    });
  }
  return { received, eaten };
}

function expireEffectsForTurnStart(state, playerId) {
  processScheduledEffects(state, playerId);
  const expired = state.activeEffects.filter(
    ({ expiresAtStartOfPlayerId }) => expiresAtStartOfPlayerId === playerId,
  );
  if (!expired.length) return [];
  const expiredIds = new Set(expired.map(({ id }) => id));
  for (const effect of expired) {
    if (effect.type === "ademar") resolveAdemar(state, effect);
  }
  state.activeEffects = state.activeEffects.filter(({ id }) => !expiredIds.has(id));
  for (const effect of expired) {
    record(state, {
      type: "effect-expired",
      effectType: effect.type,
      sourcePlayerId: effect.sourcePlayerId,
      targetPlayerId: effect.targetPlayerId,
    });
  }
  return expired;
}

function hasCaveProtection(state, playerId) {
  return state.activeEffects.some(
    (effect) => effect.type === "cave" && effect.targetPlayerId === playerId,
  );
}

function cancelEffectsFromSource(state, playerId) {
  const cancelled = state.activeEffects.filter(
    ({ sourcePlayerId }) => sourcePlayerId === playerId,
  );
  if (!cancelled.length) return;
  const ids = new Set(cancelled.map(({ id }) => id));
  state.activeEffects = state.activeEffects.filter(({ id }) => !ids.has(id));
  for (const effect of cancelled) {
    record(state, {
      type: "effect-cancelled",
      effectType: effect.type,
      sourcePlayerId: playerId,
    });
  }
}

function validateParameters(state, player, characterId, parameters) {
  if (characterId === "jeff-dino") {
    getActivePlayer(state, parameters.targetPlayerId);
  }
  if (characterId === "deivison") {
    if (!["deposit", "withdraw"].includes(parameters.mode)) {
      throw new GameRuleError(
        "Escolha depositar ou retirar do repositório.",
        "INVALID_REPOSITORY_MODE",
      );
    }
    if (!Number.isInteger(parameters.amount) || parameters.amount < 1) {
      throw new GameRuleError(
        "A quantidade do repositório deve ser um inteiro positivo.",
        "INVALID_REPOSITORY_AMOUNT",
      );
    }
    if (parameters.mode === "deposit" && player.coins < parameters.amount + 1) {
      throw new GameRuleError(
        "É preciso ter a taxa de 1 moeda e o valor que será guardado.",
        "NOT_ENOUGH_COINS_TO_DEPOSIT",
      );
    }
    if (parameters.mode === "withdraw" && player.repositoryCoins < parameters.amount) {
      throw new GameRuleError(
        "O repositório não possui essa quantidade.",
        "NOT_ENOUGH_REPOSITORY_COINS",
      );
    }
  }
  if (characterId === "luis-sapeca") {
    if (!Array.isArray(parameters.targetPlayerIds) || parameters.targetPlayerIds.length !== 2) {
      throw new GameRuleError("Escolha dois jogadores.", "INVALID_SWAP_TARGETS");
    }
    if (new Set(parameters.targetPlayerIds).size !== 2) {
      throw new GameRuleError("Os alvos precisam ser diferentes.", "DUPLICATE_SWAP_TARGET");
    }
    for (const targetId of parameters.targetPlayerIds) getActivePlayer(state, targetId);
  }
  if (["rodrigo", "marcelo-moreira"].includes(characterId)) {
    const target = getActivePlayer(state, parameters.targetPlayerId);
    if (target.id === player.id) {
      throw new GameRuleError("Escolha outro jogador.", "SELF_TARGETED_EFFECT");
    }
  }
  if (characterId === "rodrigo" && player.coins < 2) {
    throw new GameRuleError("Rodrigo exige 2 moedas para emprestar.", "NOT_ENOUGH_COINS_FOR_LOAN");
  }
  if (characterId === "marcelo-moreira") {
    if (!Number.isInteger(parameters.threshold) || parameters.threshold < 1 || parameters.threshold > 8) {
      throw new GameRuleError("O requisito deve ficar entre 1 e 8.", "INVALID_REQUIREMENT_THRESHOLD");
    }
    if (!["gte", "lte"].includes(parameters.comparison)) {
      throw new GameRuleError("Escolha maior/igual ou menor/igual.", "INVALID_REQUIREMENT_COMPARISON");
    }
  }
  if (characterId === "wave") {
    const target = getActivePlayer(state, parameters.targetPlayerId);
    if (target.id === player.id) {
      throw new GameRuleError("Escolha outro jogador para o Wave.", "SELF_TARGETED_EFFECT");
    }
    if (!["collect", "character", "coup"].includes(parameters.forcedAction)) {
      throw new GameRuleError("Escolha uma ação váida para o Wave.", "INVALID_FORCED_ACTION");
    }
    if (parameters.forcedAction === "coup" && target.coins < 7) {
      throw new GameRuleError("O alvo não possui moedas para o Golpe.", "FORCED_PLAYER_CANNOT_PAY");
    }
  }
}

function applyCharacterChoice(state, { playerId, choice }) {
  const pending = state.pendingEffectChoice;
  const choicePlayerId = pending?.type === "marcelo-loss"
    ? pending.targetPlayerId
    : pending?.type === "wave-action"
      ? pending.targetPlayerId
    : pending?.actorPlayerId;
  if (!pending || choicePlayerId !== playerId) {
    throw new GameRuleError("Não há uma escolha disponível para você.", "NO_EFFECT_CHOICE");
  }
  const actor = getActivePlayer(state, playerId);

  if (pending.type === "sandra") {
    const ownIndex = actor.hand.findIndex(({ instanceId }) => instanceId === choice.ownInstanceId);
    if (ownIndex === -1) throw new GameRuleError("Escolha uma carta da sua mão.", "CARD_NOT_OWNED_BY_PLAYER");
    const selectedCard = state.deck.takeByInstanceId(choice.deckInstanceId);
    const [returned] = actor.hand.splice(ownIndex, 1, selectedCard);
    state.deck.returnAndShuffle([returned]);
    record(state, { type: "sandra-exchanged", playerId });
  } else if (pending.type === "altimar") {
    const target = getActivePlayer(state, choice.targetPlayerId);
    if (!Number.isInteger(choice.targetCardIndex) || choice.targetCardIndex < 0 || choice.targetCardIndex >= target.hand.length) {
      throw new GameRuleError("Escolha uma posição válida da mão do alvo.", "INVALID_TARGET_CARD_INDEX");
    }
    const selectedCard = state.deck.takeByInstanceId(choice.deckInstanceId);
    const [tornCard] = target.hand.splice(choice.targetCardIndex, 1, selectedCard);
    state.revealedCards.push({
      sequence: state.revealedCards.length + 1,
      turnNumber: state.turnNumber,
      playerId: target.id,
      reason: "altimar-torn",
      instanceId: tornCard.instanceId,
      characterId: tornCard.characterId,
    });
    state.deck.returnAndShuffle([tornCard]);
    record(state, {
      type: "altimar-replaced",
      playerId,
      targetPlayerId: target.id,
      lostCharacterId: tornCard.characterId,
    });
  } else if (pending.type === "rodrigo-loss") {
    if (playerId !== pending.actorPlayerId) throw new GameRuleError("Somente o credor escolhe a carta.", "ONLY_EFFECT_OWNER_CHOOSES");
    loseCardByIndex(state, pending.targetPlayerId, choice.targetCardIndex, "rodrigo-default");
  } else if (pending.type === "marcelo-loss") {
    if (playerId !== pending.targetPlayerId) throw new GameRuleError("O alvo escolhe a própria perda.", "ONLY_LOSER_CHOOSES_CARD");
    const target = getActivePlayer(state, playerId);
    const index = target.hand.findIndex(({ instanceId }) => instanceId === choice.ownInstanceId);
    if (index === -1) throw new GameRuleError("Escolha uma carta da sua mão.", "CARD_NOT_OWNED_BY_PLAYER");
    loseCardByIndex(state, target.id, index, "marcelo-penalty");
  } else if (pending.type === "robertinho-swap") {
    const ownIndex = actor.hand.findIndex(({ instanceId }) => instanceId === choice.ownInstanceId);
    if (ownIndex === -1) throw new GameRuleError("Escolha uma carta da sua mão.", "CARD_NOT_OWNED_BY_PLAYER");
    const target = getActivePlayer(state, pending.targetPlayerId);
    const targetIndex = target.hand.findIndex(({ instanceId }) => instanceId === pending.targetCardInstanceId);
    if (targetIndex === -1) throw new GameRuleError("A carta usada não está mais com o alvo.", "TARGET_CARD_NO_LONGER_AVAILABLE");
    const [ownCard] = actor.hand.splice(ownIndex, 1);
    const [claimedCard] = target.hand.splice(targetIndex, 1);
    actor.hand.push(claimedCard);
    state.deck.returnAndShuffle([ownCard]);
    target.hand.push(...state.deck.draw(1));
    record(state, { type: "robertinho-swapped", playerId: actor.id, targetPlayerId: target.id });
  }
  state.pendingEffectChoice = null;
  return {
    finishTurn: ["sandra", "altimar", "robertinho-swap"].includes(pending.type)
      && !pending.resumeCurrentTurnAfterChoice,
  };
}

function processScheduledEffects(state, playerId) {
  for (const effect of [...state.activeEffects]) {
    if (state.pendingEffectChoice) break;
    if (effect.nextCheckAtStartOfPlayerId !== playerId) continue;
    if (effect.type === "rodrigo-debt") processRodrigoDebt(state, effect);
    if (effect.type === "marcelo-requirement") processMarceloRequirement(state, effect);
    if (effect.type === "ze-delayed-action") {
      removeEffect(state, effect.id);
      const completed = executeCharacterEffect(state, effect.actionClaim) !== false;
      if (!completed && state.pendingEffectChoice) {
        state.pendingEffectChoice.resumeCurrentTurnAfterChoice = true;
      }
      record(state, { type: "ze-delayed-action-executed", playerId: effect.sourcePlayerId, targetPlayerId: effect.targetPlayerId });
    }
  }
}

function processRodrigoDebt(state, effect) {
  const owner = state.players.find(({ id }) => id === effect.sourcePlayerId);
  const target = state.players.find(({ id }) => id === effect.targetPlayerId);
  if (!owner || owner.eliminated || !target || target.eliminated) return removeEffect(state, effect.id);
  if (target.coins >= effect.amountDue && !hasCaveProtection(state, target.id)) {
    target.coins -= effect.amountDue;
    grantCoins(state, owner, effect.amountDue, "rodrigo-payment");
    record(state, { type: "rodrigo-debt-paid", playerId: owner.id, targetPlayerId: target.id, amount: effect.amountDue });
    return removeEffect(state, effect.id);
  }
  if (effect.failedChecks === 0) {
    effect.failedChecks = 1;
    effect.amountDue = 8;
    record(state, { type: "rodrigo-debt-escalated", playerId: owner.id, targetPlayerId: target.id });
    return;
  }
  removeEffect(state, effect.id);
  state.pendingEffectChoice = { type: "rodrigo-loss", actorPlayerId: owner.id, targetPlayerId: target.id };
  record(state, { type: "rodrigo-defaulted", playerId: owner.id, targetPlayerId: target.id });
}

function processMarceloRequirement(state, effect) {
  const owner = state.players.find(({ id }) => id === effect.sourcePlayerId);
  const target = state.players.find(({ id }) => id === effect.targetPlayerId);
  if (!owner || owner.eliminated || !target || target.eliminated) return removeEffect(state, effect.id);
  const met = effect.comparison === "gte"
    ? target.coins >= effect.threshold
    : target.coins <= effect.threshold;
  if (met) {
    record(state, { type: "marcelo-requirement-met", playerId: owner.id, targetPlayerId: target.id });
    return removeEffect(state, effect.id);
  }
  if (hasCaveProtection(state, target.id)) {
    record(state, { type: "marcelo-blocked-by-cave", targetPlayerId: target.id });
    return;
  }
  if (target.coins >= 2) {
    target.coins -= 2;
    record(state, { type: "marcelo-coin-penalty", playerId: owner.id, targetPlayerId: target.id, amount: 2 });
    return;
  }
  removeEffect(state, effect.id);
  state.pendingEffectChoice = { type: "marcelo-loss", actorPlayerId: owner.id, targetPlayerId: target.id };
  record(state, { type: "marcelo-card-penalty", playerId: owner.id, targetPlayerId: target.id });
}

function loseCardByIndex(state, playerId, index, reason) {
  const player = getActivePlayer(state, playerId);
  if (!Number.isInteger(index) || index < 0 || index >= player.hand.length) {
    throw new GameRuleError("Escolha uma posição válida.", "INVALID_TARGET_CARD_INDEX");
  }
  const [card] = player.hand.splice(index, 1);
  state.revealedCards.push({ sequence: state.revealedCards.length + 1, turnNumber: state.turnNumber, playerId, reason, instanceId: card.instanceId, characterId: card.characterId });
  state.deck.returnAndShuffle([card]);
  if (player.hand.length === 0) {
    player.eliminated = true;
    cancelEffectsFromSource(state, player.id);
    record(state, { type: "player-eliminated", playerId });
  }
}

function removeEffect(state, effectId) {
  state.activeEffects = state.activeEffects.filter(({ id }) => id !== effectId);
}

function applySocialism(state, player) {
  const participants = state.players.filter(
    (candidate) => !candidate.eliminated && !hasCaveProtection(state, candidate.id),
  );
  const total = participants.reduce((sum, candidate) => sum + candidate.coins, 0);
  const share = participants.length ? Math.floor(total / participants.length) : 0;
  const discarded = total - share * participants.length;
  for (const participant of participants) {
    const previous = participant.coins;
    if (share > previous) {
      participant.coins = previous;
      grantCoins(state, participant, share - previous, "paula-granada");
    } else {
      participant.coins = share;
    }
  }
  record(state, {
    type: "socialism-applied",
    playerId: player.id,
    participantIds: participants.map(({ id }) => id),
    share,
    discarded,
  });
}

function resolveAdemar(state, effect) {
  const owner = state.players.find(({ id }) => id === effect.sourcePlayerId);
  if (!owner || owner.eliminated) return;
  for (const target of state.players) {
    if (target.eliminated || target.id === owner.id) continue;
    const gained = target.totalCoinsGained - (effect.gainSnapshot[target.id] ?? 0);
    if (gained > 0 || hasCaveProtection(state, target.id)) continue;
    const stolen = Math.min(2, target.coins);
    target.coins -= stolen;
    const received = grantCoins(state, owner, stolen, "ademar");
    record(state, {
      type: "ademar-stole",
      playerId: owner.id,
      targetPlayerId: target.id,
      amount: received.received,
      takenAmount: stolen,
    });
  }
}

function addEffect(state, effect) {
  state.activeEffects.push({ id: state.nextEffectId++, ...effect });
}

function getActivePlayer(state, playerId) {
  const player = state.players.find(({ id }) => id === playerId);
  if (!player || player.eliminated) {
    throw new GameRuleError("O jogador escolhido não está ativo.", "PLAYER_NOT_ACTIVE");
  }
  return player;
}

function record(state, event) {
  state.events.push({
    sequence: state.events.length + 1,
    turnNumber: state.turnNumber,
    ...event,
  });
}

module.exports = {
  IMPLEMENTED_CHARACTERS,
  executeCharacterEffect,
  applyCharacterChoice,
  cancelEffectsFromSource,
  expireEffectsForTurnStart,
  grantCoins,
  hasCaveProtection,
  prepareCharacterAction,
};
