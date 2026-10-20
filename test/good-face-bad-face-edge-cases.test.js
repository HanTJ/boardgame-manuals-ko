import test from 'node:test';
import assert from 'node:assert/strict';

import { applyMove, chooseAiMove, legalMoves, projectObservation } from '../games/good-face-bad-face/play/engine.js';

const card = (id, type) => ({ id, type });
const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};

function game(overrides = {}) {
  return {
    phase: 'decide', difficulty: 'hard',
    players: [
      { name: '나', kind: 'human', hand: [card('h0', 'good')], party: [] },
      { name: 'A', kind: 'ai', hand: [card('h1', 'good')], party: [] },
      { name: 'B', kind: 'ai', hand: [card('h2', 'bad')], party: [] }
    ],
    stack: [card('s0', 'good')], stackOwner: 0, currentPlayer: 1,
    ownerReturned: false, ownerMayTakeBack: false, turn: 1, winnerIndex: null, log: [],
    ...overrides
  };
}

const types = (state, actor) => legalMoves(state, actor).map(move => move.type);

test('주인이 돌아온 뒤 좋은 얼굴을 뒤집어도 회수 모드를 유지한다', () => {
  const state = game({ currentPlayer: 0, ownerReturned: true, stack: [card('g1', 'good'), card('g2', 'good')] });
  const next = applyMove(state, { type: 'flip' }, 0);
  assert.equal(next.ownerReturned, true);
  assert.deepEqual(types(next, 0), ['flip', 'takeBack']);
});

test('주인 아닌 사람이 나쁜 얼굴을 뒤집어 주인에게 넘기면 주인은 반드시 뒤집는다', () => {
  const state = game({ currentPlayer: 2, stack: [card('b1', 'bad'), card('g1', 'good')] });
  const next = applyMove(state, { type: 'flip' }, 2);
  assert.equal(next.currentPlayer, 0);
  assert.equal(next.ownerReturned, true);
  assert.deepEqual(types(next, 0), ['flip']);
});

test('나쁜 얼굴이 스택을 소진하면 넘기지 않고 이전 주인의 왼쪽부터 새 차례를 연다', () => {
  const state = game({ currentPlayer: 2, stack: [card('b1', 'bad')] });
  const next = applyMove(state, { type: 'flip' }, 2);
  assert.equal(next.phase, 'buildStack');
  assert.equal(next.stackOwner, 1);
  assert.equal(next.currentPlayer, 1);
});

test('새 주인은 뒤집은 사람이 아니라 이전 주인의 왼쪽부터 빈손을 건너뛰어 정한다', () => {
  const state = game({ stackOwner: 1, currentPlayer: 0, stack: [card('g1', 'good')] });
  state.players[2].hand = [];
  const next = applyMove(state, { type: 'flip' }, 0);
  assert.equal(next.stackOwner, 0);
  assert.equal(next.currentPlayer, 0);
});

test('이전 스택 주인만 손패가 있으면 빈손을 한 바퀴 건너뛰어 다시 주인이 된다', () => {
  const state = game({ stackOwner: 1, currentPlayer: 0, stack: [card('last', 'good')] });
  state.players[0].hand = [];
  state.players[1].hand = [card('only-hand', 'good')];
  state.players[2].hand = [];
  state.players[2].party = Array.from({ length: 13 }, (_, index) => card(`public-${index}`, 'bad'));
  const next = applyMove(state, { type: 'flip' }, 0);
  assert.equal(next.phase, 'buildStack');
  assert.equal(next.stackOwner, 1);
  assert.equal(next.currentPlayer, 1);
  assert.ok(legalMoves(next, 1).length > 0);
});

test('아무도 손패가 없는 비정상 상태는 빈 스택 주인으로 멈추지 않고 안전하게 종료한다', () => {
  const state = game({ stackOwner: 1, currentPlayer: 0, stack: [card('last', 'good')] });
  state.players.forEach(player => { player.hand = []; });
  const next = applyMove(state, { type: 'flip' }, 0);
  assert.equal(next.phase, 'gameOver');
  assert.notEqual(next.winnerIndex, null);
});

test('네 번째 좋은 얼굴은 남은 스택을 건드리지 않고 즉시 게임을 고정한다', () => {
  const state = game({ stack: [card('g4', 'good'), card('b1', 'bad')] });
  state.players[1].party = [card('g1', 'good'), card('g2', 'good'), card('g3', 'good')];
  const next = applyMove(state, { type: 'flip' }, 1);
  assert.equal(next.phase, 'gameOver');
  assert.deepEqual(next.stack, [card('b1', 'bad')]);
  assert.deepEqual(legalMoves(next, 1), []);
});

test('숨은 카드의 ID와 종류가 달라도 같은 공개 관찰과 난수면 AI 행동은 같다', () => {
  const first = game();
  const second = structuredClone(first);
  second.players[0].hand = [card('secret-other', 'bad')];
  second.stack = [card('stack-other', 'bad')];
  const firstView = projectObservation(first, 1);
  const secondView = projectObservation(second, 1);
  assert.deepEqual(firstView, secondView);
  assert.deepEqual(chooseAiMove(firstView, seeded(9)), chooseAiMove(secondView, seeded(9)));
  assert.ok(firstView.players[0].hand.every(item => item.id === null && item.type === null));
  assert.ok(firstView.stack.every(item => item.id === null && item.type === null));
});
