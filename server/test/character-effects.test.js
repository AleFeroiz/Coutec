"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  collectCoin,
  createGameState,
  createRoomConfig,
  declareCharacterAction,
  resolveClaimWithoutChallenge,
} = require("../src");

const players = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Beto" },
  { id: "p3", name: "Caio" },
];

function createGame(initialCoins = 5) {
  return createGameState({
    config: createRoomConfig({
      poolMode: "manual",
      poolSize: 3,
      selectedCharacters: ["jeff-dino", "silverio", "deivison"],
      initialCoins,
    }),
    players,
    rng: () => 0.42,
  });
}

test("dinossaurinho come uma moeda ganha e expira no próximo turno do criador", () => {
  const game = createGame(0);
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  const third = game.players[(game.currentPlayerIndex + 2) % game.players.length];

  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: "jeff-dino",
    parameters: { targetPlayerId: target.id },
  });
  resolveClaimWithoutChallenge(game);
  assert.equal(game.activeEffects[0].type, "dinosaur");

  const gain = collectCoin(game, target.id);
  assert.equal(gain.amount, 0);
  assert.equal(gain.eatenByDinosaur, 1);
  assert.equal(target.coins, 0);
  collectCoin(game, third.id);
  assert.equal(game.players[game.currentPlayerIndex].id, actor.id);
  assert.equal(game.activeEffects.length, 0);
});

test("Silvério cria a caverna até o começo do próximo turno do usuário", () => {
  const game = createGame(3);
  const actor = game.players[game.currentPlayerIndex];

  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: "silverio",
  });
  resolveClaimWithoutChallenge(game);
  assert.equal(game.activeEffects[0].type, "cave");

  for (let count = 0; count < 2; count += 1) {
    const current = game.players[game.currentPlayerIndex];
    collectCoin(game, current.id);
  }
  assert.equal(game.players[game.currentPlayerIndex].id, actor.id);
  assert.equal(game.activeEffects.length, 0);
});

test("Deivison cobra taxa normal para guardar e retirar qualquer quantidade", () => {
  const game = createGame(5);
  const actor = game.players[game.currentPlayerIndex];

  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: "deivison",
    parameters: { mode: "deposit", amount: 2 },
  });
  assert.equal(actor.coins, 4);
  resolveClaimWithoutChallenge(game);
  assert.equal(actor.coins, 2);
  assert.equal(actor.repositoryCoins, 2);

  for (let count = 0; count < 2; count += 1) {
    const current = game.players[game.currentPlayerIndex];
    collectCoin(game, current.id);
  }
  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: "deivison",
    parameters: { mode: "withdraw", amount: 2 },
  });
  assert.equal(actor.coins, 1);
  resolveClaimWithoutChallenge(game);
  assert.equal(actor.coins, 3);
  assert.equal(actor.repositoryCoins, 0);
});
