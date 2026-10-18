import {
  activeValue,
  applyMove,
  chooseAiMove,
  createGame,
  legalMoves,
  projectObservation,
  startNextRound
} from './engine.js';

const $ = selector => document.querySelector(selector);
const difficultyNames = { easy: '쉬움', normal: '보통', hard: '어려움' };
let game = null;
let selected = new Set();
let timerGeneration = 0;

const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');

function makeCard(card, selectable = false) {
  const element = document.createElement(selectable ? 'button' : 'div');
  if (selectable) element.type = 'button';
  const value = activeValue(card);
  element.className = `number-card card-${value}`;
  element.dataset.cardId = card.id;
  element.setAttribute('aria-label', `활성값 ${value}, 회전하면 ${card.rotated ? card.value0 : card.value1}${card.starred ? ', 시작 카드' : ''}`);

  const active = document.createElement('span');
  active.className = 'card-active';
  active.textContent = String(value);
  const inactive = document.createElement('span');
  inactive.className = 'card-inactive';
  inactive.textContent = String(card.rotated ? card.value0 : card.value1);
  const chain = document.createElement('span');
  chain.className = 'card-chain';
  chain.setAttribute('aria-hidden', 'true');
  element.append(active, inactive, chain);
  if (card.starred) {
    const star = document.createElement('span');
    star.className = 'card-star';
    star.textContent = '★';
    element.append(star);
  }
  if (selectable) {
    element.classList.toggle('selected', selected.has(card.id));
    element.setAttribute('aria-pressed', String(selected.has(card.id)));
    element.addEventListener('click', () => {
      if (!game || game.phase !== 'round' || game.activePlayer !== 0) return;
      selected.has(card.id) ? selected.delete(card.id) : selected.add(card.id);
      render();
    });
  }
  return element;
}

function renderArea(player, area) {
  const root = $(`#${player === 0 ? 'human' : 'computer'}-area-${area + 1}`);
  const cards = root.querySelector('.area-cards');
  cards.replaceChildren();
  const played = game.areas[player][area];
  if (played) {
    for (const card of played.cards) cards.append(makeCard(card));
  } else {
    const empty = document.createElement('span');
    empty.className = 'area-empty';
    empty.textContent = '빈 구역';
    cards.append(empty);
  }
  root.classList.toggle('active', game.phase === 'round' && game.activePlayer === player && game.activeArea === area);
  const take = root.querySelector('.take-button');
  if (take) {
    const move = legalMoves(game).find(item => item.type === 'takeSet' && item.targetPlayer === player && item.targetArea === area);
    take.hidden = !(game.activePlayer === 0 && move);
    take.setAttribute('aria-label', `컴퓨터 구역 ${area + 1} 세트 가져오기`);
    take.onclick = move ? () => commit(move) : null;
  }
}

function renderHands() {
  const humanHand = $('#human-hand');
  humanHand.replaceChildren(...game.players[0].hand.map(card => makeCard(card, game.phase === 'round' && game.activePlayer === 0)));
  $('#human-hand-count').textContent = String(game.players[0].hand.length);
  $('#computer-hand-count').textContent = String(game.players[1].hand.length);
  const hidden = $('#computer-hand');
  hidden.replaceChildren();
  for (let index = 0; index < game.players[1].hand.length; index += 1) {
    const back = document.createElement('span');
    back.className = 'mini-back';
    back.setAttribute('aria-hidden', 'true');
    hidden.append(back);
  }
}

function sameIds(left, right) {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function renderActions() {
  const humanTurn = game.phase === 'round' && game.activePlayer === 0;
  const moves = humanTurn ? legalMoves(game) : [];
  const play = moves.find(move => move.type === 'playSet' && sameIds(move.cardIds, selected));
  const playButton = $('#play-set');
  playButton.disabled = !play;
  playButton.onclick = play ? () => commit(play) : null;

  const adds = $('#add-actions');
  adds.replaceChildren();
  if (selected.size === 1) {
    const [cardId] = selected;
    for (const move of moves.filter(item => item.type === 'addCard' && item.cardId === cardId)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `B · 컴퓨터 구역 ${move.targetArea + 1}에 추가`;
      button.addEventListener('click', () => commit(move));
      adds.append(button);
    }
  }

  const rotate = moves.find(move => move.type === 'rotateHand');
  $('#rotate-hand').disabled = !rotate;
  $('#rotate-hand').onclick = rotate ? () => commit(rotate) : null;

  const help = $('#selection-help');
  if (!humanTurn) help.textContent = game.phase === 'round' ? '컴퓨터가 공개 정보만 이용해 행동을 고르는 중입니다.' : '라운드 결과를 확인하세요.';
  else if (!selected.size) help.textContent = '같은 활성값의 카드를 선택해 A 세트를 만들거나, 상대 세트 아래의 C 버튼을 누르세요.';
  else if (play) help.textContent = `선택한 ${selected.size}장으로 합법적인 세트를 낼 수 있습니다.`;
  else help.textContent = '이 조합은 세트로 낼 수 없습니다. 활성값과 같은 크기 세트의 값을 확인하세요.';
}

function renderLog() {
  const log = $('#game-log');
  log.replaceChildren();
  for (const entry of game.log.slice(0, 20)) {
    const item = document.createElement('li');
    item.textContent = entry;
    log.append(item);
  }
}

function renderStatus() {
  $('#round-number').textContent = String(game.round);
  $('#human-wins').textContent = String(game.players[0].roundWins);
  $('#computer-wins').textContent = String(game.players[1].roundWins);
  $('#difficulty-label').textContent = `${difficultyNames[game.difficulty]} 난이도`;
  $('#discard-count').textContent = `버림 ${game.discard.length}장`;
  if (game.phase === 'round') {
    $('#turn-label').textContent = game.activePlayer === 0 ? '당신 차례' : '컴퓨터 차례';
    $('#area-label').textContent = `플레이 구역 ${game.activeArea + 1} · 행동 전 이 구역의 기존 세트는 버립니다`;
  } else {
    $('#turn-label').textContent = game.phase === 'matchOver' ? '게임 종료' : '라운드 종료';
    $('#area-label').textContent = '결과를 확인하세요';
  }
}

function render() {
  if (!game) return;
  selected = new Set([...selected].filter(id => game.players[0].hand.some(card => card.id === id)));
  renderStatus();
  renderHands();
  for (let player = 0; player < 2; player += 1) for (let area = 0; area < 2; area += 1) renderArea(player, area);
  renderActions();
  renderLog();
}

function showResult() {
  const winner = game.roundWinner === 0 ? '당신' : '컴퓨터';
  const match = game.phase === 'matchOver';
  $('#result-kicker').textContent = match ? 'MATCH COMPLETE' : 'ROUND COMPLETE';
  $('#result-title').textContent = match ? `${winner} 승리` : `${winner}의 라운드 승리`;
  $('#result-copy').textContent = match
    ? `${winner}이(가) 먼저 2라운드를 이겼습니다.`
    : `${winner}이(가) 손의 카드를 모두 없앴습니다. 다음 라운드는 다시 ★ 카드 보유자가 시작합니다.`;
  $('#dialog-human-wins').textContent = String(game.players[0].roundWins);
  $('#dialog-computer-wins').textContent = String(game.players[1].roundWins);
  $('#next-round').hidden = match;
  $('#result-restart').hidden = !match;
  if (!resultDialog.open) resultDialog.showModal();
}

function commit(move) {
  if (!game || game.phase !== 'round') return;
  timerGeneration += 1;
  game = applyMove(game, move);
  selected.clear();
  render();
  if (game.phase !== 'round') {
    showResult();
    return;
  }
  scheduleComputer();
}

function scheduleComputer() {
  if (!game || game.phase !== 'round' || game.activePlayer !== 1) return;
  const generation = ++timerGeneration;
  window.setTimeout(() => {
    if (generation !== timerGeneration || !game || game.phase !== 'round' || game.activePlayer !== 1) return;
    const observation = projectObservation(game, 1);
    const move = chooseAiMove(observation, game.difficulty, Math.random);
    if (move) commit(move);
  }, 650);
}

function beginGame() {
  timerGeneration += 1;
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
  game = createGame({ difficulty });
  selected.clear();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  if (resultDialog.open) resultDialog.close();
  render();
  scheduleComputer();
}

for (const choice of document.querySelectorAll('.choice input')) {
  choice.addEventListener('change', () => {
    document.querySelectorAll('.choice').forEach(label => label.classList.toggle('selected', label.contains(document.querySelector('input[name="difficulty"]:checked'))));
  });
}

$('#start-game').addEventListener('click', beginGame);
$('#restart-button').addEventListener('click', () => {
  timerGeneration += 1;
  gameScreen.hidden = true;
  startScreen.hidden = false;
  game = null;
  selected.clear();
});
$('#result-restart').addEventListener('click', beginGame);
resultDialog.addEventListener('cancel', event => event.preventDefault());
$('#next-round').addEventListener('click', () => {
  timerGeneration += 1;
  game = startNextRound(game);
  selected.clear();
  resultDialog.close();
  render();
  scheduleComputer();
});
