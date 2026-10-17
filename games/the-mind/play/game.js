import { applyMove, chooseAiMove, createGame, legalMoves, viewForPlayer } from './engine.js?v=1.0.1';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');
let game = null;
let elapsedMs = 0;
let lastTick = 0;
let runToken = 0;
let timerId = null;
let resultShown = false;

const difficultyName = value => ({ easy: '쉬움', normal: '보통', hard: '어려움' }[value]);

function selectedDifficulty() {
  return document.querySelector('input[name="difficulty"]:checked').value;
}

function setText(selector, value) {
  $(selector).textContent = String(value);
}

function makeCard(card, { hidden = false, disabled = false } = {}) {
  const element = document.createElement(hidden ? 'div' : 'button');
  element.className = `number-card${hidden ? ' card-back' : ''}`;
  if (hidden) {
    element.setAttribute('aria-label', '컴퓨터의 비공개 카드');
    return element;
  }
  element.type = 'button';
  element.textContent = card.value;
  element.setAttribute('aria-label', `숫자 카드 ${card.value} 내기`);
  element.disabled = disabled;
  element.addEventListener('click', () => playHumanCard(card.id));
  return element;
}

function renderHands(view) {
  const humanHand = $('#human-hand');
  const playableCardId = legalMoves(game, 0).find(move => move.type === 'play')?.cardId;
  humanHand.replaceChildren(...view.players[0].hand.map(card => makeCard(card, {
    disabled: view.phase !== 'playing' || card.id !== playableCardId
  })));
  const computerHand = $('#computer-hand');
  computerHand.replaceChildren(...view.players[1].hand.map(card => makeCard(card, { hidden: true })));
  setText('#human-count', view.players[0].hand.length);
  setText('#computer-count', view.players[1].hand.length);
}

function renderPile(view) {
  const top = view.pile.at(-1);
  const pile = $('#play-pile');
  pile.textContent = top ? top.value : '—';
  pile.classList.toggle('empty-card', !top);
  setText('#pile-caption', top ? `현재 가장 큰 수 · ${top.value}` : '아직 낸 카드가 없습니다.');
  const history = $('#pile-history');
  const played = view.pile.map(card => ({ ...card, removed: false }));
  const removed = view.removed.map(card => ({ ...card, removed: true }));
  history.replaceChildren(...[...played, ...removed].sort((a, b) => a.value - b.value).map(card => {
    const chip = document.createElement('span');
    chip.className = `history-chip${card.removed ? ' removed' : ''}`;
    chip.textContent = card.value;
    chip.title = card.removed ? '건너뛰거나 수리검으로 제거한 카드' : '낸 카드';
    return chip;
  }));
}

function phaseMessage(view) {
  if (view.phase === 'focus') return ['집중할 준비를 하세요', '준비가 되면 컴퓨터와 함께 시작합니다.'];
  if (view.phase === 'paused') return ['잠시 멈췄습니다', '다시 준비되면 같은 레벨을 계속합니다.'];
  if (view.phase === 'playing') return ['숫자의 흐름을 느끼세요', '차례도 별도의 진행 표시도 없습니다.'];
  if (view.phase === 'levelComplete') {
    const reward = view.reward === 'star' ? ' · 수리검 1개 보상' : view.reward === 'life' ? ' · 생명 1개 보상' : '';
    return [`레벨 ${view.level} 성공${reward}`, '다음 레벨은 카드를 모두 다시 섞습니다.'];
  }
  return [view.result === 'won' ? '마음이 하나가 되었습니다' : '마지막 생명을 잃었습니다', '결과를 확인하세요.'];
}

function renderControls(view) {
  const focusButton = $('#focus-button');
  if (view.phase === 'focus') {
    focusButton.hidden = false;
    focusButton.disabled = false;
    focusButton.textContent = '집중 완료 · 레벨 시작';
  } else if (view.phase === 'paused') {
    focusButton.hidden = false;
    focusButton.disabled = false;
    focusButton.textContent = '집중 완료 · 계속하기';
  } else if (view.phase === 'playing') {
    focusButton.hidden = false;
    focusButton.disabled = false;
    focusButton.textContent = '잠시 멈춤 · 재집중';
  } else if (view.phase === 'levelComplete') {
    focusButton.hidden = false;
    focusButton.disabled = false;
    focusButton.textContent = '다음 레벨 준비';
  } else {
    focusButton.hidden = true;
  }
  const starMove = legalMoves(game, 0).some(move => move.type === 'proposeStar');
  const starButton = $('#throwing-star');
  starButton.disabled = !starMove;
  setText('#action-help', view.phase === 'playing'
    ? (starMove ? '수리검을 제안하면 컴퓨터가 동의하고 각자 최저 카드를 제거합니다.' : '사용할 수리검이 없습니다.')
    : '레벨을 시작하면 별도의 진행 표시는 나타나지 않습니다.');
}

function renderLog(view) {
  const list = $('#game-log');
  list.replaceChildren(...view.log.slice(0, 14).map(message => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
}

function showResult(view) {
  if (view.phase !== 'gameOver' || resultShown) return;
  resultShown = true;
  setText('#result-title', view.result === 'won' ? '팀 승리' : '게임 종료');
  setText('#result-copy', view.result === 'won'
    ? '컴퓨터 팀원과 12개 레벨을 모두 완수했습니다.'
    : `레벨 ${view.level}에서 마지막 생명을 잃었습니다.`);
  setText('#result-level', view.level);
  setText('#result-lives', view.lives);
  resultDialog.showModal();
}

function render() {
  if (!game) return;
  const view = viewForPlayer(game, 0);
  setText('#level-count', String(view.level).padStart(2, '0'));
  setText('#life-count', view.lives);
  setText('#star-count', view.stars);
  setText('#difficulty-label', `${difficultyName(view.difficulty)} 컴퓨터 · 2인 협력`);
  const [title, copy] = phaseMessage(view);
  setText('#phase-title', title);
  setText('#phase-copy', copy);
  renderHands(view);
  renderPile(view);
  renderControls(view);
  renderLog(view);
  showResult(view);
}

function playHumanCard(cardId) {
  if (!game || game.phase !== 'playing') return;
  const move = { type: 'play', cardId };
  if (!legalMoves(game, 0).some(candidate => candidate.type === 'play' && candidate.cardId === cardId)) return;
  game = applyMove(game, move, 0);
  render();
}

function handleFocus() {
  if (!game) return;
  if (game.phase === 'levelComplete') {
    game = applyMove(game, { type: 'nextLevel' }, 0);
    elapsedMs = 0;
    render();
    return;
  }
  if (game.phase === 'playing') {
    game = applyMove(game, { type: 'pause' }, 0);
    render();
    return;
  }
  if (game.phase === 'paused') {
    game = applyMove(game, { type: 'resume' }, 0);
    lastTick = performance.now();
    render();
    return;
  }
  if (game.phase !== 'focus') return;
  game = applyMove(game, { type: 'startLevel' }, 0);
  elapsedMs = 0;
  lastTick = performance.now();
  render();
}

function useThrowingStar() {
  if (!game || !legalMoves(game, 0).some(move => move.type === 'proposeStar')) return;
  game = applyMove(game, { type: 'proposeStar' }, 0);
  game = applyMove(game, { type: 'acceptStar' }, 1);
  render();
}

function runComputer(token) {
  if (!game || token !== runToken) return;
  const now = performance.now();
  if (!document.hidden && game.phase === 'playing') elapsedMs += Math.min(250, Math.max(0, now - lastTick));
  lastTick = now;
  if (game.phase === 'playing') {
    const aiView = viewForPlayer(game, 1);
    const move = chooseAiMove(aiView, elapsedMs);
    if (move) {
      game = applyMove(game, move, 1);
      render();
    }
  }
}

function startGame() {
  runToken += 1;
  const token = runToken;
  if (timerId !== null) window.clearInterval(timerId);
  resultShown = false;
  elapsedMs = 0;
  game = createGame({ difficulty: selectedDifficulty() });
  if (resultDialog.open) resultDialog.close();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  lastTick = performance.now();
  timerId = window.setInterval(() => runComputer(token), 60);
  render();
}

for (const input of document.querySelectorAll('input[name="difficulty"]')) {
  input.addEventListener('change', () => {
    document.querySelectorAll('input[name="difficulty"]').forEach(candidate => {
      candidate.closest('label').classList.toggle('selected', candidate.checked);
    });
  });
}


$('#start-game').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#result-restart').addEventListener('click', startGame);
$('#focus-button').addEventListener('click', handleFocus);
$('#throwing-star').addEventListener('click', useThrowingStar);
resultDialog.addEventListener('cancel', event => event.preventDefault());
