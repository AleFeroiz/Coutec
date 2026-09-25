"use strict";

const { GameRuleError } = require("./errors");
const { assertCardIntegrity } = require("./game-state");
const {
  applyCharacterChoice,
  executeCharacterEffect,
  prepareCharacterAction,
} = require("./character-effects");
const {
  finishGameIfThereIsAWinner,
  finishTurn,
  loseInfluence,
  recordEvent,
  recordRevealedCards,
  requireCoupIsNotMandatory,
  requireCurrentPlayer,
} = require("./turn-actions");

function declareCharacterAction(state, { playerId, characterId, parameters = {}, allowOutOfTurn = false, allowAndreia = false }) {
  const player = allowOutOfTurn
    ? requireActivePlayer(state, playerId)
    : requireCurrentPlayer(state, playerId);
  if (characterId === "andreia" && !allowAndreia) {
    throw new GameRuleError("Andreia só pode ser alegada após um Golpe certeiro.", "ANDREIA_NOT_AVAILABLE");
  }
  if (characterId !== "paula-granada") requireCoupIsNotMandatory(player);
  requireNoPendingClaim(state);
  const prepared = prepareCharacterAction(state, {
    playerId,
    characterId,
    parameters,
  });

  state.pendingClaim = {
    id: `${state.turnNumber}:${state.events.length + 1}`,
    actorPlayerId: playerId,
    characterId,
    parameters: prepared.parameters,
    announcedCost: prepared.announcedCost,
    effectImplemented: prepared.effectImplemented,
    stage: "challenge-window",
    challengerPlayerId: null,
    loserPlayerId: null,
    claimWasTrue: null,
    passedPlayerIds: [],
  };
  recordEvent(state, { type: "character-claimed", playerId, characterId });
  return state.pendingClaim;
}

function respondAndreiaOffer(state, { playerId, use }) {
  const pending = state.pendingEffectChoice;
  if (!pending || pending.type !== "andreia-offer" || pending.actorPlayerId !== playerId) {
    throw new GameRuleError("Não há uma continuação da Andreia disponível.", "NO_ANDREIA_OFFER");
  }
  state.pendingEffectChoice = null;
  if (!use) {
    finishTurn(state);
    return { claimed: false };
  }
  declareCharacterAction(state, {
    playerId,
    characterId: "andreia",
    allowOutOfTurn: true,
    allowAndreia: true,
  });
  return { claimed: true };
}

function declareForcedWaveCharacter(state, { playerId, characterId, parameters = {} }) {
  const pending = state.pendingEffectChoice;
  if (!pending || pending.type !== "wave-action" || pending.targetPlayerId !== playerId || pending.forcedAction !== "character") {
    throw new GameRuleError("Este jogador não foi obrigado a usar uma carta.", "NO_FORCED_CHARACTER_ACTION");
  }
  if (containsPlayerId(parameters, pending.actorPlayerId)) {
    throw new GameRuleError("A ação forçada não pode escolher o usuário do Wave.", "WAVE_USER_CANNOT_BE_TARGETED");
  }
  state.pendingEffectChoice = null;
  try {
    return declareCharacterAction(state, { playerId, characterId, parameters, allowOutOfTurn: true });
  } catch (error) {
    state.pendingEffectChoice = pending;
    throw error;
  }
}

function containsPlayerId(value, playerId) {
  if (value === playerId) return true;
  if (Array.isArray(value)) return value.some((item) => containsPlayerId(item, playerId));
  if (value && typeof value === "object") return Object.values(value).some((item) => containsPlayerId(item, playerId));
  return false;
}

function challengeCharacterAction(state, { challengerPlayerId }) {
  const claim = requireClaimAtStage(state, "challenge-window");
  const challenger = requireActivePlayer(state, challengerPlayerId);
  if (challenger.id === claim.actorPlayerId) {
    throw new GameRuleError(
      "O jogador não pode desafiar a própria alegação.",
      "SELF_CHALLENGE",
    );
  }

  // A mudança de estágio acontece imediatamente: qualquer desafio posterior
  // será rejeitado, garantindo que apenas o primeiro seja aceito.
  claim.stage = "loss-selection";
  claim.challengerPlayerId = challenger.id;
  const actor = requireActivePlayer(state, claim.actorPlayerId);
  const claimedCard = actor.hand.find(
    ({ characterId }) => characterId === claim.characterId,
  );
  claim.claimWasTrue = Boolean(claimedCard);

  if (claimedCard) {
    replaceRevealedClaimCard(state, actor, claimedCard);
    claim.loserPlayerId = challenger.id;
  } else {
    claim.loserPlayerId = actor.id;
  }

  recordEvent(state, {
    type: "claim-challenged",
    playerId: challenger.id,
    actorPlayerId: actor.id,
    characterId: claim.characterId,
    claimWasTrue: claim.claimWasTrue,
  });
  return claim;
}

function chooseChallengeLoss(state, { playerId, instanceId }) {
  const claim = requireClaimAtStage(state, "loss-selection");
  if (claim.loserPlayerId !== playerId) {
    throw new GameRuleError(
      "Somente o dono da influência perdida pode escolher a carta.",
      "ONLY_LOSER_CHOOSES_CARD",
    );
  }

  const lostCard = loseInfluence(state, {
    playerId,
    instanceId,
    reason: claim.claimWasTrue ? "failed-challenge" : "caught-bluff",
  });
  const result = {
    claimWasTrue: claim.claimWasTrue,
    actionCancelled: !claim.claimWasTrue,
    lostCharacterId: lostCard.characterId,
  };
  recordEvent(state, {
    type: "challenge-resolved",
    actorPlayerId: claim.actorPlayerId,
    challengerPlayerId: claim.challengerPlayerId,
    characterId: claim.characterId,
    ...result,
  });
  state.pendingClaim = null;
  if (!finishGameIfThereIsAWinner(state)) continueAfterClaim(state, claim, claim.claimWasTrue);
  return result;
}

function passCharacterChallenge(state, { playerId }) {
  const claim = requireClaimAtStage(state, "challenge-window");
  const player = requireActivePlayer(state, playerId);
  if (claim.actorPlayerId === player.id) {
    throw new GameRuleError(
      "Quem fez a alegação não vota na própria janela.",
      "ACTOR_CANNOT_PASS_OWN_CLAIM",
    );
  }
  if (!claim.passedPlayerIds.includes(player.id)) claim.passedPlayerIds.push(player.id);
  recordEvent(state, { type: "challenge-passed", playerId: player.id });

  const eligibleIds = state.players
    .filter(({ id, eliminated }) => !eliminated && id !== claim.actorPlayerId)
    .map(({ id }) => id);
  if (eligibleIds.every((id) => claim.passedPlayerIds.includes(id))) {
    resolveClaimWithoutChallenge(state);
    return { resolved: true };
  }
  return { resolved: false };
}

function resolveClaimWithoutChallenge(state) {
  const claim = requireClaimAtStage(state, "challenge-window");
  recordEvent(state, {
    type: "claim-unchallenged",
    playerId: claim.actorPlayerId,
    characterId: claim.characterId,
  });
  state.pendingClaim = null;
  continueAfterClaim(state, claim, true);
  return { actionCancelled: false };
}

function chooseCharacterEffect(state, { playerId, choice }) {
  const result = applyCharacterChoice(state, { playerId, choice });
  assertCardIntegrity(state);
  if (finishGameIfThereIsAWinner(state)) return { completed: true };
  if (result.finishTurn) {
    if (state.suspendedEffectChoice) {
      state.pendingEffectChoice = state.suspendedEffectChoice;
      state.suspendedEffectChoice = null;
      return { completed: true };
    }
    if (state.postEffectReactionClaim) {
      const claim = state.postEffectReactionClaim;
      state.postEffectReactionClaim = null;
      openReactionOrFinish(state, "robertinho", claim);
    } else finishTurn(state);
  }
  return { completed: true };
}

function claimReaction(state, { playerId }) {
  const reaction = state.pendingReaction;
  if (!reaction) throw new GameRuleError("Não há reação aberta.", "NO_REACTION_WINDOW");
  if (!reaction.eligiblePlayerIds.includes(playerId)) throw new GameRuleError("Você não pode usar esta reação.", "PLAYER_NOT_ELIGIBLE_FOR_REACTION");
  const characterId = reaction.type;
  state.pendingReaction = null;
  try {
    const claim = declareCharacterAction(state, {
      playerId,
      characterId,
      allowOutOfTurn: true,
      parameters: {},
    });
    claim.kind = "reaction";
    claim.reactionContext = { type: characterId, actionClaim: reaction.actionClaim };
    return claim;
  } catch (error) {
    state.pendingReaction = reaction;
    throw error;
  }
}

function passReaction(state, { playerId }) {
  const reaction = state.pendingReaction;
  if (!reaction || !reaction.eligiblePlayerIds.includes(playerId)) {
    throw new GameRuleError("Não há reação disponível para você.", "NO_REACTION_WINDOW");
  }
  if (!reaction.passedPlayerIds.includes(playerId)) reaction.passedPlayerIds.push(playerId);
  if (reaction.eligiblePlayerIds.every((id) => reaction.passedPlayerIds.includes(id))) {
    resolveReactionWithoutClaim(state);
    return { resolved: true };
  }
  return { resolved: false };
}

function resolveReactionWithoutClaim(state) {
  const reaction = state.pendingReaction;
  if (!reaction) return false;
  state.pendingReaction = null;
  if (reaction.type === "ze") executeOriginalAction(state, reaction.actionClaim);
  else finishOrResumeEffect(state);
  return true;
}

function continueAfterClaim(state, claim, succeeded) {
  if (claim.kind === "reaction") {
    if (succeeded) {
      const completed = executeCharacterEffect(state, claim) !== false;
      if (completed) finishOrResumeEffect(state);
    } else if (claim.reactionContext.type === "ze") executeOriginalAction(state, claim.reactionContext.actionClaim);
    else finishOrResumeEffect(state);
    return;
  }
  if (!succeeded) return finishTurn(state);
  openReactionOrFinish(state, "ze", claim);
}

function openReactionOrFinish(state, type, actionClaim) {
  const eligiblePlayerIds = state.players
    .filter(({ id, eliminated, coins }) => !eliminated && id !== actionClaim.actorPlayerId && coins >= 2)
    .map(({ id }) => id);
  if (!state.characterPool.includes(type) || !eligiblePlayerIds.length) {
    if (type === "ze") executeOriginalAction(state, actionClaim);
    else finishOrResumeEffect(state);
    return false;
  }
  state.pendingReaction = {
    type,
    actionClaim,
    eligiblePlayerIds,
    passedPlayerIds: [],
    expiresAt: Date.now() + state.config.challengeSeconds * 1000,
  };
  recordEvent(state, { type: "reaction-window-opened", reactionType: type, actorPlayerId: actionClaim.actorPlayerId });
  return true;
}

function executeOriginalAction(state, claim) {
  const completed = executeCharacterEffect(state, claim) !== false;
  if (completed) openReactionOrFinish(state, "robertinho", claim);
  else if (["wave-action", "andreia-coup"].includes(state.pendingEffectChoice?.type)) {
    state.suspendedEffectChoice = state.pendingEffectChoice;
    state.pendingEffectChoice = null;
    openReactionOrFinish(state, "robertinho", claim);
  } else {
    state.postEffectReactionClaim = claim;
  }
}

function finishOrResumeEffect(state) {
  if (state.suspendedEffectChoice) {
    state.pendingEffectChoice = state.suspendedEffectChoice;
    state.suspendedEffectChoice = null;
  } else {
    finishTurn(state);
  }
}

function replaceRevealedClaimCard(state, player, card) {
  const cardIndex = player.hand.findIndex(
    ({ instanceId }) => instanceId === card.instanceId,
  );
  player.hand.splice(cardIndex, 1);
  recordRevealedCards(state, player.id, [card], "proved-claim");
  state.deck.returnAndShuffle([card]);
  player.hand.push(...state.deck.draw(1));
  assertCardIntegrity(state);
}

function requireNoPendingClaim(state) {
  if (state.pendingClaim || state.pendingEffectChoice) {
    throw new GameRuleError(
      "Já existe uma alegação aguardando resolução.",
      "CLAIM_ALREADY_PENDING",
    );
  }
}

function requireClaimAtStage(state, stage) {
  if (!state.pendingClaim || state.pendingClaim.stage !== stage) {
    throw new GameRuleError(
      "Não existe uma alegação nessa etapa.",
      "CLAIM_NOT_AT_REQUIRED_STAGE",
    );
  }
  return state.pendingClaim;
}

function requireActivePlayer(state, playerId) {
  const player = state.players.find(({ id }) => id === playerId);
  if (!player || player.eliminated) {
    throw new GameRuleError("O jogador não está ativo.", "PLAYER_NOT_ACTIVE");
  }
  return player;
}

module.exports = {
  challengeCharacterAction,
  claimReaction,
  chooseChallengeLoss,
  chooseCharacterEffect,
  declareCharacterAction,
  declareForcedWaveCharacter,
  passCharacterChallenge,
  passReaction,
  resolveClaimWithoutChallenge,
  resolveReactionWithoutClaim,
  respondAndreiaOffer,
};
