import { applyMove, chooseAiMove, createGame, isLegalMove, legalMoves, viewForPlayer } from './engine.js';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');
const peekDialog = $('#peek-dialog');
let game = null;
let aiBusy = false;
let runToken = 0;
let shownRound = 0;
let notice = '';
let activity = [];
let selectedOwn = new Set();
let selectedOther = new Set();
let visibleCardIds = new Set();
let resumeAiAfterPeek = false;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const abilityName = ability => ({ peek: 'PEEK', spy: 'SPY', swap: 'SWAP' }[ability] ?? '');

function selectedDifficulty() {
  return document.querySelector('input[name="difficulty"]:checked').value;
}

function resetSelection() {
  selectedOwn = new Set();
  selectedOther = new Set();
  notice = '';
}

function addLog(message) {
  activity.unshift(message);
  activity = activity.slice(0, 12);
}

function openPeek(title, copy, cards, resumeAi = true) {
  visibleCardIds = new Set(cards.map(card => card.id));
  resumeAiAfterPeek = resumeAi;
  $('#peek-title').textContent = title;
  $('#peek-copy').textContent = copy;
  $('#peek-cards').innerHTML = cards.map(card => `<div class="playing-card known"><strong>${card.value}</strong>${card.ability ? `<em>${abilityName(card.ability)}</em>` : ''}<small>지금만 확인</small></div>`).join('');
  peekDialog.showModal();
  render();
}

function isLegal(move) {
  return game && isLegalMove(game, move);
}

function phaseText(view) {
  if (view.phase === 'setup') return view.current === 0 ? '처음 확인할 내 카드 두 장을 선택하세요' : '컴퓨터가 처음 두 장을 확인하고 있습니다';
  if (view.phase === 'roundResult') return '모든 카드가 공개되었습니다';
  if (view.phase === 'gameOver') return '최종 점수를 확인하세요';
  if (view.current === 1) return view.phase === 'drawn' ? '컴퓨터가 뽑은 카드를 처리하고 있습니다' : '컴퓨터가 행동을 고르고 있습니다';
  if (view.phase === 'placeExchange') return '뽑은 카드를 놓을 교환 자리를 선택하세요';
  if (view.phase === 'placeFailed') return '추가된 카드를 놓을 줄 끝을 선택하세요';
  if (view.phase === 'drawn') return view.drawnFrom === 'discard' ? '내 카드와 반드시 교환하세요' : '교환, 버리기 또는 능력을 선택하세요';
  if (view.caboCaller !== null) return 'CABO 선언 후 마지막 차례입니다';
  return '뽑기, 버림 더미 또는 CABO를 선택하세요';
}

function cardMarkup(card, index, owner, selectable) {
  const selected = (owner === 0 ? selectedOwn : selectedOther).has(index);
  const visible = card.value !== null;
  const classes = ['playing-card'];
  if (!visible) classes.push('card-back');
  if (visible && !card.faceUp) classes.push('known');
  if (card.faceUp) classes.push('face-up');
  if (selected) classes.push('selected');
  const state = card.faceUp ? '공개' : visible ? (owner === 0 ? '기억' : '확인') : '비공개';
  const value = visible ? `<strong>${card.value}</strong>` : '<span>?</span>';
  const ability = visible && card.ability ? `<em>${abilityName(card.ability)}</em>` : '';
  return `<button class="${classes.join(' ')}" type="button" data-card-owner="${owner}" data-card-index="${index}" aria-pressed="${selected}" aria-label="${owner === 0 ? '내' : '컴퓨터'} ${index + 1}번 카드, ${visible ? `${card.value}, ${state}` : state}" ${selectable ? '' : 'disabled'}>${ability}${value}<small>${state}</small></button>`;
}

function canSelect(owner, view) {
  if (!aiBusy && view.phase === 'setup' && view.current === 0) return owner === 0;
  if (aiBusy || view.current !== 0 || view.phase !== 'drawn') return false;
  if (owner === 0) return true;
  return view.drawnFrom === 'deck' && ['spy', 'swap'].includes(view.drawn?.ability);
}

function abilityMove(view) {
  if (view.phase !== 'drawn' || view.drawnFrom !== 'deck' || !view.drawn?.ability) return null;
  if (view.drawn.ability === 'peek' && selectedOwn.size === 1) return { type: 'usePeek', target: [...selectedOwn][0] };
  if (view.drawn.ability === 'spy' && selectedOther.size === 1) return { type: 'useSpy', target: [...selectedOther][0] };
  if (view.drawn.ability === 'swap' && selectedOwn.size === 1 && selectedOther.size === 1) {
    return { type: 'useSwap', own: [...selectedOwn][0], other: [...selectedOther][0] };
  }
  return null;
}

function selectionHelp(view) {
  if (view.phase === 'setup' && view.current === 0) return '내 카드 네 장 중 원하는 두 장을 선택해 숫자를 확인하세요.';
  if (view.current === 1) return '컴퓨터는 공개 정보와 자신이 확인한 카드만 사용합니다.';
  if (view.phase === 'placeExchange') return '교환에 성공했습니다. 비운 자리 중 새 카드를 둘 곳을 선택하세요.';
  if (view.phase === 'placeFailed') return '교환에 실패했습니다. 추가되는 카드가 들어갈 왼쪽·오른쪽 끝을 선택하세요.';
  if (view.phase !== 'drawn') return phaseText(view);
  if (view.drawnFrom === 'discard') return '내 카드 1장 또는 같은 숫자라고 기억하는 여러 장을 선택하세요.';
  if (view.drawn?.ability === 'peek') return '교환할 내 카드를 고르거나, 내 카드 1장을 선택해 PEEK를 사용할 수 있습니다.';
  if (view.drawn?.ability === 'spy') return '교환할 내 카드를 고르거나, 컴퓨터 카드 1장을 선택해 SPY를 사용할 수 있습니다.';
  if (view.drawn?.ability === 'swap') return '교환할 내 카드를 고르거나, 내 카드와 컴퓨터 카드 각 1장을 선택해 SWAP을 사용할 수 있습니다.';
  return '내 카드 1장 또는 같은 숫자라고 기억하는 여러 장을 선택하세요.';
}

function renderCards(view) {
  const revealAll = ['roundResult', 'gameOver'].includes(view.phase);
  const mask = card => (revealAll || card.faceUp || visibleCardIds.has(card.id)) ? card : { ...card, value: null, ability: null };
  $('#computer-row').innerHTML = view.players[1].row.map((card, index) => cardMarkup(mask(card), index, 1, canSelect(1, view))).join('');
  $('#human-row').innerHTML = view.players[0].row.map((card, index) => cardMarkup(mask(card), index, 0, canSelect(0, view))).join('');
  document.querySelectorAll('[data-card-owner]').forEach(button => button.addEventListener('click', toggleCard));
}

function renderCenter(view) {
  $('#deck-count').textContent = `${view.deckCount}장`;
  const discard = view.discardTop;
  $('#discard-card').innerHTML = discard ? `${discard.ability ? `<em>${abilityName(discard.ability)}</em>` : ''}<strong>${discard.value}</strong>` : '<strong>—</strong>';
  $('#drawn-wrap').hidden = !(view.current === 0 && ['drawn', 'placeExchange', 'placeFailed'].includes(view.phase) && view.drawn);
  if (view.drawn) {
    $('#drawn-card').innerHTML = `${view.drawn.ability ? `<em>${abilityName(view.drawn.ability)}</em>` : ''}<strong>${view.drawn.value}</strong>`;
  }
}

function renderActions(view) {
  const humanTurn = view.current === 0 && !aiBusy;
  $('#turn-actions').hidden = !(view.phase === 'turn' && humanTurn);
  $('#setup-actions').hidden = !(view.phase === 'setup' && humanTurn);
  $('#confirm-initial').disabled = selectedOwn.size !== 2 || !isLegal({ type: 'chooseInitial', indices: [...selectedOwn].sort((a, b) => a - b) });
  $('#draw-actions').hidden = !(view.phase === 'drawn' && humanTurn);
  const placement = $('#placement-actions');
  const placementMoves = humanTurn && ['placeExchange', 'placeFailed'].includes(view.phase) ? legalMoves(game) : [];
  placement.hidden = !placementMoves.length;
  placement.innerHTML = placementMoves.map((move, index) => {
    if (move.type === 'placeExchange') {
      return `<button type="button" data-placement-index="${index}"><b>${move.placeAt + 1}번 자리에 놓기</b><span>교환한 자리 중 선택</span></button>`;
    }
    const drawn = move.drawnAt === 'left' ? '왼쪽' : '오른쪽';
    const penalty = move.penaltyAt ? `벌칙 카드 ${move.penaltyAt === 'left' ? '왼쪽' : '오른쪽'}` : '줄 끝 선택';
    return `<button type="button" data-placement-index="${index}"><b>뽑은 카드 ${drawn}</b><span>${penalty}</span></button>`;
  }).join('');
  placement.querySelectorAll('[data-placement-index]').forEach(button => {
    button.addEventListener('click', () => humanMove(placementMoves[Number(button.dataset.placementIndex)]));
  });
  $('#draw-deck').disabled = !isLegal({ type: 'drawDeck' });
  $('#take-discard').disabled = !isLegal({ type: 'takeDiscard' });
  $('#call-cabo').disabled = !isLegal({ type: 'callCabo' });

  const indices = [...selectedOwn].sort((a, b) => a - b);
  const exchange = { type: 'exchange', indices };
  $('#exchange-cards').disabled = !indices.length || !isLegal(exchange);
  $('#discard-drawn').hidden = view.drawnFrom !== 'deck';
  $('#discard-drawn').disabled = !isLegal({ type: 'discardDrawn' });

  const ability = abilityMove(view);
  const abilityButton = $('#use-ability');
  abilityButton.hidden = !(view.drawnFrom === 'deck' && view.drawn?.ability);
  abilityButton.disabled = !ability || !isLegal(ability);
  if (view.drawn?.ability) {
    abilityButton.querySelector('b').textContent = `${abilityName(view.drawn.ability)} 사용`;
    $('#ability-copy').textContent = view.drawn.ability === 'swap' ? '내 카드와 상대 카드 각 1장' : view.drawn.ability === 'spy' ? '상대 카드 1장' : '내 카드 1장';
  }
  $('#selection-help').textContent = selectionHelp(view);
  $('#status-message').textContent = notice || (indices.length ? `내 카드 ${indices.map(index => index + 1).join(', ')}번 선택됨` : phaseText(view));
}

function renderResult(view) {
  if (peekDialog.open || !view.result || shownRound === view.round) return;
  shownRound = view.round;
  const over = view.phase === 'gameOver';
  const result = view.result;
  let title = `라운드 ${view.round} 결과`;
  if (over) title = view.winner === null ? '공동 승리' : view.winner === 0 ? '당신의 승리' : '컴퓨터의 승리';
  $('#result-title').textContent = title;

  const caller = result.caboCaller === null ? '' : `${result.caboCaller === 0 ? '당신' : '컴퓨터'}의 CABO 선언이 ${result.roundScores[result.caboCaller] === 0 ? '성공했습니다.' : '실패했습니다.'}`;
  const kamikaze = result.kamikaze === null ? '' : `${result.kamikaze === 0 ? '당신' : '컴퓨터'}이(가) KAMIKAZE를 완성했습니다.`;
  const reset = result.resets.length ? ` ${result.resets.map(index => index === 0 ? '당신' : '컴퓨터').join(', ')}의 누적 점수가 100에서 50으로 한 번 재설정되었습니다.` : '';
  $('#result-copy').textContent = `${kamikaze || caller || '뽑기 더미가 소진되어 라운드가 끝났습니다.'}${reset}`;
  $('#result-cards').innerHTML = `<div class="result-hand"><span>당신의 카드 · 합 ${result.sums[0]}</span><b>${result.rows[0].join(' · ')}</b></div><div class="result-hand"><span>컴퓨터 카드 · 합 ${result.sums[1]}</span><b>${result.rows[1].join(' · ')}</b></div>`;
  $('#result-score').innerHTML = `<span>당신<b>+${result.roundScores[0]} → ${result.scores[0]}점</b></span><span>컴퓨터<b>+${result.roundScores[1]} → ${result.scores[1]}점</b></span>`;
  $('#next-round').hidden = over;
  resultDialog.showModal();
}

function render() {
  if (!game) return;
  const view = viewForPlayer(game, 0);
  $('#round-number').textContent = String(view.round).padStart(2, '0');
  $('#starter-label').textContent = `${view.starter === 0 ? '당신' : '컴퓨터'}이(가) 시작`;
  $('#turn-label').textContent = ['roundResult', 'gameOver'].includes(view.phase) ? '라운드 종료' : (view.current === 0 ? '당신 차례' : '컴퓨터 차례');
  $('#phase-label').textContent = phaseText(view);
  $('#human-score').textContent = view.players[0].score;
  $('#computer-score').textContent = view.players[1].score;
  $('#human-reset').textContent = view.players[0].resetUsed ? '100점 재설정 사용' : '';
  $('#computer-reset').textContent = view.players[1].resetUsed ? '100점 재설정 사용' : '';
  renderCards(view);
  renderCenter(view);
  renderActions(view);
  $('#game-log').innerHTML = activity.map(entry => `<li>${entry}</li>`).join('');
  renderResult(view);
}

function toggleCard(event) {
  const owner = Number(event.currentTarget.dataset.cardOwner);
  const index = Number(event.currentTarget.dataset.cardIndex);
  const selection = owner === 0 ? selectedOwn : selectedOther;
  if (selection.has(index)) selection.delete(index);
  else {
    if (owner === 1) selection.clear();
    const limit = game?.phase === 'setup' ? 2 : game?.players[0].row.length;
    if (owner === 0 && selection.size >= limit) {
      notice = game?.phase === 'setup' ? '처음에는 카드 두 장을 선택합니다.' : '현재 줄에 있는 카드 수를 넘게 선택할 수 없습니다.';
      render();
      return;
    }
    selection.add(index);
  }
  notice = '';
  render();
}

function describeHuman(move, view, after) {
  if (move.type === 'chooseInitial') return '당신이 처음 확인할 카드 두 장을 골랐습니다.';
  if (move.type === 'drawDeck') return '당신이 뽑기 더미에서 카드 1장을 확인했습니다.';
  if (move.type === 'takeDiscard') return `당신이 버림 더미의 ${view.discardTop.value} 카드를 가져왔습니다.`;
  if (move.type === 'callCabo') return '당신이 CABO를 선언했습니다. 컴퓨터에게 마지막 차례가 주어집니다.';
  if (move.type === 'exchange') {
    if (after.phase === 'placeFailed') return '여러 장 교환이 실패해 선택한 카드가 공개되었습니다.';
    if (after.phase === 'placeExchange') return `같은 숫자 ${move.indices.length}장 교환에 성공했습니다.`;
    return `당신이 선택한 카드 ${move.indices.length}장을 뽑은 카드와 교환했습니다.`;
  }
  if (move.type === 'placeExchange') return `당신이 뽑은 카드를 ${move.placeAt + 1}번 교환 자리에 놓았습니다.`;
  if (move.type === 'placeFailed') return '당신이 실패 후 받은 카드를 줄 끝에 놓았습니다.';
  if (move.type === 'discardDrawn') return `당신이 뽑은 ${view.drawn.value} 카드를 버렸습니다.`;
  if (move.type === 'usePeek') return `당신이 PEEK로 내 ${move.target + 1}번 카드를 확인했습니다.`;
  if (move.type === 'useSpy') return `당신이 SPY로 컴퓨터의 ${move.target + 1}번 카드를 확인했습니다.`;
  if (move.type === 'useSwap') return `당신이 내 ${move.own + 1}번과 컴퓨터 ${move.other + 1}번 카드를 바꿨습니다.`;
  return '당신이 행동을 마쳤습니다.';
}

function describeComputer(move, view, after) {
  if (move.type === 'chooseInitial') return '컴퓨터가 처음 확인할 카드 두 장을 골랐습니다.';
  if (move.type === 'drawDeck') return '컴퓨터가 뽑기 더미에서 카드 1장을 확인했습니다.';
  if (move.type === 'takeDiscard') return `컴퓨터가 버림 더미의 ${view.discardTop.value} 카드를 가져왔습니다.`;
  if (move.type === 'callCabo') return '컴퓨터가 CABO를 선언했습니다. 당신에게 마지막 차례가 주어집니다.';
  if (move.type === 'exchange') {
    if (after.phase === 'placeFailed') return '컴퓨터의 여러 장 교환이 실패해 카드가 공개되었습니다.';
    if (after.phase === 'placeExchange') return `컴퓨터가 같은 숫자 ${move.indices.length}장 교환에 성공했습니다.`;
    return `컴퓨터가 자기 카드 ${move.indices.length}장을 교환했습니다.`;
  }
  if (move.type === 'placeExchange') return '컴퓨터가 교환한 자리에 새 카드를 놓았습니다.';
  if (move.type === 'placeFailed') return '컴퓨터가 실패 후 받은 카드를 줄 끝에 놓았습니다.';
  if (move.type === 'discardDrawn') return '컴퓨터가 뽑은 카드를 버렸습니다.';
  if (move.type === 'usePeek') return '컴퓨터가 PEEK로 자기 카드 한 장을 확인했습니다.';
  if (move.type === 'useSpy') return `컴퓨터가 SPY로 당신의 ${move.target + 1}번 카드를 확인했습니다.`;
  if (move.type === 'useSwap') return `컴퓨터가 자기 카드와 당신의 ${move.other + 1}번 카드를 바꿨습니다.`;
  return '컴퓨터가 행동을 마쳤습니다.';
}

function humanMove(move) {
  if (!game || game.current !== 0 || aiBusy || !isLegal(move)) {
    notice = '지금은 선택한 행동을 할 수 없습니다.';
    render();
    return;
  }
  const before = viewForPlayer(game, 0);
  const next = applyMove(game, move);
  const after = viewForPlayer(next, 0);
  addLog(describeHuman(move, before, after));
  game = next;
  resetSelection();
  if (move.type === 'chooseInitial') {
    openPeek('선택한 두 장을 기억하세요', '이 창을 닫으면 다시 보이지 않습니다. 위치와 숫자를 기억하세요.', move.indices.map(index => after.players[0].row[index]));
    return;
  }
  if (move.type === 'usePeek') {
    openPeek('내 카드를 확인하세요', '이 창을 닫으면 카드가 다시 뒤집힙니다.', [after.players[0].row[move.target]]);
    return;
  }
  if (move.type === 'useSpy') {
    openPeek('상대 카드를 확인하세요', '확인한 위치와 숫자를 기억하세요. 이 창을 닫으면 다시 보이지 않습니다.', [after.players[1].row[move.target]]);
    return;
  }
  render();
  runComputer();
}

async function runComputer() {
  const aiPhases = ['setup', 'turn', 'drawn', 'placeExchange', 'placeFailed'];
  if (!game || aiBusy || game.current !== 1 || !aiPhases.includes(game.phase)) return;
  aiBusy = true;
  const token = runToken;
  while (game && token === runToken && game.current === 1 && aiPhases.includes(game.phase)) {
    render();
    await wait(560);
    if (token !== runToken) break;
    const before = viewForPlayer(game, 0);
    const move = chooseAiMove(game, game.difficulty, 1);
    const next = applyMove(game, move);
    addLog(describeComputer(move, before, viewForPlayer(next, 0)));
    game = next;
    resetSelection();
    render();
  }
  aiBusy = false;
  render();
}

function startGame() {
  runToken += 1;
  aiBusy = false;
  shownRound = 0;
  activity = [];
  resetSelection();
  game = createGame({ difficulty: selectedDifficulty(), firstPlayer: Math.random() < .5 ? 0 : 1, manualSetup: true });
  addLog('새 게임을 시작했습니다. 먼저 확인할 카드 두 장을 선택하세요.');
  if (resultDialog.open) resultDialog.close();
  if (peekDialog.open) peekDialog.close();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
}

document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener('change', () => {
  const checked = document.querySelector('input[name="difficulty"]:checked');
  document.querySelectorAll('.difficulty-option').forEach(label => label.classList.toggle('selected', label.contains(checked)));
}));
$('#start-game').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#result-restart').addEventListener('click', startGame);
$('#draw-deck').addEventListener('click', () => humanMove({ type: 'drawDeck' }));
$('#take-discard').addEventListener('click', () => humanMove({ type: 'takeDiscard' }));
$('#call-cabo').addEventListener('click', () => humanMove({ type: 'callCabo' }));
$('#confirm-initial').addEventListener('click', () => humanMove({ type: 'chooseInitial', indices: [...selectedOwn].sort((a, b) => a - b) }));
$('#discard-drawn').addEventListener('click', () => humanMove({ type: 'discardDrawn' }));
$('#exchange-cards').addEventListener('click', () => humanMove({ type: 'exchange', indices: [...selectedOwn].sort((a, b) => a - b) }));
$('#use-ability').addEventListener('click', () => {
  const move = abilityMove(viewForPlayer(game, 0));
  if (move) humanMove(move);
});
$('#next-round').addEventListener('click', () => {
  resultDialog.close();
  game = applyMove(game, { type: 'nextRound' });
  shownRound = 0;
  resetSelection();
  addLog(`라운드 ${game.round}을 시작했습니다. 처음 확인할 카드 두 장을 선택하세요.`);
  render();
});
$('#finish-peek').addEventListener('click', () => {
  peekDialog.close();
  visibleCardIds.clear();
  render();
  if (resumeAiAfterPeek) runComputer();
});
peekDialog.addEventListener('cancel', event => event.preventDefault());
resultDialog.addEventListener('cancel', event => event.preventDefault());
