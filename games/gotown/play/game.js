import { applyMove, chooseAiMove, createGame, legalMoves, viewForPlayer } from './engine.js';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');
let game = null;
let aiBusy = false;
let runToken = 0;
let activity = [];
let resultShown = false;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const typeName = type => ({
  floor: '층', joker: '조커', dog: '경비견', bone: '뼈다귀', jackhammer: '착암기',
  wreckingBall: '철거용 쇠공', milkshake: '밀크셰이크', donutTruck: '도넛 푸드트럭',
  thief: '도둑', superThief: '슈퍼 도둑'
}[type] ?? type);
const difficultyName = value => ({ easy: '쉬움', normal: '보통', hard: '어려움' }[value]);

function selectedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function addLog(message) {
  activity.unshift(message);
  activity = activity.slice(0, 14);
}

function cardMarkup(item, hidden = false) {
  if (hidden) return '<div class="card card-back" aria-label="비공개 카드">G</div>';
  const special = item.type !== 'floor';
  const value = item.type === 'floor' ? `<strong>${item.value}</strong>` : item.type === 'joker' ? '<strong>?</strong>' : '';
  return `<div class="card ${special ? `special-card type-${item.type}` : ''}" aria-label="${item.type === 'floor' ? `층 카드 ${item.value}` : typeName(item.type)}">${value}<small>${typeName(item.type)}</small></div>`;
}

function floorMarkup(floor, index) {
  const cards = floor.cards.map(slot => {
    const joker = slot.card.type === 'joker';
    return `<div class="floor-card"><b>${joker ? '?' : slot.card.value}</b><small>${joker ? `조커 = ${slot.effectiveValue}` : `값 ${slot.effectiveValue}`}</small></div>`;
  }).join('');
  return `<div class="floor" aria-label="${index + 1}층, 합계 9">${cards}${floor.dog ? '<div class="guard">경비견<br>보호</div>' : '<span></span>'}</div>`;
}

function renderPlayer(view, index) {
  const player = view.players[index];
  const prefix = index === 0 ? 'human' : 'computer';
  $(`#${prefix}-floor-count`).textContent = player.floors.length;
  $(`#${prefix}-tower`).innerHTML = player.floors.length
    ? player.floors.map(floorMarkup).join('')
    : '<p class="empty-tower">아직 완성된 층이 없습니다.</p>';
  $(`#${prefix}-hand`).innerHTML = player.hand.map(item => cardMarkup(item, index === 1)).join('');
}

function discardMarkup(card) {
  if (!card) return '—';
  if (card.type === 'floor') return `<strong>${card.value}</strong><small>층</small>`;
  if (card.type === 'joker') return '<strong>?</strong><small>조커</small>';
  return `<small>${typeName(card.type)}</small>`;
}

function describeMove(move, before, actor) {
  const who = actor === 0 ? '당신이' : '컴퓨터가';
  const hand = before.players[actor].hand;
  if (move.type === 'build') {
    const labels = move.cards.map(index => hand[index].type === 'joker' ? '조커' : hand[index].value).join(' + ');
    return `${who} ${labels}로 새 층을 완성했습니다.`;
  }
  if (move.type === 'stealFloor') return `${who} 상대 꼭대기 층의 카드 한 장을 훔쳐 새 층을 완성했습니다.`;
  if (move.type === 'guard') return `${who} ${move.floor + 1}층에 경비견을 놓았습니다.`;
  if (move.type === 'bone') return `${who} 뼈다귀로 상대 ${move.floor + 1}층의 경비견을 제거했습니다.`;
  if (move.type === 'destroy') return `${who} ${typeName(hand[move.card].type)}으로 상대 꼭대기 층을 파괴했습니다.`;
  if (move.type === 'thief') return `${who} ${typeName(hand[move.card].type)}으로 상대 손에서 카드 한 장을 가져왔습니다.`;
  if (move.type === 'milkshake') return `${who} 상대에게 밀크셰이크를 건넸습니다.`;
  if (move.type === 'donutTruck') return `${who} 도넛 푸드트럭을 내고 다음 차례도 예약했습니다.`;
  return `${who} 차례를 마쳤습니다.`;
}

function moveLabel(move, view) {
  const hand = view.players[0].hand;
  if (move.type === 'build') {
    const labels = move.cards.map(index => hand[index].type === 'joker' ? '?' : hand[index].value);
    return [`${labels.join(' + ')}로 층 건설`, '합계 9 · 내 빌딩에 추가'];
  }
  if (move.type === 'stealFloor') {
    const stolen = view.players[1].floors.at(-1).cards[move.stolen];
    return [`${hand[move.card].value} + ${stolen.card.type === 'joker' ? `조커(${stolen.effectiveValue})` : stolen.effectiveValue} 훔치기`, '상대 꼭대기 층 제거 · 내 층 완성'];
  }
  if (move.type === 'guard') return [`${move.floor + 1}층에 경비견`, '훔치기와 착암기로부터 보호'];
  if (move.type === 'bone') return [`상대 ${move.floor + 1}층 경비견 제거`, '뼈다귀와 경비견 모두 버리기'];
  if (move.type === 'destroy') return [`${typeName(hand[move.card].type)} 사용`, '상대 꼭대기 층 파괴'];
  if (move.type === 'thief') return [`${typeName(hand[move.card].type)} 사용`, '컴퓨터 손에서 무작위 한 장 훔치기'];
  if (move.type === 'milkshake') return ['밀크셰이크 건네기', '컴퓨터의 다음 차례 건너뛰기'];
  if (move.type === 'donutTruck') return ['도넛 푸드트럭', '현재 차례 뒤 내가 한 번 더'];
  return ['차례 마치기', '손이 3장 미만이면 보충'];
}

function renderActions(view) {
  const container = $('#legal-actions');
  if (view.phase === 'gameOver') {
    container.innerHTML = '';
    return;
  }
  if (view.current !== 0 || aiBusy) {
    container.innerHTML = '<button class="action-button" type="button" disabled><b>컴퓨터가 생각 중입니다</b><span>공개 정보와 자기 손 카드만 사용합니다.</span></button>';
    return;
  }
  const moves = legalMoves(game);
  container.innerHTML = moves.map((move, index) => {
    const [title, copy] = moveLabel(move, view);
    return `<button class="action-button ${move.type === 'endTurn' ? 'end-action' : ''}" type="button" data-move="${index}"><b>${title}</b><span>${copy}</span></button>`;
  }).join('');
  container.querySelectorAll('[data-move]').forEach(button => {
    button.addEventListener('click', () => humanMove(moves[Number(button.dataset.move)]));
  });
}

function showResult(view) {
  if (view.phase !== 'gameOver' || resultShown) return;
  resultShown = true;
  if (view.result === 'stalemate') {
    $('#result-title').textContent = '진행 불가 · 무승부';
    $('#result-copy').textContent = '두 플레이어 모두 손이 8장이고 낼 수 있는 카드가 없어 더 진행할 수 없습니다.';
  } else {
    $('#result-title').textContent = view.winner === 0 ? '당신의 승리' : '컴퓨터의 승리';
    const winner = view.winner === 0 ? '당신이' : '컴퓨터가';
    $('#result-copy').textContent = `${winner} ${view.targetFloors}층 빌딩을 먼저 완성했습니다.`;
  }
  $('#result-towers').innerHTML = `<div><span>당신의 빌딩</span><b>${view.players[0].floors.length}층</b></div><div><span>컴퓨터 빌딩</span><b>${view.players[1].floors.length}층</b></div>`;
  resultDialog.showModal();
}

function render() {
  if (!game) return;
  const view = viewForPlayer(game, 0);
  $('#turn-number').textContent = String(view.turn).padStart(2, '0');
  $('#turn-label').textContent = view.phase === 'gameOver' ? '게임 종료' : view.current === 0 ? '당신 차례' : '컴퓨터 차례';
  $('#phase-label').textContent = view.phase === 'gameOver' ? '결과를 확인하세요' : view.current === 0 ? '원하는 만큼 행동한 뒤 차례를 마치세요' : '규칙에 맞는 행동을 계산하고 있습니다';
  $('#deck-count').textContent = `${view.deckCount}장`;
  $('#discard-card').innerHTML = discardMarkup(view.discardTop);
  document.querySelectorAll('.target-count').forEach(node => { node.textContent = view.targetFloors; });
  renderPlayer(view, 0);
  renderPlayer(view, 1);
  renderActions(view);
  $('#action-help').textContent = view.players[0].milkshakeCount ? '밀크셰이크가 놓여 있어 다음 차례를 건너뜁니다.' : '행동은 원하는 순서로 원하는 만큼 수행할 수 있습니다.';
  $('#game-log').innerHTML = activity.map(entry => `<li>${entry}</li>`).join('');
  showResult(view);
}

function humanMove(move) {
  if (!game || game.current !== 0 || aiBusy || game.phase !== 'action') return;
  const before = viewForPlayer(game, 0);
  addLog(describeMove(move, before, 0));
  game = applyMove(game, move);
  render();
  runComputer();
}

async function runComputer() {
  if (!game || aiBusy || game.current !== 1 || game.phase !== 'action') return;
  aiBusy = true;
  const token = runToken;
  render();
  while (game && token === runToken && game.current === 1 && game.phase === 'action') {
    await wait(460);
    if (token !== runToken) break;
    const before = viewForPlayer(game, 1);
    const move = chooseAiMove(game, game.difficulty, 1);
    addLog(describeMove(move, before, 1));
    game = applyMove(game, move);
    render();
  }
  aiBusy = false;
  render();
}

function startGame() {
  runToken += 1;
  aiBusy = false;
  activity = [];
  resultShown = false;
  const difficulty = selectedValue('difficulty');
  const targetFloors = Number(selectedValue('target'));
  game = createGame({ difficulty, targetFloors, firstPlayer: Math.random() < .5 ? 0 : 1 });
  $('#difficulty-label').textContent = `${difficultyName(difficulty)} 난이도 · ${targetFloors}층 승리`;
  addLog(`${difficultyName(difficulty)} 컴퓨터와 ${targetFloors}층 게임을 시작했습니다.`);
  if (resultDialog.open) resultDialog.close();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  runComputer();
}

for (const input of document.querySelectorAll('input[type="radio"]')) {
  input.addEventListener('change', () => {
    const name = input.name;
    document.querySelectorAll(`input[name="${name}"]`).forEach(candidate => {
      candidate.closest('label').classList.toggle('selected', candidate.checked);
    });
  });
}

$('#start-game').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#result-restart').addEventListener('click', startGame);
resultDialog.addEventListener('cancel', event => event.preventDefault());
