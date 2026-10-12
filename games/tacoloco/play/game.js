import {
  chooseAiMove,
  createGame,
  legalMoves,
  playCard,
  resolveLegendary,
  shouldAiDefend
} from './engine.js';

const $ = selector => document.querySelector(selector);
const startScreen = $('#start-screen');
const gameScreen = $('#game-screen');
const pilesElement = $('#piles');
const humanHand = $('#human-hand');
const computerHand = $('#computer-hand');
const moveHint = $('#move-hint');
const aiThinking = $('#ai-thinking');
const defenseDialog = $('#defense-dialog');
const resultDialog = $('#result-dialog');
const cardTemplate = $('#card-template');

const difficultyNames = { easy: '쉬움', normal: '보통', hard: '어려움' };
let game = null;
let selectedCardId = null;
let timer = null;
let locked = false;

function cardText(card) {
  if (card.kind === 'legendary') return { name: '전설의', value: '11', mark: 'LEGENDARY' };
  if (card.kind === 'lonesome') return { name: '외로운', value: '0', mark: 'LONESOME' };
  return { name: '재료', value: String(card.value), mark: 'TACO' };
}

function cardElement(card, { interactive = false, selected = false } = {}) {
  const element = cardTemplate.content.firstElementChild.cloneNode(true);
  const text = cardText(card);
  element.dataset.cardId = card.id;
  element.dataset.kind = card.kind;
  element.querySelector('.card-name').textContent = text.name;
  element.querySelector('.card-value').textContent = text.value;
  element.querySelector('.card-mark').textContent = text.mark;
  element.classList.toggle('selected', selected);
  element.disabled = !interactive;
  if (interactive) element.addEventListener('click', () => selectCard(card.id));
  return element;
}

function renderHands() {
  humanHand.replaceChildren();
  const canPlay = game.current === 0 && !game.pendingLegendary && !game.gameOver && !locked;
  game.players[0].hand.forEach(card => humanHand.append(cardElement(card, {
    interactive: canPlay,
    selected: selectedCardId === card.id
  })));

  computerHand.replaceChildren();
  game.players[1].hand.forEach(() => {
    const back = document.createElement('span');
    back.className = 'card-back';
    back.setAttribute('aria-label', '뒤집힌 카드');
    computerHand.append(back);
  });
}

function pileCardChip(card) {
  const chip = document.createElement('span');
  chip.className = `pile-chip ${card.kind}`;
  chip.textContent = card.kind === 'number' ? card.value : card.kind === 'legendary' ? '전설' : '외로운';
  return chip;
}

function renderPiles() {
  pilesElement.replaceChildren();
  if (!game.piles.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-table';
    empty.innerHTML = '<strong>테이블이 비었습니다</strong><span>다음 카드가 새 타코의 바닥이 됩니다.</span>';
    pilesElement.append(empty);
    return;
  }

  const allowedTargets = selectedCardId
    ? legalMoves(game, 0).filter(move => move.cardId === selectedCardId).map(move => move.targetPileId)
    : [];

  game.piles.forEach((pile, index) => {
    const article = document.createElement('article');
    article.className = 'taco-pile';
    const visibleCards = pile.cards;
    const stack = document.createElement('div');
    stack.className = 'pile-stack';
    visibleCards.forEach(pileCard => stack.append(pileCardChip(pileCard)));
    const canTarget = allowedTargets.includes(pile.id);
    article.innerHTML = `<div class="pile-meta"><span>타코 ${index + 1}</span><strong>합계 ${pile.sum}</strong><small>${pile.cards.length}장</small></div>`;
    article.prepend(stack);
    if (canTarget) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'place-button';
      button.textContent = '여기에 내기';
      button.addEventListener('click', () => commitMove({ cardId: selectedCardId, targetPileId: pile.id }));
      article.append(button);
      article.classList.add('available');
    }
    pilesElement.append(article);
  });
}

function renderLog() {
  const list = $('#game-log');
  list.replaceChildren();
  game.log.slice(-6).reverse().forEach(entry => {
    const item = document.createElement('li');
    item.textContent = entry;
    list.append(item);
  });
}

function render() {
  $('#human-score').textContent = `${game.players[0].collected.length}장`;
  $('#computer-score').textContent = `${game.players[1].collected.length}장`;
  $('#deck-count').textContent = game.deck.length;
  $('#difficulty-label').textContent = difficultyNames[game.difficulty];
  $('#turn-label').textContent = game.gameOver ? '게임 종료' : game.pendingLegendary ? '전설의 타코 대응' : game.current === 0 ? '내 차례' : '컴퓨터 차례';
  $('#cancel-selection').hidden = !selectedCardId;
  aiThinking.hidden = !(locked && game.current === 1);

  if (game.pendingLegendary) moveHint.textContent = '전설의 타코에 대응할 수 있습니다.';
  else if (game.current === 1) moveHint.textContent = '컴퓨터가 카드를 고르고 있습니다.';
  else if (selectedCardId) moveHint.textContent = '카드를 놓을 타코를 선택하세요.';
  else moveHint.textContent = '손에서 낼 카드를 선택하세요.';

  renderHands();
  renderPiles();
  renderLog();
}

function selectCard(cardId) {
  if (locked || game.current !== 0) return;
  const moves = legalMoves(game, 0).filter(move => move.cardId === cardId);
  if (moves.length === 1) {
    commitMove(moves[0]);
    return;
  }
  selectedCardId = cardId;
  render();
}

function commitMove(move) {
  if (locked) return;
  game = playCard(game, move);
  selectedCardId = null;
  render();
  continueGame();
}

function waitForAction(action, delay = 650) {
  locked = true;
  render();
  clearTimeout(timer);
  timer = setTimeout(() => {
    locked = false;
    action();
  }, delay);
}

function continueGame() {
  if (game.gameOver) {
    showResult();
    return;
  }
  if (game.pendingLegendary) {
    const defender = (game.pendingLegendary.playerIndex + 1) % 2;
    if (defender === 0) {
      const canDefend = game.players[0].hand.some(card => card.kind === 'lonesome');
      if (canDefend) defenseDialog.showModal();
      else waitForAction(() => {
        game = resolveLegendary(game, false);
        render();
        continueGame();
      }, 450);
    } else {
      waitForAction(() => {
        const defend = shouldAiDefend(game, game.difficulty);
        game = resolveLegendary(game, defend);
        render();
        continueGame();
      }, 750);
    }
    return;
  }
  if (game.current === 1) {
    waitForAction(() => {
      const move = chooseAiMove(game, game.difficulty);
      if (move) game = playCard(game, move);
      render();
      continueGame();
    }, game.difficulty === 'hard' ? 850 : 650);
  }
}

function showResult() {
  const human = game.players[0].collected.length;
  const computer = game.players[1].collected.length;
  $('#final-human').textContent = `${human}장`;
  $('#final-computer').textContent = `${computer}장`;
  if (game.winners.length === 2) {
    $('#result-title').textContent = '무승부입니다';
    $('#result-summary').textContent = '두 플레이어가 같은 수의 카드를 가져갔습니다.';
  } else if (game.winners[0] === 0) {
    $('#result-title').textContent = '승리했습니다!';
    $('#result-summary').textContent = '컴퓨터보다 타코를 적게 가져갔습니다.';
  } else {
    $('#result-title').textContent = '컴퓨터가 승리했습니다';
    $('#result-summary').textContent = '가져간 카드를 줄일 수 있는 다른 선택을 찾아보세요.';
  }
  resultDialog.showModal();
}

function startGame() {
  const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
  clearTimeout(timer);
  defenseDialog.close();
  resultDialog.close();
  locked = false;
  selectedCardId = null;
  game = createGame({ difficulty });
  startScreen.hidden = true;
  gameScreen.hidden = false;
  render();
  continueGame();
}

function returnToSetup() {
  clearTimeout(timer);
  locked = false;
  selectedCardId = null;
  if (defenseDialog.open) defenseDialog.close();
  if (resultDialog.open) resultDialog.close();
  gameScreen.hidden = true;
  startScreen.hidden = false;
}

$('#start-button').addEventListener('click', startGame);
$('#new-game-button').addEventListener('click', returnToSetup);
$('#cancel-selection').addEventListener('click', () => { selectedCardId = null; render(); });
$('#defend-button').addEventListener('click', () => {
  defenseDialog.close();
  game = resolveLegendary(game, true);
  render();
  continueGame();
});
$('#pass-button').addEventListener('click', () => {
  defenseDialog.close();
  game = resolveLegendary(game, false);
  render();
  continueGame();
});
$('#replay-button').addEventListener('click', () => {
  resultDialog.close();
  const difficulty = game.difficulty;
  game = createGame({ difficulty });
  selectedCardId = null;
  render();
  continueGame();
});
$('#change-difficulty-button').addEventListener('click', returnToSetup);
defenseDialog.addEventListener('cancel', event => event.preventDefault());

document.querySelectorAll('input[name="difficulty"]').forEach(input => input.addEventListener('change', () => {
  document.querySelectorAll('.difficulty-option').forEach(option => option.classList.toggle('selected', option.contains(input)));
}));
