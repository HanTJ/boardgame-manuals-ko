import { applyMove, chooseAiMove, createGame, FRUIT_RULES, legalMoves, projectObservation } from './engine.js?v=1.0.0';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');
const FRUIT_NAMES = { acai: '아사이', avocado: '아보카도', banana: '바나나', carambola: '카람볼라', coconut: '코코넛', fig: '무화과', lime: '라임', lychee: '리치', orange: '오렌지', papaya: '파파야', pineapple: '파인애플', pomegranate: '석류', rambutan: '람부탄' };
const EFFECT_NAMES = { give: '과일 주기', steal: '과일 빼앗기', hide: '과일 보호' };
let game = null;
let runToken = 0;
let timerId = null;
let resultShown = false;

const setText = (selector, text) => { $(selector).textContent = String(text); };
const selectedDifficulty = () => document.querySelector('input[name="difficulty"]:checked').value;
const difficultyName = value => ({ easy: '쉬움', normal: '보통', hard: '어려움' }[value]);
const sameMove = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const scoreLabel = fruit => {
  const rule = FRUIT_RULES[fruit];
  return rule.scores
    ? `${rule.scores.join('·')}점`
    : `단독 최다 ${rule.majority[0]} · 그 외 ${rule.majority[1]}점/장`;
};

function cardElement(card, interactive = false) {
  const element = document.createElement(interactive ? 'button' : 'div');
  if (interactive) element.type = 'button';
  element.className = `card ${card.type}`;
  element.dataset.cardId = card.id;
  const title = document.createElement('b');
  const detail = document.createElement('small');
  if (card.type === 'fruit') {
    element.dataset.fruit = card.fruit;
    title.textContent = FRUIT_NAMES[card.fruit];
    detail.textContent = scoreLabel(card.fruit);
  } else if (card.type === 'joker') {
    title.textContent = '조커'; detail.textContent = '게임 종료 때 배정';
  } else {
    title.textContent = '투칸'; detail.textContent = EFFECT_NAMES[card.effect];
  }
  element.append(title, detail);
  return element;
}
function groupCards(cards) {
  const groups = [];
  const byKey = new Map();
  for (const card of cards) {
    const key = card.type === 'fruit' ? `fruit:${card.fruit}` : card.type === 'toucan' ? `toucan:${card.effect}` : card.type;
    if (!byKey.has(key)) {
      const group = [];
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).push(card);
  }
  return groups;
}
function cardStackElement(cards) {
  const stack = document.createElement('div');
  stack.className = 'card-stack';
  const count = document.createElement('span');
  count.className = 'card-count';
  count.textContent = `${cards.length}장`;
  const cardName = cards[0].type === 'fruit' ? FRUIT_NAMES[cards[0].fruit] : cards[0].type === 'joker' ? '조커' : `투칸 ${EFFECT_NAMES[cards[0].effect]}`;
  count.setAttribute('aria-label', `${cardName} ${cards.length}장`);
  const cardsElement = document.createElement('div');
  cardsElement.className = 'card-stack-cards';
  cardsElement.append(...cards.map(card => cardElement(card)));
  stack.append(count, cardsElement);
  return stack;
}
function cardBack() { const card = document.createElement('span'); card.className = 'card-back'; card.setAttribute('aria-label', '보호된 카드'); return card; }
function empty(text) { const item = document.createElement('span'); item.className = 'empty'; item.textContent = text; return item; }

function renderPlayer(view, index) {
  const player = view.players[index];
  const zone = $(`#player-${index}`);
  zone.classList.toggle('active', view.phase !== 'gameOver' && view.currentPlayer === index);
  const head = document.createElement('div'); head.className = 'player-head';
  const name = document.createElement('h2'); name.textContent = player.name;
  const summary = document.createElement('b'); summary.textContent = `공개 ${player.faceUp.length} · 보호 ${player.faceDown.length}`;
  head.append(name, summary);
  const openLabel = document.createElement('p'); openLabel.className = 'zone-label'; openLabel.textContent = '공개 과일';
  const open = document.createElement('div'); open.className = 'card-row'; open.append(...(player.faceUp.length ? groupCards(player.faceUp).map(cardStackElement) : [empty('공개 카드가 없습니다.') ]));
  const hiddenLabel = document.createElement('p'); hiddenLabel.className = 'zone-label'; hiddenLabel.textContent = `보호된 카드 · 내용 비공개 (${player.faceDown.length}장)`;
  const hidden = document.createElement('div'); hidden.className = 'card-row'; hidden.append(...(player.faceDown.length ? player.faceDown.map(cardBack) : [empty('보호된 카드가 없습니다.') ]));
  zone.replaceChildren(head, openLabel, open, hiddenLabel, hidden);
}

function renderColumns(view) {
  view.columns.forEach((cards, index) => {
    const column = $(`#column-${index}`);
    const legal = view.playerIndex === view.currentPlayer && view.phase === 'chooseColumn' && view.moves.some(move => move.type === 'chooseColumn' && move.columnIndex === index);
    column.disabled = !legal;
    column.querySelector('.column-cards').replaceChildren(...(cards.length ? cards.map(card => cardElement(card)) : [empty('빈 열')]));
  });
}

function actionLabel(move, view) {
  if (move.type === 'chooseToucan') return `${EFFECT_NAMES[view.pendingToucans.find(card => card.id === move.cardId).effect]} 먼저 해결`;
  if (move.type === 'giveTarget') return `${view.players[0].faceUp.find(card => card.id === move.cardId)?.type === 'joker' ? '조커' : FRUIT_NAMES[view.players[0].faceUp.find(card => card.id === move.cardId)?.fruit]} 주기`;
  if (move.type === 'stealTarget') return `${view.players[1].faceUp.find(card => card.id === move.cardId)?.type === 'joker' ? '조커' : FRUIT_NAMES[view.players[1].faceUp.find(card => card.id === move.cardId)?.fruit]} 빼앗기`;
  if (move.type === 'assignJoker') return `조커를 ${FRUIT_NAMES[move.fruit]}로 지정`;
  return '선택';
}
function renderActions(view) {
  const humanTurn = view.currentPlayer === 0 && view.phase !== 'gameOver';
  const moves = humanTurn ? legalMoves(game, 0) : [];
  const actionable = moves.filter(move => move.type !== 'chooseColumn');
  const controls = $('#action-controls');
  controls.replaceChildren(...actionable.map(move => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = actionLabel(move, view);
    button.addEventListener('click', () => performHuman(move)); return button;
  }));
  const titles = { chooseColumn: ['열을 고르세요', '선택한 열의 모든 카드를 가져옵니다.'], chooseToucan: ['투칸 순서를 고르세요', '효과 하나를 선택해 해결합니다.'], giveTarget: ['줄 카드를 고르세요', '내 공개 카드 1장을 컴퓨터에게 줍니다.'], stealTarget: ['빼앗을 카드를 고르세요', '컴퓨터의 공개 카드 1장을 가져옵니다.'], jokerAssignment: ['조커 과일을 고르세요', '완성되지 않은 과일 세트에 조커를 배정합니다.'] };
  const copy = humanTurn ? titles[view.phase] : ['컴퓨터가 생각 중입니다', '컴퓨터는 공개 정보만 사용합니다.'];
  if (copy) { setText('#action-title', copy[0]); setText('#action-help', copy[1]); }
}
function renderLog(view) {
  $('#game-log').replaceChildren(...view.log.slice(0, 20).map(message => { const item = document.createElement('li'); item.textContent = message; return item; }));
}
function showResult(view) {
  if (view.phase !== 'gameOver' || resultShown) return;
  resultShown = true;
  const totals = view.scores.players.map(player => player.total);
  setText('#result-title', view.winnerIndex === null ? '무승부' : view.winnerIndex === 0 ? '승리했습니다!' : '컴퓨터 승리');
  setText('#result-copy', `최종 점수 ${totals[0]} : ${totals[1]}${view.winnerIndex === null ? ' · 공동 승리/동점' : ''}`);
  $('#score-breakdown').replaceChildren(...view.scores.players.map((score, index) => {
    const section = document.createElement('section'); const title = document.createElement('h3'); title.textContent = view.players[index].name;
    const total = document.createElement('b'); total.textContent = `총 ${score.total}점`;
    const list = document.createElement('ul');
    for (const [fruit, points] of Object.entries(score.byFruit)) if (score.counts[fruit]) { const item = document.createElement('li'); item.textContent = `${FRUIT_NAMES[fruit]} ${score.counts[fruit]}장 · ${points}점`; list.append(item); }
    section.append(title, total, list); return section;
  }));
  if (!resultDialog.open) resultDialog.showModal();
}
function render() {
  if (!game) return;
  const view = projectObservation(game, 0);
  setText('#turn-count', `${Math.min(24, view.turn)} / 24`); setText('#draw-count', view.drawPile.length); setText('#difficulty-label', `${difficultyName(view.difficulty)} 컴퓨터`);
  const phaseNames = { chooseColumn: `${view.players[view.currentPlayer].name}의 열 선택`, chooseToucan: '투칸 효과 순서', giveTarget: '과일 주기', stealTarget: '과일 빼앗기', jokerAssignment: '조커 지정', gameOver: '게임 종료' };
  setText('#phase-title', phaseNames[view.phase]);
  renderPlayer(view, 0); renderPlayer(view, 1); renderColumns(view); renderActions(view); renderLog(view); showResult(view);
}
function performHuman(move) {
  if (!game || !legalMoves(game, 0).some(candidate => sameMove(candidate, move))) return;
  game = applyMove(game, move, 0); render(); scheduleComputer();
}
function scheduleComputer() {
  if (!game || game.phase === 'gameOver' || game.currentPlayer !== 1) return;
  const actor = game.currentPlayer; const token = runToken;
  if (timerId !== null) window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    timerId = null;
    if (!game || token !== runToken || game.phase === 'gameOver' || game.currentPlayer !== actor) return;
    const move = chooseAiMove(projectObservation(game, actor));
    if (!move || !legalMoves(game, actor).some(candidate => sameMove(candidate, move))) return;
    game = applyMove(game, move, actor); render(); scheduleComputer();
  }, 550);
}
function startGame() {
  runToken += 1;
  if (timerId !== null) window.clearTimeout(timerId);
  timerId = null; resultShown = false; game = createGame({ difficulty: selectedDifficulty() });
  if (resultDialog.open) resultDialog.close(); startScreen.hidden = true; gameScreen.hidden = false; render(); scheduleComputer();
}
for (const input of document.querySelectorAll('input[name="difficulty"]')) input.addEventListener('change', () => document.querySelectorAll('input[name="difficulty"]').forEach(candidate => candidate.closest('label').classList.toggle('selected', candidate.checked)));
for (let index = 0; index < 3; index += 1) $(`#column-${index}`).addEventListener('click', () => performHuman({ type: 'chooseColumn', columnIndex: index }));
$('#start-game').addEventListener('click', startGame); $('#restart-button').addEventListener('click', startGame); $('#result-restart').addEventListener('click', startGame);
resultDialog.addEventListener('cancel', event => event.preventDefault());
