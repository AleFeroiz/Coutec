"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  collectCoinForcedByWave,
  claimReaction,
  chooseCharacterEffect,
  createGameState,
  createRoomConfig,
  declareCharacterAction,
  declareForcedWaveCharacter,
  performCoup,
  resolveClaimWithoutChallenge,
  resolveReactionWithoutClaim,
  respondAndreiaOffer,
} = require("../src");

const players = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Beto" },
  { id: "p3", name: "Caio" },
];
const selectedCharacters = ["andreia", "wave", "jeff-dino", "silverio", "deivison"];

function createGame(initialCoins = 12) {
  return createGameState({
    config: createRoomConfig({ poolMode: "manual", poolSize: selectedCharacters.length, selectedCharacters, initialCoins }),
    players,
    rng: () => 0.42,
  });
}

test("Andreia é alegada após um acerto e libera um Golpe gratuito", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players.find(({ id }) => id !== actor.id);
  const firstGuess = target.hand[0].characterId;
  performCoup(game, { playerId: actor.id, targetPlayerId: target.id, guessedCharacterId: firstGuess });
  assert.equal(game.pendingEffectChoice.type, "andreia-offer");

  respondAndreiaOffer(game, { playerId: actor.id, use: true });
  assert.equal(game.pendingClaim.characterId, "andreia");
  resolveClaimWithoutChallenge(game);
  assert.equal(game.pendingEffectChoice.type, "andreia-coup");

  const coinsBefore = actor.coins;
  const secondTarget = game.players.find(({ id, eliminated }) => id !== actor.id && !eliminated);
  performCoup(game, { playerId: actor.id, targetPlayerId: secondTarget.id, guessedCharacterId: secondTarget.hand[0].characterId, freeAndreia: true });
  assert.equal(actor.coins, coinsBefore);
});

test("o alvo do Wave executa a coleta e o turno original termina", () => {
  const game = createGame(9);
  const waveUser = game.players[game.currentPlayerIndex];
  const forced = game.players.find(({ id }) => id !== waveUser.id);
  declareCharacterAction(game, { playerId: waveUser.id, characterId: "wave", parameters: { targetPlayerId: forced.id, forcedAction: "collect" } });
  resolveClaimWithoutChallenge(game);
  const before = forced.coins;
  collectCoinForcedByWave(game, forced.id);
  assert.equal(forced.coins, before + 1);
  assert.notEqual(game.players[game.currentPlayerIndex].id, waveUser.id);
});

test("a carta forçada pelo Wave não pode escolher o usuário do Wave", () => {
  const game = createGame(9);
  const waveUser = game.players[game.currentPlayerIndex];
  const forced = game.players.find(({ id }) => id !== waveUser.id);
  declareCharacterAction(game, { playerId: waveUser.id, characterId: "wave", parameters: { targetPlayerId: forced.id, forcedAction: "character" } });
  resolveClaimWithoutChallenge(game);
  assert.throws(() => declareForcedWaveCharacter(game, {
    playerId: forced.id,
    characterId: "jeff-dino",
    parameters: { targetPlayerId: waveUser.id },
  }), ({ code }) => code === "WAVE_USER_CANNOT_BE_TARGETED");
});

test("Zé pode ser alegado na reação e adia a habilidade original", () => {
  const game = createGame(6);
  game.characterPool.push("ze");
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players.find(({ id }) => id !== actor.id);
  declareCharacterAction(game, { playerId: actor.id, characterId: "jeff-dino", parameters: { targetPlayerId: target.id } });
  resolveClaimWithoutChallenge(game);
  assert.equal(game.pendingReaction.type, "ze");
  const zeUser = game.players.find(({ id }) => game.pendingReaction.eligiblePlayerIds.includes(id));
  claimReaction(game, { playerId: zeUser.id });
  assert.equal(game.pendingClaim.characterId, "ze");
  resolveClaimWithoutChallenge(game);
  assert.ok(game.events.some(({ type }) => type === "ze-action-delayed"));
});

test("Robertinho troca uma carta própria pela carta realmente usada", () => {
  const game = createGame(6);
  game.characterPool.push("robertinho");
  const actor = game.players.find(({ hand }) => hand.some(({ characterId }) => characterId === "jeff-dino"));
  game.currentPlayerIndex = game.players.findIndex(({ id }) => id === actor.id);
  const claimedCard = actor.hand.find(({ characterId }) => characterId === "jeff-dino");
  const robertinhoUser = game.players.find(({ id }) => id !== actor.id);
  const ownCard = robertinhoUser.hand[0];
  declareCharacterAction(game, { playerId: actor.id, characterId: "jeff-dino", parameters: { targetPlayerId: robertinhoUser.id } });
  resolveClaimWithoutChallenge(game);
  if (game.pendingReaction?.type === "ze") resolveReactionWithoutClaim(game);
  assert.equal(game.pendingReaction.type, "robertinho");
  claimReaction(game, { playerId: robertinhoUser.id });
  resolveClaimWithoutChallenge(game);
  assert.equal(game.pendingEffectChoice.type, "robertinho-swap");
  chooseCharacterEffect(game, { playerId: robertinhoUser.id, choice: { ownInstanceId: ownCard.instanceId } });
  assert.ok(robertinhoUser.hand.some(({ instanceId }) => instanceId === claimedCard.instanceId));
  assert.equal(actor.hand.length, 2);
});
