import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove, chooseAiMove, createDeck, createGame, legalMoves, projectObservation
} from '../games/good-face-bad-face/play/engine.js';

const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};

const card = (id, type) => ({ id, type });

function fixture(overrides = {}) {
  return {
    phase: 'decide',
    difficulty: 'normal',
    players: [
      { name: '나', kind: 'human', hand: [], party: [] },
      { name: '컴퓨터 A', kind: 'ai', hand: [], party: [] },
      { name: '컴퓨터 B', kind: 'ai', hand: [], party: [] }
    ],
    stack: [],
    stackOwner: 0,
    currentPlayer: 1,
    ownerReturned: false,
    turn: 1,
    winnerIndex: null,
    log: [],
    ...overrides
  };
}

const hasMove = (game, playerIndex, type) => legalMoves(game, playerIndex).some(move => move.type === type);

function allCards(game) {
  return [
    ...game.stack,
    ...game.players.flatMap(player => [...player.hand, ...player.party])
  ];
}

test('3인 기본 덱은 고유 ID를 가진 좋은 얼굴 10장과 나쁜 얼굴 5장이다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 15);
  assert.equal(new Set(deck.map(item => item.id)).size, 15);
  assert.equal(deck.filter(item => item.type === 'good').length, 10);
  assert.equal(deck.filter(item => item.type === 'bad').length, 5);
});

test('1인 게임은 사람 1명과 컴퓨터 2명에게 5장씩 나누고 사람이 첫 스택을 만든다', () => {
  const game = createGame({ difficulty: 'hard', rng: seeded(3) });
  assert.deepEqual(game.players.map(player => player.kind), ['human', 'ai', 'ai']);
  assert.deepEqual(game.players.map(player => player.hand.length), [5, 5, 5]);
  assert.deepEqual(game.players.map(player => player.party.length), [0, 0, 0]);
  assert.equal(game.phase, 'buildStack');
  assert.equal(game.stackOwner, 0);
  assert.equal(game.currentPlayer, 0);
  assert.equal(allCards(game).length, 15);
});

test('스택 주인은 손패 1장 이상을 원하는 순서로 쌓아 왼쪽 플레이어에게 보낸다', () => {
  let game = createGame({ rng: seeded(5) });
  const chosen = [game.players[0].hand[2].id, game.players[0].hand[0].id];
  game = applyMove(game, { type: 'buildStack', cardIds: chosen }, 0);
  assert.deepEqual(game.stack.map(item => item.id), chosen);
  assert.equal(game.players[0].hand.length, 3);
  assert.equal(game.phase, 'decide');
  assert.equal(game.currentPlayer, 1);
  assert.deepEqual(legalMoves(game, 1), [{ type: 'flip' }, { type: 'pass' }]);
});

test('좋은 얼굴은 나쁜 얼굴이 없는 파티에 추가되고 다시 뒤집거나 넘길 수 있다', () => {
  let game = fixture({ stack: [card('g1', 'good'), card('g2', 'good')] });
  game = applyMove(game, { type: 'flip' }, 1);
  assert.deepEqual(game.players[1].party.map(item => item.id), ['g1']);
  assert.deepEqual(game.stack.map(item => item.id), ['g2']);
  assert.deepEqual(legalMoves(game, 1), [{ type: 'flip' }, { type: 'pass' }]);
});

test('나쁜 얼굴이 있는 파티에서 좋은 얼굴을 뒤집으면 둘을 손으로 가져간다', () => {
  const game0 = fixture({ stack: [card('g1', 'good') ] });
  game0.players[1].party = [card('b1', 'bad'), card('b2', 'bad')];
  const game = applyMove(game0, { type: 'flip' }, 1);
  assert.deepEqual(game.players[1].hand.map(item => item.id).sort(), ['b1', 'g1']);
  assert.deepEqual(game.players[1].party.map(item => item.id), ['b2']);
});

test('좋은 얼굴 네 번째 장을 파티에 놓는 즉시 승리한다', () => {
  const game0 = fixture({ stack: [card('g4', 'good')] });
  game0.players[1].party = [card('g1', 'good'), card('g2', 'good'), card('g3', 'good')];
  const game = applyMove(game0, { type: 'flip' }, 1);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winnerIndex, 1);
  assert.deepEqual(legalMoves(game, 1), []);
});

test('좋은 얼굴 파티에서 나쁜 얼굴을 뒤집으면 좋은 얼굴 전부와 나쁜 얼굴을 손으로 가져간다', () => {
  const game0 = fixture({ stack: [card('b1', 'bad'), card('g2', 'good')] });
  game0.players[1].party = [card('g0', 'good'), card('g1', 'good')];
  const game = applyMove(game0, { type: 'flip' }, 1);
  assert.deepEqual(game.players[1].party, []);
  assert.deepEqual(game.players[1].hand.map(item => item.id).sort(), ['b1', 'g0', 'g1']);
  assert.equal(game.currentPlayer, 2);
  assert.deepEqual(legalMoves(game, 2), [{ type: 'flip' }, { type: 'pass' }]);
});

test('나쁜 얼굴 세 번째 장이 놓이면 나쁜 얼굴 세 장을 모두 손으로 가져간다', () => {
  const game0 = fixture({ stack: [card('b3', 'bad'), card('g1', 'good')] });
  game0.players[1].party = [card('b1', 'bad'), card('b2', 'bad')];
  const game = applyMove(game0, { type: 'flip' }, 1);
  assert.deepEqual(game.players[1].party, []);
  assert.deepEqual(game.players[1].hand.map(item => item.id).sort(), ['b1', 'b2', 'b3']);
  assert.equal(game.currentPlayer, 2);
});

test('스택이 주인에게 돌아오면 반드시 한 장 뒤집고 좋은 얼굴 뒤에는 회수 종료를 선택할 수 있다', () => {
  let game = fixture({ currentPlayer: 2, stack: [card('g1', 'good'), card('b1', 'bad')] });
  game = applyMove(game, { type: 'pass' }, 2);
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.ownerReturned, true);
  assert.deepEqual(legalMoves(game, 0), [{ type: 'flip' }]);
  game = applyMove(game, { type: 'flip' }, 0);
  assert.equal(hasMove(game, 0, 'takeBack'), true);
  game = applyMove(game, { type: 'takeBack' }, 0);
  assert.equal(game.phase, 'buildStack');
  assert.equal(game.stackOwner, 1);
  assert.equal(game.currentPlayer, 1);
  assert.deepEqual(game.players[0].hand.map(item => item.id), ['b1']);
});

test('돌아온 스택 주인이 나쁜 얼굴을 뒤집으면 남은 스택을 손으로 회수하고 차례가 끝난다', () => {
  const game0 = fixture({ currentPlayer: 0, ownerReturned: true, stack: [card('b1', 'bad'), card('g1', 'good')] });
  const game = applyMove(game0, { type: 'flip' }, 0);
  assert.equal(game.phase, 'buildStack');
  assert.equal(game.stackOwner, 1);
  assert.deepEqual(game.players[0].party.map(item => item.id), ['b1']);
  assert.deepEqual(game.players[0].hand.map(item => item.id), ['g1']);
  assert.deepEqual(game.stack, []);
});

test('스택이 소진되면 다음 차례로 넘어가며 손패가 빈 스택 주인은 건너뛴다', () => {
  const game0 = fixture({ stack: [card('g1', 'good')] });
  game0.players[1].hand = [];
  game0.players[2].hand = [card('g2', 'good')];
  const game = applyMove(game0, { type: 'flip' }, 1);
  assert.equal(game.phase, 'buildStack');
  assert.equal(game.stackOwner, 2);
  assert.equal(game.currentPlayer, 2);
});

test('관찰 뷰는 자기 손패와 공개 파티만 보여 주고 남의 손패와 남의 스택 정보를 숨긴다', () => {
  let game = createGame({ difficulty: 'hard', rng: seeded(7) });
  const humanCard = game.players[0].hand[0];
  game = applyMove(game, { type: 'buildStack', cardIds: [humanCard.id] }, 0);
  const aiView = projectObservation(game, 1);
  assert.ok(aiView.players[1].hand.every(item => item.type));
  assert.ok(aiView.players[0].hand.every(item => item.type === null));
  assert.ok(aiView.stack.every(item => item.type === null));
  assert.equal(aiView.knownStack, null);
  const ownerView = projectObservation(game, 0);
  assert.deepEqual(ownerView.knownStack.map(item => item.type), ['good', 'bad'].includes(humanCard.type) ? [humanCard.type] : []);
  assert.equal('players' in aiView && 'stack' in aiView, true);
});

test('쉬움·보통·어려움 컴퓨터는 항상 legalMoves 안에서만 행동한다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let game = createGame({ difficulty, rng: seeded(11) });
    game.currentPlayer = 1;
    game.stackOwner = 1;
    game.phase = 'buildStack';
    const view = projectObservation(game, 1);
    const move = chooseAiMove(view, seeded(13));
    assert.ok(legalMoves(game, 1).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
  }
});

test('어려움 컴퓨터는 돌아온 스택의 다음 카드가 네 번째 좋은 얼굴이면 뒤집는다', () => {
  const game = fixture({ difficulty: 'hard', currentPlayer: 1, stackOwner: 1, ownerReturned: true, stack: [card('g4', 'good')] });
  game.players[1].party = [card('g1', 'good'), card('g2', 'good'), card('g3', 'good')];
  const move = chooseAiMove(projectObservation(game, 1), seeded(17));
  assert.deepEqual(move, { type: 'flip' });
});

function simulate(difficulty, seed) {
  const rng = seeded(seed);
  let game = createGame({ difficulty, rng });
  let steps = 0;
  while (game.phase !== 'gameOver' && steps < 1500) {
    const actor = game.currentPlayer;
    const move = chooseAiMove(projectObservation(game, actor), rng);
    assert.ok(move, `${difficulty} seed ${seed} has no move in ${game.phase}`);
    assert.ok(legalMoves(game, actor).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
    game = applyMove(game, move, actor);
    const cards = allCards(game);
    assert.equal(cards.length, 15);
    assert.equal(new Set(cards.map(item => item.id)).size, 15);
    steps += 1;
  }
  assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed} exceeded turn cap`);
  return game;
}

test('모든 난이도의 자동 대국이 카드 유실과 규칙 위반 없이 끝난다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 100; seed += 1) simulate(difficulty, seed * 31);
  }
});
