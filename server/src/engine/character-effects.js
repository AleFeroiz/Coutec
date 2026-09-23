"use strict";

const { getCharacter } = require("../cards/catalog");
const { GameRuleError } = require("./errors");

const IMPLEMENTED_CHARACTERS = new Set([
  "jeff-dino", "silverio", "deivison", "paula-granada", "ademar",
  "sandra", "altimar", "luis-sapeca",
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
  const announcedCost = characterId === "paula-granada"
    ? 7
    : character.cost.type === "coins" ? character.cost.amount : 0;
  if (player.coins < announcedCost) {
    throw new GameRuleError(
      `São necessárias ${announcedCost} moedas para anunciar essa ação.`,
      "NOT_ENOUGH_COINS_FOR_CHARACTER",
    );
  }
  player.coins -= announcedCost;
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
}

function applyCharacterChoice(state, { playerId, choice }) {
  const pending = state.pendingEffectChoice;
  if (!pending || pending.actorPlayerId !== playerId) {
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
  } else {
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
  }
  state.pendingEffectChoice = null;
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
