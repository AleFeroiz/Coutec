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
const { serializeRoomForPlayer } = require("../src/network/serialize-room");

const players = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Beto" },
  { id: "p3", name: "Caio" },
];
const selectedCharacters = [
  "jeff-dino", "silverio", "deivison", "paula-granada",
  "ademar", "sandra", "altimar", "luis-sapeca",
];

function createGame(initialCoins = 6) {
  return createGameState({
    config: createRoomConfig({
      poolMode: "manual",
      poolSize: selectedCharacters.length,
      selectedCharacters,
      initialCoins,
    }),
    players,
    rng: () => 0.42,
  });
}

test("Paula reparte só moedas normais de jogadores sem caverna", () => {
  const game = createGame(10);
  const actor = game.players[game.currentPlayerIndex];
  const protectedPlayer = game.players[(game.currentPlayerIndex + 1) % 3];
  const third = game.players[(game.currentPlayerIndex + 2) % 3];
  protectedPlayer.coins = 5;
  third.coins = 0;
  game.activeEffects.push({
    id: game.nextEffectId++, type: "cave", sourcePlayerId: protectedPlayer.id,
    targetPlayerId: protectedPlayer.id, expiresAtStartOfPlayerId: protectedPlayer.id,
  });

  declareCharacterAction(game, { playerId: actor.id, characterId: "paula-granada" });
  resolveClaimWithoutChallenge(game);

  assert.equal(actor.coins, 1);
  assert.equal(third.coins, 1);
  assert.equal(protectedPlayer.coins, 5);
});

test("Ademar rouba no começo do próximo turno apenas de quem não ganhou moedas", () => {
  const game = createGame(6);
  const actor = game.players[game.currentPlayerIndex];
  const targetWhoGains = game.players[(game.currentPlayerIndex + 1) % 3];
  const targetWithoutGain = game.players[(game.currentPlayerIndex + 2) % 3];
  declareCharacterAction(game, { playerId: actor.id, characterId: "ademar" });
  resolveClaimWithoutChallenge(game);

  collectCoin(game, targetWhoGains.id);
  declareCharacterAction(game, {
    playerId: targetWithoutGain.id,
    characterId: "jeff-dino",
    parameters: { targetPlayerId: targetWhoGains.id },
  });
  resolveClaimWithoutChallenge(game);

  assert.equal(targetWhoGains.coins, 7);
  assert.equal(targetWithoutGain.coins, 4);
  assert.equal(actor.coins, 6);
});

test("Luis Sapeca troca as mãos completas de dois jogadores", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const targets = game.players.filter(({ id }) => id !== actor.id);
  const firstHand = targets[0].hand.map(({ instanceId }) => instanceId);
  const secondHand = targets[1].hand.map(({ instanceId }) => instanceId);
  declareCharacterAction(game, {
    playerId: actor.id,
    characterId: "luis-sapeca",
    parameters: { targetPlayerIds: targets.map(({ id }) => id) },
  });
  resolveClaimWithoutChallenge(game);
  assert.deepEqual(targets[0].hand.map(({ instanceId }) => instanceId), secondHand);
  assert.deepEqual(targets[1].hand.map(({ instanceId }) => instanceId), firstHand);
});

test("Sandra consulta o baralho depois da alegação e troca uma carta sem revelar", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const oldCard = actor.hand[0];
  const chosen = game.deck.cards[0];
  declareCharacterAction(game, { playerId: actor.id, characterId: "sandra" });
  resolveClaimWithoutChallenge(game);
  assert.equal(game.pendingEffectChoice.type, "sandra");
  chooseCharacterEffect(game, {
    playerId: actor.id,
    choice: { ownInstanceId: oldCard.instanceId, deckInstanceId: chosen.instanceId },
  });
  assert.ok(actor.hand.some(({ instanceId }) => instanceId === chosen.instanceId));
  assert.equal(game.revealedCards.some(({ instanceId }) => instanceId === oldCard.instanceId), false);
});

test("Altimar rasga uma posição escondida e entrega a carta escolhida", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % 3];
  const torn = target.hand[1];
  const chosen = game.deck.cards[0];
  declareCharacterAction(game, { playerId: actor.id, characterId: "altimar" });
  resolveClaimWithoutChallenge(game);
  chooseCharacterEffect(game, {
    playerId: actor.id,
    choice: {
      targetPlayerId: target.id,
      targetCardIndex: 1,
      deckInstanceId: chosen.instanceId,
    },
  });
  assert.equal(target.hand[1].instanceId, chosen.instanceId);
  assert.equal(game.revealedCards.at(-1).instanceId, torn.instanceId);
});

test("somente Sandra ou Altimar recebe o conteúdo privado do baralho", () => {
  const game = createGame();
  const actor = game.players[game.currentPlayerIndex];
  const opponent = game.players.find(({ id }) => id !== actor.id);
  declareCharacterAction(game, { playerId: actor.id, characterId: "sandra" });
  resolveClaimWithoutChallenge(game);
  const room = {
    id: "PRIVADO",
    phase: "playing",
    hostPlayerId: actor.id,
    config: game.config,
    players: game.players,
    game,
  };

  assert.equal(
    serializeRoomForPlayer(room, actor.id).game.effectChoiceOptions.deckCards.length,
    game.deck.size,
  );
  assert.equal(
    serializeRoomForPlayer(room, opponent.id).game.effectChoiceOptions,
    null,
  );
});
