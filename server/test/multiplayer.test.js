"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { io: createClient } = require("socket.io-client");
const { createCoutecServer } = require("../src/server");

test("três jogadores recebem estado sincronizado sem vazamento de mãos", async (context) => {
  const { io, server } = createCoutecServer({ rng: () => 0.42 });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const clients = Array.from({ length: 3 }, () =>
    createClient(`http://127.0.0.1:${port}`),
  );

  context.after(async () => {
    for (const client of clients) client.close();
    await new Promise((resolve) => io.close(resolve));
  });
  await Promise.all(clients.map(waitForConnection));

  let statePromises = [waitForState(clients[0])];
  const created = await emit(clients[0], "room:create", {
    playerName: "Ana",
    config: {
      poolSize: 3,
      copiesPerCharacter: 3,
      poolMode: "manual",
      bannedCharacters: [],
      selectedCharacters: ["jeff-dino", "silverio", "deivison"],
      initialCoins: 7,
    },
  });
  await Promise.all(statePromises);

  for (let index = 1; index < clients.length; index += 1) {
    statePromises = clients.slice(0, index + 1).map(waitForState);
    await emit(clients[index], "room:join", {
      roomId: created.roomId,
      playerName: ["Ana", "Beto", "Caio"][index],
    });
    await Promise.all(statePromises);
  }

  statePromises = clients.map(waitForState);
  await emit(clients[0], "room:start", {});
  const states = await Promise.all(statePromises);

  for (const state of states) {
    assert.equal(state.game.players.length, 3);
    assert.equal(state.game.ownHand.length, 2);
    assert.equal(
      state.game.players.some((player) => Object.hasOwn(player, "hand")),
      false,
    );
  }

  const actorIndex = states.findIndex(
    (state) => state.selfPlayerId === state.game.currentPlayerId,
  );
  const targetIndex = (actorIndex + 1) % clients.length;
  const targetId = states[targetIndex].selfPlayerId;
  const guessedCharacterId = states[targetIndex].game.ownHand[0].characterId;
  statePromises = clients.map(waitForState);
  await emit(clients[actorIndex], "action:coup", {
    targetPlayerId: targetId,
    guessedCharacterId,
  });
  const statesAfterCoup = await Promise.all(statePromises);

  for (const state of statesAfterCoup) {
    const publicTarget = state.game.players.find(({ id }) => id === targetId);
    assert.equal(publicTarget.handSize, 1);
    assert.equal(state.game.revealedCards.at(-1).characterId, guessedCharacterId);
  }
  assert.equal(statesAfterCoup[targetIndex].game.ownHand.length, 1);

  const claimantIndex = statesAfterCoup.findIndex(
    (state) => state.selfPlayerId === state.game.currentPlayerId,
  );
  const challengerIndex = (claimantIndex + 1) % clients.length;
  const claimedCharacter = statesAfterCoup[claimantIndex].game.ownHand[0].characterId;
  const claimParameters = claimedCharacter === "jeff-dino"
    ? { targetPlayerId: statesAfterCoup[challengerIndex].selfPlayerId }
    : claimedCharacter === "deivison"
      ? { mode: "deposit", amount: 1 }
      : {};
  statePromises = clients.map(waitForState);
  await emit(clients[claimantIndex], "action:declare-character", {
    characterId: claimedCharacter,
    parameters: claimParameters,
  });
  await Promise.all(statePromises);

  statePromises = clients.map(waitForState);
  await emit(clients[challengerIndex], "challenge:contest", {});
  const challengedStates = await Promise.all(statePromises);
  const claim = challengedStates[challengerIndex].game.pendingClaim;
  assert.equal(claim.claimWasTrue, true);
  assert.equal(claim.loserPlayerId, challengedStates[challengerIndex].selfPlayerId);

  const chosenLoss = challengedStates[challengerIndex].game.ownHand[0];
  statePromises = clients.map(waitForState);
  await emit(clients[challengerIndex], "challenge:choose-loss", {
    instanceId: chosenLoss.instanceId,
  });
  const resolvedStates = await Promise.all(statePromises);
  assert.equal(resolvedStates[0].game.pendingClaim, null);
});

function waitForConnection(client) {
  if (client.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
}

function waitForState(client) {
  return new Promise((resolve) => client.once("room:state", resolve));
}

function emit(client, eventName, payload) {
  return new Promise((resolve, reject) => {
    client.emit(eventName, payload, (response) => {
      if (response?.ok) resolve(response);
      else reject(new Error(response?.error?.message ?? `${eventName} falhou`));
    });
  });
}
