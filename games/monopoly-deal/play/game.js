import { applyMove, chooseAiMove, COLOR_NAMES, createGame, legalMoves, PROPERTY_RULES, summarizePlayer } from './engine.js';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const responseDialog = $('#response-dialog');
const resultDialog = $('#result-dialog');
const cardTemplate = $('#card-template');
const difficultyNames = { easy: '쉬움', normal: '보통', hard: '어려움' };
const colorCss = { brown: '#8b5a3c', lightBlue: '#8dc9e8', pink: '#d66d9e', orange: '#e98336', red: '#cf3e43', yellow: '#e8c936', green: '#4f9661', darkBlue: '#35558b', railroad: '#383838', utility: '#8b7b67' };
const actionNames = { dealBreaker: '딜 브레이커', forcedDeal: '포스드 딜', slyDeal: '슬라이 딜', justSayNo: '그냥 안 돼', debtCollector: '빚 받기', birthday: '생일 축하해', doubleRent: '임대료 두 배', house: '집', hotel: '호텔', passGo: '출발', rent: '임대료' };
let game = null;
let selectedCardId = null;
let timer = null;
let locked = false;

function activePlayer() {
  if (!game) return null;
  if (game.phase === 'payment') return game.payment.payer;
  if (game.phase === 'response') return game.pending.responder;
  return game.current;
}

function cardDetail(card) {
  if (card.kind === 'property') return COLOR_NAMES[card.colors[0]];
  if (card.kind === 'wild') return card.colors.length === 10 ? '모든 색' : card.colors.map(color => COLOR_NAMES[color]).join(' / ');
  if (card.kind === 'money') return '은행 전용';
  return actionNames[card.action] ?? '액션 카드';
}

function cardElement(card, interactive = false) {
  const element = cardTemplate.content.firstElementChild.cloneNode(true);
  element.dataset.kind = card.kind;
  element.dataset.cardId = card.id;
  element.querySelector('.card-value').textContent = card.value;
  element.querySelector('.card-name').textContent = card.name;
  element.querySelector('.card-detail').textContent = cardDetail(card);
  if (card.kind === 'property' || card.kind === 'wild') element.style.setProperty('--card-color', colorCss[card.colors[0]]);
  element.classList.toggle('selected', selectedCardId === card.id);
  element.disabled = !interactive;
  if (interactive) element.addEventListener('click', () => {
    selectedCardId = selectedCardId === card.id ? null : card.id;
    render();
  });
  return element;
}

function summaryText(player) {
  const summary = summarizePlayer(player);
  return `${summary.completedSets}세트 · ${summary.bank}M`;
}

function assetSelected(key) { return game.phase === 'payment' && game.payment.selected.includes(key); }
function paymentToggle(key) {
  const candidate = legalMoves(game, 0).find(move => move.type === 'paymentToggle' && move.assetKey === key);
  if (candidate) commitMove(candidate);
}

function renderBank(playerIndex, element) {
  element.replaceChildren();
  const player = game.players[playerIndex];
  if (!player.bank.length) {
    const empty = document.createElement('span'); empty.className = 'empty-zone'; empty.textContent = '비어 있음'; element.append(empty);
  }
  for (const card of player.bank) {
    const chip = document.createElement(playerIndex === 0 && game.phase === 'payment' && game.payment.payer === 0 ? 'button' : 'span');
    chip.className = 'money-chip'; chip.textContent = `${card.value}M`;
    const key = `bank:${card.id}`;
    chip.classList.toggle('selected', assetSelected(key));
    if (chip instanceof HTMLButtonElement) { chip.type = 'button'; chip.addEventListener('click', () => paymentToggle(key)); }
    element.append(chip);
  }
}

function groupLabel(group) { return `${COLOR_NAMES[group.color]} ${group.cards.length}/${PROPERTY_RULES[group.color].size}`; }
function renderProperties(playerIndex, element) {
  element.replaceChildren();
  const player = game.players[playerIndex];
  if (!player.groups.length && !player.looseBuildings.length) {
    const empty = document.createElement('span'); empty.className = 'empty-zone'; empty.textContent = '부동산 없음'; element.append(empty);
  }
  const humanLegal = playerIndex === 0 ? legalMoves(game, 0) : [];
  for (const group of player.groups) {
    const article = document.createElement('article');
    article.className = 'property-set';
    article.style.setProperty('--set-color', colorCss[group.color]);
    article.classList.toggle('complete', group.cards.length >= PROPERTY_RULES[group.color].size);
    const header = document.createElement('header');
    header.innerHTML = `<b>${groupLabel(group)}</b><span>${group.cards.length >= PROPERTY_RULES[group.color].size ? '완성' : `${PROPERTY_RULES[group.color].rents[Math.max(0, group.cards.length - 1)] ?? 0}M`}</span>`;
    const cards = document.createElement('div'); cards.className = 'property-cards';
    for (const card of group.cards) {
      const canReassign = humanLegal.some(move => move.type === 'reassignWild' && move.cardId === card.id);
      const key = `property:${group.id}:${card.id}`;
      const canPay = playerIndex === 0 && game.phase === 'payment' && humanLegal.some(move => move.assetKey === key);
      const chip = document.createElement(canReassign || canPay ? 'button' : 'span');
      chip.className = 'property-chip';
      chip.textContent = card.kind === 'wild' ? 'WILD' : COLOR_NAMES[group.color];
      chip.classList.toggle('selected', selectedCardId === card.id || assetSelected(key));
      if (chip instanceof HTMLButtonElement) {
        chip.type = 'button';
        chip.addEventListener('click', () => canPay ? paymentToggle(key) : (selectedCardId = card.id, render()));
      }
      cards.append(chip);
    }
    for (const [kind, label] of [['house', '집 +3'], ['hotel', '호텔 +4']]) if (group[kind]) {
      const key = `building:${group.id}:${kind}`;
      const canPay = playerIndex === 0 && game.phase === 'payment' && humanLegal.some(move => move.assetKey === key);
      const building = document.createElement(canPay ? 'button' : 'span'); building.className = 'building-chip'; building.textContent = label;
      building.classList.toggle('selected', assetSelected(key));
      if (building instanceof HTMLButtonElement) { building.type = 'button'; building.addEventListener('click', () => paymentToggle(key)); }
      cards.append(building);
    }
    article.append(header, cards); element.append(article);
  }
  for (const card of player.looseBuildings) {
    const key = `loose:${card.id}`;
    const chip = document.createElement(playerIndex === 0 && game.phase === 'payment' ? 'button' : 'span');
    chip.className = 'property-chip'; chip.textContent = `${card.name} 대기`;
    chip.classList.toggle('selected', assetSelected(key));
    if (chip instanceof HTMLButtonElement) { chip.type = 'button'; chip.addEventListener('click', () => paymentToggle(key)); }
    element.append(chip);
  }
}

function renderHands() {
  const humanHand = $('#human-hand'); humanHand.replaceChildren();
  const humanMoves = legalMoves(game, 0);
  const canChoose = !locked && activePlayer() === 0 && ['action', 'discard'].includes(game.phase);
  for (const card of game.players[0].hand) {
    const interactive = canChoose && humanMoves.some(move => move.cardId === card.id);
    humanHand.append(cardElement(card, interactive));
  }
  $('#hand-count').textContent = `${game.players[0].hand.length}장`;
  const computerHand = $('#computer-hand'); computerHand.replaceChildren();
  for (const _card of game.players[1].hand) { const back = document.createElement('span'); back.className = 'card-back'; computerHand.append(back); }
}

function findCardName(cardId) {
  for (const player of game.players) {
    const card = [...player.hand, ...player.bank, ...player.groups.flatMap(group => group.cards)].find(item => item.id === cardId);
    if (card) return card.name;
  }
  return '카드';
}
function targetDescription(move) {
  const opponent = game.players[1];
  const own = game.players[0];
  const targetGroup = opponent.groups.find(group => group.id === move.targetGroupId);
  if (move.type === 'bank') return '은행에 넣기';
  if (move.type === 'property') return `${COLOR_NAMES[move.color]} ${move.groupId ? '세트에 추가' : '세트 시작'}`;
  if (move.type === 'discard') return '이 카드 버리기';
  if (move.type === 'reassignWild') return `${COLOR_NAMES[move.color]}으로 이동`;
  if (move.type !== 'action') return move.type;
  if (move.action === 'rent') return `${COLOR_NAMES[move.color]} 임대료${move.doubleCardIds?.length ? ` ×${2 ** move.doubleCardIds.length}` : ''}`;
  if (move.action === 'slyDeal') return `${groupLabel(targetGroup)}의 ${findCardName(move.targetCardId)} 빼앗기`;
  if (move.action === 'dealBreaker') return `${groupLabel(targetGroup)} 전체 빼앗기`;
  if (move.action === 'forcedDeal') {
    const ownGroup = own.groups.find(group => group.id === move.ownGroupId);
    return `${groupLabel(ownGroup)}의 ${findCardName(move.ownCardId)} ↔ ${groupLabel(targetGroup)}의 ${findCardName(move.targetCardId)}`;
  }
  if (move.action === 'house' || move.action === 'hotel') {
    const group = own.groups.find(candidate => candidate.id === move.targetGroupId);
    return `${groupLabel(group)}에 ${actionNames[move.action]} 놓기`;
  }
  return `${actionNames[move.action]} 사용`;
}
function paymentAssetLabel(key) {
  if (key.startsWith('bank:')) return `은행 ${findCardName(key.split(':')[1])}`;
  if (key.startsWith('property:')) return `부동산 ${findCardName(key.split(':')[2])}`;
  if (key.startsWith('building:')) return key.endsWith(':house') ? '집 카드' : '호텔 카드';
  return `대기 중 ${findCardName(key.split(':')[1])}`;
}

function renderActionConsole() {
  const options = $('#action-options'); options.replaceChildren();
  const title = $('#action-title'); const hint = $('#move-hint');
  const moves = legalMoves(game, 0);
  let visible = [];
  if (game.phase === 'payment' && game.payment.payer === 0) {
    title.textContent = `${game.payment.source} ${game.payment.amount}M 지불`;
    const selectedValue = moves.filter(move => move.type === 'paymentToggle' && game.payment.selected.includes(move.assetKey)).length;
    hint.textContent = `공개된 카드로 금액 이상을 선택하세요. 거스름돈은 없습니다. 선택 ${selectedValue}개.`;
    visible = moves;
  } else if (game.phase === 'discard' && game.current === 0) {
    title.textContent = '손패를 7장으로 정리'; hint.textContent = '버릴 카드를 선택하세요.';
    visible = selectedCardId ? moves.filter(move => move.cardId === selectedCardId) : [];
  } else if (game.phase === 'action' && game.current === 0) {
    title.textContent = selectedCardId ? findCardName(selectedCardId) : '카드를 선택하세요';
    hint.textContent = selectedCardId ? '가능한 사용 방법을 고르세요.' : '손패에서 카드를 선택하거나 차례를 끝낼 수 있습니다.';
    visible = selectedCardId ? moves.filter(move => move.cardId === selectedCardId) : moves.filter(move => move.type === 'reassignWild').slice(0, 4);
  } else {
    title.textContent = game.phase === 'response' ? '액션 응답 대기' : '컴퓨터 차례'; hint.textContent = '컴퓨터가 규칙에 따라 행동하고 있습니다.';
  }
  for (const candidate of visible) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'action-choice';
    if (candidate.type === 'paymentConfirm') { button.textContent = '선택한 카드로 지불'; button.classList.add('primary'); }
    else if (candidate.type === 'paymentToggle') { button.textContent = paymentAssetLabel(candidate.assetKey); button.classList.toggle('selected', game.payment.selected.includes(candidate.assetKey)); }
    else button.textContent = targetDescription(candidate);
    button.addEventListener('click', () => commitMove(candidate)); options.append(button);
  }
  const end = $('#end-turn-button');
  const endMove = moves.find(move => move.type === 'endTurn');
  end.disabled = !endMove || locked;
  end.onclick = endMove ? () => commitMove(endMove) : null;
}

function renderLog() {
  const list = $('#game-log'); list.replaceChildren();
  game.log.slice(-9).reverse().forEach(entry => { const item = document.createElement('li'); item.textContent = entry; list.append(item); });
}
function phaseLabel() {
  if (game.phase === 'gameOver') return '게임 종료';
  if (game.phase === 'payment') return game.payment.payer === 0 ? '내 지불' : '컴퓨터 지불';
  if (game.phase === 'response') return game.pending.responder === 0 ? '내 응답' : '컴퓨터 응답';
  if (game.phase === 'discard') return game.current === 0 ? '내 손패 정리' : '컴퓨터 손패 정리';
  return game.current === 0 ? '내 차례' : '컴퓨터 차례';
}

function render() {
  if (!game) return;
  if (selectedCardId && !game.players[0].hand.some(card => card.id === selectedCardId) && !game.players[0].groups.some(group => group.cards.some(card => card.id === selectedCardId))) selectedCardId = null;
  $('#computer-summary').textContent = summaryText(game.players[1]);
  $('#human-summary').textContent = summaryText(game.players[0]);
  $('#difficulty-label').textContent = difficultyNames[game.difficulty];
  $('#turn-label').textContent = phaseLabel();
  $('#plays-left').textContent = game.playsLeft;
  $('#deck-count').textContent = game.deck.length;
  $('#ai-thinking').hidden = !(locked && activePlayer() === 1);
  $('#cancel-selection').hidden = !selectedCardId;
  renderBank(1, $('#computer-bank')); renderBank(0, $('#human-bank'));
  renderProperties(1, $('#computer-properties')); renderProperties(0, $('#human-properties'));
  renderHands(); renderActionConsole(); renderLog();
}

function showHumanResponse() {
  const moves = legalMoves(game, 0);
  const options = $('#response-actions'); options.replaceChildren();
  $('#response-title').textContent = game.pending.active ? '컴퓨터의 액션을 받을까요?' : '‘그냥 안 돼’가 사용되었습니다';
  $('#response-copy').textContent = game.pending.active ? '받아들이거나 손패의 ‘그냥 안 돼’로 취소할 수 있습니다.' : '다시 ‘그냥 안 돼’를 내면 원래 액션이 다시 적용됩니다.';
  for (const candidate of moves) {
    const button = document.createElement('button'); button.type = 'button';
    button.className = candidate.choice === 'no' ? 'primary-button' : 'plain-button';
    button.textContent = candidate.choice === 'no' ? '그냥 안 돼 사용' : (game.pending.active ? '액션 받아들이기' : '취소 유지하기');
    button.addEventListener('click', () => { responseDialog.close(); commitMove(candidate); }); options.append(button);
  }
  if (!responseDialog.open) responseDialog.showModal();
}

function continueGame() {
  clearTimeout(timer);
  if (game.phase === 'gameOver') { showResult(); return; }
  if (activePlayer() === 0) {
    locked = false; render();
    if (game.phase === 'response') showHumanResponse();
    return;
  }
  locked = true; render();
  timer = setTimeout(() => {
    const actor = activePlayer();
    const candidate = chooseAiMove(game, game.difficulty, actor);
    if (!candidate) return;
    game = applyMove(game, candidate);
    selectedCardId = null;
    locked = false;
    render();
    continueGame();
  }, game.difficulty === 'hard' ? 700 : 520);
}

function commitMove(candidate) {
  if (locked) return;
  game = applyMove(game, candidate);
  if (candidate.type !== 'paymentToggle') selectedCardId = null;
  render();
  continueGame();
}
function showResult() {
  const human = summarizePlayer(game.players[0]); const computer = summarizePlayer(game.players[1]);
  $('#result-title').textContent = game.winner === 0 ? '승리했습니다!' : '컴퓨터가 승리했습니다';
  $('#result-summary').textContent = game.winner === 0 ? '서로 다른 색의 완성 세트 3개를 먼저 모았습니다.' : '다른 카드 조합과 방어 타이밍으로 다시 도전해 보세요.';
  $('#final-human').textContent = `${human.completedSets}세트`;
  $('#final-computer').textContent = `${computer.completedSets}세트`;
  if (!resultDialog.open) resultDialog.showModal();
}
function startGame(difficulty = null) {
  clearTimeout(timer);
  if (responseDialog.open) responseDialog.close(); if (resultDialog.open) resultDialog.close();
  const selectedDifficulty = difficulty ?? document.querySelector('input[name="difficulty"]:checked').value;
  game = createGame({ difficulty: selectedDifficulty }); selectedCardId = null; locked = false;
  startScreen.hidden = true; gameScreen.hidden = false; render(); continueGame();
}
function returnToSetup() {
  clearTimeout(timer); locked = false; selectedCardId = null;
  if (responseDialog.open) responseDialog.close(); if (resultDialog.open) resultDialog.close();
  gameScreen.hidden = true; startScreen.hidden = false;
}

$('#start-button').addEventListener('click', () => startGame());
$('#new-game-button').addEventListener('click', returnToSetup);
$('#cancel-selection').addEventListener('click', () => { selectedCardId = null; render(); });
$('#replay-button').addEventListener('click', () => startGame(game.difficulty));
$('#change-difficulty-button').addEventListener('click', returnToSetup);
responseDialog.addEventListener('cancel', event => event.preventDefault());
resultDialog.addEventListener('cancel', event => event.preventDefault());
document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.difficulty-option').forEach(option => option.classList.toggle('selected', option.contains(input)));
}));
