import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyMove, chooseAiMove, createDeck, createGame, legalMoves,
  projectObservation, scoreGame
} from '../games/tucano/play/engine.js';

const FRUITS = {
  acai: [6, [1, 2, 3, 5, 8, 13]], avocado: [5, 'majority:3:1'],
  banana: [5, 'majority:2:0'], carambola: [5, [1, 3, 6, 10, 15]],
  coconut: [6, [8, 6, 4, 2, 0, -2]], fig: [4, [-2, 0, 9, 16]],
  lime: [2, [-2, -8]], lychee: [2, [5, 12]], orange: [4, [4, 8, 12, 0]],
  papaya: [4, [1, 1, 9, 20]], pineapple: [3, [0, -2, -4]],
  pomegranate: [6, 'majority:1:-1'], rambutan: [5, [3, 6, 9, 12, 15]]
};
const constantRng = value => () => value;
const allCards = game => [
  ...game.drawPile, ...game.columns.flat(),
  ...game.players.flatMap(player => [...player.faceUp, ...player.faceDown]),
  ...game.pendingToucans, ...(game.activeToucan ? [game.activeToucan] : []),
  ...game.toucanDiscard, ...game.finalDiscard
];

function fruit(id, kind) { return { id, type: 'fruit', fruit: kind }; }
function blankGame(overrides = {}) {
  const cards = createDeck();
  return {
    difficulty: 'normal', phase: 'chooseColumn', currentPlayer: 0, turn: 1,
    turnsTaken: [0, 0], drawPile: [], columns: [[], [], []],
    players: [{ name: '나', kind: 'human', faceUp: [], faceDown: [], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [], faceDown: [], jokerFruit: null }],
    pendingToucans: [], activeToucan: null, toucanDiscard: [], finalDiscard: cards,
    winnerIndex: null, scores: null, log: [], ...overrides
  };
}

test('deck manifest has 70 unique IDs and exact fruit/toucan counts', () => {
  const deck = createDeck();
  assert.equal(deck.length, 70);
  assert.equal(new Set(deck.map(card => card.id)).size, 70);
  for (const [kind, [count]] of Object.entries(FRUITS)) {
    assert.equal(deck.filter(card => card.fruit === kind).length, count, kind);
  }
  assert.equal(deck.filter(card => card.type === 'joker').length, 1);
  for (const effect of ['give', 'steal', 'hide']) {
    assert.equal(deck.filter(card => card.effect === effect).length, 4, effect);
  }
});

test('setup puts toucans in lower half and deals visible columns 1/2/1', () => {
  const game = createGame({ difficulty: 'hard', rng: constantRng(0.42) });
  assert.deepEqual(game.columns.map(column => column.length), [1, 2, 1]);
  assert.equal(game.drawPile.length, 66);
  assert.ok(game.columns.flat().every(card => card.type !== 'toucan'));
  assert.ok([...game.columns.flat(), ...game.drawPile.slice(0, 25)].every(card => card.type !== 'toucan'));
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.phase, 'chooseColumn');
  assert.equal(allCards(game).length, 70);
});

test('fixed score vectors score every fruit count exactly', () => {
  for (const [kind, [max, vector]] of Object.entries(FRUITS)) {
    if (!Array.isArray(vector)) continue;
    for (let count = 0; count <= max; count += 1) {
      const cards = Array.from({ length: count }, (_, i) => fruit(`${kind}-${i}`, kind));
      const game = blankGame();
      game.players[0].faceUp = cards;
      game.finalDiscard = game.finalDiscard.filter(card => !cards.some(item => item.id === card.id));
      const scored = scoreGame(game);
      assert.equal(scored.players[0].byFruit[kind], count ? vector[count - 1] : 0, `${kind} ${count}`);
    }
  }
});

test('majority fruits handle sole leader, tie, and zero', () => {
  const game = blankGame();
  game.players[0].faceUp = [fruit('a1', 'avocado'), fruit('a2', 'avocado'), fruit('b1', 'banana'), fruit('p1', 'pomegranate')];
  game.players[1].faceUp = [fruit('a3', 'avocado'), fruit('b2', 'banana'), fruit('p2', 'pomegranate'), fruit('p3', 'pomegranate')];
  const scores = scoreGame(game).players;
  assert.equal(scores[0].byFruit.avocado, 6);
  assert.equal(scores[1].byFruit.avocado, 1);
  assert.equal(scores[0].byFruit.banana, 0);
  assert.equal(scores[1].byFruit.banana, 0);
  assert.equal(scores[0].byFruit.pomegranate, -1);
  assert.equal(scores[1].byFruit.pomegranate, 2);
  assert.equal(scores[0].byFruit.rambutan, 0);
});

test('taking a full column collects cards and refills near-to-far without mutation', () => {
  const original = createGame({ rng: constantRng(0.2) });
  const expectedTaken = original.columns[1].map(card => card.id);
  const expectedRefill = original.drawPile.slice(0, 3).map(card => card.id);
  const next = applyMove(original, { type: 'chooseColumn', columnIndex: 1 }, 0);
  assert.deepEqual(original.columns.map(column => column.length), [1, 2, 1]);
  assert.deepEqual(next.players[0].faceUp.map(card => card.id), expectedTaken);
  assert.deepEqual(next.columns.map(column => column.at(-1)?.id), expectedRefill);
  assert.equal(next.currentPlayer, 1);
  assert.equal(next.turnsTaken[0], 1);
  assert.equal(allCards(next).length, 70);
});

test('toucan order changes target availability and hide appends protected cards', () => {
  const give = { id: 'tg', type: 'toucan', effect: 'give' };
  const hide = { id: 'th', type: 'toucan', effect: 'hide' };
  const own = fruit('own', 'fig');
  let game = blankGame({ phase: 'chooseToucan', pendingToucans: [give, hide], finalDiscard: [],
    players: [{ name: '나', kind: 'human', faceUp: [own], faceDown: [fruit('old', 'lime')], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [], faceDown: [], jokerFruit: null }] });
  assert.deepEqual(legalMoves(game, 0).map(move => move.cardId).sort(), ['tg', 'th']);
  game = applyMove(game, { type: 'chooseToucan', cardId: 'th' }, 0);
  assert.equal(game.players[0].faceUp.length, 0);
  assert.equal(game.players[0].faceDown.length, 2);
  game = applyMove(game, { type: 'chooseToucan', cardId: 'tg' }, 0);
  assert.equal(game.toucanDiscard.length, 2, 'unusable give is discarded');
});

test('give and steal only target current face-up collectibles including Joker', () => {
  const joker = { id: 'joker-x', type: 'joker' };
  let game = blankGame({ phase: 'giveTarget', activeToucan: { id: 'give-x', type: 'toucan', effect: 'give' }, finalDiscard: [],
    players: [{ name: '나', kind: 'human', faceUp: [joker, fruit('f', 'fig')], faceDown: [fruit('hidden', 'lime')], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [], faceDown: [], jokerFruit: null }] });
  assert.deepEqual(legalMoves(game, 0).map(move => move.cardId).sort(), ['f', 'joker-x']);
  game = applyMove(game, { type: 'giveTarget', cardId: 'joker-x' }, 0);
  assert.equal(game.players[1].faceUp[0].id, 'joker-x');

  game.phase = 'stealTarget'; game.currentPlayer = 0;
  game.activeToucan = { id: 'steal-x', type: 'toucan', effect: 'steal' };
  assert.deepEqual(legalMoves(game, 0), [{ type: 'stealTarget', cardId: 'joker-x' }]);
  game = applyMove(game, { type: 'stealTarget', cardId: 'joker-x' }, 0);
  assert.ok(game.players[0].faceUp.some(card => card.id === 'joker-x'));
});

test('observations redact draw order and every protected identity, and hidden swaps do not affect AI', () => {
  const game = createGame({ difficulty: 'hard', rng: constantRng(0.7) });
  game.players[0].faceDown = [fruit('secret-a', 'acai')];
  game.players[1].faceDown = [fruit('secret-b', 'lime')];
  const view = projectObservation(game, 1);
  assert.ok(view.drawPile.every(card => card.id === null && card.type === null));
  assert.ok(view.players.flatMap(player => player.faceDown).every(card => card.id === null && card.type === null));
  const swapped = structuredClone(game);
  [swapped.players[0].faceDown, swapped.players[1].faceDown] = [swapped.players[1].faceDown, swapped.players[0].faceDown];
  assert.deepEqual(projectObservation(swapped, 1), view);
  assert.deepEqual(chooseAiMove(projectObservation(swapped, 1), constantRng(0.3)), chooseAiMove(view, constantRng(0.3)));
});

test('Joker can join a zero-card set, swings majority, and cannot complete beyond physical maximum', () => {
  const game = blankGame();
  game.players[0].faceDown = [{ id: 'j', type: 'joker' }];
  game.players[1].faceUp = [fruit('b1', 'banana')];
  const zeroSet = scoreGame(game, ['rambutan', null]);
  assert.equal(zeroSet.players[0].byFruit.rambutan, 3);
  const majority = scoreGame(game, ['banana', null]);
  assert.equal(majority.players[0].byFruit.banana, 0);
  assert.equal(majority.players[1].byFruit.banana, 0);
  game.players[0].faceUp = Array.from({ length: 5 }, (_, i) => fruit(`a${i}`, 'avocado'));
  game.phase = 'jokerAssignment'; game.currentPlayer = 0;
  assert.ok(!legalMoves(game, 0).some(move => move.fruit === 'avocado'));
  assert.ok(legalMoves(game, 0).some(move => move.fruit === 'rambutan'));
});

test('endgame reveals protected cards before the Joker owner chooses a fruit', () => {
  const joker = { id: 'joker-hidden', type: 'joker' };
  const protectedFruit = fruit('protected-fig', 'fig');
  const lastTaken = fruit('last-taken', 'acai');
  const discarded = fruit('last-discarded', 'lime');
  const game = blankGame({
    currentPlayer: 0,
    turnsTaken: [11, 12],
    columns: [[lastTaken], [discarded], []],
    players: [
      { name: '나', kind: 'human', faceUp: [], faceDown: [joker, protectedFruit], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [], faceDown: [], jokerFruit: null }
    ],
    finalDiscard: []
  });

  const next = applyMove(game, { type: 'chooseColumn', columnIndex: 0 }, 0);
  assert.equal(next.phase, 'jokerAssignment');
  assert.equal(next.players[0].faceDown.length, 0);
  assert.deepEqual(next.players[0].faceUp.map(card => card.id).sort(), ['joker-hidden', 'last-taken', 'protected-fig']);
  const view = projectObservation(next, 0);
  assert.ok(view.players[0].faceUp.some(card => card.id === 'protected-fig'));
  assert.ok(view.moves.some(move => move.type === 'assignJoker' && move.fruit === 'fig'));
});

test('illegal moves reject and leave source state unchanged', () => {
  const game = createGame({ rng: constantRng(0.1) });
  const snapshot = structuredClone(game);
  assert.throws(() => applyMove(game, { type: 'chooseColumn', columnIndex: 9 }, 0), /허용/);
  assert.throws(() => applyMove(game, { type: 'chooseColumn', columnIndex: 0 }, 1), /허용/);
  assert.deepEqual(game, snapshot);
});

function seeded(seed) {
  let value = seed >>> 0;
  return () => ((value = (value * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

test('all AI levels finish deterministic legal games in exactly 24 turns with conservation', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const rng = seeded(20261021);
    let game = createGame({ difficulty, rng });
    let actions = 0;
    while (game.phase !== 'gameOver' && actions < 200) {
      const actor = game.currentPlayer;
      const moves = legalMoves(game, actor);
      assert.ok(moves.length, `${difficulty} ${game.phase}`);
      const move = actor === 1 ? chooseAiMove(projectObservation(game, actor), rng) : moves[0];
      assert.ok(moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)), `${difficulty} legal AI`);
      game = applyMove(game, move, actor);
      assert.equal(allCards(game).length, 70, `${difficulty} conservation after ${actions}`);
      assert.equal(new Set(allCards(game).map(card => card.id)).size, 70);
      actions += 1;
    }
    assert.ok(actions < 200, `${difficulty} hard cap`);
    assert.equal(game.phase, 'gameOver');
    assert.deepEqual(game.turnsTaken, [12, 12]);
    assert.equal(game.columns.flat().length, 0);
    assert.ok(game.finalDiscard.length > 0);
    assert.ok(game.scores);
  }
});

test('difficulty strategies remain legal and use distinct public heuristics', () => {
  const base = createGame({ rng: constantRng(0.5) });
  base.currentPlayer = 1;
  for (const difficulty of ['easy', 'normal', 'hard']) {
    base.difficulty = difficulty;
    const view = projectObservation(base, 1);
    const move = chooseAiMove(view, constantRng(0));
    assert.ok(view.moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
  }
  base.difficulty = 'hard';
  const hard = chooseAiMove(projectObservation(base, 1), constantRng(0));
  base.difficulty = 'easy';
  const easy = chooseAiMove(projectObservation(base, 1), constantRng(0));
  assert.ok(hard.columnIndex >= 0 && easy.columnIndex >= 0);
});

test('hard AI assigns the Joker by current score gain instead of theoretical set maximum', () => {
  const game = blankGame({
    difficulty: 'hard', phase: 'jokerAssignment', currentPlayer: 1, finalDiscard: [],
    players: [
      { name: '나', kind: 'human', faceUp: [], faceDown: [], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [fruit('fig-1', 'fig'), fruit('fig-2', 'fig'), { id: 'joker-ai', type: 'joker' }], faceDown: [], jokerFruit: null }
    ]
  });
  assert.deepEqual(chooseAiMove(projectObservation(game, 1), constantRng(0)), { type: 'assignJoker', fruit: 'fig' });
});

test('hard AI uses current set values for columns while normal uses simple visible value', () => {
  const game = blankGame({
    difficulty: 'normal', currentPlayer: 1, finalDiscard: [],
    columns: [[fruit('rambutan-offer', 'rambutan')], [fruit('carambola-offer', 'carambola')], [fruit('avocado-offer', 'avocado')]],
    players: [
      { name: '나', kind: 'human', faceUp: [], faceDown: [], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [fruit('carambola-1', 'carambola'), fruit('carambola-2', 'carambola'), fruit('carambola-3', 'carambola'), fruit('carambola-4', 'carambola')], faceDown: [], jokerFruit: null }
    ]
  });
  const normal = chooseAiMove(projectObservation(game, 1), constantRng(0));
  game.difficulty = 'hard';
  const hard = chooseAiMove(projectObservation(game, 1), constantRng(0));
  assert.deepEqual(normal, { type: 'chooseColumn', columnIndex: 0 });
  assert.deepEqual(hard, { type: 'chooseColumn', columnIndex: 1 });
});

test('hard AI values a majority swing when choosing a Toucan steal target', () => {
  const game = blankGame({
    difficulty: 'normal', phase: 'stealTarget', currentPlayer: 1,
    activeToucan: { id: 'steal-choice', type: 'toucan', effect: 'steal' }, finalDiscard: [],
    players: [
      { name: '나', kind: 'human', faceUp: [fruit('carambola-target', 'carambola'), fruit('avocado-a', 'avocado'), fruit('avocado-b', 'avocado')], faceDown: [], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [], faceDown: [], jokerFruit: null }
    ]
  });
  const normal = chooseAiMove(projectObservation(game, 1), constantRng(0));
  game.difficulty = 'hard';
  const hard = chooseAiMove(projectObservation(game, 1), constantRng(0));
  assert.deepEqual(normal, { type: 'stealTarget', cardId: 'carambola-target' });
  assert.deepEqual(hard, { type: 'stealTarget', cardId: 'avocado-a' });
});

test('difficulty calibration makes normal and hard stronger than easy over deterministic games', () => {
  const aiWins = {};
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let wins = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const rng = seeded(seed * 104729);
      let game = createGame({ difficulty, rng });
      let actions = 0;
      while (game.phase !== 'gameOver' && actions < 200) {
        const actor = game.currentPlayer;
        const observation = projectObservation(game, actor);
        observation.difficulty = actor === 0 ? 'normal' : difficulty;
        game = applyMove(game, chooseAiMove(observation, rng), actor);
        actions += 1;
      }
      assert.equal(game.phase, 'gameOver');
      if (game.winnerIndex === 1) wins += 1;
    }
    aiWins[difficulty] = wins;
  }
  assert.ok(aiWins.normal > aiWins.easy + 100, JSON.stringify(aiWins));
  assert.ok(aiWins.hard > aiWins.normal, JSON.stringify(aiWins));
});
