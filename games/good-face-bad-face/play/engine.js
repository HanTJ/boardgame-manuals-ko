const PLAYER_COUNT = 3;
const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

export function createDeck() {
  return [
    ...Array.from({ length: 10 }, (_, index) => ({ id: `good-${index + 1}`, type: 'good' })),
    ...Array.from({ length: 5 }, (_, index) => ({ id: `bad-${index + 1}`, type: 'bad' }))
  ];
}

function shuffle(cards, rng) {
  const result = cards.map(card => ({ ...card }));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createGame({ difficulty = 'normal', rng = Math.random } = {}) {
  if (!DIFFICULTIES.has(difficulty)) throw new Error('알 수 없는 난이도입니다.');
  const deck = shuffle(createDeck(), rng);
  const players = [
    { name: '나', kind: 'human', hand: deck.slice(0, 5), party: [] },
    { name: '컴퓨터 A', kind: 'ai', hand: deck.slice(5, 10), party: [] },
    { name: '컴퓨터 B', kind: 'ai', hand: deck.slice(10, 15), party: [] }
  ];
  return {
    phase: 'buildStack', difficulty, players, stack: [], stackOwner: 0,
    currentPlayer: 0, ownerReturned: false, ownerMayTakeBack: false,
    turn: 1, winnerIndex: null, log: ['내가 첫 스택 주인입니다. 카드를 골라 순서를 정하세요.']
  };
}

function orderedSelections(cards) {
  const result = [];
  const visit = (prefix, remaining) => {
    if (prefix.length) result.push({ type: 'buildStack', cardIds: prefix.map(card => card.id) });
    remaining.forEach((card, index) => visit([...prefix, card], [
      ...remaining.slice(0, index), ...remaining.slice(index + 1)
    ]));
  };
  visit([], cards);
  return result;
}

export function legalMoves(game, playerIndex) {
  if (!game || game.phase === 'gameOver' || playerIndex !== game.currentPlayer) return [];
  if (game.phase === 'buildStack') {
    if (playerIndex !== game.stackOwner) return [];
    const hand = game.players[playerIndex].hand;
    if (hand.length <= 5) return orderedSelections(hand);
    const candidates = [
      ...hand.map(card => ({ type: 'buildStack', cardIds: [card.id] })),
      { type: 'buildStack', cardIds: hand.map(card => card.id) },
      { type: 'buildStack', cardIds: [...hand].sort((a, b) => a.type.localeCompare(b.type)).map(card => card.id) },
      { type: 'buildStack', cardIds: [...hand].sort((a, b) => b.type.localeCompare(a.type)).map(card => card.id) }
    ];
    return candidates.filter((move, index) => candidates.findIndex(candidate =>
      candidate.cardIds.join('|') === move.cardIds.join('|')) === index);
  }
  if (game.phase !== 'decide' || game.stack.length === 0) return [];
  if (playerIndex === game.stackOwner && game.ownerReturned) {
    return game.ownerMayTakeBack ? [{ type: 'flip' }, { type: 'takeBack' }] : [{ type: 'flip' }];
  }
  return [{ type: 'flip' }, { type: 'pass' }];
}

function sameMove(first, second) {
  return first.type === second.type && (first.type !== 'buildStack' || (
    Array.isArray(second.cardIds) && first.cardIds.length === second.cardIds.length &&
    first.cardIds.every((id, index) => id === second.cardIds[index])
  ));
}

function nextIndex(index) {
  return (index + 1) % PLAYER_COUNT;
}

function beginNextTurn(game) {
  const previousOwner = game.stackOwner;
  let candidate = nextIndex(previousOwner);
  let found = false;
  for (let offset = 1; offset < PLAYER_COUNT; offset += 1) {
    const index = (previousOwner + offset) % PLAYER_COUNT;
    if (game.players[index].hand.length > 0) {
      candidate = index;
      found = true;
      break;
    }
  }
  const cardCount = game.stack.length + game.players.reduce((sum, player) =>
    sum + player.hand.length + player.party.length, 0);
  if (!found && cardCount === 15 && game.players[previousOwner].hand.length > 0) candidate = previousOwner;
  if (!game.players.some(player => player.hand.length > 0)) {
    const goodCounts = game.players.map(player => player.party.filter(card => card.type === 'good').length);
    game.stack = [];
    game.phase = 'gameOver';
    game.winnerIndex = goodCounts.indexOf(Math.max(...goodCounts));
    game.log.unshift('더 이상 스택을 만들 수 있는 손패가 없어 게임을 종료합니다.');
    return;
  }
  game.stack = [];
  game.stackOwner = candidate;
  game.currentPlayer = candidate;
  game.ownerReturned = false;
  game.ownerMayTakeBack = false;
  game.phase = 'buildStack';
  game.log.unshift(`${game.players[candidate].name}이(가) 새 스택 주인입니다.`);
}

function passToLeft(game) {
  const receiver = nextIndex(game.currentPlayer);
  game.currentPlayer = receiver;
  if (receiver === game.stackOwner) {
    game.ownerReturned = true;
    game.ownerMayTakeBack = false;
    game.log.unshift(`스택이 ${game.players[receiver].name}에게 돌아왔습니다. 반드시 한 장을 뒤집습니다.`);
  } else {
    game.log.unshift(`${game.players[receiver].name}에게 스택을 넘겼습니다.`);
  }
}

function resolveCard(game, playerIndex, card) {
  const player = game.players[playerIndex];
  if (card.type === 'good') {
    const badIndex = player.party.findIndex(item => item.type === 'bad');
    if (badIndex >= 0) {
      const [bad] = player.party.splice(badIndex, 1);
      player.hand.push(card, bad);
      game.log.unshift(`${player.name}이(가) 좋은 얼굴로 나쁜 얼굴 1장을 없애 둘 다 손으로 가져갑니다.`);
    } else {
      player.party.push(card);
      game.log.unshift(`${player.name}의 파티에 좋은 얼굴이 추가되었습니다.`);
      if (player.party.filter(item => item.type === 'good').length >= 4) {
        game.phase = 'gameOver';
        game.winnerIndex = playerIndex;
        game.log.unshift(`${player.name}이(가) 좋은 얼굴 4장을 모아 승리했습니다!`);
      }
    }
    return;
  }

  const goodCards = player.party.filter(item => item.type === 'good');
  if (goodCards.length) {
    player.hand.push(...goodCards, card);
    player.party = player.party.filter(item => item.type !== 'good');
    game.log.unshift(`${player.name}이(가) 나쁜 얼굴을 뒤집어 좋은 얼굴 전부를 손으로 가져갑니다.`);
  } else {
    player.party.push(card);
    game.log.unshift(`${player.name}의 파티에 나쁜 얼굴이 추가되었습니다.`);
    const badCards = player.party.filter(item => item.type === 'bad');
    if (badCards.length >= 3) {
      player.hand.push(...badCards);
      player.party = player.party.filter(item => item.type !== 'bad');
      game.log.unshift(`나쁜 얼굴 3장이 모여 ${player.name}의 손으로 돌아갑니다.`);
    }
  }
}

export function applyMove(game, move, playerIndex) {
  const moves = legalMoves(game, playerIndex);
  const handIds = new Set(game.players[playerIndex]?.hand.map(card => card.id) ?? []);
  const validCustomStack = game.phase === 'buildStack' && playerIndex === game.currentPlayer &&
    playerIndex === game.stackOwner && move.type === 'buildStack' && Array.isArray(move.cardIds) &&
    move.cardIds.length > 0 && new Set(move.cardIds).size === move.cardIds.length &&
    move.cardIds.every(id => handIds.has(id));
  if (!validCustomStack && !moves.some(candidate => sameMove(candidate, move))) throw new Error('허용되지 않은 행동입니다.');
  const next = structuredClone(game);
  next.turn += 1;

  if (move.type === 'buildStack') {
    const hand = next.players[playerIndex].hand;
    next.stack = move.cardIds.map(id => hand.find(card => card.id === id));
    const selected = new Set(move.cardIds);
    next.players[playerIndex].hand = hand.filter(card => !selected.has(card.id));
    next.phase = 'decide';
    next.currentPlayer = nextIndex(playerIndex);
    next.ownerReturned = false;
    next.ownerMayTakeBack = false;
    next.log.unshift(`${next.players[playerIndex].name}이(가) 카드 ${next.stack.length}장으로 비밀 스택을 만들었습니다.`);
    return next;
  }

  if (move.type === 'pass') {
    passToLeft(next);
    return next;
  }

  if (move.type === 'takeBack') {
    next.players[playerIndex].hand.push(...next.stack);
    next.log.unshift(`${next.players[playerIndex].name}이(가) 남은 스택 ${next.stack.length}장을 회수합니다.`);
    next.stack = [];
    beginNextTurn(next);
    return next;
  }

  const wasReturnedOwner = playerIndex === next.stackOwner && next.ownerReturned;
  const flipped = next.stack.shift();
  resolveCard(next, playerIndex, flipped);
  if (next.phase === 'gameOver') return next;
  if (next.stack.length === 0) {
    beginNextTurn(next);
    return next;
  }
  if (flipped.type === 'bad') {
    if (wasReturnedOwner) {
      next.players[playerIndex].hand.push(...next.stack);
      next.log.unshift(`${next.players[playerIndex].name}이(가) 남은 스택을 회수하고 차례를 마칩니다.`);
      next.stack = [];
      beginNextTurn(next);
    } else {
      passToLeft(next);
    }
    return next;
  }
  if (wasReturnedOwner) next.ownerMayTakeBack = true;
  return next;
}

function hiddenCard() {
  return { id: null, type: null };
}

export function projectObservation(game, playerIndex) {
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex >= game.players.length) {
    throw new Error('알 수 없는 플레이어입니다.');
  }
  return {
    phase: game.phase,
    difficulty: game.difficulty,
    playerIndex,
    currentPlayer: game.currentPlayer,
    stackOwner: game.stackOwner,
    ownerReturned: game.ownerReturned,
    ownerMayTakeBack: game.ownerMayTakeBack,
    turn: game.turn,
    winnerIndex: game.winnerIndex,
    players: game.players.map((player, index) => ({
      name: player.name,
      kind: player.kind,
      hand: index === playerIndex ? player.hand.map(card => ({ ...card })) : player.hand.map(hiddenCard),
      party: player.party.map(card => ({ ...card }))
    })),
    stack: game.stack.map(hiddenCard),
    knownStack: playerIndex === game.stackOwner ? game.stack.map(card => ({ ...card })) : null,
    log: [...game.log],
    moves: legalMoves(game, playerIndex)
  };
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function buildMove(observation, moves, rng) {
  if (observation.difficulty === 'easy') return randomItem(moves, rng);
  const handById = new Map(observation.players[observation.playerIndex].hand.map(card => [card.id, card]));
  const targetLength = observation.difficulty === 'normal' ? Math.min(2, handById.size) : handById.size;
  const exact = moves.filter(move => move.cardIds.length === targetLength);
  const sized = exact.length ? exact : moves;
  const score = move => {
    const cards = move.cardIds.map(id => handById.get(id));
    let value = cards[0]?.type === 'bad' ? 4 : 0;
    if (observation.difficulty === 'hard') {
      value += cards.reduce((sum, card, index) => sum + (card.type === 'good' ? index + 1 : 0), 0);
    }
    return value;
  };
  const bestScore = Math.max(...sized.map(score));
  return randomItem(sized.filter(move => score(move) === bestScore), rng);
}

function decisionMove(observation, moves, rng) {
  const flip = moves.find(move => move.type === 'flip');
  const stop = moves.find(move => move.type === 'takeBack' || move.type === 'pass');
  if (!stop) return flip;
  if (observation.difficulty === 'easy') return randomItem(moves, rng);

  const player = observation.players[observation.playerIndex];
  const goodParty = player.party.filter(card => card.type === 'good').length;
  const knownTop = observation.knownStack?.[0];
  if (knownTop) {
    if (knownTop.type === 'good') return flip;
    if (observation.ownerReturned && observation.ownerMayTakeBack) return stop;
  }
  const visible = observation.players.flatMap(item => item.party);
  const ownHand = player.hand;
  const knownGood = [...visible, ...ownHand].filter(card => card.type === 'good').length;
  const knownBad = [...visible, ...ownHand].filter(card => card.type === 'bad').length;
  const unknownGood = 10 - knownGood;
  const unknownBad = 5 - knownBad;
  const goodChance = unknownGood / Math.max(1, unknownGood + unknownBad);
  const threshold = observation.difficulty === 'hard' ? (goodParty >= 3 ? 0.35 : 0.62) : 0.68;
  return goodChance >= threshold || rng() < (observation.difficulty === 'normal' ? 0.18 : 0.06) ? flip : stop;
}

export function chooseAiMove(observation, rng = Math.random) {
  const moves = observation.moves ?? [];
  if (!moves.length) return null;
  if (moves[0].type === 'buildStack') return buildMove(observation, moves, rng);
  return decisionMove(observation, moves, rng);
}
