"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  GameRuleError,
  assertCardIntegrity,
  challengeCharacterAction,
  chooseChallengeLoss,
  createGameState,
  createRoomConfig,
  declareCharacterAction,
  passCharacterChallenge,
  resolveClaimWithoutChallenge,
} = require("../src");

const players = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Beto" },
  { id: "p3", name: "Caio" },
];
const createGame = () =>
  createGameState({
    config: createRoomConfig({
      poolMode: "manual",
      poolSize: 3,
      initialCoins: 5,
      selectedCharacters: ["jeff-dino", "silverio", "deivison"],
    }),
    players,
    rng: () => 0.42,
  });

test("alegação verdadeira troca a carta mostrada e o desafiante escolhe sua perda", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const challenger = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  const claimedCard = actor.hand[0];

  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: claimedCard.characterId,
    parameters: parametersFor(claimedCard.characterId, actor, challenger),
  });
  const claim = challengeCharacterAction(game, {
    challengerPlayerId: challenger.id,
  });

  assert.equal(claim.claimWasTrue, true);
  assert.equal(claim.loserPlayerId, challenger.id);
  assert.equal(actor.hand.length, 2);
  assert.equal(game.revealedCards.at(-1).instanceId, claimedCard.instanceId);

  chooseChallengeLoss(game, {
    playerId: challenger.id,
    instanceId: challenger.hand[0].instanceId,
  });
  assert.equal(challenger.hand.length, 1);
  assert.equal(game.pendingClaim, null);
  assert.equal(assertCardIntegrity(game), true);
});

test("blefe descoberto cancela a ação e o próprio blefador escolhe sua perda", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const challenger = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  const ownedCharacters = new Set(actor.hand.map(({ characterId }) => characterId));
  const bluff = game.characterPool.find((id) => !ownedCharacters.has(id));

  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: bluff,
    parameters: parametersFor(bluff, actor, challenger),
  });
  const claim = challengeCharacterAction(game, {
    challengerPlayerId: challenger.id,
  });
  assert.equal(claim.claimWasTrue, false);
  assert.equal(claim.loserPlayerId, actor.id);

  const result = chooseChallengeLoss(game, {
    playerId: actor.id,
    instanceId: actor.hand[1].instanceId,
  });
  assert.equal(result.actionCancelled, true);
  assert.equal(actor.hand.length, 1);
  assert.equal(game.pendingClaim, null);
});

test("somente o primeiro desafio é aceito", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const challengers = game.players.filter(({ id }) => id !== actor.id);

  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: actor.hand[0].characterId,
    parameters: parametersFor(actor.hand[0].characterId, actor, challengers[0]),
  });
  challengeCharacterAction(game, { challengerPlayerId: challengers[0].id });

  assert.throws(
    () =>
      challengeCharacterAction(game, { challengerPlayerId: challengers[1].id }),
    (error) =>
      error instanceof GameRuleError &&
      error.code === "CLAIM_NOT_AT_REQUIRED_STAGE",
  );
});

test("uma alegação sem desafio é executada quando a janela termina", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const previousTurn = game.turnNumber;
  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: actor.hand[0].characterId,
    parameters: parametersFor(
      actor.hand[0].characterId,
      actor,
      game.players.find(({ id }) => id !== actor.id),
    ),
  });

  resolveClaimWithoutChallenge(game, { playerId: actor.id });

  assert.equal(game.pendingClaim, null);
  assert.equal(game.turnNumber, previousTurn + 1);
});

test("a janela termina antes do cronômetro quando todos votam não desafiar", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const voters = game.players.filter(({ id }) => id !== actor.id);
  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: "silverio",
  });

  const firstVote = passCharacterChallenge(game, { playerId: voters[0].id });
  assert.equal(firstVote.resolved, false);
  assert.ok(game.pendingClaim);
  const secondVote = passCharacterChallenge(game, { playerId: voters[1].id });
  assert.equal(secondVote.resolved, true);
  assert.equal(game.pendingClaim, null);
  assert.equal(game.activeEffects[0].type, "cave");
});

function parametersFor(characterId, actor, target) {
  if (characterId === "jeff-dino") return { targetPlayerId: target.id };
  if (characterId === "deivison") return { mode: "deposit", amount: 1 };
  return {};
}
