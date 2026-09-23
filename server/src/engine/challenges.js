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

function declareCharacterAction(state, { playerId, characterId, parameters = {} }) {
  const player = requireCurrentPlayer(state, playerId);
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

  const effectCompleted = claim.claimWasTrue
    ? executeCharacterEffect(state, claim) !== false
    : true;
  if (!finishGameIfThereIsAWinner(state) && effectCompleted) finishTurn(state);
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
  const effectCompleted = executeCharacterEffect(state, claim) !== false;
  if (effectCompleted) finishTurn(state);
  return { actionCancelled: false };
}

function chooseCharacterEffect(state, { playerId, choice }) {
  applyCharacterChoice(state, { playerId, choice });
  assertCardIntegrity(state);
  finishTurn(state);
  return { completed: true };
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
  if (state.pendingClaim) {
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
  chooseChallengeLoss,
  chooseCharacterEffect,
  declareCharacterAction,
  passCharacterChallenge,
  resolveClaimWithoutChallenge,
};
