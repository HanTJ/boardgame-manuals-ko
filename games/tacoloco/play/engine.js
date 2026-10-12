const NUMBER_COUNTS = new Map([
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 6], [7, 4], [8, 4], [9, 4]
]);

export function createDeck() {
  const deck = [];
  for (const [value, count] of NUMBER_COUNTS) {
    for (let index = 0; index < count; index += 1) {
      deck.push({ id: `n${value}-${index + 1}`, kind: 'number', value });
    }
  }
  for (let index = 0; index < 6; index += 1) {
    deck.push({ id: `legendary-${index + 1}`, kind: 'legendary' });
    deck.push({ id: `lonesome-${index + 1}`, kind: 'lonesome' });
  }
  return deck;
}

function shuffle(cards, rng = Math.random) {
  for (let index = cards.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [cards[index], cards[target]] = [cards[target], cards[index]];
  }
  return cards;
}

export function createGame({ difficulty = 'normal', rng = Math.random, firstPlayer } = {}) {
  const deck = shuffle(createDeck(), rng);
  const players = [
    { name: '나', hand: [], collected: [] },
    { name: '컴퓨터', hand: [], collected: [] }
  ];
  for (let round = 0; round < 3; round += 1) {
    players.forEach(player => player.hand.push(deck.pop()));
  }

  const returnedSpecials = [];
  let starter = deck.pop();
  while (starter.kind !== 'number') {
    returnedSpecials.push(starter);
    starter = deck.pop();
  }
  deck.push(...returnedSpecials);
  shuffle(deck, rng);

  const current = firstPlayer ?? (rng() < 0.5 ? 0 : 1);
  return {
    players,
    deck,
    piles: [{ id: 'pile-1', cards: [starter], sum: starter.value }],
    current,
    lastNumber: starter.value,
    pendingLegendary: null,
    nextPileId: 2,
    turn: 1,
    difficulty,
    log: [`첫 타코는 ${starter.value}에서 시작합니다.`, `${players[current].name}의 차례입니다.`],
    gameOver: false,
    winners: []
  };
}

function targetIds(state, card) {
  if (card.kind === 'number' && card.value === state.lastNumber) return [null];
  if (state.piles.length === 0) return [null];
  return state.piles.map(pile => pile.id);
}

export function legalMoves(state, playerIndex = state.current) {
  if (state.gameOver || state.pendingLegendary || playerIndex !== state.current) return [];
  return state.players[playerIndex].hand.flatMap(card =>
    targetIds(state, card).map(targetPileId => ({ cardId: card.id, targetPileId }))
  );
}

function drawCard(state, playerIndex) {
  if (state.deck.length) state.players[playerIndex].hand.push(state.deck.pop());
}

function removePile(state, pileId) {
  const index = state.piles.findIndex(pile => pile.id === pileId);
  if (index < 0) throw new Error('타코를 찾을 수 없습니다.');
  return state.piles.splice(index, 1)[0];
}

function finishTurn(state, playerIndex) {
  drawCard(state, playerIndex);
  state.turn += 1;
  const scored = scoreGame(state);
  if (scored.gameOver) return scored;
  for (let offset = 1; offset <= scored.players.length; offset += 1) {
    const candidate = (playerIndex + offset) % scored.players.length;
    if (scored.players[candidate].hand.length) {
      scored.current = candidate;
      break;
    }
  }
  scored.log.push(`${scored.players[scored.current].name}의 차례입니다.`);
  return scored;
}

export function playCard(source, move) {
  const state = structuredClone(source);
  const playerIndex = state.current;
  const allowed = legalMoves(state, playerIndex).some(candidate =>
    candidate.cardId === move.cardId && candidate.targetPileId === move.targetPileId
  );
  if (!allowed) throw new Error('규칙상 낼 수 없는 카드입니다.');

  const hand = state.players[playerIndex].hand;
  const cardIndex = hand.findIndex(card => card.id === move.cardId);
  const [card] = hand.splice(cardIndex, 1);
  let pile;
  if (move.targetPileId === null) {
    pile = { id: `pile-${state.nextPileId}`, cards: [], sum: 0 };
    state.nextPileId += 1;
    state.piles.push(pile);
  } else {
    pile = state.piles.find(candidate => candidate.id === move.targetPileId);
  }
  pile.cards.push(card);

  if (card.kind === 'number') {
    pile.sum += card.value;
    state.lastNumber = card.value;
    state.log.push(`${state.players[playerIndex].name}: 숫자 ${card.value} → 합계 ${pile.sum}`);
    if (pile.sum === 11) {
      const completed = removePile(state, pile.id);
      const recipient = (playerIndex + 1) % state.players.length;
      state.players[recipient].collected.push(...completed.cards);
      state.log.push(`완벽한 타코! ${state.players[recipient].name}에게 ${completed.cards.length}장을 건넸습니다.`);
    } else if (pile.sum > 11) {
      const burst = removePile(state, pile.id);
      state.players[playerIndex].collected.push(...burst.cards);
      state.log.push(`타코가 터졌습니다. ${state.players[playerIndex].name}이(가) ${burst.cards.length}장을 가져갑니다.`);
    }
    return finishTurn(state, playerIndex);
  }

  state.lastNumber = null;
  if (card.kind === 'lonesome') {
    pile.sum = 0;
    state.log.push(`${state.players[playerIndex].name}: 외로운 타코 → 합계 0`);
    return finishTurn(state, playerIndex);
  }

  pile.sum = 11;
  state.pendingLegendary = { playerIndex, pileId: pile.id };
  state.log.push(`${state.players[playerIndex].name}: 전설의 타코! 대응 기회가 열렸습니다.`);
  return state;
}

export function resolveLegendary(source, defend) {
  const state = structuredClone(source);
  if (!state.pendingLegendary) throw new Error('해결할 전설의 타코가 없습니다.');
  const { playerIndex, pileId } = state.pendingLegendary;
  const defenderIndex = (playerIndex + 1) % state.players.length;
  const pile = state.piles.find(candidate => candidate.id === pileId);

  if (defend) {
    const defenseIndex = state.players[defenderIndex].hand.findIndex(card => card.kind === 'lonesome');
    if (defenseIndex < 0) throw new Error('외로운 타코가 없어 대응할 수 없습니다.');
    const [defenseCard] = state.players[defenderIndex].hand.splice(defenseIndex, 1);
    pile.cards.push(defenseCard);
    const defended = removePile(state, pileId);
    state.players[playerIndex].collected.push(...defended.cards);
    drawCard(state, defenderIndex);
    state.log.push(`${state.players[defenderIndex].name}이(가) 외로운 타코로 방어했습니다. ${state.players[playerIndex].name}이(가) ${defended.cards.length}장을 가져갑니다.`);
  } else {
    const completed = removePile(state, pileId);
    state.players[defenderIndex].collected.push(...completed.cards);
    state.log.push(`${state.players[defenderIndex].name}이(가) 전설의 타코 ${completed.cards.length}장을 받았습니다.`);
  }

  state.pendingLegendary = null;
  drawCard(state, playerIndex);
  state.turn += 1;
  const scored = scoreGame(state);
  if (scored.gameOver) return scored;
  scored.current = scored.players[defenderIndex].hand.length ? defenderIndex : playerIndex;
  scored.log.push(`${scored.players[scored.current].name}의 차례입니다.`);
  return scored;
}

export function scoreGame(source) {
  const state = structuredClone(source);
  if (state.pendingLegendary || state.deck.length || state.players.some(player => player.hand.length)) return state;
  const scores = state.players.map(player => player.collected.length);
  const best = Math.min(...scores);
  state.gameOver = true;
  state.winners = scores.flatMap((score, index) => score === best ? [index] : []);
  state.log.push(`게임 종료: ${state.winners.map(index => state.players[index].name).join(', ')} 승리`);
  return state;
}

function scoreMove(state, move) {
  const card = state.players[state.current].hand.find(candidate => candidate.id === move.cardId);
  const pile = move.targetPileId === null ? { sum: 0, cards: [] } : state.piles.find(candidate => candidate.id === move.targetPileId);
  const pileSize = pile.cards.length + 1;
  if (card.kind === 'legendary') return 82 + pileSize * 4;
  if (card.kind === 'lonesome') return pile.sum >= 8 ? 35 + pileSize : 2 - pile.sum;
  const total = move.targetPileId === null ? card.value : pile.sum + card.value;
  if (total === 11) return 120 + pileSize * 6;
  if (total > 11) return -120 - pileSize * 8;
  return 28 - Math.abs(11 - total) + pileSize;
}

export function chooseAiMove(state, difficulty = state.difficulty ?? 'normal', rng = Math.random) {
  const moves = legalMoves(state, state.current);
  if (!moves.length) return null;
  if (difficulty === 'easy') return moves[Math.floor(rng() * moves.length)];
  const ranked = moves.map(move => ({ move, score: scoreMove(state, move) })).sort((a, b) => b.score - a.score);
  if (difficulty === 'normal') {
    const pool = ranked.slice(0, Math.min(3, ranked.length));
    return pool[Math.floor(rng() * pool.length)].move;
  }
  return ranked[0].move;
}

export function shouldAiDefend(state, difficulty = state.difficulty ?? 'normal', rng = Math.random) {
  if (!state.pendingLegendary) return false;
  const defenderIndex = (state.pendingLegendary.playerIndex + 1) % state.players.length;
  if (!state.players[defenderIndex].hand.some(card => card.kind === 'lonesome')) return false;
  const pile = state.piles.find(candidate => candidate.id === state.pendingLegendary.pileId);
  if (difficulty === 'easy') return rng() < 0.35;
  if (difficulty === 'normal') return pile.cards.length >= 3;
  return true;
}
