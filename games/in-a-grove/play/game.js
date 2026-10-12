import { applyMove, chooseAiMove, createGame, legalMoves, viewForPlayer } from './engine.js';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const resultDialog = $('#result-dialog');
let game = null;
let aiBusy = false;
let runToken = 0;
let shownRound = 0;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function selectedDifficulty() {
  return document.querySelector('input[name="difficulty"]:checked').value;
}

function phaseText(view) {
  if (view.phase === 'inspect') return view.current === 0 ? '보지 않을 용의자를 선택하세요' : '컴퓨터가 확인 범위를 정하고 있습니다';
  if (view.phase === 'accuse') return view.current === 0 ? '정보를 바탕으로 범인을 지목하세요' : '컴퓨터가 범인을 추리하고 있습니다';
  if (view.phase === 'roundResult') return '사건의 진실이 공개되었습니다';
  return '수사가 끝났습니다';
}

function chipMarkup(stack) {
  return stack.map(owner => `<span class="detective-chip ${owner === 0 ? 'human' : 'computer'}" title="${owner === 0 ? '당신' : '컴퓨터'}의 지목">${owner === 0 ? '나' : 'AI'}</span>`).join('');
}

function suspectMarkup(suspect, view) {
  const canAct = view.current === 0;
  const inspect = view.phase === 'inspect' && canAct;
  const accuse = view.phase === 'accuse' && canAct;
  const isCriminal = view.result?.criminal === suspect.index;
  const firstSkipped = view.unviewed === suspect.index;
  const blockedByAccusation = suspect.value === null && view.accusations[0]?.suspect === suspect.index;
  const isUnviewed = suspect.value === null;
  let state = suspect.value === null ? '아직 확인하지 못함' : '확인한 숫자';
  if (firstSkipped) state = `미확인 마커 · 최초 도착자가 보지 않음${suspect.observed ? ' · 나는 확인함' : ''}`;
  if (blockedByAccusation) state = firstSkipped ? '미확인 마커 · 둘 다 확인하지 못함' : '직전 지목으로 확인할 수 없음';
  if (isCriminal) state = '실제 범인';
  const actions = inspect
    ? `<button type="button" data-move="inspect" data-suspect="${suspect.index}">이 용의자는 보지 않기</button>`
    : accuse
      ? `<button class="accuse" type="button" data-move="accuse" data-suspect="${suspect.index}">범인으로 지목</button>`
      : '';
  return `<article class="suspect-card${isCriminal ? ' criminal' : ''}${isUnviewed ? ' unviewed' : ''}">
    <span class="suspect-index">SUSPECT ${suspect.index + 1}</span>
    <strong class="suspect-value${suspect.value === null ? ' hidden' : ''}">${suspect.value ?? '?'}</strong>
    <span class="suspect-state">${state}</span>
    <div class="chip-stack">${chipMarkup(view.stacks[suspect.index])}</div>
    <div class="suspect-actions">${actions}</div>
  </article>`;
}

function renderResult(view) {
  if (!view.result || shownRound === view.round) return;
  shownRound = view.round;
  const humanAward = view.result.awards[0];
  const computerAward = view.result.awards[1];
  const over = view.phase === 'gameOver';
  $('#result-title').textContent = over ? (view.winner === 0 ? '당신의 승리' : '컴퓨터의 승리') : `사건 ${view.round} 해결`;
  $('#result-copy').textContent = `${view.result.criminal + 1}번 용의자가 범인이었습니다. 이번 사건에서 당신은 ${humanAward}개, 컴퓨터는 ${computerAward}개의 무능한 탐정 칩을 받았습니다.`;
  $('#result-score').innerHTML = `<span>당신<b>${view.players[0].penalties}개</b></span><span>컴퓨터<b>${view.players[1].penalties}개</b></span>`;
  $('#next-round').hidden = over;
  resultDialog.showModal();
}

function render() {
  if (!game) return;
  const view = viewForPlayer(game, 0);
  $('#round-number').textContent = String(view.round).padStart(2, '0');
  $('#arrival-label').textContent = `${view.firstPlayer === 0 ? '당신' : '컴퓨터'}이(가) 최초 현장 도착자`;
  $('#turn-label').textContent = view.phase === 'roundResult' || view.phase === 'gameOver' ? '사건 종료' : (view.current === 0 ? '당신 차례' : '컴퓨터 차례');
  $('#phase-label').textContent = phaseText(view);
  $('#scene-help').textContent = phaseText(view);
  $('#own-alibi').textContent = view.ownAlibi;
  $('#public-tile').textContent = view.publicTile;
  $('#victim-tile').textContent = view.victim ?? '사건 종료 후 공개';
  $('#suspect-grid').innerHTML = view.suspects.map(suspect => suspectMarkup(suspect, view)).join('');
  $('#human-score').textContent = view.players[0].penalties;
  $('#computer-score').textContent = view.players[1].penalties;
  $('#human-supply').textContent = `남은 칩 ${view.players[0].supply}개`;
  $('#computer-supply').textContent = `남은 칩 ${view.players[1].supply}개`;
  $('#game-log').innerHTML = view.log.slice(0, 10).map(entry => `<li>${entry}</li>`).join('');
  document.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', humanMove));
  renderResult(view);
}

function humanMove(event) {
  if (!game || game.current !== 0 || aiBusy) return;
  const selected = { type: event.currentTarget.dataset.move, suspect: Number(event.currentTarget.dataset.suspect) };
  if (!legalMoves(game).some(move => JSON.stringify(move) === JSON.stringify(selected))) return;
  game = applyMove(game, selected);
  render();
  runComputer();
}

async function runComputer() {
  if (!game || aiBusy || game.current !== 1 || !['inspect', 'accuse'].includes(game.phase)) return;
  aiBusy = true;
  const token = runToken;
  while (game && token === runToken && game.current === 1 && ['inspect', 'accuse'].includes(game.phase)) {
    render();
    await wait(650);
    if (token !== runToken) break;
    const selected = chooseAiMove(game, game.difficulty, 1);
    game = applyMove(game, selected);
    render();
  }
  aiBusy = false;
}

function startGame() {
  runToken += 1;
  shownRound = 0;
  aiBusy = false;
  game = createGame({ difficulty: selectedDifficulty(), firstPlayer: Math.random() < .5 ? 0 : 1 });
  if (resultDialog.open) resultDialog.close();
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  runComputer();
}

document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.difficulty-option').forEach(label => label.classList.toggle('selected', label.contains(document.querySelector('input[name="difficulty"]:checked'))));
}));
$('#start-game').addEventListener('click', startGame);
$('#restart-button').addEventListener('click', startGame);
$('#result-restart').addEventListener('click', startGame);
$('#next-round').addEventListener('click', () => {
  resultDialog.close();
  game = applyMove(game, { type: 'nextRound' });
  render();
  runComputer();
});
$('#toggle-log').addEventListener('click', event => {
  const log = $('#game-log');
  log.hidden = !log.hidden;
  event.currentTarget.textContent = log.hidden ? '펼치기' : '접기';
});
resultDialog.addEventListener('cancel', event => event.preventDefault());
