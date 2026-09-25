"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { RoomStore } = require("../src/network/room-store");

function startedRoom(playerCount = 3) {
  const store = new RoomStore({ rng: () => 0.31 });
  const created = store.create({ socketId: "s1", playerName: "Ana", config: { initialCoins: 7 } });
  const players = [created.playerId];
  for (let index = 2; index <= playerCount; index += 1) {
    players.push(store.join({ socketId: `s${index}`, roomId: created.room.id, playerName: `Jogador ${index}` }).playerId);
  }
  store.start("s1");
  return { store, room: created.room, players };
}

test("saída voluntária remove imediatamente e preserva as cartas", () => {
  const { store, room, players } = startedRoom();
  const total = room.game.totalCardCount;
  store.leave("s2");
  assert.equal(room.players.some(({ id }) => id === players[1]), false);
  assert.equal(room.game.players.find(({ id }) => id === players[1]).departed, true);
  assert.equal(room.game.deck.size + room.game.players.reduce((sum, player) => sum + player.hand.length, 0), total);
});

test("queda pausa ações e reconexão restaura a mesma sessão", () => {
  const { store, room, players } = startedRoom();
  const { disconnected } = store.disconnect("s2");
  assert.equal(room.connectionPause.playerId, players[1]);
  assert.throws(() => store.collect("s1"), ({ code }) => code === "ROOM_PAUSED");
  const resumed = store.resume({ socketId: "s2-new", roomId: room.id, playerId: players[1] });
  assert.equal(resumed.playerId, players[1]);
  assert.equal(room.connectionPause, null);
  assert.equal(disconnected.playerId, players[1]);
});

test("jogador que não volta até o prazo é removido", () => {
  const { store, room, players } = startedRoom(2);
  const { disconnected } = store.disconnect("s2");
  store.expireDisconnect(room.id, disconnected.playerId, disconnected.expiresAt);
  assert.equal(room.players.some(({ id }) => id === players[1]), false);
  assert.equal(room.game.winnerPlayerId, players[0]);
});

test("duas quedas simultâneas mantêm a sala pausada até ambas serem resolvidas", () => {
  const { store, room, players } = startedRoom();
  const first = store.disconnect("s2").disconnected;
  const second = store.disconnect("s3").disconnected;
  assert.equal(room.connectionPause.disconnectedCount, 2);
  store.resume({ socketId: "s2-new", roomId: room.id, playerId: players[1] });
  assert.equal(room.connectionPause.disconnectedCount, 1);
  store.expireDisconnect(room.id, second.playerId, second.expiresAt);
  assert.equal(room.connectionPause, null);
  assert.equal(room.players.some(({ id }) => id === players[2]), false);
  assert.ok(first.expiresAt > first.startedAt);
});

test("cronômetros pendentes ganham de volta o tempo em que a sala ficou pausada", () => {
  const { store, room } = startedRoom();
  room.game.pendingClaim = { id: "claim-test", stage: "challenge-window", expiresAt: Date.now() + 5_000 };
  const before = room.game.pendingClaim.expiresAt;
  store.disconnect("s2");
  room.pauseStartedAt -= 2_000;
  store.resume({ socketId: "s2-new", roomId: room.id, playerId: room.players[1].id });
  assert.ok(room.game.pendingClaim.expiresAt >= before + 2_000);
});

test("desafio não vence enquanto há jogador desconectado", () => {
  const { store, room } = startedRoom();
  room.game.pendingClaim = { id: "claim-paused", stage: "challenge-window", expiresAt: Date.now() };
  store.disconnect("s2");
  assert.equal(store.expireClaim(room.id, "claim-paused"), null);
  assert.equal(room.game.pendingClaim.id, "claim-paused");
});

test("janela de reação não vence enquanto há jogador desconectado", () => {
  const { store, room } = startedRoom();
  const expiresAt = Date.now();
  room.game.pendingReaction = { type: "ze", expiresAt };
  store.disconnect("s2");
  assert.equal(store.expireReaction(room.id, expiresAt), null);
  assert.equal(room.game.pendingReaction.type, "ze");
});
