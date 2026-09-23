"use strict";

/**
 * O catálogo descreve as cartas, mas não executa suas habilidades. Os valores
 * numéricos ficam em `parameters` para poderem ser balanceados sem reescrever
 * o motor.
 */
const CHARACTER_CATALOG = Object.freeze([
  {
    id: "jeff-dino",
    name: "Jeff Dino",
    abilityName: null,
    cost: { type: "coins", amount: 0 },
    parameters: { coinsEatenPerGain: 1, durationRounds: 1 },
    effect:
      "Escolhe um jogador e coloca um dinossaurinho nele. Durante essa rodada, toda vez que esse jogador ganhar moedas, o dinossaurinho come 1 moeda das que ele ganhou.",
  },
  {
    id: "altimar",
    name: "Altimar",
    abilityName: null,
    cost: { type: "coins", amount: 3 },
    parameters: {},
    effect:
      "Escolhe um jogador, rasga uma das cartas dele e dá uma nova carta à sua escolha para ele.",
  },
  {
    id: "silverio",
    name: "Silvério",
    abilityName: null,
    cost: { type: "coins", amount: 1 },
    parameters: { durationRounds: 1 },
    effect:
      "Pela próxima rodada, as moedas do usuário ficam numa caverna: ninguém pode roubá-las.",
  },
  {
    id: "ademar",
    name: "Ademar",
    abilityName: "Vagabundo!",
    cost: { type: "coins", amount: 2 },
    parameters: { stolenCoins: 2, durationRounds: 1 },
    effect:
      "Durante a rodada, se algum jogador não ganhou nenhuma moeda, o usuário rouba 2 moedas desse jogador.",
  },
  {
    id: "paula-granada",
    name: "Paula Granada",
    abilityName: "Socialismo",
    cost: { type: "replaces-coup" },
    parameters: {},
    effect:
      "Em vez de dar um Golpe, todos os jogadores repartem as moedas igualmente, descartando moedas que deixariam a divisão desigual.",
  },
  {
    id: "robertinho",
    name: "Robertinho",
    abilityName: "Eu fico emocionado",
    cost: { type: "coins", amount: 2 },
    parameters: {},
    effect:
      "Quando um jogador usa uma carta, o usuário paga 2 moedas; se a carta alegada for verdadeira, troca sua própria carta pela carta desse jogador, e o jogador ganha uma nova carta.",
  },
  {
    id: "rodrigo",
    name: "Rodrigo",
    abilityName: "Empréstimo binário",
    cost: { type: "gives-coins", amount: 2 },
    parameters: { initialDebt: 4, escalatedDebt: 8, escalationRounds: 1 },
    effect:
      "O usuário dá 2 moedas a um alvo. Na rodada seguinte, o alvo deve pagar 4 moedas; se não pagar, na rodada depois sobe para 8; se ainda assim não pagar, o dono da carta escolhe 1 carta para o alvo perder, e a dívida se encerra.",
  },
  {
    id: "ze",
    name: "Zé",
    abilityName: "Atraso",
    cost: { type: "coins", amount: 2 },
    parameters: { delayRounds: 1 },
    effect:
      "Quando um jogador faz uma ação, o usuário pode pagar 2 moedas para atrasar o efeito dela, fazendo-a acontecer 1 rodada depois.",
  },
  {
    id: "luis-sapeca",
    name: "Luis Sapeca",
    abilityName: "Sapecagem",
    cost: { type: "coins", amount: 3 },
    parameters: { targetCount: 2 },
    effect: "Escolhe 2 jogadores; ambos trocam suas cartas entre si.",
  },
  {
    id: "sandra",
    name: "Sandra",
    abilityName: "Orientação à carta",
    cost: { type: "coins", amount: 2 },
    parameters: {},
    effect:
      "Pode escolher qualquer carta do baralho para substituir uma das suas.",
  },
  {
    id: "andreia",
    name: "Andreia",
    abilityName: "Isso é lógica né pessoal",
    cost: { type: "none" },
    parameters: {},
    effect:
      "Toda vez que der um Golpe e acertar a carta do jogador, pode dar um novo Golpe em sequência.",
  },
  {
    id: "deivison",
    name: "Deivison",
    abilityName: "Repositório",
    cost: { type: "coins", amount: 1 },
    parameters: {},
    effect:
      "Guarda uma quantia de moedas no repositório: elas não podem ser alteradas por outros efeitos, podem ser retiradas a qualquer momento para gastar, e não contam para o limite do Golpe obrigatório.",
  },
  {
    id: "marcelo-moreira",
    name: "Marcelo Moreira",
    abilityName: "Requisito meu",
    cost: { type: "none" },
    parameters: { minimumRequirement: 1, maximumRequirement: 8, coinPenalty: 2 },
    effect:
      "Define um número de 1 a 8 e uma condição sobre as moedas do alvo. A cada rodada, se o alvo não atender ao requisito, perde 2 moedas; se não tiver 2 moedas, perde 1 carta e sai do efeito.",
  },
  {
    id: "wave",
    name: "Wave",
    abilityName: "Opressão do esculacho",
    cost: { type: "coins", amount: 2 },
    parameters: {},
    effect: "Obriga um jogador a fazer uma ação escolhida pelo usuário.",
  },
].map(deepFreeze));

const CHARACTER_BY_ID = new Map(
  CHARACTER_CATALOG.map((character) => [character.id, character]),
);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function getCharacter(characterId) {
  return CHARACTER_BY_ID.get(characterId) ?? null;
}

function hasCharacter(characterId) {
  return CHARACTER_BY_ID.has(characterId);
}

module.exports = { CHARACTER_CATALOG, getCharacter, hasCharacter };
