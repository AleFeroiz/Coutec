"use strict";

applyRandomAmbientColor();
installMobileTapBridge();

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
let abilityWizard = null;
let targetPicker = null;
let coupWizard = null;
let effectWizard = null;
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
  if (!abilityWizard?.ready) return showMessage("Conclua as escolhas da habilidade primeiro.");
  emit("action:declare-character", {
    characterId: byId("claim-character").value,
    parameters: readCharacterParameters(),
  });
});
byId("claim-character").addEventListener("change", () => {
  startAbilityWizard(byId("claim-character").value);
});
bindPress(document.querySelector(".own-meta"), () => chooseTableTarget(room?.selfPlayerId));
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
bindPress(byId("leave-game-button"), () => {
  if (!window.confirm("Sair da partida agora? Você será removido imediatamente.")) return;
  emit("room:leave", {}, () => {
    sessionStorage.removeItem("coutecSession");
    room = null;
    document.body.classList.remove("in-game", "is-own-turn");
    showOnly("home-view");
    showMessage("Você saiu da partida.");
  });
});
bindPress(byId("bluff-button"), openBluffPanel);
bindPress(byId("coup-button"), openCoupPanel);
bindPress(byId("close-action-console"), closeActionConsole);
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
  const paused = Boolean(room.connectionPause);
  document.body.classList.toggle("is-own-turn", isOwnTurn);
  byId("game-room-code").textContent = room.id;
  byId("turn-text").textContent = current
    ? (isOwnTurn ? "É a sua vez" : `Vez de ${current.name}`)
    : "Partida encerrada";
  byId("winner-text").textContent = game.winnerPlayerId
    ? `${game.players.find((player) => player.id === game.winnerPlayerId)?.name} venceu!`
    : "";
  byId("connection-pause").hidden = !paused;
  byId("connection-pause-player").textContent = paused
    ? `${room.connectionPause.playerName} perdeu a conexão. A partida continuará se não voltar a tempo.`
    : "";
  byId("own-effects").innerHTML = effectBadges(game, self);
  byId("own-coin-pile").innerHTML = coinPileMarkup(game, self);
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
    bindPress(cardButton, () => {
      if (targetPicker) return chooseTableTarget(room.selfPlayerId);
      activateOwnedCard(cardButton.dataset.useCharacter);
    });
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
    return `<article data-player-id="${player.id}" class="player-tile ${player.id === game.currentPlayerId ? "current" : ""} ${player.eliminated ? "eliminated" : ""}"
      style="--x:${position.x}%;--y:${position.y}%;--seat-angle:${position.rotation}deg">
      <div class="effect-badges">${effects}</div>
      <div class="player-nameplate">${escapeHtml(player.name)}</div>
      <div class="opponent-hand-zone"><div class="card-backs">${backs}</div>${coinPileMarkup(game, player)}</div>
    </article>`;
  }).join("");
  for (const tile of byId("table-players").querySelectorAll("[data-player-id]")) {
    bindPress(tile, () => chooseTableTarget(tile.dataset.playerId));
  }
  refreshTargetHighlights();
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
  byId("claim-character").closest("label").hidden = isBluff;
  byId("claim-panel").hidden = false;
  byId("coup-panel").hidden = true;
  byId("normal-actions").hidden = false;
  byId("action-console").hidden = false;
  byId("action-title").textContent = isBluff ? "Escolha seu blefe" : `Usar ${characterName(characterId)}`;
  byId("action-prompt").textContent = isBluff
    ? "Os demais jogadores poderão desafiar sua alegação."
    : "Escolha os detalhes e confirme a habilidade.";
  if (isBluff) {
    abilityWizard = { selectingCharacter: true, ready: false, parameters: {} };
    renderCharacterParameters();
  } else {
    startAbilityWizard(byId("claim-character").value);
  }
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
  coupWizard = { step: 0, targetPlayerId: null, guessedCharacterId: null };
  renderCoupWizard();
}

function closeActionConsole() {
  if (room?.game?.pendingClaim || room?.game?.pendingReaction || room?.game?.pendingEffectChoice) return;
  selectedTableAction = null;
  clearTargetPicker();
  abilityWizard = null;
  coupWizard = null;
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
  if (blockingInteraction) {
    clearTargetPicker();
    abilityWizard = null;
    coupWizard = null;
  }
  if (!isOwnTurn && !blockingInteraction) {
    selectedTableAction = null;
    coupWizard = null;
    clearTargetPicker();
  }
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
  const canCollect = isOwnTurn && !self.eliminated && self.coins < 10 && !blockingInteraction;
  byId("collect-button").disabled = false;
  byId("collect-button").setAttribute("aria-disabled", String(!canCollect));
  byId("collect-button").classList.toggle("action-unavailable", !canCollect);
  byId("claim-button").dataset.baseDisabled = String(!isOwnTurn || self.eliminated);
  updateClaimButton();
  byId("coup-button").disabled = !isOwnTurn || self.eliminated || self.coins < 7 || !targets.length;
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
      byId("reaction-claim-button").textContent = `${ownsReactionCard ? "Usar" : "Blefar com"} ${characterName(reaction.type)}`;
      byId("reaction-claim-button").hidden = !eligible || passed;
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
    if (selectedTableAction === "coup") renderCoupWizard();
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

function startAbilityWizard(characterId) {
  abilityWizard = { characterId, parameters: {}, step: 0, ready: false };
  clearTargetPicker();
  renderCharacterParameters();
}

function renderCoupWizard() {
  if (!room?.game || selectedTableAction !== "coup") return;
  const container = byId("coup-wizard");
  coupWizard ??= { step: 0, targetPlayerId: null, guessedCharacterId: null };
  if (coupWizard.step === 0) {
    const targets = room.game.players.filter(({ id, eliminated }) => id !== room.selfPlayerId && !eliminated);
    container.innerHTML = '<div class="wizard-step"><strong>Quem receberá o Golpe?</strong><p>Toque no jogador sobre a mesa.</p></div>';
    requestTableTarget(targets.map(({ id }) => id), (playerId) => {
      coupWizard.targetPlayerId = playerId;
      coupWizard.step = 1;
      renderCoupWizard();
    });
    return;
  }
  clearTargetPicker();
  if (coupWizard.step === 1) {
    container.innerHTML = `<div class="wizard-step"><strong>Qual carta você acha que ele possui?</strong>${characterChoiceButtons(room.game.characterPool, "coup-guess")}</div>`;
    for (const button of container.querySelectorAll("[data-coup-guess]")) bindPress(button, () => {
      coupWizard.guessedCharacterId = button.dataset.coupGuess;
      coupWizard.step = 2;
      renderCoupWizard();
    });
    return;
  }
  const target = room.game.players.find(({ id }) => id === coupWizard.targetPlayerId);
  container.innerHTML = `<div class="wizard-ready">Golpe em <strong>${escapeHtml(target?.name ?? "jogador")}</strong>, palpite: <strong>${characterName(coupWizard.guessedCharacterId)}</strong>.</div><button id="confirm-coup-button" class="danger">Confirmar Golpe</button>`;
  bindPress(byId("confirm-coup-button"), () => emit("action:coup", {
    targetPlayerId: coupWizard.targetPlayerId,
    guessedCharacterId: coupWizard.guessedCharacterId,
  }));
}

function characterChoiceButtons(characterIds, dataName) {
  return `<div class="choice-card-grid">${characterIds.map((id) => `<button class="choice-card" data-${dataName}="${id}">${characterName(id)}</button>`).join("")}</div>`;
}

function renderCharacterParameters() {
  if (!room?.game || room.game.pendingClaim) return;
  const container = byId("character-parameters");
  if (abilityWizard?.selectingCharacter) {
    const ids = [...byId("claim-character").options].filter(({ disabled }) => !disabled).map(({ value }) => value);
    container.innerHTML = `<div class="wizard-step"><strong>Qual personagem você quer alegar?</strong>${characterChoiceButtons(ids, "bluff-character")}</div>`;
    for (const button of container.querySelectorAll("[data-bluff-character]")) bindPress(button, () => {
      byId("claim-character").value = button.dataset.bluffCharacter;
      startAbilityWizard(button.dataset.bluffCharacter);
    });
    byId("claim-button").disabled = true;
    return;
  }
  const characterId = byId("claim-character").value;
  if (!abilityWizard || abilityWizard.characterId !== characterId) {
    abilityWizard = { characterId, parameters: {}, step: 0, ready: false };
  }
  const selectedCharacter = room.game.characters?.find(({ id }) => id === characterId);
  byId("claim-help").textContent = selectedCharacter
    ? `${costLabel(selectedCharacter.cost)} · ${selectedCharacter.effect}`
    : "Escolha uma habilidade disponível no pool da partida.";
  const activePlayers = room.game.players.filter(({ eliminated }) => !eliminated);
  const otherPlayers = activePlayers.filter(({ id }) => id !== room.selfPlayerId);
  if (abilityWizard.ready) {
    container.innerHTML = '<div class="wizard-ready">✓ Escolhas concluídas. Confirme para anunciar a habilidade.</div>';
    return updateClaimButton();
  }
  const targetStep = (players, text, next) => {
    container.innerHTML = `<div class="wizard-step"><strong>${escapeHtml(text)}</strong><p>Toque diretamente no jogador sobre a mesa.</p></div>`;
    requestTableTarget(players.map(({ id }) => id), (playerId) => {
      abilityWizard.parameters.targetPlayerId = playerId;
      abilityWizard.step += 1;
      next();
    });
  };
  if (["jeff-dino", "rodrigo", "marcelo-moreira", "wave"].includes(characterId) && abilityWizard.step === 0) {
    const players = characterId === "jeff-dino" ? activePlayers : otherPlayers;
    targetStep(players, characterId === "jeff-dino" ? "Quem receberá o dinossaurinho?" : "Escolha o alvo", renderCharacterParameters);
    return updateClaimButton();
  }
  clearTargetPicker();
  if (characterId === "marcelo-moreira" && abilityWizard.step === 1) {
    container.innerHTML = `<div class="wizard-step"><label>Número de moedas: <output id="requirement-output">4</output><input id="requirement-slider" type="range" min="1" max="8" value="4"></label><button id="wizard-next">OK</button></div>`;
    const slider = byId("requirement-slider");
    slider.addEventListener("input", () => { byId("requirement-output").value = slider.value; });
    bindPress(byId("wizard-next"), () => { abilityWizard.parameters.threshold = Number(slider.value); abilityWizard.step = 2; renderCharacterParameters(); });
    return updateClaimButton();
  }
  if (characterId === "marcelo-moreira" && abilityWizard.step === 2) {
    container.innerHTML = `<div class="wizard-step"><strong>Qual é a condição?</strong><div class="wizard-options"><button data-comparison="gte">Maior ou igual (≥)</button><button data-comparison="lte">Menor ou igual (≤)</button></div></div>`;
    for (const button of container.querySelectorAll("[data-comparison]")) bindPress(button, () => {
      abilityWizard.parameters.comparison = button.dataset.comparison; finishAbilityWizard();
    });
    return updateClaimButton();
  }
  if (characterId === "wave" && abilityWizard.step === 1) {
    container.innerHTML = `<div class="wizard-step"><strong>Qual ação o alvo fará?</strong><div class="wizard-options"><button data-wave-action="collect">Coletar moeda</button><button data-wave-action="character">Usar carta</button><button data-wave-action="coup">Dar Golpe</button></div></div>`;
    for (const button of container.querySelectorAll("[data-wave-action]")) bindPress(button, () => {
      abilityWizard.parameters.forcedAction = button.dataset.waveAction; finishAbilityWizard();
    });
    return updateClaimButton();
  }
  if (characterId === "luis-sapeca" && abilityWizard.step < 2) {
    const first = abilityWizard.parameters.targetPlayerIds?.[0];
    const choices = activePlayers.filter(({ id }) => id !== first);
    container.innerHTML = `<div class="wizard-step"><strong>${first ? "Escolha o segundo jogador" : "Escolha o primeiro jogador"}</strong><p>Toque diretamente no jogador sobre a mesa.</p></div>`;
    requestTableTarget(choices.map(({ id }) => id), (playerId) => {
      abilityWizard.parameters.targetPlayerIds = [...(abilityWizard.parameters.targetPlayerIds ?? []), playerId];
      abilityWizard.step += 1;
      if (abilityWizard.step === 2) finishAbilityWizard(); else renderCharacterParameters();
    });
    return updateClaimButton();
  }
  if (characterId === "deivison" && abilityWizard.step === 0) {
    container.innerHTML = `<div class="wizard-step"><strong>O que deseja fazer?</strong><div class="wizard-options"><button data-repository-mode="deposit">Guardar</button><button data-repository-mode="withdraw">Retirar</button></div></div>`;
    for (const button of container.querySelectorAll("[data-repository-mode]")) bindPress(button, () => {
      abilityWizard.parameters.mode = button.dataset.repositoryMode; abilityWizard.step = 1; renderCharacterParameters();
    });
    return updateClaimButton();
  }
  if (characterId === "deivison" && abilityWizard.step === 1) {
    const self = activePlayers.find(({ id }) => id === room.selfPlayerId);
    const available = abilityWizard.parameters.mode === "deposit" ? self.coins - 1 : self.repositoryCoins;
    if (available < 1) {
      container.innerHTML = `<div class="wizard-warning">Não há moedas disponíveis para ${abilityWizard.parameters.mode === "deposit" ? "guardar além do custo" : "retirar"}.</div>`;
      return updateClaimButton();
    }
    const max = available;
    container.innerHTML = `<div class="wizard-step"><label>Quantidade: <output id="repository-output">1</output><input id="repository-slider" type="range" min="1" max="${max}" value="1"></label><button id="wizard-next">OK</button></div>`;
    const slider = byId("repository-slider");
    slider.addEventListener("input", () => { byId("repository-output").value = slider.value; });
    bindPress(byId("wizard-next"), () => { abilityWizard.parameters.amount = Number(slider.value); finishAbilityWizard(); });
    return updateClaimButton();
  }
  if (["jeff-dino", "rodrigo"].includes(characterId) && abilityWizard.step === 1) return finishAbilityWizard();
  if (!["marcelo-moreira", "wave", "luis-sapeca", "deivison"].includes(characterId)) finishAbilityWizard();
}

function readCharacterParameters() {
  return { ...(abilityWizard?.parameters ?? {}) };
}

function finishAbilityWizard() {
  clearTargetPicker();
  abilityWizard.ready = true;
  byId("character-parameters").innerHTML = '<div class="wizard-ready">✓ Escolhas concluídas. Confirme para anunciar a habilidade.</div>';
  updateClaimButton();
}

function requestTableTarget(playerIds, onSelect) {
  targetPicker = { playerIds: new Set(playerIds), onSelect };
  byId("action-console").classList.add("target-picking");
  refreshTargetHighlights();
}

function chooseTableTarget(playerId) {
  if (!targetPicker || !targetPicker.playerIds.has(playerId)) return;
  const callback = targetPicker.onSelect;
  clearTargetPicker();
  callback(playerId);
}

function clearTargetPicker() {
  targetPicker = null;
  byId("action-console")?.classList.remove("target-picking");
  document.querySelectorAll(".selectable-target").forEach((element) => element.classList.remove("selectable-target"));
}

function refreshTargetHighlights() {
  document.querySelectorAll("[data-player-id]").forEach((element) => {
    element.classList.toggle("selectable-target", Boolean(targetPicker?.playerIds.has(element.dataset.playerId)));
  });
  document.querySelector(".own-seat")?.classList.toggle("selectable-target", Boolean(targetPicker?.playerIds.has(room?.selfPlayerId)));
}

function updateClaimButton() {
  if (!room?.game) return;
  const self = room.game.players.find(({ id }) => id === room.selfPlayerId);
  const baseDisabled = byId("claim-button").dataset.baseDisabled === "true";
  const isPaula = byId("claim-character").value === "paula-granada";
  byId("claim-button").disabled = baseDisabled || !abilityWizard?.ready || (self.coins >= 10 && !isPaula);
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
  const wizardKey = `${pending.type}:${pending.actorPlayerId ?? ""}:${pending.targetPlayerId ?? ""}`;
  if (!effectWizard || effectWizard.key !== wizardKey) effectWizard = { key: wizardKey, step: 0, values: {} };
  if (pending.type === "andreia-offer") {
    const ownsAndreia = game.ownHand.some(({ characterId }) => characterId === "andreia");
    byId("action-prompt").textContent = "O Golpe acertou. Você quer alegar Andreia para continuar?";
    container.innerHTML = `<div class="action-row"><button id="andreia-use">${ownsAndreia ? "Usar Andreia" : "Blefar com Andreia"}</button><button id="andreia-skip" class="secondary">Encerrar turno</button></div>`;
    bindPress(byId("andreia-use"), () => emit("andreia:respond", { use: true }));
    bindPress(byId("andreia-skip"), () => emit("andreia:respond", { use: false }));
    return;
  } else if (pending.type === "andreia-coup") {
    const targets = game.players.filter(({ eliminated, id }) => !eliminated && id !== room.selfPlayerId);
    if (effectWizard.step === 0) {
      container.innerHTML = '<div class="wizard-step"><strong>Andreia: escolha o alvo do Golpe grátis</strong><p>Toque no jogador sobre a mesa.</p></div>';
      requestTableTarget(targets.map(({ id }) => id), (playerId) => { effectWizard.values.targetPlayerId = playerId; effectWizard.step = 1; renderEffectChoice(game, pending); });
    } else {
      clearTargetPicker();
      container.innerHTML = `<div class="wizard-step"><strong>Escolha o palpite</strong>${characterChoiceButtons(game.characterPool, "andreia-guess")}</div>`;
      for (const button of container.querySelectorAll("[data-andreia-guess]")) bindPress(button, () => emit("andreia:coup", { targetPlayerId: effectWizard.values.targetPlayerId, guessedCharacterId: button.dataset.andreiaGuess }));
    }
    return;
  } else if (pending.type === "wave-action") {
    renderForcedWaveAction(game, pending, container);
    return;
  } else if (pending.type === "sandra") {
    const deckCards = game.effectChoiceOptions?.deckCards ?? [];
    if (effectWizard.step === 0) {
      container.innerHTML = `<div class="wizard-step"><strong>Qual carta sua será substituída?</strong><div class="choice-card-grid">${game.ownHand.map((card) => `<button class="choice-card" data-own-card="${card.instanceId}">${characterName(card.characterId)}</button>`).join("")}</div></div>`;
      for (const button of container.querySelectorAll("[data-own-card]")) bindPress(button, () => { effectWizard.values.ownInstanceId = button.dataset.ownCard; effectWizard.step = 1; renderEffectChoice(game, pending); });
    } else {
      container.innerHTML = `<div class="wizard-step"><strong>Escolha a nova carta olhando o baralho</strong><div class="choice-card-grid">${deckCards.map((card) => `<button class="choice-card" data-deck-card="${card.instanceId}">${characterName(card.characterId)}</button>`).join("")}</div></div>`;
      for (const button of container.querySelectorAll("[data-deck-card]")) bindPress(button, () => emit("effect:choose", { ownInstanceId: effectWizard.values.ownInstanceId, deckInstanceId: button.dataset.deckCard }));
    }
    return;
  } else if (pending.type === "altimar") {
    const targets = game.players.filter(({ eliminated }) => !eliminated);
    if (effectWizard.step === 0) {
      container.innerHTML = '<div class="wizard-step"><strong>Altimar: escolha o alvo</strong><p>Toque no jogador sobre a mesa.</p></div>';
      requestTableTarget(targets.map(({ id }) => id), (playerId) => { effectWizard.values.targetPlayerId = playerId; effectWizard.step = 1; renderEffectChoice(game, pending); });
    } else if (effectWizard.step === 1) {
      clearTargetPicker();
      const target = game.players.find(({ id }) => id === effectWizard.values.targetPlayerId);
      container.innerHTML = `<div class="wizard-step"><strong>Qual carta escondida será rasgada?</strong><div class="choice-card-grid">${Array.from({ length: target.handSize }, (_, index) => `<button class="choice-card card-back-choice" data-card-index="${index}">Carta ${index + 1}</button>`).join("")}</div></div>`;
      for (const button of container.querySelectorAll("[data-card-index]")) bindPress(button, () => { effectWizard.values.targetCardIndex = Number(button.dataset.cardIndex); effectWizard.step = 2; renderEffectChoice(game, pending); });
    } else {
      const deckCards = game.effectChoiceOptions?.deckCards ?? [];
      container.innerHTML = `<div class="wizard-step"><strong>Escolha a nova carta</strong><div class="choice-card-grid">${deckCards.map((card) => `<button class="choice-card" data-deck-card="${card.instanceId}">${characterName(card.characterId)}</button>`).join("")}</div></div>`;
      for (const button of container.querySelectorAll("[data-deck-card]")) bindPress(button, () => emit("effect:choose", { ...effectWizard.values, deckInstanceId: button.dataset.deckCard }));
    }
    return;
  } else if (pending.type === "rodrigo-loss") {
    const target = game.players.find(({ id }) => id === pending.targetPlayerId);
    container.innerHTML = `<div class="wizard-step"><strong>${escapeHtml(target.name)} não pagou. Escolha uma carta escondida.</strong><div class="choice-card-grid">${Array.from({ length: target.handSize }, (_, index) => `<button class="choice-card card-back-choice" data-card-index="${index}">Carta ${index + 1}</button>`).join("")}</div></div>`;
    for (const button of container.querySelectorAll("[data-card-index]")) bindPress(button, () => emit("effect:choose", { targetCardIndex: Number(button.dataset.cardIndex) }));
    return;
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
}

function renderForcedWaveAction(game, pending, container) {
  const allowedTargets = game.players.filter(({ eliminated, id }) => !eliminated && id !== room.selfPlayerId && id !== pending.actorPlayerId);
  const wizardKey = `wave:${pending.actorPlayerId}:${pending.targetPlayerId}:${pending.forcedAction}`;
  if (!effectWizard || effectWizard.key !== wizardKey) effectWizard = { key: wizardKey, step: 0, values: {} };
  if (pending.forcedAction === "collect") {
    container.innerHTML = `<p>O Wave obrigou você a coletar uma moeda.</p><button id="wave-complete">Coletar moeda</button>`;
    bindPress(byId("wave-complete"), () => emit("wave:collect", {}));
    return;
  }
  if (pending.forcedAction === "coup") {
    if (effectWizard.step === 0) {
      container.innerHTML = '<div class="wizard-step"><strong>Wave obriga um Golpe: escolha o alvo</strong><p>O usuário do Wave não pode ser escolhido.</p></div>';
      requestTableTarget(allowedTargets.map(({ id }) => id), (playerId) => { effectWizard.values.targetPlayerId = playerId; effectWizard.step = 1; renderForcedWaveAction(game, pending, container); });
    } else {
      clearTargetPicker();
      container.innerHTML = `<div class="wizard-step"><strong>Escolha o palpite</strong>${characterChoiceButtons(game.characterPool, "wave-guess")}</div>`;
      for (const button of container.querySelectorAll("[data-wave-guess]")) bindPress(button, () => emit("wave:coup", { targetPlayerId: effectWizard.values.targetPlayerId, guessedCharacterId: button.dataset.waveGuess }));
    }
    return;
  }
  const forcedPlayer = game.players.find(({ id }) => id === room.selfPlayerId);
  const choices = game.characters.filter((character) => character.implemented
    && !["andreia", "robertinho", "ze"].includes(character.id)
    && forcedPlayer.coins >= characterActionCost(character));
  if (!effectWizard.values.characterId) {
    container.innerHTML = `<div class="wizard-step"><strong>Qual carta você foi obrigado a alegar?</strong>${characterChoiceButtons(choices.map(({ id }) => id), "forced-character")}</div>`;
    for (const button of container.querySelectorAll("[data-forced-character]")) bindPress(button, () => {
      effectWizard.values.characterId = button.dataset.forcedCharacter;
      effectWizard.step = 0;
      renderForcedWaveAction(game, pending, container);
    });
    return;
  }
  renderForcedCharacterParameters(game, pending, container, allowedTargets);
}

function renderForcedCharacterParameters(game, pending, container, allowedTargets) {
  const id = effectWizard.values.characterId;
  const parameters = effectWizard.values.parameters ??= {};
  const send = () => emit("wave:character", { characterId: id, parameters });
  if (["jeff-dino", "rodrigo", "marcelo-moreira", "wave"].includes(id) && effectWizard.step === 0) {
    container.innerHTML = '<div class="wizard-step"><strong>Escolha o alvo na mesa</strong><p>O usuário do Wave não pode ser escolhido.</p></div>';
    requestTableTarget(allowedTargets.map(({ id: playerId }) => playerId), (playerId) => { parameters.targetPlayerId = playerId; effectWizard.step = 1; renderForcedCharacterParameters(game, pending, container, allowedTargets); });
    return;
  }
  if (id === "luis-sapeca" && effectWizard.step < 2) {
    const selected = parameters.targetPlayerIds ??= [];
    const choices = allowedTargets.filter(({ id: playerId }) => !selected.includes(playerId));
    container.innerHTML = `<div class="wizard-step"><strong>Escolha o ${selected.length ? "segundo" : "primeiro"} jogador na mesa</strong></div>`;
    requestTableTarget(choices.map(({ id: playerId }) => playerId), (playerId) => { selected.push(playerId); effectWizard.step += 1; renderForcedCharacterParameters(game, pending, container, allowedTargets); });
    return;
  }
  clearTargetPicker();
  if (id === "marcelo-moreira" && effectWizard.step === 1) {
    container.innerHTML = '<div class="wizard-step"><label>Número: <output id="forced-output">4</output><input id="forced-slider" type="range" min="1" max="8" value="4"></label><button id="forced-next">OK</button></div>';
    const slider = byId("forced-slider"); slider.addEventListener("input", () => { byId("forced-output").value = slider.value; });
    bindPress(byId("forced-next"), () => { parameters.threshold = Number(slider.value); effectWizard.step = 2; renderForcedCharacterParameters(game, pending, container, allowedTargets); });
    return;
  }
  if (id === "marcelo-moreira" && effectWizard.step === 2) {
    container.innerHTML = '<div class="wizard-step"><strong>Condição</strong><div class="wizard-options"><button data-forced-comparison="gte">Maior ou igual</button><button data-forced-comparison="lte">Menor ou igual</button></div></div>';
    for (const button of container.querySelectorAll("[data-forced-comparison]")) bindPress(button, () => { parameters.comparison = button.dataset.forcedComparison; send(); });
    return;
  }
  if (id === "wave" && effectWizard.step === 1) {
    container.innerHTML = '<div class="wizard-step"><strong>Ação forçada</strong><div class="wizard-options"><button data-forced-action="collect">Coletar</button><button data-forced-action="character">Usar carta</button><button data-forced-action="coup">Golpe</button></div></div>';
    for (const button of container.querySelectorAll("[data-forced-action]")) bindPress(button, () => { parameters.forcedAction = button.dataset.forcedAction; send(); });
    return;
  }
  if (id === "deivison" && effectWizard.step === 0) {
    container.innerHTML = '<div class="wizard-step"><strong>Operação</strong><div class="wizard-options"><button data-forced-mode="deposit">Guardar</button><button data-forced-mode="withdraw">Retirar</button></div></div>';
    for (const button of container.querySelectorAll("[data-forced-mode]")) bindPress(button, () => { parameters.mode = button.dataset.forcedMode; effectWizard.step = 1; renderForcedCharacterParameters(game, pending, container, allowedTargets); });
    return;
  }
  if (id === "deivison" && effectWizard.step === 1) {
    const self = game.players.find(({ id: playerId }) => playerId === room.selfPlayerId);
    const available = parameters.mode === "deposit" ? self.coins - 1 : self.repositoryCoins;
    if (available < 1) { container.innerHTML = '<div class="wizard-warning">Não há moedas disponíveis para essa operação.</div>'; return; }
    container.innerHTML = `<div class="wizard-step"><label>Quantidade: <output id="forced-output">1</output><input id="forced-slider" type="range" min="1" max="${available}" value="1"></label><button id="forced-next">Confirmar</button></div>`;
    const slider = byId("forced-slider"); slider.addEventListener("input", () => { byId("forced-output").value = slider.value; });
    bindPress(byId("forced-next"), () => { parameters.amount = Number(slider.value); send(); });
    return;
  }
  container.innerHTML = '<button id="wave-complete">Confirmar habilidade</button>';
  bindPress(byId("wave-complete"), send);
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
    if (effect.type === "cave") return "";
    if (effect.type === "ademar") return '<span class="ademar-effect" title="Ademar está observando quem não ganha moedas">👀</span>';
    if (effect.type === "rodrigo-debt") return `<span class="ademar-effect" title="Dívida: ${effect.amountDue} moedas">💸</span>`;
    if (effect.type === "marcelo-requirement") return `<span class="ademar-effect" title="Requisito ${effect.comparison === "gte" ? "≥" : "≤"} ${effect.threshold}">📋</span>`;
    return "";
  }).join("");
}

function coinPileMarkup(game, player) {
  const protectedByCave = game.activeEffects.some(
    ({ type, targetPlayerId }) => type === "cave" && targetPlayerId === player.id,
  );
  return `<div class="coin-pile ${protectedByCave ? "protected-coins" : ""}" title="${player.coins} moeda(s)${protectedByCave ? " protegidas pela caverna" : ""}">
    <span class="coin-disc coin-one">●</span><span class="coin-disc coin-two">●</span><span class="coin-disc coin-three">●</span>
    <strong>${player.coins}</strong>${protectedByCave ? '<span class="coin-cave" aria-label="Moedas protegidas pela caverna"></span>' : ""}
    ${player.repositoryCoins > 0 ? `<span class="repository-cloud coin-repository" title="Moedas no repositório">☁ ${player.repositoryCoins}</span>` : ""}
  </div>`;
}

function installMobileTapBridge() {
  let start = null;
  document.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (touch) start = { x: touch.clientX, y: touch.clientY };
  }, { passive: true, capture: true });
  document.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (!touch || !start) return;
    const moved = Math.hypot(touch.clientX - start.x, touch.clientY - start.y);
    start = null;
    if (moved > 12 || event.target.closest("button")) return;
    const selector = ".cps-collect,.own-seat .card,.quick-actions button,#pool-button,.action-drawer button,.selectable-target";
    const target = document.elementsFromPoint(touch.clientX, touch.clientY)
      .map((element) => element.closest?.(selector))
      .find(Boolean);
    if (target) {
      event.preventDefault();
      target.click();
    }
  }, { passive: false, capture: true });
  document.addEventListener("touchcancel", () => { start = null; }, { passive: true, capture: true });
}

function updateChallengeTimer() {
  const pause = room?.connectionPause;
  if (pause) {
    const remaining = Math.max(0, Math.ceil((pause.expiresAt - Date.now()) / 1000));
    byId("connection-pause-timer").textContent = `${remaining}s`;
  }
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
  let lastTouchActivation = 0;
  element.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") touchStart = { x: event.clientX, y: event.clientY };
  }, { passive: true });
  element.addEventListener("pointerup", (event) => {
    if (event.pointerType === "mouse" || event.pointerType === "touch" || !touchStart) return;
    const moved = Math.hypot(event.clientX - touchStart.x, event.clientY - touchStart.y);
    touchStart = null;
    if (moved > 12) return;
    event.preventDefault();
    lastPointerActivation = Date.now();
    handler(event);
  });
  element.addEventListener("pointercancel", () => { touchStart = null; });
  element.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches[0];
    if (touch) touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  element.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (!touch || !touchStart) return;
    const moved = Math.hypot(touch.clientX - touchStart.x, touch.clientY - touchStart.y);
    touchStart = null;
    if (moved > 12) return;
    event.preventDefault();
    lastTouchActivation = Date.now();
    handler(event);
  }, { passive: false });
  element.addEventListener("touchcancel", () => { touchStart = null; });
  element.addEventListener("click", (event) => {
    if (Date.now() - lastPointerActivation < 600 || Date.now() - lastTouchActivation < 600) return;
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
