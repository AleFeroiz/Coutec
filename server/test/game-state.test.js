"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CHARACTER_CATALOG,
  GameRuleError,
  addPlayer,
  assertCardIntegrity,
  collectCoin,
  createGameState,
  createRoom,
  createRoomConfig,
  loseInfluence,
  performCoup,
  startGame,
} = require("../src");

const fixedRng = () => 0.42;
const players = [
  { id: "p1", name: "Ana" },
  { id: "p2", name: "Beto" },
  { id: "p3", name: "Caio" },
];

test("o catálogo contém os 14 personagens do documento", () => {
  assert.equal(CHARACTER_CATALOG.length, 14);
  assert.equal(new Set(CHARACTER_CATALOG.map(({ id }) => id)).size, 14);
});

test("a configuração padrão preserva o pool e começa com 0 moedas", () => {
  const config = createRoomConfig();
  assert.equal(config.poolSize, 5);
  assert.equal(config.copiesPerCharacter, 3);
  assert.equal(config.poolMode, "random");
  assert.deepEqual(config.bannedCharacters, []);
  assert.equal(config.initialCoins, 0);
  assert.equal(config.challengeSeconds, 5);
});

test("o pool aleatório respeita personagens banidos", () => {
  const config = createRoomConfig({
    bannedCharacters: ["wave", "altimar", "sandra"],
  });
  const game = createGameState({ config, players, rng: fixedRng });
  assert.equal(game.characterPool.length, 5);
  assert.equal(game.characterPool.includes("wave"), false);
  assert.equal(game.characterPool.includes("altimar"), false);
  assert.equal(game.characterPool.includes("sandra"), false);
});

test("o pool manual usa exatamente a seleção do host", () => {
  const selectedCharacters = [
    "jeff-dino",
    "altimar",
    "silverio",
    "ademar",
    "wave",
  ];
  const config = createRoomConfig({
    poolMode: "manual",
    selectedCharacters,
  });
  const game = createGameState({ config, players, rng: fixedRng });
  assert.deepEqual(game.characterPool, selectedCharacters);
});

test("uma partida distribui cartas, usa as moedas configuradas e sorteia quem começa", () => {
  const config = createRoomConfig({ initialCoins: 4 });
  const game = createGameState({ config, players, rng: fixedRng });

  assert.equal(game.totalCardCount, 15);
  assert.equal(game.deck.size, 9);
  assert.deepEqual(
    game.players.map(({ hand }) => hand.length),
    [2, 2, 2],
  );
  assert.deepEqual(
    game.players.map(({ coins }) => coins),
    [4, 4, 4],
  );
  assert.equal(game.currentPlayerIndex, 1);
  assert.equal(assertCardIntegrity(game), true);
});

test("a integridade detecta a duplicação de uma carta física", () => {
  const game = createGameState({
    config: createRoomConfig(),
    players,
    rng: fixedRng,
  });
  game.deck.cards[0] = game.players[0].hand[0];

  assert.throws(
    () => assertCardIntegrity(game),
    (error) =>
      error instanceof GameRuleError && error.code === "DUPLICATE_CARD_INSTANCE",
  );
});

test("o host pode configurar a quantidade de moedas iniciais", () => {
  const game = createGameState({
    config: createRoomConfig({ initialCoins: 6 }),
    players,
    rng: fixedRng,
  });
  assert.deepEqual(
    game.players.map(({ coins }) => coins),
    [6, 6, 6],
  );
});

test("banimentos no modo manual impedem selecionar o personagem banido", () => {
  assert.throws(
    () =>
      createRoomConfig({
        poolMode: "manual",
        bannedCharacters: ["wave"],
        selectedCharacters: [
          "jeff-dino",
          "altimar",
          "silverio",
          "ademar",
          "wave",
        ],
      }),
    (error) =>
      error instanceof GameRuleError && error.code === "BANNED_CHARACTER_SELECTED",
  );
});

test("o modo manual aceita banimentos fora do pool escolhido", () => {
  const config = createRoomConfig({
    poolMode: "manual",
    bannedCharacters: ["wave", "sandra"],
    selectedCharacters: [
      "jeff-dino",
      "altimar",
      "silverio",
      "ademar",
      "robertinho",
    ],
  });

  assert.deepEqual(config.bannedCharacters, ["wave", "sandra"]);
});

test("somente o host inicia uma sala com dois ou mais jogadores", () => {
  const room = createRoom({ id: "sala-1", hostPlayerId: "p1" });
  for (const player of players.slice(0, 2)) addPlayer(room, player);

  assert.throws(
    () => startGame(room, { requestingPlayerId: "p2" }),
    (error) => error.code === "ONLY_HOST_CAN_START",
  );

  const game = startGame(room, {
    requestingPlayerId: "p1",
    rng: fixedRng,
  });
  assert.equal(room.phase, "playing");
  assert.equal(game.players.length, 2);
});

test("uma partida não inicia com apenas um jogador", () => {
  const room = createRoom({ id: "sala-solo", hostPlayerId: "p1" });
  addPlayer(room, players[0]);
  assert.throws(
    () => startGame(room, { requestingPlayerId: "p1", rng: fixedRng }),
    (error) => error.code === "NOT_ENOUGH_PLAYERS",
  );
});

test("coletar uma moeda encerra o turno e passa ao próximo jogador ativo", () => {
  const game = createGameState({
    config: createRoomConfig(),
    players,
    rng: fixedRng,
  });
  const currentPlayer = game.players[game.currentPlayerIndex];
  const nextIndex = (game.currentPlayerIndex + 1) % game.players.length;

  const result = collectCoin(game, currentPlayer.id);

  assert.equal(result.coins, 1);
  assert.equal(currentPlayer.coins, 1);
  assert.equal(game.currentPlayerIndex, nextIndex);
  assert.equal(game.turnNumber, 2);
});

test("com 10 moedas o jogador não pode coletar e deve dar Golpe", () => {
  const game = createGameState({
    config: createRoomConfig({ initialCoins: 10 }),
    players,
    rng: fixedRng,
  });
  const currentPlayer = game.players[game.currentPlayerIndex];

  assert.throws(
    () => collectCoin(game, currentPlayer.id),
    (error) => error instanceof GameRuleError && error.code === "COUP_IS_MANDATORY",
  );
});

test("Golpe certo cobra 7 moedas, revela/devolve a carta e registra o histórico", () => {
  const game = createGameState({
    config: createRoomConfig({ initialCoins: 7 }),
    players,
    rng: fixedRng,
  });
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  const guessedCharacterId = target.hand[0].characterId;

  const result = performCoup(game, {
    playerId: actor.id,
    targetPlayerId: target.id,
    guessedCharacterId,
  });

  assert.equal(result.hit, true);
  assert.equal(actor.coins, 0);
  assert.equal(target.hand.length, 1);
  assert.equal(game.revealedCards.at(-1).characterId, guessedCharacterId);
  assert.equal(game.revealedCards.at(-1).reason, "coup-hit");
  assert.equal(assertCardIntegrity(game), true);
});

test("Golpe errado revela e troca as duas cartas de um alvo com duas influências", () => {
  const game = createGameState({
    config: createRoomConfig({ initialCoins: 7 }),
    players,
    rng: fixedRng,
  });
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  const targetCharacters = new Set(target.hand.map(({ characterId }) => characterId));
  const wrongGuess = game.characterPool.find((id) => !targetCharacters.has(id));

  const result = performCoup(game, {
    playerId: actor.id,
    targetPlayerId: target.id,
    guessedCharacterId: wrongGuess,
  });

  assert.equal(result.hit, false);
  assert.equal(result.exchangedCardCount, 2);
  assert.equal(target.hand.length, 2);
  assert.equal(game.revealedCards.length, 2);
  assert.equal(assertCardIntegrity(game), true);
});

test("Golpe errado troca apenas uma carta quando o alvo tem uma influência", () => {
  const game = createGameState({
    config: createRoomConfig({ initialCoins: 7 }),
    players,
    rng: fixedRng,
  });
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  loseInfluence(game, {
    playerId: target.id,
    instanceId: target.hand[0].instanceId,
    reason: "test-setup",
  });
  game.revealedCards.length = 0;
  const wrongGuess = game.characterPool.find(
    (id) => id !== target.hand[0].characterId,
  );

  const result = performCoup(game, {
    playerId: actor.id,
    targetPlayerId: target.id,
    guessedCharacterId: wrongGuess,
  });

  assert.equal(result.hit, false);
  assert.equal(result.exchangedCardCount, 1);
  assert.equal(target.hand.length, 1);
  assert.equal(game.revealedCards.length, 1);
  assert.equal(assertCardIntegrity(game), true);
});

test("a partida termina quando um Golpe elimina o penúltimo jogador", () => {
  const game = createGameState({
    config: createRoomConfig({ initialCoins: 7 }),
    players,
    rng: fixedRng,
  });
  const actor = game.players[game.currentPlayerIndex];
  const target = game.players[(game.currentPlayerIndex + 1) % game.players.length];
  const otherPlayer = game.players.find(
    ({ id }) => id !== actor.id && id !== target.id,
  );

  for (const card of [...otherPlayer.hand]) {
    loseInfluence(game, {
      playerId: otherPlayer.id,
      instanceId: card.instanceId,
      reason: "test-setup",
    });
  }
  loseInfluence(game, {
    playerId: target.id,
    instanceId: target.hand[0].instanceId,
    reason: "test-setup",
  });

  performCoup(game, {
    playerId: actor.id,
    targetPlayerId: target.id,
    guessedCharacterId: target.hand[0].characterId,
  });

  assert.equal(game.phase, "finished");
  assert.equal(game.winnerPlayerId, actor.id);
  assert.equal(game.currentPlayerIndex, null);
  assert.equal(assertCardIntegrity(game), true);
});
