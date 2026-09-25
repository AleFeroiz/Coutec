"use strict";

applyRandomAmbientColor();

const CHARACTER_NAMES = {
  "jeff-dino": "Jeff Dino", altimar: "Altimar", silverio: "Silvério",
  ademar: "Ademar", "paula-granada": "Paula Granada",
  robertinho: "Robertinho", rodrigo: "Rodrigo", ze: "Zé",
  "luis-sapeca": "Luis Sapeca", sandra: "Sandra", andreia: "Andreia",
  deivison: "Deivison", "marcelo-moreira": "Marcelo Moreira", wave: "Wave",
};
let socket = null;
let room = null;
let shownPoolRoomId = null;
let lastAnimatedEvent = 0;
let selectedTableAction = null;
const byId = (id) => document.getElementById(id);

function applyRandomAmbientColor() {
  const hue = Math.floor(Math.random() * 360);
  const secondaryHue = (hue + 38 + Math.floor(Math.random() * 55)) % 360;
  document.documentElement.style.setProperty("--ambient-hue", hue);
  document.documentElement.style.setProperty("--ambient-secondary-hue", secondaryHue);
}

const configuredOnlineUrl = window.COUTEC_CONFIG?.onlineServerUrl ?? "";
bindPress(byId("online-connect-button"), () =>
  connect(configuredOnlineUrl),
);
byId("create-form").addEventListener("submit", createRoom);
byId("join-form").addEventListener("submit", joinRoom);
bindPress(byId("start-button"), () => emit("room:start", {}));
bindPress(byId("collect-button"), () => {
  const game = room?.game;
  const self = game?.players.find(({ id }) => id === room.selfPlayerId);
  if (!game || !self || game.currentPlayerId !== self.id) return showMessage("Aguarde: ainda não é a sua vez.");
  if (game.pendingClaim || game.pendingReaction || game.pendingEffectChoice) return showMessage("Resolva a ação atual antes de coletar.");
  if (self.coins >= 10) return showMessage("Com 10 moedas, você precisa dar um Golpe.");
  selectedTableAction = null;
  emit("action:collect", {});
});
bindPress(byId("claim-button"), () => {
  emit("action:declare-character", {
    characterId: byId("claim-character").value,
    parameters: readCharacterParameters(),
  });
});
byId("claim-character").addEventListener("change", () => {
  renderCharacterParameters();
  updateClaimButton();
});
bindPress(byId("challenge-button"), () =>
  emit("challenge:contest", {}),
);
bindPress(byId("resolve-claim-button"), () =>
  emit("challenge:pass", {}),
);
bindPress(byId("reaction-claim-button"), () => emit("reaction:claim", {}));
bindPress(byId("reaction-pass-button"), () => emit("reaction:pass", {}));
bindPress(byId("pool-button"), () => byId("pool-dialog").showModal());
bindPress(byId("close-pool"), () => byId("pool-dialog").close());
bindPress(byId("bluff-button"), openBluffPanel);
bindPress(byId("coup-button"), openCoupPanel);
bindPress(byId("close-action-console"), closeActionConsole);
bindPress(byId("confirm-coup-button"), () => {
  emit("action:coup", {
    targetPlayerId: byId("coup-target").value,
    guessedCharacterId: byId("coup-character").value,
  });
});
bindPress(byId("copy-code"), async () => {
  await navigator.clipboard.writeText(room.id);
  showMessage("Código copiado.");
});

async function connect(rawServerUrl) {
  const serverUrl = rawServerUrl.trim().replace(/\/$/, "");
  if (!serverUrl) return showError("O servidor online ainda não foi configurado.");
  const connectButton = byId("online-connect-button");
  connectButton.disabled = true;
  connectButton.textContent = "Conectando…";
  byId("connection-status").textContent = "Conectando ao servidor online…";
  try {
    await loadSocketClient(`${serverUrl}/socket.io/socket.io.js`);
    socket?.disconnect();
    socket = window.io(serverUrl);
    socket.on("connect", () => {
      connectButton.textContent = "Conectado";
      byId("connection-status").textContent = "Conectado";
      byId("connection-status").classList.add("connected");
      const savedSession = readSavedSession();
      if (savedSession) {
        socket.emit("room:resume", savedSession, (response) => {
          if (!response?.ok) {
            sessionStorage.removeItem("coutecSession");
            room = null;
            showOnly("home-view");
            showError("A sala anterior não existe mais. Entre em uma nova sala.");
          }
        });
      } else {
        showOnly("home-view");
      }
    });
    socket.on("connect_error", () => {
      connectButton.disabled = false;
      connectButton.textContent = "Tentar novamente";
      showError("Não foi possível conectar. O servidor pode estar acordando; tente novamente em alguns segundos.");
    });
    socket.on("disconnect", () => {
      byId("connection-status").textContent = "Desconectado";
      byId("connection-status").classList.remove("connected");
    });
    socket.on("room:state", (nextRoom) => {
      room = nextRoom;
      try {
        render();
      } catch (error) {
        console.error("Falha ao renderizar a mesa", error);
        showError("A mesa recebeu um estado incompatível. Atualize a página e entre novamente na sala.");
      }
    });
  } catch (_error) {
    connectButton.disabled = false;
    connectButton.textContent = "Tentar novamente";
    showError("Não foi possível carregar o Socket.IO desse servidor.");
  }
}

function createRoom(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  emit("room:create", {
    playerName: data.get("playerName"),
    config: {
      poolSize: Number(data.get("poolSize")),
      copiesPerCharacter: Number(data.get("copiesPerCharacter")),
      initialCoins: Number(data.get("initialCoins")),
      challengeSeconds: Number(data.get("challengeSeconds")),
      poolMode: "random",
      bannedCharacters: String(data.get("bannedCharacters") || "")
        .split(",").map((value) => value.trim().toLowerCase()).filter(Boolean),
    },
  }, saveSession);
}

function joinRoom(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  emit("room:join", { playerName: data.get("playerName"), roomId: data.get("roomId") }, saveSession);
}

function emit(eventName, payload, onSuccess) {
  if (!socket?.connected) return showError("Servidor desconectado.");
  socket.emit(eventName, payload, (response) => {
    if (!response?.ok) showError(response?.error?.message ?? "A ação falhou.");
    else onSuccess?.(response);
  });
}

function saveSession(response) {
  sessionStorage.setItem("coutecSession", JSON.stringify({
    roomId: response.roomId,
    playerId: response.playerId,
  }));
}

function readSavedSession() {
  try {
    return JSON.parse(sessionStorage.getItem("coutecSession"));
  } catch (_error) {
    sessionStorage.removeItem("coutecSession");
    return null;
  }
}

function render() {
  if (!room.game) renderLobby();
  else renderGame();
}

function renderLobby() {
  document.body.classList.remove("in-game");
  showOnly("lobby-view");
  byId("room-code").textContent = room.id;
  byId("room-config").textContent = `${room.players.length} jogador(es) · ${room.config.poolSize} personagens × ${room.config.copiesPerCharacter} cópias · ${room.config.initialCoins} moedas iniciais`;
  byId("lobby-players").innerHTML = room.players.map((player) =>
    `<li><span class="player-list-avatar">${initials(player.name)}</span><strong>${escapeHtml(player.name)}</strong>${player.id === room.hostPlayerId ? '<span class="host-badge">Host</span>' : ""}</li>`,
  ).join("");
  const isHost = room.selfPlayerId === room.hostPlayerId;
  byId("start-button").hidden = !isHost;
  byId("start-button").disabled = room.players.length < 2;
  byId("start-button").textContent = room.players.length < 2
    ? "Aguardando mais 1 jogador…"
    : `Iniciar partida com ${room.players.length} jogadores`;
  byId("waiting-host").hidden = isHost;
}

function renderGame() {
  document.body.classList.add("in-game");
  showOnly("game-view");
  const { game } = room;
  const self = game.players.find((player) => player.id === room.selfPlayerId);
  if (!self) {
    throw new Error(`Jogador local ${room.selfPlayerId} ausente do estado da partida`);
  }
  const current = game.players.find((player) => player.id === game.currentPlayerId);
  const isOwnTurn = game.currentPlayerId === room.selfPlayerId;
  document.body.classList.toggle("is-own-turn", isOwnTurn);
  byId("game-room-code").textContent = room.id;
  byId("turn-text").textContent = current
    ? (isOwnTurn ? "É a sua vez" : `Vez de ${current.name}`)
    : "Partida encerrada";
  byId("winner-text").textContent = game.winnerPlayerId
    ? `${game.players.find((player) => player.id === game.winnerPlayerId)?.name} venceu!`
    : "";
  byId("own-coins").innerHTML = `${self.coins} moeda(s) ${self.repositoryCoins > 0 ? `<span class="repository-cloud">☁ ${self.repositoryCoins}</span>` : ""} ${effectBadges(game, self)}`;
  renderOwnHand(game);
  renderOpponents(game);
  renderControls(game, self, isOwnTurn);
  renderPool(game);
  animateNewEvents(game);
}

function renderOwnHand(game) {
  const self = game.players.find(({ id }) => id === room.selfPlayerId);
  byId("own-hand").innerHTML = game.ownHand.length
    ? game.ownHand.map((card, index) => `
      <button type="button" class="card ${canActivateOwnedCard(game, self, card) ? "card-ready" : "card-inactive"}" aria-disabled="${!canActivateOwnedCard(game, self, card)}" data-use-character="${card.characterId}" data-initial="${characterName(card.characterId).charAt(0)}"
        style="--card-rotation:${index ? 5 : -5}deg;--card-y:${index ? "0" : "5px"}">
        <span>${characterName(card.characterId)}</span>
      </button>`).join("")
    : '<p class="muted">Você não possui mais influência.</p>';
  for (const cardButton of byId("own-hand").querySelectorAll("[data-use-character]")) {
    bindPress(cardButton, () => activateOwnedCard(cardButton.dataset.useCharacter));
  }
}

function renderOpponents(game) {
  const opponents = game.players.filter((player) => player.id !== room.selfPlayerId);
  byId("table-players").innerHTML = opponents.map((player, index) => {
    const position = opponentPosition(index, opponents.length);
    const backs = Array.from({ length: player.handSize }, (_, cardIndex) =>
      `<i class="card-back" style="--rotation:${(cardIndex - (player.handSize - 1) / 2) * 11}deg"><span>COUTEC</span></i>`,
    ).join("");
    const effects = effectBadges(game, player);
    const repository = player.repositoryCoins > 0
      ? `<span class="repository-cloud" title="Moedas no repositório">☁ ${player.repositoryCoins}</span>`
      : "";
    return `<article data-player-id="${player.id}" class="player-tile ${player.id === game.currentPlayerId ? "current" : ""} ${player.eliminated ? "eliminated" : ""}"
      style="--x:${position.x}%;--y:${position.y}%;--seat-angle:${position.rotation}deg">
      <div class="effect-badges">${effects}</div>
      <div class="card-backs">${backs}</div>
      <div class="player-info"><div class="player-avatar">${initials(player.name)}</div><div><strong>${escapeHtml(player.name)}</strong>
      <div class="player-stats"><span>● ${player.coins}</span><span>▣ ${player.handSize}</span></div>${repository}</div></div>
    </article>`;
  }).join("");
}

function canActivateOwnedCard(game, self, card) {
  if (!self || self.eliminated) return false;
  const reaction = game.pendingReaction;
  if (reaction) {
    return card.characterId === reaction.type
      && reaction.eligiblePlayerIds.includes(self.id)
      && !reaction.passedPlayerIds.includes(self.id);
  }
  const pending = game.pendingEffectChoice;
  if (pending?.type === "andreia-offer") {
    return pending.actorPlayerId === self.id && card.characterId === "andreia";
  }
  if (game.pendingClaim || pending || game.currentPlayerId !== self.id) return false;
  if (["andreia", "robertinho", "ze"].includes(card.characterId)) return false;
  if (self.coins >= 10 && card.characterId !== "paula-granada") return false;
  const character = game.characters?.find(({ id }) => id === card.characterId);
  const cost = characterActionCost(character);
  return self.coins >= cost;
}

function characterActionCost(character) {
  if (!character) return Infinity;
  if (character.id === "paula-granada") return 7;
  if (character.id === "rodrigo") return 2;
  return character.cost?.type === "coins" ? character.cost.amount : 0;
}

function activateOwnedCard(characterId) {
  const game = room?.game;
  if (!game) return;
  const self = game.players.find(({ id }) => id === room.selfPlayerId);
  const card = game.ownHand.find(({ characterId: id }) => id === characterId);
  if (!card) return;
  if (!canActivateOwnedCard(game, self, card)) {
    if (game.currentPlayerId !== self.id && !game.pendingReaction && game.pendingEffectChoice?.type !== "andreia-offer") {
      return showMessage("Esta carta poderá ser usada no seu turno.");
    }
    if (["andreia", "robertinho", "ze"].includes(characterId)) {
      return showMessage(`${characterName(characterId)} só pode ser usada no momento especial da carta.`);
    }
    return showMessage("Esta habilidade não está disponível agora ou faltam moedas.");
  }
  if (game.pendingReaction?.type === characterId) {
    emit("reaction:claim", {});
    return;
  }
  if (game.pendingEffectChoice?.type === "andreia-offer" && characterId === "andreia") {
    emit("andreia:respond", { use: true });
    return;
  }
  openAbilityPanel(characterId, false);
}

function openAbilityPanel(characterId, isBluff) {
  if (!room?.game) return;
  const characters = room.game.characters.filter(({ id, implemented }) =>
    implemented && !["andreia", "robertinho", "ze"].includes(id),
  );
  const self = room.game.players.find(({ id }) => id === room.selfPlayerId);
  const ownCharacters = new Set(room.game.ownHand.map(({ characterId: id }) => id));
  const options = isBluff
    ? characters.filter((character) => !ownCharacters.has(character.id) && self.coins >= characterActionCost(character))
    : characters.filter(({ id }) => id === characterId);
  if (!options.length) return showError("Não há personagem disponível para essa ação.");
  selectedTableAction = "ability";
  fillClaimCharacterSelect(byId("claim-character"), options);
  byId("claim-character").disabled = !isBluff;
  byId("claim-panel").hidden = false;
  byId("coup-panel").hidden = true;
  byId("normal-actions").hidden = false;
  byId("action-console").hidden = false;
  byId("action-title").textContent = isBluff ? "Escolha seu blefe" : `Usar ${characterName(characterId)}`;
  byId("action-prompt").textContent = isBluff
    ? "Os demais jogadores poderão desafiar sua alegação."
    : "Escolha os detalhes e confirme a habilidade.";
  renderCharacterParameters();
  updateClaimButton();
}

function openBluffPanel() {
  openAbilityPanel(null, true);
}

function openCoupPanel() {
  if (!room?.game) return;
  selectedTableAction = "coup";
  byId("claim-panel").hidden = true;
  byId("coup-panel").hidden = false;
  byId("normal-actions").hidden = false;
  byId("action-console").hidden = false;
  byId("action-title").textContent = "Preparar Golpe";
  byId("action-prompt").textContent = "Escolha um jogador e adivinhe uma das cartas dele.";
}

function closeActionConsole() {
  if (room?.game?.pendingClaim || room?.game?.pendingReaction || room?.game?.pendingEffectChoice) return;
  selectedTableAction = null;
  byId("action-console").hidden = true;
}

function renderControls(game, self, isOwnTurn) {
  const claim = game.pendingClaim;
  const reaction = game.pendingReaction;
  const normal = byId("normal-actions");
  const challenge = byId("challenge-actions");
  const loss = byId("loss-actions");
  const effectChoice = game.pendingEffectChoice;
  const blockingInteraction = Boolean(claim || reaction || effectChoice);
  if (!blockingInteraction && isOwnTurn && self.coins >= 10) selectedTableAction = "coup";
  if (blockingInteraction) selectedTableAction = null;
  if (!isOwnTurn && !blockingInteraction) selectedTableAction = null;
  const drawerOpen = blockingInteraction || Boolean(selectedTableAction);
  byId("action-console").hidden = !drawerOpen;
  byId("close-action-console").hidden = blockingInteraction;
  byId("quick-actions").hidden = blockingInteraction || !isOwnTurn || self.eliminated;
  normal.hidden = blockingInteraction || !selectedTableAction;
  challenge.hidden = !claim || claim.stage !== "challenge-window";
  loss.hidden = !claim || claim.stage !== "loss-selection" || claim.loserPlayerId !== room.selfPlayerId;
  byId("effect-choice-actions").hidden = !effectChoice;
  byId("reaction-actions").hidden = !reaction;

  const targets = game.players.filter((player) => player.id !== room.selfPlayerId && !player.eliminated);
  const characterDetails = Array.isArray(game.characters)
    ? game.characters
    : game.characterPool.map((id) => ({ id, name: characterName(id), implemented: false }));
  fillCharacterSelect(byId("coup-character"), game.characterPool);
  byId("coup-target").innerHTML = targets.map((player) =>
    `<option value="${player.id}">${escapeHtml(player.name)}</option>`,
  ).join("");
  const canCollect = isOwnTurn && !self.eliminated && self.coins < 10 && !blockingInteraction;
  byId("collect-button").disabled = false;
  byId("collect-button").setAttribute("aria-disabled", String(!canCollect));
  byId("collect-button").classList.toggle("action-unavailable", !canCollect);
  byId("claim-button").dataset.baseDisabled = String(!isOwnTurn || self.eliminated);
  updateClaimButton();
  byId("coup-button").disabled = !isOwnTurn || self.eliminated || self.coins < 7 || !targets.length;
  byId("confirm-coup-button").disabled = byId("coup-button").disabled;
  byId("bluff-button").disabled = !isOwnTurn || self.eliminated || self.coins >= 10;

  byId("claim-panel").hidden = selectedTableAction !== "ability";
  byId("coup-panel").hidden = selectedTableAction !== "coup";

  if (!claim) {
    if (reaction) {
      const eligible = reaction.eligiblePlayerIds.includes(room.selfPlayerId);
      const passed = reaction.passedPlayerIds.includes(room.selfPlayerId);
      const ownsReactionCard = game.ownHand.some(({ characterId }) => characterId === reaction.type);
      byId("action-title").textContent = "Janela de reação";
      byId("reaction-description").textContent = reaction.type === "ze"
        ? "Alguém vai alegar Zé para atrasar esta habilidade?"
        : "Alguém vai alegar Robertinho depois desta habilidade?";
      byId("reaction-claim-button").textContent = `Blefar com ${characterName(reaction.type)}`;
      byId("reaction-claim-button").hidden = !eligible || passed || ownsReactionCard;
      byId("reaction-pass-button").hidden = !eligible || passed;
      byId("reaction-timer").textContent = `${Math.max(0, (reaction.expiresAt - Date.now()) / 1000).toFixed(1)}s`;
      return;
    }
    if (effectChoice) {
      renderEffectChoice(game, effectChoice);
      return;
    }
    const mandatoryCoup = isOwnTurn && self.coins >= 10;
    byId("action-title").textContent = mandatoryCoup
      ? "Golpe obrigatório"
      : selectedTableAction === "coup" ? "Preparar Golpe" : "Usar habilidade";
    byId("action-prompt").textContent = mandatoryCoup
      ? "Com 10 ou mais moedas, você precisa dar um Golpe."
      : isOwnTurn ? "Colete uma moeda, use uma habilidade ou dê um Golpe." : "Você poderá agir quando o turno chegar.";
    if (selectedTableAction === "ability") renderCharacterParameters();
    return;
  }
  const actor = game.players.find((player) => player.id === claim.actorPlayerId);
  byId("action-title").textContent = claim.stage === "challenge-window" ? "Alegação aberta" : "Desafio resolvido";
  byId("claim-description").textContent = `${actor?.name} alega ter ${characterName(claim.characterId)}.`;
  const alreadyPassed = claim.passedPlayerIds.includes(room.selfPlayerId);
  const canVote = claim.actorPlayerId !== room.selfPlayerId && !self.eliminated && !alreadyPassed;
  byId("challenge-button").hidden = !canVote;
  byId("resolve-claim-button").hidden = !canVote;
  byId("challenge-timer").hidden = false;
  updateChallengeTimer();
  byId("action-prompt").textContent = claim.stage === "loss-selection"
    ? (claim.loserPlayerId === room.selfPlayerId ? "Você deve escolher sua perda." : "Aguardando o jogador escolher uma carta.")
    : "O primeiro desafio será aceito.";

  if (!loss.hidden) {
    byId("loss-card-buttons").innerHTML = game.ownHand.map((card) =>
      `<button data-instance-id="${card.instanceId}">${characterName(card.characterId)}</button>`,
    ).join("");
    for (const button of byId("loss-card-buttons").querySelectorAll("button")) {
      bindPress(button, () =>
        emit("challenge:choose-loss", { instanceId: button.dataset.instanceId }),
      );
    }
  }
}

function renderCharacterParameters() {
  if (!room?.game || room.game.pendingClaim) return;
  const characterId = byId("claim-character").value;
  const container = byId("character-parameters");
  const selectedCharacter = room.game.characters?.find(({ id }) => id === characterId);
  byId("claim-help").textContent = selectedCharacter
    ? `${costLabel(selectedCharacter.cost)} · ${selectedCharacter.effect}`
    : "Escolha uma habilidade disponível no pool da partida.";
  const activePlayers = room.game.players.filter(({ eliminated }) => !eliminated);
  if (characterId === "jeff-dino") {
    container.innerHTML = `<label>Alvo do dinossaurinho<select id="effect-target">${activePlayers.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("")}</select></label>`;
  } else if (characterId === "deivison") {
    container.innerHTML = `<div class="action-row"><label>Operação<select id="repository-mode"><option value="deposit">Guardar</option><option value="withdraw">Retirar</option></select></label><label>Quantidade<input id="repository-amount" type="number" min="1" value="1"></label></div>`;
  } else if (characterId === "luis-sapeca") {
    const options = activePlayers.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
    container.innerHTML = `<div class="action-row"><label>Primeiro jogador<select id="swap-target-one">${options}</select></label><label>Segundo jogador<select id="swap-target-two">${options}</select></label></div>`;
    const second = byId("swap-target-two");
    if (second.options.length > 1) second.selectedIndex = 1;
  } else if (characterId === "rodrigo") {
    const options = activePlayers.filter(({ id }) => id !== room.selfPlayerId).map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
    container.innerHTML = `<label>Quem recebe o empréstimo<select id="effect-target">${options}</select></label>`;
  } else if (characterId === "marcelo-moreira") {
    const options = activePlayers.filter(({ id }) => id !== room.selfPlayerId).map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
    container.innerHTML = `<div class="action-row"><label>Alvo<select id="effect-target">${options}</select></label><label>Condição<select id="requirement-comparison"><option value="gte">Maior ou igual</option><option value="lte">Menor ou igual</option></select></label></div><label>Número de moedas<input id="requirement-threshold" type="number" min="1" max="8" value="4"></label>`;
  } else if (characterId === "wave") {
    const options = activePlayers.filter(({ id }) => id !== room.selfPlayerId).map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
    container.innerHTML = `<div class="action-row"><label>Jogador obrigado<select id="effect-target">${options}</select></label><label>Ação<select id="wave-action"><option value="collect">Coletar 1 moeda</option><option value="character">Usar uma carta</option><option value="coup">Dar Golpe</option></select></label></div>`;
  } else {
    container.innerHTML = "";
  }
}

function readCharacterParameters() {
  const characterId = byId("claim-character").value;
  if (characterId === "jeff-dino") return { targetPlayerId: byId("effect-target").value };
  if (characterId === "deivison") return { mode: byId("repository-mode").value, amount: Number(byId("repository-amount").value) };
  if (characterId === "luis-sapeca") return { targetPlayerIds: [byId("swap-target-one").value, byId("swap-target-two").value] };
  if (characterId === "rodrigo") return { targetPlayerId: byId("effect-target").value };
  if (characterId === "marcelo-moreira") return { targetPlayerId: byId("effect-target").value, comparison: byId("requirement-comparison").value, threshold: Number(byId("requirement-threshold").value) };
  if (characterId === "wave") return { targetPlayerId: byId("effect-target").value, forcedAction: byId("wave-action").value };
  return {};
}

function updateClaimButton() {
  if (!room?.game) return;
  const self = room.game.players.find(({ id }) => id === room.selfPlayerId);
  const baseDisabled = byId("claim-button").dataset.baseDisabled === "true";
  const isPaula = byId("claim-character").value === "paula-granada";
  byId("claim-button").disabled = baseDisabled || (self.coins >= 10 && !isPaula);
}

function renderEffectChoice(game, pending) {
  byId("action-title").textContent = "Complete a habilidade";
  const container = byId("effect-choice-actions");
  const choicePlayerId = ["marcelo-loss", "wave-action"].includes(pending.type)
    ? pending.targetPlayerId
    : pending.actorPlayerId;
  if (choicePlayerId !== room.selfPlayerId) {
    byId("action-prompt").textContent = "Aguardando o jogador consultar o baralho.";
    container.innerHTML = "";
    return;
  }
  byId("action-prompt").textContent = "Somente você pode ver as cartas disponíveis.";
  const deckOptions = (game.effectChoiceOptions?.deckCards ?? []).map((card) =>
    `<option value="${card.instanceId}">${characterName(card.characterId)}</option>`,
  ).join("");
  if (pending.type === "andreia-offer") {
    const ownsAndreia = game.ownHand.some(({ characterId }) => characterId === "andreia");
    byId("action-prompt").textContent = "O Golpe acertou. Você quer alegar Andreia para continuar?";
    container.innerHTML = `<div class="action-row">${ownsAndreia ? "" : '<button id="andreia-use">Blefar com Andreia</button>'}<button id="andreia-skip" class="secondary">Encerrar turno</button></div>`;
    if (byId("andreia-use")) bindPress(byId("andreia-use"), () => emit("andreia:respond", { use: true }));
    bindPress(byId("andreia-skip"), () => emit("andreia:respond", { use: false }));
    return;
  } else if (pending.type === "andreia-coup") {
    const targets = game.players.filter(({ eliminated, id }) => !eliminated && id !== room.selfPlayerId);
    container.innerHTML = `<p>Andreia liberou um Golpe gratuito.</p><div class="coup-controls"><label>Alvo<select id="choice-target">${targets.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("")}</select></label><label>Palpite<select id="choice-character"></select></label><button id="complete-effect" class="danger">Golpe grátis</button></div>`;
    fillCharacterSelect(byId("choice-character"), game.characterPool);
    bindPress(byId("complete-effect"), () => emit("andreia:coup", { targetPlayerId: byId("choice-target").value, guessedCharacterId: byId("choice-character").value }));
    return;
  } else if (pending.type === "wave-action") {
    renderForcedWaveAction(game, pending, container);
    return;
  } else if (pending.type === "sandra") {
    container.innerHTML = `<label>Sua carta<select id="choice-own-card">${game.ownHand.map((card, index) => `<option value="${card.instanceId}">Carta ${index + 1} — ${characterName(card.characterId)}</option>`).join("")}</select></label><label>Nova carta do baralho<select id="choice-deck-card">${deckOptions}</select></label><button id="complete-effect">Trocar carta</button>`;
  } else if (pending.type === "altimar") {
    const targets = game.players.filter(({ eliminated }) => !eliminated);
    container.innerHTML = `<label>Alvo<select id="choice-target">${targets.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("")}</select></label><label>Posição escondida<select id="choice-target-index"></select></label><label>Nova carta<select id="choice-deck-card">${deckOptions}</select></label><button id="complete-effect">Rasgar e substituir</button>`;
    const updateIndexes = () => {
      const target = game.players.find(({ id }) => id === byId("choice-target").value);
      byId("choice-target-index").innerHTML = Array.from({ length: target.handSize }, (_, index) => `<option value="${index}">Carta ${index + 1}</option>`).join("");
    };
    byId("choice-target").addEventListener("change", updateIndexes);
    updateIndexes();
  } else if (pending.type === "rodrigo-loss") {
    const target = game.players.find(({ id }) => id === pending.targetPlayerId);
    container.innerHTML = `<p>${escapeHtml(target.name)} não pagou a dívida. Escolha uma carta escondida:</p><label>Posição<select id="choice-target-index">${Array.from({ length: target.handSize }, (_, index) => `<option value="${index}">Carta ${index + 1}</option>`).join("")}</select></label><button id="complete-effect">Rasgar carta</button>`;
  } else if (pending.type === "robertinho-swap") {
    container.innerHTML = `<p>Escolha uma carta sua para trocar pela carta usada pelo alvo:</p><div class="loss-card-buttons">${game.ownHand.map((card) => `<button data-robertinho-card="${card.instanceId}">${characterName(card.characterId)}</button>`).join("")}</div>`;
    for (const button of container.querySelectorAll("[data-robertinho-card]")) {
      bindPress(button, () => emit("effect:choose", { ownInstanceId: button.dataset.robertinhoCard }));
    }
    return;
  } else {
    container.innerHTML = `<p>Você não possui 2 moedas. Escolha uma influência para perder:</p><div class="loss-card-buttons">${game.ownHand.map((card) => `<button data-own-instance="${card.instanceId}">${characterName(card.characterId)}</button>`).join("")}</div>`;
    for (const button of container.querySelectorAll("[data-own-instance]")) {
      bindPress(button, () => emit("effect:choose", { ownInstanceId: button.dataset.ownInstance }));
    }
    return;
  }
  bindPress(byId("complete-effect"), () => {
    const payload = { deckInstanceId: byId("choice-deck-card").value };
    if (pending.type === "sandra") payload.ownInstanceId = byId("choice-own-card").value;
    else if (pending.type === "altimar") {
      payload.targetPlayerId = byId("choice-target").value;
      payload.targetCardIndex = Number(byId("choice-target-index").value);
    } else {
      payload.targetCardIndex = Number(byId("choice-target-index").value);
    }
    emit("effect:choose", payload);
  });
}

function renderForcedWaveAction(game, pending, container) {
  const allowedTargets = game.players.filter(({ eliminated, id }) => !eliminated && id !== room.selfPlayerId && id !== pending.actorPlayerId);
  if (pending.forcedAction === "collect") {
    container.innerHTML = `<p>O Wave obrigou você a coletar uma moeda.</p><button id="wave-complete">Coletar moeda</button>`;
    bindPress(byId("wave-complete"), () => emit("wave:collect", {}));
    return;
  }
  if (pending.forcedAction === "coup") {
    container.innerHTML = `<p>O Wave obrigou você a dar um Golpe. O usuário do Wave não pode ser o alvo.</p><div class="coup-controls"><label>Alvo<select id="choice-target">${allowedTargets.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("")}</select></label><label>Palpite<select id="choice-character"></select></label><button id="wave-complete" class="danger">Dar Golpe</button></div>`;
    fillCharacterSelect(byId("choice-character"), game.characterPool);
    bindPress(byId("wave-complete"), () => emit("wave:coup", { targetPlayerId: byId("choice-target").value, guessedCharacterId: byId("choice-character").value }));
    return;
  }
  const choices = game.characters.filter(({ id, implemented }) => implemented && id !== "andreia");
  container.innerHTML = `<p>O Wave obrigou você a usar uma carta. O usuário do Wave não pode ser escolhido.</p><label>Personagem<select id="forced-character">${choices.map((character) => `<option value="${character.id}">${escapeHtml(character.name)}</option>`).join("")}</select></label><div id="forced-parameters"></div><button id="wave-complete">Alegar habilidade</button>`;
  const renderParameters = () => {
    const id = byId("forced-character").value;
    const targetOptions = allowedTargets.map((player) => `<option value="${player.id}">${escapeHtml(player.name)}</option>`).join("");
    if (["jeff-dino", "rodrigo", "marcelo-moreira"].includes(id)) byId("forced-parameters").innerHTML = `<label>Alvo<select id="forced-target">${targetOptions}</select></label>${id === "marcelo-moreira" ? '<label>Condição<select id="forced-comparison"><option value="gte">Maior ou igual</option><option value="lte">Menor ou igual</option></select></label><label>Número<input id="forced-threshold" type="number" min="1" max="8" value="4"></label>' : ""}`;
    else if (id === "deivison") byId("forced-parameters").innerHTML = '<label>Operação<select id="forced-mode"><option value="deposit">Guardar</option><option value="withdraw">Retirar</option></select></label><label>Quantidade<input id="forced-amount" type="number" min="1" value="1"></label>';
    else if (id === "luis-sapeca") byId("forced-parameters").innerHTML = `<label>Primeiro alvo<select id="forced-target-one">${targetOptions}</select></label><label>Segundo alvo<select id="forced-target-two">${targetOptions}</select></label>`;
    else byId("forced-parameters").innerHTML = "";
  };
  byId("forced-character").addEventListener("change", renderParameters);
  renderParameters();
  bindPress(byId("wave-complete"), () => {
    const id = byId("forced-character").value;
    let parameters = {};
    if (["jeff-dino", "rodrigo"].includes(id)) parameters = { targetPlayerId: byId("forced-target").value };
    if (id === "marcelo-moreira") parameters = { targetPlayerId: byId("forced-target").value, comparison: byId("forced-comparison").value, threshold: Number(byId("forced-threshold").value) };
    if (id === "deivison") parameters = { mode: byId("forced-mode").value, amount: Number(byId("forced-amount").value) };
    if (id === "luis-sapeca") parameters = { targetPlayerIds: [byId("forced-target-one").value, byId("forced-target-two").value] };
    emit("wave:character", { characterId: id, parameters });
  });
}

function renderPool(game) {
  const characters = Array.isArray(game.characters)
    ? game.characters
    : game.characterPool.map((id) => ({ id, name: characterName(id), effect: "Reinicie o servidor para carregar a descrição.", cost: { type: "none" }, implemented: false }));
  byId("pool-cards").innerHTML = characters.map((character) => `
    <article class="pool-character ${character.implemented ? "implemented" : "pending"}">
      <span class="character-monogram">${character.name.charAt(0)}</span>
      <div><h3>${escapeHtml(character.name)}</h3><small>${costLabel(character.cost)}</small><p>${escapeHtml(character.effect)}</p>
      <b>${character.implemented ? "Jogável" : "Efeito em desenvolvimento"}</b></div>
    </article>`).join("");
  if (shownPoolRoomId !== room.id) {
    shownPoolRoomId = room.id;
    setTimeout(() => {
      if (!byId("pool-dialog").open) byId("pool-dialog").showModal();
    }, 250);
  }
}

function effectBadges(game, player) {
  return game.activeEffects.filter((effect) =>
    effect.targetPlayerId === player.id ||
    (effect.type === "ademar" && effect.sourcePlayerId === player.id),
  ).map((effect) => {
    if (effect.type === "dinosaur") return '<span class="dinosaur-effect" title="Dinossaurinho: come 1 moeda de cada ganho">🦖</span>';
    if (effect.type === "cave") return '<span class="cave-effect" title="Moedas protegidas">⛰</span>';
    if (effect.type === "ademar") return '<span class="ademar-effect" title="Ademar está observando quem não ganha moedas">👀</span>';
    if (effect.type === "rodrigo-debt") return `<span class="ademar-effect" title="Dívida: ${effect.amountDue} moedas">💸</span>`;
    if (effect.type === "marcelo-requirement") return `<span class="ademar-effect" title="Requisito ${effect.comparison === "gte" ? "≥" : "≤"} ${effect.threshold}">📋</span>`;
    return "";
  }).join("");
}

function updateChallengeTimer() {
  const claim = room?.game?.pendingClaim;
  if (claim?.stage === "challenge-window") {
    const remaining = Math.max(0, (claim.expiresAt - Date.now()) / 1000);
    byId("challenge-timer").textContent = `${remaining.toFixed(1)}s`;
  }
  const reaction = room?.game?.pendingReaction;
  if (reaction) {
    const remaining = Math.max(0, (reaction.expiresAt - Date.now()) / 1000);
    byId("reaction-timer").textContent = `${remaining.toFixed(1)}s`;
  }
}

function costLabel(cost) {
  if (cost.type === "coins") return `${cost.amount} moeda(s)`;
  if (cost.type === "replaces-coup") return "Substitui um Golpe";
  if (cost.type === "gives-coins") return `Entrega ${cost.amount} moedas`;
  return "Sem custo";
}

function opponentPosition(index, count) {
  if (count === 1) return { x: 50, y: 15, rotation: 0 };
  const angle = Math.PI + (Math.PI * index) / (count - 1);
  const x = 50 + Math.cos(angle) * 39;
  const y = 43 + Math.sin(angle) * 30;
  return {
    x,
    y,
    rotation: Math.max(-34, Math.min(34, (50 - x) * 0.87)),
  };
}
function fillCharacterSelect(select, ids) {
  select.innerHTML = ids.map((id) => `<option value="${id}">${characterName(id)}</option>`).join("");
}
function fillClaimCharacterSelect(select, characters) {
  const previous = select.value;
  select.innerHTML = characters.filter(({ id }) => id !== "andreia").map((character) =>
    `<option value="${character.id}" ${character.implemented ? "" : "disabled"}>${escapeHtml(character.name)}${character.implemented ? "" : " — em desenvolvimento"}</option>`,
  ).join("");
  const previousOption = [...select.options].find(({ value }) => value === previous);
  if (previousOption && !previousOption.disabled) select.value = previous;
  else {
    const firstEnabled = [...select.options].find((option) => !option.disabled);
    if (firstEnabled) select.value = firstEnabled.value;
  }
}
function showOnly(viewId) {
  for (const id of ["connection-view", "home-view", "lobby-view", "game-view"]) byId(id).hidden = id !== viewId;
}
function showMessage(text, isError = false) {
  const message = byId("message");
  message.hidden = false; message.textContent = text; message.classList.toggle("error", isError);
  setTimeout(() => { message.hidden = true; }, 4500);
}
function showError(text) { showMessage(text, true); }
function characterName(id) { return CHARACTER_NAMES[id] ?? id; }
function initials(name) { return String(name).split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase(); }
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function bindPress(element, handler) {
  let touchStart = null;
  let lastPointerActivation = 0;
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") touchStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  element.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse" || !touchStart) return;
    const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
    touchStart = null;
    if (moved > 12) return;
    event.preventDefault();
    lastPointerActivation = Date.now();
    handler(event);
  });
  element.addEventListener("pointercancel", () => { touchStart = null; });
  element.addEventListener("click", (event) => {
    if (Date.now() - lastPointerActivation < 600) return;
    handler(event);
  });
}
function loadSocketClient(source) {
  if (window.io) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = source;
    script.onload = resolve; script.onerror = reject; document.head.append(script);
  });
}

function animateNewEvents(game) {
  const newEvents = game.events.filter(({ sequence }) => sequence > lastAnimatedEvent);
  if (game.events.length) lastAnimatedEvent = Math.max(...game.events.map(({ sequence }) => sequence));
  for (const event of newEvents) {
    if (event.type === "coins-collected") animateCoinTo(event.playerId);
  }
}

function animateCoinTo(playerId) {
  const table = document.querySelector(".game-table");
  const building = byId("collect-button");
  const target = playerId === room.selfPlayerId
    ? document.querySelector(".own-meta")
    : document.querySelector(`[data-player-id="${playerId}"]`);
  if (!table || !building || !target) return;
  const tableRect = table.getBoundingClientRect();
  const from = building.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const startX = from.left + from.width / 2 - tableRect.left;
  const startY = from.top + from.height / 2 - tableRect.top;
  const endX = to.left + to.width / 2 - tableRect.left;
  const endY = to.top + to.height / 2 - tableRect.top;
  const coin = document.createElement("span");
  coin.className = "flying-coin"; coin.textContent = "●";
  coin.style.left = `${startX}px`; coin.style.top = `${startY}px`;
  coin.style.setProperty("--coin-x", `${endX - startX}px`);
  coin.style.setProperty("--coin-y", `${endY - startY}px`);
  byId("coin-effects").append(coin);
  coin.addEventListener("animationend", () => {
    coin.remove();
    const impact = document.createElement("span");
    impact.className = "coin-impact"; impact.style.left = `${endX}px`; impact.style.top = `${endY}px`;
    byId("coin-effects").append(impact);
    impact.addEventListener("animationend", () => impact.remove());
  }, { once: true });
}

setInterval(updateChallengeTimer, 100);
