import {
  applyMove, chooseAiMove, createGame, GIFT_LABELS, legalMoves, projectObservation
} from './engine.js?v=1.0.0';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const revealDialog = $('#reveal-dialog');
const resultDialog = $('#result-dialog');
let game = null;
let runToken = 0;
let timerId = null;
let revealTimerId = null;
let resultShown = false;

const difficultyName = value => ({ easy: '쉬움', normal: '보통', hard: '어려움' }[value]);
const selectedDifficulty = () => document.querySelector('input[name="difficulty"]:checked').value;
const setText = (selector, value) => { $(selector).textContent = String(value); };

function activeActor() {
  if (!game) return null;
  if (game.phase === 'awaitResponse') return game.pendingOffer.receiver;
  if (game.phase === 'awaitClaim') return game.pendingPass.actor;
  return null;
}

function giftCard(card, hidden = false) {
  const element = document.createElement('div');
  element.className = `gift-card ${hidden ? 'card-back' : 'face-card'}`;
  if (hidden) {
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = card.direction === 'left' ? '←' : '→';
    element.append(arrow);
    element.setAttribute('aria-label', `${card.direction === 'left' ? '왼쪽' : '오른쪽'} 화살표가 있는 뒷면 선물`);
  } else {
    const icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = card.icon;
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = card.label;
    element.append(icon, label);
    element.setAttribute('aria-label', `선물 ${card.label}`);
  }
  return element;
}

function playerZone(view, index) {
  const player = view.players[index];
  const zone = $(`#player-${index}`);
  zone.classList.toggle('active', activeActor() === index);
  const heading = document.createElement('div');
  heading.className = 'player-heading';
  const identity = document.createElement('div');
  const role = document.createElement('span');
  role.textContent = player.kind === 'human' ? 'PLAYER' : 'COMPUTER';
  const name = document.createElement('h2');
  name.textContent = player.name;
  identity.append(role, name);
  const score = document.createElement('p');
  score.className = 'score';
  score.append('벌점 ', Object.assign(document.createElement('b'), { textContent: player.penalties.length }), ' / 3');
  heading.append(identity, score);

  const gifts = document.createElement('div');
  gifts.className = 'gift-row';
  gifts.setAttribute('aria-label', `${player.name}의 선물`);
  gifts.append(...player.gifts.map(card => giftCard(card, !card.faceUp)));

  const penalties = document.createElement('div');
  penalties.className = 'penalty-row';
  penalties.setAttribute('aria-label', `${player.name}의 공개 벌점 카드`);
  if (!player.penalties.length) {
    const empty = document.createElement('span');
    empty.className = 'penalty-chip';
    empty.textContent = '벌점 없음';
    penalties.append(empty);
  } else {
    penalties.append(...player.penalties.map(card => {
      const chip = document.createElement('span');
      chip.className = 'penalty-chip';
      chip.textContent = `${card.icon} ${card.label}`;
      return chip;
    }));
  }
  zone.replaceChildren(heading, gifts, penalties);
}

function renderTable(view) {
  view.players.forEach((_, index) => playerZone(view, index));
  setText('#shop-count', view.shopCount);
  const shop = $('#shop-card');
  shop.replaceWith(Object.assign(giftCard(view.shopTop, false), { id: 'shop-card' }));

  const offer = view.pendingOffer?.card ?? view.pendingPass?.card;
  const offerElement = offer ? giftCard(offer, true) : document.createElement('div');
  offerElement.id = 'offer-card';
  if (!offer) offerElement.className = 'gift-card card-back';
  $('#offer-card').replaceWith(offerElement);
  if (view.pendingOffer) {
    setText('#offer-route', `${view.players[view.pendingOffer.giver].name} → ${view.players[view.pendingOffer.receiver].name}`);
    setText('#offer-claim', `“멋진 ${view.pendingOffer.claim}을(를) 드릴게요.”`);
  } else if (view.pendingPass) {
    setText('#offer-route', `${view.players[view.pendingPass.actor].name}이(가) 오래된 선물을 고르는 중`);
    setText('#offer-claim', '무슨 선물이었는지 기억해 보세요.');
  } else {
    setText('#offer-route', '게임 종료');
    setText('#offer-claim', '최종 벌점을 확인하세요.');
  }
}

function renderControls(view) {
  const actor = activeActor();
  const humanTurn = actor === 0;
  const response = humanTurn && game.phase === 'awaitResponse';
  const claim = humanTurn && game.phase === 'awaitClaim';
  $('#response-controls').hidden = !response;
  $('#claim-form').hidden = !claim;
  if (response) {
    setText('#action-title', '이 선물을 받을까요?');
    setText('#action-help', `컴퓨터가 “${game.pendingOffer.claim}”이라고 말했습니다. 카드는 확인할 수 없습니다.`);
  } else if (claim) {
    setText('#action-title', '오래된 선물을 건네세요');
    setText('#action-help', '실제 카드가 무엇인지 보지 않고 기억한 이름 또는 허세 이름을 고릅니다.');
  } else if (game.phase === 'gameOver') {
    setText('#action-title', '게임이 끝났습니다');
    setText('#action-help', '가장 낮은 벌점을 받은 플레이어가 승리합니다.');
  } else {
    setText('#action-title', '컴퓨터가 생각 중입니다');
    setText('#action-help', `${view.players[actor].name}이(가) 규칙과 자기 기억에 따라 행동합니다.`);
  }
}

function renderLog(view) {
  const list = $('#game-log');
  list.replaceChildren(...view.log.slice(0, 16).map(message => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
}

function showReveal(card, giverName) {
  if (revealTimerId !== null) window.clearTimeout(revealTimerId);
  setText('#reveal-copy', `${giverName}이(가) 이 선물을 모두에게 보여 줍니다. 잠시 뒤 뒤집어 건넵니다.`);
  const cardElement = giftCard(card, false);
  cardElement.id = 'reveal-card';
  $('#reveal-card').replaceWith(cardElement);
  if (!revealDialog.open) revealDialog.showModal();
  const token = runToken;
  revealTimerId = window.setTimeout(() => {
    if (!game || token !== runToken) return;
    revealDialog.close();
    revealTimerId = null;
    render();
    scheduleComputer();
  }, 1800);
}

function showResult(view) {
  if (game.phase !== 'gameOver' || resultShown) return;
  resultShown = true;
  const humanWon = game.winnerIndexes.includes(0);
  const winners = game.winnerIndexes.map(index => view.players[index].name).join(', ');
  setText('#result-title', humanWon ? '승리했습니다!' : '게임 종료');
  setText('#result-copy', `승자: ${winners} · 가장 낮은 벌점이 승리합니다.`);
  const scores = $('#result-scores');
  scores.replaceChildren(...view.players.map(player => {
    const item = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = player.name;
    const score = document.createElement('b');
    score.textContent = `${player.penalties.length}점`;
    item.append(name, score);
    return item;
  }));
  resultDialog.showModal();
}

function render() {
  if (!game) return;
  const view = projectObservation(game, 0);
  setText('#turn-count', game.turn);
  setText('#difficulty-label', `${difficultyName(game.difficulty)} 컴퓨터 · 3인 기본 규칙`);
  const actor = activeActor();
  if (game.phase === 'awaitResponse') {
    setText('#phase-title', `${view.players[actor].name}의 선택`);
    setText('#phase-copy', '받거나, 선언이 틀렸다고 거절합니다.');
  } else if (game.phase === 'awaitClaim') {
    setText('#phase-title', `${view.players[actor].name}의 선물 전달`);
    setText('#phase-copy', '가장 오래된 선물의 이름을 말합니다.');
  } else {
    setText('#phase-title', '세 번째 벌점 · 게임 종료');
    setText('#phase-copy', '최저 벌점 플레이어가 승리합니다.');
  }
  renderTable(view);
  renderControls(view);
  renderLog(view);
  showResult(view);
}

function legalHumanMove(move) {
  return legalMoves(game, 0).some(candidate => JSON.stringify(candidate) === JSON.stringify(move));
}

function advanceMove(move, actor) {
  game = applyMove(game, move, actor);
  render();
  if (move.type === 'reject' && game.phase !== 'gameOver') {
    showReveal(game.pendingOffer.card, game.players[game.pendingOffer.giver].name);
    return;
  }
  scheduleComputer();
}

function performHuman(move) {
  if (!game || !legalHumanMove(move)) return;
  advanceMove(move, 0);
}

function scheduleComputer() {
  if (!game || game.phase === 'gameOver') return;
  const actor = activeActor();
  if (actor === null || game.players[actor].kind !== 'ai') return;
  const token = runToken;
  if (timerId !== null) window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    if (!game || token !== runToken) return;
    const move = chooseAiMove(projectObservation(game, actor));
    if (!move || !legalMoves(game, actor).some(candidate => JSON.stringify(candidate) === JSON.stringify(move))) return;
    advanceMove(move, actor);
  }, 650);
}

function startGame() {
  runToken += 1;
  if (timerId !== null) window.clearTimeout(timerId);
  if (revealTimerId !== null) window.clearTimeout(revealTimerId);
  timerId = null;
  revealTimerId = null;
  resultShown = false;
  game = createGame({ difficulty: selectedDifficulty() });
  if (revealDialog.open) revealDialog.close();
  if (resultDialog.open) resultDialog.close();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  showReveal(game.pendingOffer.card, game.players[game.pendingOffer.giver].name);
}

const select = $('#claim-select');
select.append(...GIFT_LABELS.map(label => {
  const option = document.createElement('option');
  option.value = label;
  option.textContent = label;
  return option;
}));
for (const input of document.querySelectorAll('input[name="difficulty"]')) {
  input.addEventListener('change', () => document.querySelectorAll('input[name="difficulty"]').forEach(candidate => {
    candidate.closest('label').classList.toggle('selected', candidate.checked);
  }));
}
$('#start-game').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#result-restart').addEventListener('click', startGame);
$('#accept-button').addEventListener('click', () => performHuman({ type: 'accept' }));
$('#reject-button').addEventListener('click', () => performHuman({ type: 'reject' }));
$('#claim-form').addEventListener('submit', event => {
  event.preventDefault();
  performHuman({ type: 'claim', label: select.value });
});
revealDialog.addEventListener('cancel', event => event.preventDefault());
resultDialog.addEventListener('cancel', event => event.preventDefault());
