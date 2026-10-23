import { ITEMS, applyMove, chooseAiMove, createGame, legalMoves, projectObservation } from './engine.js?v=1.0.0';

const startScreen = document.querySelector('#start-screen');
const gameScreen = document.querySelector('#game-screen');
const startButton = document.querySelector('#start-game');
const restartButton = document.querySelector('#restart-button');
const resultRestart = document.querySelector('#result-restart');
const turnCount = document.querySelector('#turn-count');
const difficultyLabel = document.querySelector('#difficulty-label');
const phaseTitle = document.querySelector('#phase-title');
const computerZone = document.querySelector('#computer-zone');
const caseFile = document.querySelector('#case-file');
const humanEvidence = document.querySelector('#human-evidence');
const actionTitle = document.querySelector('#action-title');
const actionHelp = document.querySelector('#action-help');
const selectionSummary = document.querySelector('#selection-summary');
const actionControls = document.querySelector('#action-controls');
const accuseButton = document.querySelector('#accuse-button');
const gameLog = document.querySelector('#game-log');
const accusationDialog = document.querySelector('#accusation-dialog');
const accusationTitle = document.querySelector('#accusation-title');
const accusationOptions = document.querySelector('#accusation-options');
const accusationCancel = accusationDialog.querySelector('button[value="cancel"]');
const submitAccusation = document.querySelector('#submit-accusation');
const resultDialog = document.querySelector('#result-dialog');
const resultTitle = document.querySelector('#result-title');
const resultCopy = document.querySelector('#result-copy');
const resultSolution = document.querySelector('#result-solution');
const resultAccusations = document.querySelector('#result-accusations');

const categoryNames = { suspect: '용의자', location: '장소', weapon: '흉기' };
const difficultyNames = { easy: '쉬움', normal: '보통', hard: '어려움' };
const itemByKey = Object.fromEntries(ITEMS.map(item => [item.key, item]));
let game = null;
let selectedQuestion = new Set();
let pendingAccusationType = 'accuse';
let aiTimer = null;
let runToken = 0;
let resultShown = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sameMove(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function actorForState() {
  if (!game || game.phase === 'gameOver') return null;
  return game.phase === 'ask' ? game.currentPlayer : 1 - game.currentPlayer;
}

function sortedKeys(keys) {
  return [...keys].sort((first, second) => ITEMS.findIndex(item => item.key === first) - ITEMS.findIndex(item => item.key === second));
}

function evidenceCard(card, selectable = false) {
  const button = element(selectable ? 'button' : 'article', 'evidence-card');
  if (selectable) {
    button.type = 'button';
    button.classList.add('selectable');
    button.dataset.cardId = card.id;
  }
  button.append(element('small', '', categoryNames[card.category]), element('b', '', itemByKey[card.itemKey].name), element('small', '', '무죄 증거'));
  return button;
}

function renderComputer(view) {
  const copy = element('div');
  copy.append(element('p', 'kicker', 'COMPUTER DETECTIVE'), element('h2', '', '컴퓨터 탐정'), element('p', '', '증거 카드의 정체와 사건 파일 표시는 비공개입니다.'));
  const stats = element('div', 'detective-stats');
  stats.append(element('span', 'stat-chip', `증거 ${view.players[1].evidence.length}장`), element('span', 'stat-chip', `난이도 ${difficultyNames[view.difficulty]}`));
  computerZone.replaceChildren(copy, stats);
}

function renderCaseFile(view) {
  const canAsk = actorForState() === 0 && game.phase === 'ask';
  const innocent = new Set(view.knowledge.knownInnocent);
  const suspected = new Set(view.knowledge.knownSolution);
  const groups = ['suspect', 'location', 'weapon'].map(category => {
    const group = element('section', 'category');
    group.append(element('h3', '', categoryNames[category]));
    for (const item of ITEMS.filter(candidate => candidate.category === category)) {
      const button = element('button', 'case-item');
      button.type = 'button';
      button.dataset.itemKey = item.key;
      button.disabled = !canAsk;
      if (innocent.has(item.key)) button.classList.add('innocent');
      if (suspected.has(item.key)) button.classList.add('suspected');
      if (selectedQuestion.has(item.key)) button.classList.add('selected');
      button.append(element('span', '', item.name), element('span', 'mark', suspected.has(item.key) ? '정답 후보' : innocent.has(item.key) ? '무죄' : '미확인'));
      button.addEventListener('click', () => toggleQuestion(item.key));
      group.append(button);
    }
    return group;
  });
  caseFile.replaceChildren(...groups);
}

function renderEvidence(view) {
  const answerMoves = game.phase === 'answer' && actorForState() === 0 ? legalMoves(game, 0).filter(move => move.type === 'showEvidence') : [];
  const selectableIds = new Set(answerMoves.map(move => move.cardId));
  const cards = view.players[0].evidence.map(card => {
    const node = evidenceCard(card, selectableIds.has(card.id));
    if (selectableIds.has(card.id)) node.addEventListener('click', () => commitHumanMove({ type: 'showEvidence', cardId: card.id }));
    return node;
  });
  humanEvidence.replaceChildren(...cards);
}

function renderSelection() {
  const names = sortedKeys(selectedQuestion).map(key => itemByKey[key].name);
  selectionSummary.textContent = names.length ? `선택: ${names.join(' · ')}` : '아직 선택한 항목이 없습니다.';
}

function actionButton(label, move, className = '') {
  const button = element('button', className, label);
  button.type = 'button';
  button.addEventListener('click', () => commitHumanMove(move));
  return button;
}

function renderActions(view) {
  actionControls.replaceChildren();
  accuseButton.hidden = true;
  const actor = actorForState();
  if (actor === 1) {
    actionTitle.textContent = '컴퓨터가 추리하고 있습니다';
    actionHelp.textContent = '컴퓨터의 합법적인 행동을 기다려 주세요.';
    selectionSummary.textContent = '상대 차례';
    return;
  }
  if (game.phase === 'ask') {
    actionTitle.textContent = '질문할 증거를 고르세요';
    actionHelp.textContent = '사건 파일에서 서로 다른 항목 2개를 선택합니다.';
    renderSelection();
    const keys = sortedKeys(selectedQuestion);
    const move = { type: 'ask', itemKeys: keys };
    const button = actionButton('선택한 두 항목 질문하기', move, 'primary');
    button.disabled = keys.length !== 2 || !legalMoves(game, 0).some(candidate => sameMove(candidate, move));
    actionControls.append(button);
    accuseButton.hidden = false;
    accuseButton.disabled = false;
    return;
  }
  if (game.phase === 'answer') {
    const names = game.question.itemKeys.map(key => itemByKey[key].name);
    actionTitle.textContent = '컴퓨터의 질문에 답하세요';
    actionHelp.textContent = `${names.join(' 또는 ')} 중 가진 증거가 있다면 정확히 1장만 보여 주세요.`;
    selectionSummary.textContent = `질문: ${names.join(' · ')}`;
    const moves = legalMoves(game, 0);
    const cannot = moves.find(move => move.type === 'cannotHelp');
    if (cannot) actionControls.append(actionButton('도와줄 수 없습니다', cannot, 'primary'));
    else actionControls.append(element('p', '', '아래 내 증거 카드 중 강조된 카드 1장을 선택하세요.'));
    return;
  }
  if (game.phase === 'counterAccuse') {
    actionTitle.textContent = '반드시 맞고발해야 합니다';
    actionHelp.textContent = '컴퓨터가 먼저 고발했습니다. 용의자·장소·흉기를 하나씩 고르세요.';
    selectionSummary.textContent = '고발을 제출하면 두 고발을 함께 공개합니다.';
    openAccusation('counterAccuse');
  }
}

function renderLog(view) {
  gameLog.replaceChildren(...view.log.slice(0, 16).map(entry => element('li', '', entry)));
}

function render() {
  if (!game) return;
  const view = projectObservation(game, 0);
  turnCount.textContent = String(view.turn);
  difficultyLabel.textContent = difficultyNames[view.difficulty];
  phaseTitle.textContent = view.phase === 'gameOver' ? '사건 종료' : actorForState() === 0 ? '내 차례' : '컴퓨터 차례';
  renderComputer(view);
  renderCaseFile(view);
  renderEvidence(view);
  renderActions(view);
  renderLog(view);
  if (game.phase === 'gameOver') showResult(view);
}

function toggleQuestion(itemKey) {
  if (selectedQuestion.has(itemKey)) selectedQuestion.delete(itemKey);
  else if (selectedQuestion.size < 2) selectedQuestion.add(itemKey);
  render();
}

function commitHumanMove(move) {
  if (!game || !legalMoves(game, 0).some(candidate => sameMove(candidate, move))) return;
  selectedQuestion.clear();
  game = applyMove(game, move, 0);
  render();
  scheduleComputer();
}

function buildAccusationOptions() {
  const groups = ['suspect', 'location', 'weapon'].map(category => {
    const section = element('section', 'accusation-group');
    section.append(element('h3', '', categoryNames[category]));
    const options = element('div', 'accusation-options');
    for (const item of ITEMS.filter(candidate => candidate.category === category)) {
      const label = element('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = `accusation-${category}`;
      input.value = item.key;
      label.append(input, element('span', '', item.name));
      options.append(label);
    }
    section.append(options);
    return section;
  });
  accusationOptions.replaceChildren(...groups);
}

function openAccusation(type) {
  if (!game || accusationDialog.open) return;
  pendingAccusationType = type;
  accusationTitle.textContent = type === 'counterAccuse' ? '컴퓨터에게 맞고발하기' : '고발할 세 항목';
  accusationCancel.hidden = type === 'counterAccuse';
  buildAccusationOptions();
  accusationDialog.showModal();
}

function submitAccusationMove() {
  const itemKeys = ['suspect', 'location', 'weapon'].map(category => accusationOptions.querySelector(`input[name="accusation-${category}"]:checked`)?.value);
  if (itemKeys.some(key => !key)) return;
  const move = { type: pendingAccusationType, itemKeys };
  if (!legalMoves(game, 0).some(candidate => sameMove(candidate, move))) return;
  accusationDialog.close();
  commitHumanMove(move);
}

function computerStep(token) {
  if (!game || token !== runToken || game.phase === 'gameOver') return;
  const actor = actorForState();
  if (actor !== 1) return;
  const observation = projectObservation(game, actor);
  const move = chooseAiMove(observation);
  if (!move || !legalMoves(game, actor).some(candidate => sameMove(candidate, move))) throw new Error('컴퓨터가 허용되지 않은 행동을 선택했습니다.');
  game = applyMove(game, move, actor);
  render();
  scheduleComputer();
}

function scheduleComputer() {
  if (aiTimer) window.clearTimeout(aiTimer);
  const actor = actorForState();
  if (actor !== 1) return;
  const token = runToken;
  aiTimer = window.setTimeout(() => computerStep(token), 650);
}

function resultCard(card) {
  const item = itemByKey[card.itemKey];
  const node = element('div', 'solution-card');
  node.append(element('small', '', categoryNames[item.category]), element('b', '', item.name));
  return node;
}

function accusationResult(view, playerIndex) {
  const keys = view.accusations[playerIndex];
  const names = keys.map(key => itemByKey[key].name).join(' · ');
  const answer = new Set(view.solution.map(card => card.itemKey));
  const correct = keys.every(key => answer.has(key));
  return element('p', 'accusation-result', `${view.players[playerIndex].name}: ${names} — ${correct ? '정답' : '오답'}`);
}

function showResult(view) {
  if (resultShown) return;
  resultShown = true;
  resultTitle.textContent = view.winnerIndex === 0 ? '사건 해결 성공' : view.winnerIndex === 1 ? '컴퓨터 탐정 승리' : '범인이 모두를 따돌렸습니다';
  resultCopy.textContent = view.winnerIndex === 0 ? '당신의 고발이 판정 순서에서 먼저 정답이었습니다.' : view.winnerIndex === 1 ? '컴퓨터의 고발이 판정 순서에서 먼저 정답이었습니다.' : '두 탐정의 고발이 모두 틀렸습니다.';
  const grid = element('div', 'solution-grid');
  grid.append(...view.solution.map(resultCard));
  resultSolution.replaceChildren(element('h3', '', '비밀 봉투의 정답'), grid);
  resultAccusations.replaceChildren(element('h3', '', '고발 비교'), accusationResult(view, 0), accusationResult(view, 1));
  resultDialog.showModal();
}

function startGame() {
  runToken += 1;
  if (aiTimer) window.clearTimeout(aiTimer);
  if (accusationDialog.open) accusationDialog.close();
  if (resultDialog.open) resultDialog.close();
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
  game = createGame({ difficulty });
  selectedQuestion.clear();
  resultShown = false;
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  scheduleComputer();
}

document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.setup-panel label').forEach(label => label.classList.toggle('selected', label.contains(input) && input.checked));
}));
startButton.addEventListener('click', startGame);
restartButton.addEventListener('click', startGame);
resultRestart.addEventListener('click', startGame);
accuseButton.addEventListener('click', () => openAccusation('accuse'));
submitAccusation.addEventListener('click', submitAccusationMove);
accusationDialog.addEventListener('cancel', event => {
  if (pendingAccusationType === 'counterAccuse') event.preventDefault();
});
resultDialog.addEventListener('cancel', event => event.preventDefault());
