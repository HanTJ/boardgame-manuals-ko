import {
  applyMove, chooseAiMove, createGame, legalMoves, projectObservation
} from './engine.js?v=1.0.0';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');
let game = null;
let selectedIds = [];
let runToken = 0;
let timerId = null;
let resultShown = false;

const difficultyName = value => ({ easy: '쉬움', normal: '보통', hard: '어려움' }[value]);
const selectedDifficulty = () => document.querySelector('input[name="difficulty"]:checked').value;
const setText = (selector, value) => { $(selector).textContent = String(value); };

function faceCard(card, { button = false, selected = false } = {}) {
  const element = document.createElement(button ? 'button' : 'div');
  if (button) element.type = 'button';
  element.className = `face-card ${card.type}`;
  element.classList.toggle('selected', selected);
  const icon = document.createElement('span');
  icon.className = 'icon';
  icon.textContent = card.type === 'good' ? '☺' : '☹';
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = card.type === 'good' ? '좋은 얼굴' : '나쁜 얼굴';
  element.append(icon, label);
  element.setAttribute('aria-label', label.textContent);
  return element;
}

function cardBack(label = '비밀 카드') {
  const element = document.createElement('div');
  element.className = 'card-back';
  element.setAttribute('aria-label', label);
  return element;
}

function renderPlayer(view, index) {
  const player = view.players[index];
  const zone = $(`#player-${index}`);
  zone.classList.toggle('active', game.phase !== 'gameOver' && game.currentPlayer === index);

  const heading = document.createElement('div');
  heading.className = 'player-heading';
  const identity = document.createElement('div');
  const role = document.createElement('span');
  role.textContent = player.kind === 'human' ? 'PLAYER' : 'COMPUTER';
  const name = document.createElement('h2');
  name.textContent = player.name;
  identity.append(role, name);
  const count = document.createElement('p');
  count.className = 'hand-count';
  count.append('손패 ', Object.assign(document.createElement('b'), { textContent: player.hand.length }), '장');
  heading.append(identity, count);

  const partyLabel = document.createElement('p');
  partyLabel.className = 'party-label';
  const goodCount = player.party.filter(card => card.type === 'good').length;
  partyLabel.textContent = `공개 파티 · 좋은 얼굴 ${goodCount} / 4`;
  const party = document.createElement('div');
  party.className = 'card-row party-row';
  if (player.party.length) {
    party.append(...player.party.map(card => faceCard(card)));
  } else {
    const empty = document.createElement('span');
    empty.className = 'empty-party';
    empty.textContent = '아직 파티 카드가 없습니다.';
    party.append(empty);
  }
  const children = [heading, partyLabel, party];
  if (index === 0) {
    const handLabel = document.createElement('p');
    handLabel.className = 'party-label';
    handLabel.textContent = '내 손패 · 언제든 확인 가능';
    const ownHand = document.createElement('div');
    ownHand.className = 'card-row own-hand-row';
    if (player.hand.length) {
      ownHand.append(...player.hand.map(card => faceCard(card)));
    } else {
      const empty = document.createElement('span');
      empty.className = 'empty-party';
      empty.textContent = '손패가 없습니다.';
      ownHand.append(empty);
    }
    children.push(handLabel, ownHand);
  }
  zone.replaceChildren(...children);
}

function renderTable(view) {
  view.players.forEach((_, index) => renderPlayer(view, index));
  setText('#stack-count', view.stack.length);
  const stack = $('#table-stack');
  const visible = view.knownStack;
  stack.replaceChildren(...(visible
    ? visible.map(card => faceCard(card))
    : view.stack.map((_, index) => cardBack(`비밀 스택 ${index + 1}번째 카드`))));
  if (!view.stack.length) {
    const empty = document.createElement('span');
    empty.className = 'empty-party';
    empty.textContent = '스택을 준비하고 있습니다.';
    stack.append(empty);
  }
}

function moveSelection(id) {
  const index = selectedIds.indexOf(id);
  if (index >= 0) selectedIds.splice(index, 1);
  else selectedIds.push(id);
  render();
}

function moveOrder(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= selectedIds.length) return;
  [selectedIds[index], selectedIds[target]] = [selectedIds[target], selectedIds[index]];
  render();
}

function renderBuildControls(view, humanTurn) {
  const building = humanTurn && game.phase === 'buildStack';
  $('#build-controls').hidden = !building;
  if (!building) return;
  const ownHand = view.players[0].hand;
  const available = new Set(ownHand.map(card => card.id));
  selectedIds = selectedIds.filter(id => available.has(id));
  const hand = $('#hand-cards');
  hand.replaceChildren(...ownHand.map(card => {
    const element = faceCard(card, { button: true, selected: selectedIds.includes(card.id) });
    element.addEventListener('click', () => moveSelection(card.id));
    return element;
  }));

  const byId = new Map(ownHand.map(card => [card.id, card]));
  const order = $('#stack-order');
  order.replaceChildren(...selectedIds.map((id, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    const card = byId.get(id);
    label.textContent = `${index + 1}. ${card.type === 'good' ? '좋은 얼굴' : '나쁜 얼굴'}`;
    const up = document.createElement('button');
    up.type = 'button';
    up.textContent = '↑';
    up.setAttribute('aria-label', '한 칸 위로');
    up.disabled = index === 0;
    up.addEventListener('click', () => moveOrder(index, -1));
    const down = document.createElement('button');
    down.type = 'button';
    down.textContent = '↓';
    down.setAttribute('aria-label', '한 칸 아래로');
    down.disabled = index === selectedIds.length - 1;
    down.addEventListener('click', () => moveOrder(index, 1));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '스택에서 빼기');
    remove.addEventListener('click', () => moveSelection(id));
    item.append(label, up, down, remove);
    return item;
  }));
  $('#build-stack').disabled = selectedIds.length === 0;
}

function renderControls(view) {
  const humanTurn = game.currentPlayer === 0 && game.phase !== 'gameOver';
  const moves = humanTurn ? legalMoves(game, 0) : [];
  const moveTypes = new Set(moves.map(move => move.type));
  renderBuildControls(view, humanTurn);
  const deciding = humanTurn && game.phase === 'decide';
  $('#decision-controls').hidden = !deciding;
  $('#flip-card').hidden = !moveTypes.has('flip');
  $('#pass-stack').hidden = !moveTypes.has('pass');
  $('#take-back').hidden = !moveTypes.has('takeBack');

  if (!humanTurn) {
    setText('#action-title', game.phase === 'gameOver' ? '게임이 끝났습니다' : '컴퓨터가 생각 중입니다');
    setText('#action-help', game.phase === 'gameOver' ? '최종 파티를 확인하세요.' : `${view.players[game.currentPlayer].name}이(가) 공개 정보와 자기 정보만으로 행동합니다.`);
  } else if (game.phase === 'buildStack') {
    setText('#action-title', '카드를 골라 스택을 만드세요');
    setText('#action-help', '선택한 순서가 맨 위부터 표시됩니다. 화살표로 순서를 바꿀 수 있습니다.');
  } else if (game.ownerReturned) {
    setText('#action-title', game.ownerMayTakeBack ? '더 뒤집거나 회수하세요' : '돌아온 스택에서 반드시 뒤집으세요');
    setText('#action-help', game.ownerMayTakeBack ? '좋은 얼굴 뒤에는 계속 도전하거나 남은 카드를 회수할 수 있습니다.' : '스택 주인은 첫 카드를 피할 수 없습니다.');
  } else {
    setText('#action-title', '뒤집을까요, 넘길까요?');
    setText('#action-help', '스택 내용은 볼 수 없습니다. 맨 위 카드를 공개하거나 그대로 넘기세요.');
  }
}

function renderLog(view) {
  $('#game-log').replaceChildren(...view.log.slice(0, 18).map(message => {
    const item = document.createElement('li');
    item.textContent = message;
    return item;
  }));
}

function showResult(view) {
  if (game.phase !== 'gameOver' || resultShown) return;
  resultShown = true;
  const winner = view.players[game.winnerIndex];
  setText('#result-title', game.winnerIndex === 0 ? '승리했습니다!' : `${winner.name} 승리`);
  setText('#result-copy', `${winner.name}이(가) 좋은 얼굴 4장을 먼저 모았습니다.`);
  $('#result-parties').replaceChildren(...view.players.map(player => {
    const item = document.createElement('div');
    const name = document.createElement('span');
    name.textContent = player.name;
    const score = document.createElement('b');
    score.textContent = `좋은 얼굴 ${player.party.filter(card => card.type === 'good').length}장`;
    item.append(name, score);
    return item;
  }));
  if (!resultDialog.open) resultDialog.showModal();
}

function render() {
  if (!game) return;
  const view = projectObservation(game, 0);
  setText('#turn-count', game.turn);
  setText('#difficulty-label', `${difficultyName(game.difficulty)} 컴퓨터 · 3인 기본 규칙`);
  if (game.phase === 'buildStack') {
    setText('#phase-title', `${view.players[game.stackOwner].name}의 스택 만들기`);
    setText('#phase-copy', '손패에서 1장 이상을 골라 비밀 스택을 만듭니다.');
  } else if (game.phase === 'decide') {
    setText('#phase-title', `${view.players[game.currentPlayer].name}의 선택`);
    setText('#phase-copy', game.ownerReturned ? '돌아온 스택을 처리합니다.' : '뒤집거나 왼쪽으로 넘깁니다.');
  } else {
    setText('#phase-title', '좋은 얼굴 4장 · 게임 종료');
    setText('#phase-copy', `${view.players[game.winnerIndex].name} 승리`);
  }
  renderTable(view);
  renderControls(view);
  renderLog(view);
  showResult(view);
}

function legalHumanMove(move) {
  const moves = legalMoves(game, 0);
  if (move.type === 'buildStack') return moves.some(candidate => candidate.type === 'buildStack') && move.cardIds.length > 0;
  return moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(move));
}

function advanceMove(move, actor) {
  game = applyMove(game, move, actor);
  if (actor === 0) selectedIds = [];
  render();
  scheduleComputer();
}

function performHuman(move) {
  if (!game || !legalHumanMove(move)) return;
  advanceMove(move, 0);
}

function scheduleComputer() {
  if (!game || game.phase === 'gameOver') return;
  const actor = game.currentPlayer;
  if (game.players[actor].kind !== 'ai') return;
  const token = runToken;
  if (timerId !== null) window.clearTimeout(timerId);
  timerId = window.setTimeout(() => {
    timerId = null;
    if (!game || token !== runToken || game.phase === 'gameOver') return;
    const move = chooseAiMove(projectObservation(game, actor));
    if (!move || !legalMoves(game, actor).some(candidate => JSON.stringify(candidate) === JSON.stringify(move))) return;
    advanceMove(move, actor);
  }, 650);
}

function startGame() {
  runToken += 1;
  if (timerId !== null) window.clearTimeout(timerId);
  timerId = null;
  selectedIds = [];
  resultShown = false;
  game = createGame({ difficulty: selectedDifficulty() });
  if (resultDialog.open) resultDialog.close();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  scheduleComputer();
}

for (const input of document.querySelectorAll('input[name="difficulty"]')) {
  input.addEventListener('change', () => document.querySelectorAll('input[name="difficulty"]').forEach(candidate => {
    candidate.closest('label').classList.toggle('selected', candidate.checked);
  }));
}
$('#start-game').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#result-restart').addEventListener('click', startGame);
$('#build-stack').addEventListener('click', () => performHuman({ type: 'buildStack', cardIds: [...selectedIds] }));
$('#flip-card').addEventListener('click', () => performHuman({ type: 'flip' }));
$('#pass-stack').addEventListener('click', () => performHuman({ type: 'pass' }));
$('#take-back').addEventListener('click', () => performHuman({ type: 'takeBack' }));
resultDialog.addEventListener('cancel', event => event.preventDefault());
