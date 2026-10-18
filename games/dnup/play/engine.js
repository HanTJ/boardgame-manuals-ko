const BASE_PAIRS = [
  [2, 4], [2, 4], [3, 4], [1, 5], [2, 5], [2, 5], [3, 5],
  [1, 6], [2, 6], [2, 6], [3, 6], [4, 6], [1, 7], [2, 7],
  [3, 7], [4, 7], [5, 7], [6, 7], [1, 8], [3, 8], [4, 8],
  [5, 8], [1, 9], [1, 9], [3, 9], [1, 10]
];

const EXTRA_PAIRS = {
  3: [[1, 8], [2, 10], [3, 6], [4, 5]],
  4: [[1, 6], [1, 7], [2, 8], [2, 9], [3, 4], [3, 5]],
  5: [[3, 10], [4, 9], [5, 8], [6, 7]]
};

function definitions() {
  const cards = [];
  let serial = 0;
  const add = (pairs, minPlayers) => {
    for (const [value0, value1] of pairs) {
      cards.push({
        id: `dnup-${String(serial += 1).padStart(2, '0')}`,
        value0,
        value1,
        rotated: false,
        minPlayers,
        starred: minPlayers === 2 && value0 === 1 && value1 === 5
      });
    }
  };
  add(BASE_PAIRS, 2);
  add(EXTRA_PAIRS[3], 3);
  add(EXTRA_PAIRS[4], 4);
  add(EXTRA_PAIRS[5], 5);
  return cards;
}

export function createOfficialDeck() {
  return definitions();
}

export function createDeck(playerCount = 2) {
  if (![2, 3, 4, 5].includes(playerCount)) throw new Error('지원하지 않는 플레이어 수입니다.');
  return definitions().filter(card => card.minPlayers <= playerCount);
}

export function activeValue(card) {
  return card.rotated ? card.value1 : card.value0;
}

function shuffle(items, rng) {
  const output = structuredClone(items);
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function roundState({ deck, wins, round, difficulty }) {
  const shuffled = deck ?? createDeck(2);
  const hands = [[], []];
  shuffled.forEach((card, index) => hands[index % 2].push(card));
  const starter = hands.findIndex(hand => hand.some(card => card.starred));
  return {
    phase: 'round',
    players: [
      { name: '나', hand: hands[0], roundWins: wins[0] },
      { name: '컴퓨터', hand: hands[1], roundWins: wins[1] }
    ],
    areas: [[null, null], [null, null]],
    discard: [],
    activePlayer: starter,
    activeArea: 1,
    starter,
    round,
    turn: 1,
    difficulty,
    roundWinner: null,
    matchWinner: null,
    log: [`${round}라운드: ${starter === 0 ? '당신' : '컴퓨터'}이(가) ★ 카드를 가져 2번 구역부터 시작합니다.`]
  };
}

export function createGame({ rng = Math.random, difficulty = 'normal' } = {}) {
  return roundState({ deck: shuffle(createDeck(2), rng), wins: [0, 0], round: 1, difficulty });
}

function allCards(game) {
  return [
    ...game.players.flatMap(player => player.hand),
    ...game.areas.flat().filter(Boolean).flatMap(area => area.cards),
    ...game.discard
  ];
}

export function startNextRound(source, rng = Math.random) {
  if (source.phase !== 'roundOver') throw new Error('종료된 라운드에서만 다음 라운드를 시작할 수 있습니다.');
  const deck = allCards(source).map(card => ({ ...card }));
  if (deck.length !== 26 || new Set(deck.map(card => card.id)).size !== 26) throw new Error('카드 보존 상태가 올바르지 않습니다.');
  return roundState({
    deck: shuffle(deck, rng),
    wins: source.players.map(player => player.roundWins),
    round: source.round + 1,
    difficulty: source.difficulty
  });
}

function combinations(items) {
  const output = [];
  const total = 2 ** items.length;
  for (let mask = 1; mask < total; mask += 1) {
    const choice = [];
    for (let bit = 0; bit < items.length; bit += 1) if (mask & (2 ** bit)) choice.push(items[bit]);
    output.push(choice);
  }
  return output;
}

function sameMove(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function occupiedAfterCleanup(game) {
  const occupied = [];
  for (let player = 0; player < 2; player += 1) {
    for (let area = 0; area < 2; area += 1) {
      if (player === game.activePlayer && area === game.activeArea) continue;
      const played = game.areas[player][area];
      if (played) occupied.push({ ...played, owner: player, area });
    }
  }
  return occupied;
}

function setValue(played) {
  return activeValue(played.cards[0]);
}

function beatsEverySameSize(value, size, occupied, excluded = null) {
  return occupied
    .filter(item => !(excluded && item.owner === excluded.owner && item.area === excluded.area))
    .filter(item => item.cards.length === size)
    .every(item => value > setValue(item));
}

export function legalMoves(game) {
  if (game.phase !== 'round') return [];
  const actor = game.activePlayer;
  const hand = game.players[actor].hand;
  if (!hand.length) return [];
  const occupied = occupiedAfterCleanup(game);
  const moves = [];
  const groups = new Map();
  for (const card of hand) {
    const value = activeValue(card);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(card);
  }
  for (const [value, cards] of groups) {
    for (const choice of combinations(cards)) {
      if (beatsEverySameSize(value, choice.length, occupied)) {
        moves.push({ type: 'playSet', cardIds: choice.map(card => card.id) });
      }
    }
  }

  const opponent = 1 - actor;
  for (let area = 0; area < 2; area += 1) {
    const target = game.areas[opponent][area];
    if (!target) continue;
    const value = setValue(target);
    const newSize = target.cards.length + 1;
    for (const held of hand) {
      if (activeValue(held) === value && beatsEverySameSize(value, newSize, occupied, { owner: opponent, area })) {
        moves.push({ type: 'addCard', cardId: held.id, targetPlayer: opponent, targetArea: area });
      }
    }
    moves.push({ type: 'takeSet', targetPlayer: opponent, targetArea: area });
  }
  moves.push({ type: 'rotateHand' });
  return moves;
}

function removeCard(hand, id) {
  const index = hand.findIndex(card => card.id === id);
  if (index < 0) throw new Error('손에 없는 카드입니다.');
  return hand.splice(index, 1)[0];
}

function rotate(card) {
  return { ...card, rotated: !card.rotated };
}

function cleanupActiveArea(game) {
  const played = game.areas[game.activePlayer][game.activeArea];
  if (played) {
    game.discard.push(...played.cards);
    game.areas[game.activePlayer][game.activeArea] = null;
  }
}

function resolveConflicts(game, candidateOwner, candidateArea) {
  const candidate = game.areas[candidateOwner][candidateArea];
  const value = setValue(candidate);
  const size = candidate.cards.length;
  for (let player = 0; player < 2; player += 1) {
    for (let area = 0; area < 2; area += 1) {
      if (player === candidateOwner && area === candidateArea) continue;
      const played = game.areas[player][area];
      if (!played || played.cards.length !== size) continue;
      if (setValue(played) >= value) throw new Error('충돌에서 이길 수 없는 행동입니다.');
      game.players[player].hand.push(...played.cards.map(rotate));
      game.areas[player][area] = null;
      game.log.unshift(`${player === 0 ? '당신' : '컴퓨터'}의 ${area + 1}번 구역 세트가 돌아왔습니다.`);
    }
  }
}

function moveLabel(move, count = 0, value = null) {
  if (move.type === 'playSet') return `값 ${value} · ${count}장 세트를 냈습니다.`;
  if (move.type === 'addCard') return `상대 세트에 값 ${value} 카드 1장을 추가했습니다.`;
  if (move.type === 'takeSet') return `상대 세트 ${count}장을 회전해 가져왔습니다.`;
  return '손의 모든 카드를 회전했습니다.';
}

function advance(game) {
  if (game.activeArea === 0) game.activeArea = 1;
  else {
    game.activePlayer = 1 - game.activePlayer;
    game.activeArea = 0;
    game.turn += 1;
  }
}

export function applyMove(source, move) {
  if (!legalMoves(source).some(candidate => sameMove(candidate, move))) throw new Error('허용되지 않은 행동입니다.');
  const game = structuredClone(source);
  const actor = game.activePlayer;
  const actorName = actor === 0 ? '당신' : '컴퓨터';
  cleanupActiveArea(game);
  const hand = game.players[actor].hand;

  if (move.type === 'playSet') {
    const cards = move.cardIds.map(id => removeCard(hand, id));
    game.areas[actor][game.activeArea] = { owner: actor, area: game.activeArea, cards };
    resolveConflicts(game, actor, game.activeArea);
    game.log.unshift(`${actorName}: ${moveLabel(move, cards.length, activeValue(cards[0]))}`);
  } else if (move.type === 'addCard') {
    const donated = removeCard(hand, move.cardId);
    const target = game.areas[move.targetPlayer][move.targetArea];
    target.cards.push(donated);
    resolveConflicts(game, move.targetPlayer, move.targetArea);
    game.log.unshift(`${actorName}: ${moveLabel(move, 1, activeValue(donated))}`);
  } else if (move.type === 'takeSet') {
    const target = game.areas[move.targetPlayer][move.targetArea];
    game.areas[move.targetPlayer][move.targetArea] = null;
    hand.push(...target.cards.map(rotate));
    game.log.unshift(`${actorName}: ${moveLabel(move, target.cards.length)}`);
  } else if (move.type === 'rotateHand') {
    game.players[actor].hand = hand.map(rotate);
    game.log.unshift(`${actorName}: ${moveLabel(move)}`);
  }

  if (game.players[actor].hand.length === 0) {
    game.players[actor].roundWins += 1;
    game.roundWinner = actor;
    game.log.unshift(`${actorName}이(가) ${game.round}라운드에서 승리했습니다.`);
    if (game.players[actor].roundWins >= 2) {
      game.phase = 'matchOver';
      game.matchWinner = actor;
    } else {
      game.phase = 'roundOver';
    }
    return game;
  }
  advance(game);
  return game;
}

function publicArea(area) {
  return area ? { owner: area.owner, area: area.area, cards: structuredClone(area.cards) } : null;
}

export function projectObservation(game, playerIndex) {
  if (playerIndex !== game.activePlayer) throw new Error('현재 플레이어의 관찰만 만들 수 있습니다.');
  const opponentIndex = 1 - playerIndex;
  return {
    phase: game.phase,
    viewer: playerIndex,
    activePlayer: game.activePlayer,
    activeArea: game.activeArea,
    starter: game.starter,
    round: game.round,
    difficulty: game.difficulty,
    self: {
      hand: structuredClone(game.players[playerIndex].hand),
      roundWins: game.players[playerIndex].roundWins
    },
    opponent: {
      handCount: game.players[opponentIndex].hand.length,
      roundWins: game.players[opponentIndex].roundWins
    },
    areas: game.areas.map(row => row.map(publicArea)),
    discardCount: game.discard.length
  };
}

function stateFromObservation(observation) {
  const players = [
    { name: '나', hand: [], roundWins: 0 },
    { name: '컴퓨터', hand: [], roundWins: 0 }
  ];
  players[observation.viewer] = {
    name: observation.viewer === 0 ? '나' : '컴퓨터',
    hand: structuredClone(observation.self.hand),
    roundWins: observation.self.roundWins
  };
  players[1 - observation.viewer] = {
    name: observation.viewer === 0 ? '컴퓨터' : '나',
    hand: Array.from({ length: observation.opponent.handCount }, (_, index) => ({
      id: `hidden-opponent-${index}`,
      value0: 0,
      value1: 0,
      rotated: false,
      starred: false,
      minPlayers: 2
    })),
    roundWins: observation.opponent.roundWins
  };
  return {
    phase: observation.phase,
    players,
    areas: observation.areas.map(row => row.map(publicArea)),
    discard: Array.from({ length: observation.discardCount }, (_, index) => ({ id: `known-discard-${index}` })),
    activePlayer: observation.activePlayer,
    activeArea: observation.activeArea,
    starter: observation.starter,
    round: observation.round,
    turn: 1,
    difficulty: observation.difficulty,
    roundWinner: null,
    matchWinner: null,
    log: []
  };
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function groupingScore(hand) {
  const counts = new Map();
  for (const card of hand) counts.set(activeValue(card), (counts.get(activeValue(card)) ?? 0) + 1);
  return [...counts.values()].reduce((sum, count) => sum + count * count, 0);
}

function exposedCount(state, player) {
  return state.areas[player].filter(Boolean).reduce((sum, area) => sum + area.cards.length, 0);
}

function evaluate(state, actor, difficulty) {
  if (state.matchWinner === actor) return 1_000_000;
  if (state.roundWinner === actor) return 100_000;
  const opponent = 1 - actor;
  const selfHand = state.players[actor].hand;
  const handDelta = state.players[opponent].hand.length - selfHand.length;
  const ownExposed = exposedCount(state, actor);
  const opponentExposed = exposedCount(state, opponent);
  const grouping = groupingScore(selfHand);
  const weights = difficulty === 'hard'
    ? { hand: 130, own: 35, opponent: -24, group: 10 }
    : { hand: 100, own: 26, opponent: -18, group: 6 };
  return handDelta * weights.hand + ownExposed * weights.own + opponentExposed * weights.opponent + grouping * weights.group;
}

function rankedMove(observation, difficulty, rng) {
  const state = stateFromObservation(observation);
  const actor = observation.viewer;
  const moves = legalMoves(state);
  const ranked = moves.map(move => {
    const next = applyMove(state, move);
    let score = evaluate(next, actor, difficulty);
    if (difficulty === 'hard' && next.phase === 'round' && next.activePlayer === actor) {
      const replies = legalMoves(next);
      if (replies.length) score += Math.max(...replies.map(reply => evaluate(applyMove(next, reply), actor, difficulty))) * 0.35;
    }
    return { move, score, tie: rng() };
  });
  ranked.sort((left, right) => right.score - left.score || left.tie - right.tie || JSON.stringify(left.move).localeCompare(JSON.stringify(right.move)));
  return ranked[0].move;
}

export function chooseAiMove(observation, difficulty = 'normal', rng = Math.random) {
  const state = stateFromObservation(observation);
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const winning = moves.filter(move => {
    const next = applyMove(state, move);
    return next.roundWinner === observation.viewer;
  });
  if (winning.length) return winning[0];
  const ordered = [...moves].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (difficulty === 'easy') return randomItem(ordered, rng);
  return rankedMove(observation, difficulty === 'hard' ? 'hard' : 'normal', rng);
}
