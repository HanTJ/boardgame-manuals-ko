import test from 'node:test';
import assert from 'node:assert/strict';

import {
  activeValue,
  applyMove,
  chooseAiMove,
  createDeck,
  createGame,
  createOfficialDeck,
  legalMoves,
  projectObservation,
  startNextRound
} from '../games/dnup/play/engine.js';

const fixedRng = (values = [0.1]) => {
  let index = 0;
  return () => values[index++ % values.length];
};

function card(id, value0, value1, rotated = false, starred = false) {
  return { id, value0, value1, rotated, starred, minPlayers: 2 };
}

function fixture({ hand0 = [], hand1 = [], areas = [[null, null], [null, null]], activePlayer = 0, activeArea = 0, wins = [0, 0] } = {}) {
  return {
    phase: 'round',
    players: [
      { name: '나', hand: hand0, roundWins: wins[0] },
      { name: '컴퓨터', hand: hand1, roundWins: wins[1] }
    ],
    areas,
    discard: [],
    activePlayer,
    activeArea,
    starter: 0,
    round: 1,
    turn: 1,
    difficulty: 'normal',
    roundWinner: null,
    matchWinner: null,
    log: []
  };
}

function set(owner, area, cards) {
  return { owner, area, cards };
}

function key(move) {
  return JSON.stringify(move);
}

test('official manifest has 40 number cards and exact setup-group sizes', () => {
  const all = createOfficialDeck();
  assert.equal(all.length, 40);
  assert.deepEqual(
    [2, 3, 4, 5].map(count => createDeck(count).length),
    [26, 30, 36, 40]
  );
  assert.equal(all.filter(item => item.starred).length, 1);
  const star = all.find(item => item.starred);
  assert.deepEqual([star.value0, star.value1], [1, 5]);
});

test('every setup-symbol group matches the official physical card pairs', () => {
  const pairList = minPlayers => createOfficialDeck()
    .filter(item => item.minPlayers === minPlayers)
    .map(item => `${item.value0}-${item.value1}`)
    .sort();
  assert.deepEqual(pairList(2), [
    '1-10', '1-5', '1-6', '1-7', '1-8', '1-9', '1-9',
    '2-4', '2-4', '2-5', '2-5', '2-6', '2-6', '2-7',
    '3-4', '3-5', '3-6', '3-7', '3-8', '3-9',
    '4-6', '4-7', '4-8', '5-7', '5-8', '6-7'
  ].sort());
  assert.deepEqual(pairList(3), ['1-8', '2-10', '3-6', '4-5'].sort());
  assert.deepEqual(pairList(4), ['1-6', '1-7', '2-8', '2-9', '3-4', '3-5'].sort());
  assert.deepEqual(pairList(5), ['3-10', '4-9', '5-8', '6-7'].sort());
});

test('2-player deck matches the official player-aid endpoint frequencies', () => {
  const counts = new Map();
  for (const item of createDeck(2)) {
    counts.set(item.value0, (counts.get(item.value0) ?? 0) + 1);
    counts.set(item.value1, (counts.get(item.value1) ?? 0) + 1);
  }
  assert.deepEqual(Object.fromEntries(counts), {
    1: 7, 2: 7, 3: 6, 4: 6, 5: 6,
    6: 6, 7: 6, 8: 4, 9: 3, 10: 1
  });
});

test('new round deals 13 cards each and star holder opens in area 2 only', () => {
  const game = createGame({ rng: fixedRng([0.2, 0.8, 0.4, 0.6]) });
  assert.deepEqual(game.players.map(player => player.hand.length), [13, 13]);
  const holder = game.players.findIndex(player => player.hand.some(item => item.starred));
  assert.equal(game.activePlayer, holder);
  assert.equal(game.activeArea, 1);
  assert.equal(game.starter, holder);
});

test('active value changes only by toggling rotation', () => {
  const item = card('x', 2, 9);
  assert.equal(activeValue(item), 2);
  assert.equal(activeValue({ ...item, rotated: true }), 9);
});

test('A allows any nonempty same-value subset and rejects equal or lower conflicts', () => {
  const hand = [card('a', 4, 8), card('b', 4, 7), card('c', 4, 6), card('d', 3, 9)];
  const lower = set(1, 0, [card('e', 3, 8), card('f', 3, 7)]);
  const game = fixture({ hand0: hand, hand1: [card('z', 1, 5)], areas: [[null, null], [lower, null]] });
  const plays = legalMoves(game).filter(move => move.type === 'playSet');
  assert.ok(plays.some(move => move.cardIds.length === 1));
  assert.ok(plays.some(move => move.cardIds.length === 2));
  assert.ok(plays.some(move => move.cardIds.length === 3));

  const equal = fixture({ hand0: [card('a', 3, 8), card('b', 3, 7)], hand1: [card('z', 1, 5)], areas: [[null, null], [lower, null]] });
  assert.equal(legalMoves(equal).some(move => move.type === 'playSet' && move.cardIds.length === 2), false);
});

test('A resolves a global conflict against the actor own other area and rotates the return', () => {
  const bounced = [card('old-a', 2, 8), card('old-b', 2, 9)];
  const game = fixture({
    hand0: [card('new-a', 6, 1), card('new-b', 6, 3), card('keep', 4, 10)],
    hand1: [card('opp', 1, 5)],
    activeArea: 1,
    areas: [[set(0, 0, bounced), null], [null, null]]
  });
  const next = applyMove(game, { type: 'playSet', cardIds: ['new-a', 'new-b'] });
  assert.equal(next.areas[0][0], null);
  assert.deepEqual(next.players[0].hand.map(item => [item.id, activeValue(item)]).sort(), [['keep', 4], ['old-a', 8], ['old-b', 9]]);
  assert.equal(game.players[0].hand.length, 3, 'source state remains immutable');
});

test('B adds exactly one matching card to an opponent set and resolves the enlarged conflict', () => {
  const target = set(1, 0, [card('t', 5, 2)]);
  const loser = set(0, 1, [card('l1', 3, 8), card('l2', 3, 9)]);
  const game = fixture({
    hand0: [card('add', 5, 1), card('keep', 4, 7)],
    hand1: [card('opp', 2, 6)],
    activeArea: 0,
    areas: [[null, loser], [target, null]]
  });
  const move = { type: 'addCard', cardId: 'add', targetPlayer: 1, targetArea: 0 };
  assert.ok(legalMoves(game).some(candidate => key(candidate) === key(move)));
  const next = applyMove(game, move);
  assert.deepEqual(next.areas[1][0].cards.map(item => item.id), ['t', 'add']);
  assert.equal(next.areas[0][1], null);
  assert.deepEqual(next.players[0].hand.map(item => activeValue(item)).sort((a, b) => a - b), [4, 8, 9]);
});

test('B cannot target own area or create an equal/lower resulting set', () => {
  const own = set(0, 1, [card('o', 5, 2)]);
  const target = set(1, 0, [card('t', 3, 6)]);
  const blocker = set(1, 1, [card('b1', 4, 8), card('b2', 4, 9)]);
  const game = fixture({ hand0: [card('add5', 5, 1), card('add3', 3, 1)], hand1: [card('x', 1, 7)], areas: [[null, own], [target, blocker]] });
  const moves = legalMoves(game);
  assert.equal(moves.some(move => move.type === 'addCard' && move.targetPlayer === 0), false);
  assert.equal(moves.some(move => move.type === 'addCard' && move.cardId === 'add3'), false);
});

test('C takes only a complete opponent set and rotates every card', () => {
  const game = fixture({ hand0: [card('keep', 2, 8)], hand1: [card('x', 1, 7)], areas: [[null, null], [set(1, 0, [card('a', 3, 9), card('b', 3, 10)]), null]] });
  const next = applyMove(game, { type: 'takeSet', targetPlayer: 1, targetArea: 0 });
  assert.equal(next.areas[1][0], null);
  assert.deepEqual(next.players[0].hand.map(item => activeValue(item)).sort((a, b) => a - b), [2, 9, 10]);
});

test('D rotates the entire hand and no table card', () => {
  const tableCard = card('table', 4, 9);
  const game = fixture({ hand0: [card('a', 1, 7), card('b', 2, 8)], hand1: [card('x', 1, 6)], areas: [[null, null], [set(1, 0, [tableCard]), null]] });
  const next = applyMove(game, { type: 'rotateHand' });
  assert.deepEqual(next.players[0].hand.map(activeValue), [7, 8]);
  assert.equal(activeValue(next.areas[1][0].cards[0]), 4);
});

test('only the active area is discarded before its action and cursor advances correctly', () => {
  const area0 = set(0, 0, [card('a0', 2, 8)]);
  const area1 = set(0, 1, [card('a1', 3, 9)]);
  const game = fixture({ hand0: [card('h', 4, 7)], hand1: [card('x', 1, 6)], activeArea: 0, areas: [[area0, area1], [null, null]] });
  const next = applyMove(game, { type: 'rotateHand' });
  assert.equal(next.areas[0][0], null);
  assert.equal(next.areas[0][1].cards[0].id, 'a1');
  assert.equal(next.discard[0].id, 'a0');
  assert.equal(next.activePlayer, 0);
  assert.equal(next.activeArea, 1);

  const later = applyMove(next, { type: 'rotateHand' });
  assert.equal(later.activePlayer, 1);
  assert.equal(later.activeArea, 0);
});

test('last-card play wins only after conflict returns are resolved', () => {
  const returned = set(0, 0, [card('old', 2, 8)]);
  const game = fixture({ hand0: [card('last', 6, 3)], hand1: [card('x', 1, 7)], activeArea: 1, areas: [[returned, null], [null, null]] });
  const next = applyMove(game, { type: 'playSet', cardIds: ['last'] });
  assert.equal(next.phase, 'round');
  assert.equal(next.players[0].hand.length, 1);
  assert.equal(activeValue(next.players[0].hand[0]), 8);
});

test('empty hand ends round; second round win ends match', () => {
  const game = fixture({ hand0: [card('last', 6, 3)], hand1: [card('x', 1, 7)], wins: [1, 0] });
  const next = applyMove(game, { type: 'playSet', cardIds: ['last'] });
  assert.equal(next.phase, 'matchOver');
  assert.equal(next.matchWinner, 0);
  assert.equal(next.players[0].roundWins, 2);
});

test('startNextRound recollects all cards, preserves orientation, and lets star holder start in area 2', () => {
  const game = createGame({ rng: fixedRng([0.4, 0.2, 0.7]) });
  const preservedId = game.players[0].hand[0].id;
  game.players[0].hand[0].rotated = true;
  game.phase = 'roundOver';
  game.roundWinner = 0;
  game.players[0].roundWins = 1;
  const next = startNextRound(game, fixedRng([0.8, 0.3, 0.1]));
  assert.equal(next.round, 2);
  assert.deepEqual(next.players.map(player => player.hand.length), [13, 13]);
  assert.equal(next.players.flatMap(player => player.hand).find(item => item.id === preservedId).rotated, true);
  const holder = next.players.findIndex(player => player.hand.some(item => item.starred));
  assert.equal(next.activePlayer, holder);
  assert.equal(next.activeArea, 1);
  assert.equal(next.players[0].roundWins, 1);
});

test('AI observation masks the human hand and private ordering', () => {
  const game = fixture({ hand0: [card('secret-a', 1, 10), card('secret-b', 2, 9)], hand1: [card('ai', 4, 8)], activePlayer: 1 });
  const observation = projectObservation(game, 1);
  assert.equal(observation.opponent.handCount, 2);
  assert.equal('hand' in observation.opponent, false);
  assert.equal(JSON.stringify(observation).includes('secret-a'), false);
  assert.equal(JSON.stringify(observation).includes('secret-b'), false);
});

test('AI decision is unchanged when only the hidden human hand changes', () => {
  const common = { hand1: [card('ai-a', 4, 8), card('ai-b', 4, 7), card('ai-c', 2, 9)], activePlayer: 1, activeArea: 0 };
  const left = fixture({ ...common, hand0: [card('secret-a', 1, 10), card('secret-b', 2, 9)] });
  const right = fixture({ ...common, hand0: [card('different-a', 8, 1), card('different-b', 7, 3)] });
  const a = projectObservation(left, 1);
  const b = projectObservation(right, 1);
  assert.deepEqual(a, b);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    assert.deepEqual(chooseAiMove(a, difficulty, fixedRng([0.31])), chooseAiMove(b, difficulty, fixedRng([0.31])));
  }
});

test('every AI level returns a legal move', () => {
  const game = fixture({ hand0: [card('human', 2, 9)], hand1: [card('a', 4, 8), card('b', 4, 7), card('c', 2, 10)], activePlayer: 1 });
  const legal = legalMoves(game).map(key);
  const observation = projectObservation(game, 1);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    assert.ok(legal.includes(key(chooseAiMove(observation, difficulty, fixedRng([0.47])))));
  }
});

test('random legal simulations conserve all 26 card identities and terminate rounds', () => {
  for (let sample = 0; sample < 12; sample += 1) {
    const rng = fixedRng([0.13 + sample * 0.01, 0.71, 0.29, 0.53, 0.89]);
    let game = createGame({ rng });
    const expected = new Set(createDeck(2).map(item => item.id));
    for (let step = 0; step < 1200 && game.phase === 'round'; step += 1) {
      const moves = legalMoves(game);
      assert.ok(moves.length > 0);
      game = applyMove(game, moves[Math.floor(rng() * moves.length) % moves.length]);
      const all = [
        ...game.players.flatMap(player => player.hand),
        ...game.areas.flat(2).filter(Boolean).flatMap(area => area.cards),
        ...game.discard
      ];
      assert.equal(all.length, 26);
      assert.equal(new Set(all.map(item => item.id)).size, 26);
      assert.deepEqual(new Set(all.map(item => item.id)), expected);
    }
    assert.notEqual(game.phase, 'round', `simulation ${sample} failed to terminate`);
  }
});

function seededRng(seed) {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(1664525, value) + 1013904223) >>> 0) / 2 ** 32);
}

function simulateMatch(leftDifficulty, rightDifficulty, seed) {
  const rng = seededRng(seed);
  let game = createGame({ rng });
  for (let step = 0; step < 5000; step += 1) {
    if (game.phase === 'matchOver') return game.matchWinner;
    if (game.phase === 'roundOver') {
      game = startNextRound(game, rng);
      continue;
    }
    const difficulty = game.activePlayer === 0 ? leftDifficulty : rightDifficulty;
    const move = chooseAiMove(projectObservation(game, game.activePlayer), difficulty, rng);
    game = applyMove(game, move);
  }
  throw new Error('자동 대국이 제한 행동 안에 종료되지 않았습니다.');
}

test('hard policy is measurably stronger than normal and easy under identical legal rules', () => {
  let hardOverNormal = 0;
  let normalOverEasy = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    if (simulateMatch('hard', 'normal', seed) === 0) hardOverNormal += 1;
    if (simulateMatch('normal', 'easy', seed + 1000) === 0) normalOverEasy += 1;
  }
  assert.ok(hardOverNormal >= 23, `hard won only ${hardOverNormal}/40`);
  assert.ok(normalOverEasy >= 23, `normal won only ${normalOverEasy}/40`);
});
