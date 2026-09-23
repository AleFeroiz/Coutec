"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  chooseCharacterEffect,
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

function createGame(initialCoins) {
  return createGameState({
    config: createRoomConfig({
      poolMode: "manual",
      poolSize: 4,
      selectedCharacters: ["rodrigo", "marcelo-moreira", "silverio", "jeff-dino"],
      initialCoins,
    }),
    players,
    rng: () => 0.42,
  });
}

function useSilverio(game, player) {
  declareCharacterAction(game, { playerId: player.id, characterId: "silverio" });
  resolveClaimWithoutChallenge(game);
}

function useJeff(game, player, target) {
  declareCharacterAction(game, {
    playerId: player.id,
    characterId: "jeff-dino",
    parameters: { targetPlayerId: target.id },
  });
  resolveClaimWithoutChallenge(game);
}

test("Rodrigo cobra 4, escala para 8 e permite ao credor escolher a perda", () => {
  const game = createGame(6);
  const owner = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % 3];
  const third = game.players[(game.currentPlayerIndex + 2) % 3];
  declareCharacterAction(game, {
    playerId: owner.id,
    characterId: "rodrigo",
    parameters: { targetPlayerId: target.id },
  });
  assert.equal(owner.coins, 4);
  assert.equal(target.coins, 8);
  resolveClaimWithoutChallenge(game);

  useSilverio(game, target);
  collectCoin(game, third.id);
  const debt = game.activeEffects.find(({ type }) => type === "rodrigo-debt");
  assert.equal(debt.amountDue, 8);

  collectCoin(game, owner.id);
  useSilverio(game, target);
  collectCoin(game, third.id);
  assert.equal(game.pendingEffectChoice.type, "rodrigo-loss");
  const oldSize = target.hand.length;
  chooseCharacterEffect(game, {
    playerId: owner.id,
    choice: { targetCardIndex: 0 },
  });
  assert.equal(target.hand.length, oldSize - 1);
});

test("Marcelo aplica moedas e depois uma perda escolhida pelo alvo", () => {
  const game = createGame(3);
  const owner = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % 3];
  const third = game.players[(game.currentPlayerIndex + 2) % 3];
  declareCharacterAction(game, {
    playerId: owner.id,
    characterId: "marcelo-moreira",
    parameters: { targetPlayerId: target.id, comparison: "gte", threshold: 8 },
  });
  resolveClaimWithoutChallenge(game);
  collectCoin(game, target.id);
  collectCoin(game, third.id);
  assert.equal(target.coins, 2);

  collectCoin(game, owner.id);
  target.coins = 1;
  useJeff(game, target, third);
  collectCoin(game, third.id);
  assert.equal(game.pendingEffectChoice.type, "marcelo-loss");
  const chosen = target.hand[0];
  chooseCharacterEffect(game, {
    playerId: target.id,
    choice: { ownInstanceId: chosen.instanceId },
  });
  assert.equal(target.hand.length, 1);
});
