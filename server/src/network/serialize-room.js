"use strict";

const { getCharacter } = require("../cards/catalog");
const { IMPLEMENTED_CHARACTERS } = require("../engine/character-effects");

function serializeRoomForPlayer(room, playerId) {
  const base = {
    id: room.id,
    phase: room.phase,
    hostPlayerId: room.hostPlayerId,
    selfPlayerId: playerId,
    config: room.config,
    connectionPause: room.connectionPause ? { ...room.connectionPause } : null,
    players: room.players.map((player) => ({ id: player.id, name: player.name })),
  };

  if (!room.game) return base;

  const self = room.game.players.find(({ id }) => id === playerId);
  const currentPlayer = room.game.players[room.game.currentPlayerIndex] ?? null;
  return {
    ...base,
    game: {
      phase: room.game.phase,
      characterPool: [...room.game.characterPool],
      characters: room.game.characterPool.map((id) => {
        const character = getCharacter(id);
        return {
          id: character.id,
          name: character.name,
          abilityName: character.abilityName,
          effect: character.effect,
          cost: character.cost,
          implemented: IMPLEMENTED_CHARACTERS.has(id),
        };
      }),
      currentPlayerId: currentPlayer?.id ?? null,
      turnNumber: room.game.turnNumber,
      winnerPlayerId: room.game.winnerPlayerId,
      players: room.game.players.filter(({ departed }) => !departed).map((player) => ({
        id: player.id,
        name: player.name,
        coins: player.coins,
        repositoryCoins: player.repositoryCoins,
        handSize: player.hand.length,
        eliminated: player.eliminated,
      })),
      ownHand:
        self?.hand.map((card) => ({
          instanceId: card.instanceId,
          characterId: card.characterId,
        })) ?? [],
      revealedCards: room.game.revealedCards.map((entry) => ({ ...entry })),
      events: room.game.events.map((event) => ({ ...event })),
      pendingClaim: room.game.pendingClaim
        ? { ...room.game.pendingClaim }
        : null,
      pendingReaction: room.game.pendingReaction
        ? { ...room.game.pendingReaction, actionClaim: undefined }
        : null,
      activeEffects: room.game.activeEffects.map((effect) => ({ ...effect })),
      pendingEffectChoice: room.game.pendingEffectChoice
        ? { ...room.game.pendingEffectChoice }
        : null,
      effectChoiceOptions:
        getChoicePlayerId(room.game.pendingEffectChoice) === playerId
          ? {
              deckCards: ["sandra", "altimar"].includes(room.game.pendingEffectChoice.type)
                ? room.game.deck.snapshot()
                : [],
            }
          : null,
    },
  };
}

function getChoicePlayerId(pending) {
  if (!pending) return null;
  return pending.type === "marcelo-loss"
    ? pending.targetPlayerId
    : pending.type === "wave-action"
      ? pending.targetPlayerId
    : pending.actorPlayerId;
}

module.exports = { serializeRoomForPlayer };
