"use strict";

const { CHARACTER_CATALOG } = require("../cards/catalog");
const { GameRuleError } = require("./errors");

class Deck {
  constructor(cards, rng = Math.random) {
    this.cards = [...cards];
    this.rng = rng;
  }

  get size() {
    return this.cards.length;
  }

  shuffle() {
    shuffleInPlace(this.cards, this.rng);
    return this;
  }

  draw(count = 1) {
    if (!Number.isInteger(count) || count < 1) {
      throw new GameRuleError("A compra deve ser de ao menos 1 carta.", "INVALID_DRAW_COUNT");
    }
    if (count > this.size) {
      throw new GameRuleError(
        `O baralho tem ${this.size} carta(s), mas a compra pediu ${count}.`,
        "NOT_ENOUGH_CARDS",
      );
    }
    return this.cards.splice(this.cards.length - count, count);
  }

  returnAndShuffle(cards) {
    if (!Array.isArray(cards) || cards.length === 0) {
      throw new GameRuleError(
        "É preciso devolver ao menos uma carta ao baralho.",
        "INVALID_RETURNED_CARDS",
      );
    }
    this.cards.push(...cards);
    return this.shuffle();
  }

  takeByInstanceId(instanceId) {
    const index = this.cards.findIndex((card) => card.instanceId === instanceId);
    if (index === -1) {
      throw new GameRuleError(
        "A carta escolhida não está mais no baralho.",
        "CARD_NOT_IN_DECK",
      );
    }
    return this.cards.splice(index, 1)[0];
  }

  snapshot() {
    return this.cards.map((card) => ({ ...card }));
  }
}

function resolveCharacterPool(config, rng = Math.random) {
  if (config.poolMode === "manual") return [...config.selectedCharacters];

  const banned = new Set(config.bannedCharacters);
  const candidates = CHARACTER_CATALOG.map(({ id }) => id).filter(
    (id) => !banned.has(id),
  );

  if (config.poolSize > candidates.length) {
    throw new GameRuleError(
      `O pool pediu ${config.poolSize} personagens, mas só há ${candidates.length} disponíveis após os banimentos.`,
      "POOL_LARGER_THAN_AVAILABLE_CHARACTERS",
    );
  }

  shuffleInPlace(candidates, rng);
  return candidates.slice(0, config.poolSize);
}

function buildDeck(characterPool, copiesPerCharacter, rng = Math.random) {
  const cards = [];
  for (const characterId of characterPool) {
    for (let copyNumber = 1; copyNumber <= copiesPerCharacter; copyNumber += 1) {
      cards.push(
        Object.freeze({
          instanceId: `${characterId}:${copyNumber}`,
          characterId,
          copyNumber,
        }),
      );
    }
  }
  return new Deck(cards, rng).shuffle();
}

function shuffleInPlace(items, rng) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [items[index], items[target]] = [items[target], items[index]];
  }
  return items;
}

module.exports = { Deck, buildDeck, resolveCharacterPool, shuffleInPlace };
