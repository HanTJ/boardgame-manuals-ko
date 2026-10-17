import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMove, chooseAiMove, createAiSchedule, createDeck, createGame, legalMoves, viewForPlayer
} from '../games/the-mind/play/engine.js';

const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};

test('The Mind 숫자 덱은 1부터 100까지 고유 카드 100장이다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 100);
  assert.deepEqual(deck.map(card => card.value), Array.from({ length: 100 }, (_, index) => index + 1));
  assert.equal(new Set(deck.map(card => card.id)).size, 100);
});

test('2인 게임은 레벨 1·생명 2·수리검 1개와 각자 카드 1장으로 시작한다', () => {
  const game = createGame({ rng: seeded(7), difficulty: 'normal' });
  assert.equal(game.level, 1);
  assert.equal(game.maxLevel, 12);
  assert.equal(game.lives, 2);
  assert.equal(game.stars, 1);
  assert.equal(game.phase, 'focus');
  assert.deepEqual(game.players.map(player => player.hand.length), [1, 1]);
  assert.equal(game.deck.length, 98);
  assert.equal(game.pile.length, 0);
  assert.equal(game.removed.length, 0);
});

const card = value => ({ id: `mind-${value}`, value });

test('집중 단계에서는 시작만, 진행 중에는 자기 카드와 수리검만 허용한다', () => {
  let game = createGame({ rng: seeded(11) });
  assert.deepEqual(legalMoves(game, 0), [{ type: 'startLevel' }]);
  game = applyMove(game, { type: 'startLevel' }, 0);
  game.players[0].hand = [card(12), card(45)];
  const moves = legalMoves(game, 0);
  assert.ok(moves.some(move => move.type === 'play' && move.cardId === game.players[0].hand[0].id));
  assert.equal(moves.filter(move => move.type === 'play').length, 1);
  assert.ok(!moves.some(move => move.type === 'play' && move.cardId === 'mind-45'));
  assert.ok(moves.some(move => move.type === 'proposeStar'));
  assert.throws(() => applyMove(game, { type: 'startLevel' }, 0), /허용되지 않은/);
});

test('진행 중 멈춤을 선언하면 같은 패와 경과 상태를 유지한 채 재집중 후 계속한다', () => {
  let game = createGame({ rng: seeded(12) });
  game = applyMove(game, { type: 'startLevel' }, 0);
  const hands = structuredClone(game.players.map(player => player.hand));
  assert.ok(legalMoves(game, 0).some(move => move.type === 'pause'));
  game = applyMove(game, { type: 'pause' }, 0);
  assert.equal(game.phase, 'paused');
  assert.deepEqual(game.players.map(player => player.hand), hands);
  assert.deepEqual(legalMoves(game, 0), [{ type: 'resume' }]);
  game = applyMove(game, { type: 'resume' }, 0);
  assert.equal(game.phase, 'playing');
  assert.deepEqual(game.players.map(player => player.hand), hands);
});

test('큰 카드를 먼저 내면 생명 1개만 잃고 양쪽 손의 더 낮은 카드를 모두 제거한다', () => {
  let game = createGame({ rng: seeded(13) });
  game.phase = 'playing';
  game.players[0].hand = [card(45)];
  game.players[1].hand = [card(8), card(30), card(70)];
  game.deck = createDeck().filter(item => ![8, 30, 45, 70].includes(item.value));
  game = applyMove(game, { type: 'play', cardId: 'mind-45' }, 0);
  assert.equal(game.lives, 1);
  assert.equal(game.phase, 'paused');
  assert.deepEqual(game.removed.map(item => item.value).sort((a, b) => a - b), [8, 30]);
  assert.deepEqual(game.players[0].hand.map(item => item.value), []);
  assert.deepEqual(game.players[1].hand.map(item => item.value), [70]);
  assert.equal(game.pile.at(-1).value, 45);
});

test('수리검은 자원 1개를 쓰고 양 플레이어의 최저 카드를 제거한 뒤 재집중 단계로 들어간다', () => {
  let game = createGame({ rng: seeded(17) });
  game.phase = 'playing';
  game.players[0].hand = [card(15), card(60)];
  game.players[1].hand = [card(22), card(80)];
  game.deck = createDeck().filter(item => ![15, 22, 60, 80].includes(item.value));
  game = applyMove(game, { type: 'proposeStar' }, 0);
  assert.equal(game.phase, 'starVote');
  assert.deepEqual(legalMoves(game, 0), []);
  assert.deepEqual(legalMoves(game, 1), [{ type: 'acceptStar' }]);
  assert.equal(game.stars, 1);
  game = applyMove(game, { type: 'acceptStar' }, 1);
  assert.equal(game.stars, 0);
  assert.equal(game.phase, 'paused');
  assert.deepEqual(game.removed.map(item => item.value).sort((a, b) => a - b), [15, 22]);
  assert.deepEqual(game.players.map(player => player.hand.map(item => item.value)), [[60], [80]]);
  assert.ok(!legalMoves(game, 0).some(move => move.type === 'proposeStar'));
  assert.ok(legalMoves(game, 0).some(move => move.type === 'resume'));
  game = applyMove(game, { type: 'resume' }, 0);
  assert.equal(game.phase, 'playing');
  // 이미 제거한 카드나 제거된 상대 카드를 낼 수 없다
  assert.throws(() => applyMove(game, { type: 'play', cardId: 'mind-15' }, 0), /허용되지 않은/);
  assert.throws(() => applyMove(game, { type: 'play', cardId: 'mind-22' }, 0), /허용되지 않은/);
});

test('수리검은 사람만 제안하고 컴퓨터의 동의 전에는 소비하거나 카드를 제거하지 않는다', () => {
  let game = createGame({ rng: seeded(41) });
  game.phase = 'playing';
  game.stars = 1;
  assert.ok(legalMoves(game, 0).some(move => move.type === 'proposeStar'));
  assert.ok(!legalMoves(game, 1).some(move => move.type === 'proposeStar'));
  assert.ok(legalMoves(game, 1).some(move => move.cardId === game.players[1].hand[0].id));
  const hands = structuredClone(game.players.map(player => player.hand));
  game = applyMove(game, { type: 'proposeStar' }, 0);
  assert.equal(game.stars, 1);
  assert.deepEqual(game.players.map(player => player.hand), hands);
});

test('레벨 성공 보상을 받고 다음 레벨에는 모든 숫자 카드를 다시 섞어 레벨만큼 나눠 준다', () => {
  let game = createGame({ rng: seeded(19) });
  game.level = 2;
  game.phase = 'playing';
  game.players[0].hand = [card(10)];
  game.players[1].hand = [card(20)];
  game.deck = createDeck().filter(item => ![10, 20].includes(item.value));
  game = applyMove(game, { type: 'play', cardId: 'mind-10' }, 0);
  game = applyMove(game, { type: 'play', cardId: 'mind-20' }, 1);
  assert.equal(game.phase, 'levelComplete');
  assert.equal(game.stars, 2);
  assert.equal(game.reward, 'star');
  assert.deepEqual(legalMoves(game, 0), [{ type: 'nextLevel' }]);

  game = applyMove(game, { type: 'nextLevel' }, 0, seeded(23));
  assert.equal(game.level, 3);
  assert.equal(game.phase, 'focus');
  assert.deepEqual(game.players.map(player => player.hand.length), [3, 3]);
  assert.equal(game.deck.length, 94);
  assert.equal(game.pile.length, 0);
  assert.equal(game.removed.length, 0);
  const cards = [...game.deck, ...game.players.flatMap(player => player.hand)];
  assert.equal(cards.length, 100);
  assert.equal(new Set(cards.map(item => item.id)).size, 100);
});

test('생명과 수리검 보상은 각각 최대 5개와 3개를 넘지 않는다', () => {
  let game = createGame({ rng: seeded(29) });
  game.level = 3;
  game.lives = 5;
  game.phase = 'playing';
  game.players[0].hand = [card(1)];
  game.players[1].hand = [];
  game.deck = createDeck().filter(item => item.value !== 1);
  game = applyMove(game, { type: 'play', cardId: 'mind-1' }, 0);
  assert.equal(game.lives, 5);
  assert.equal(game.reward, 'life');

  game.level = 5;
  game.stars = 3;
  game.phase = 'playing';
  game.players[0].hand = [card(2)];
  game = applyMove(game, { type: 'play', cardId: 'mind-2' }, 0);
  assert.equal(game.stars, 3);
  assert.equal(game.reward, 'star');
});

test('마지막 생명을 잃으면 즉시 패배하고 12레벨을 마치면 승리한다', () => {
  let lost = createGame({ rng: seeded(31) });
  lost.phase = 'playing';
  lost.lives = 1;
  lost.players[0].hand = [card(40)];
  lost.players[1].hand = [card(10)];
  lost = applyMove(lost, { type: 'play', cardId: 'mind-40' }, 0);
  assert.equal(lost.phase, 'gameOver');
  assert.equal(lost.result, 'lost');
  assert.deepEqual(legalMoves(lost, 0), []);

  let won = createGame({ rng: seeded(37) });
  won.level = 12;
  won.phase = 'playing';
  won.players[0].hand = [card(90)];
  won.players[1].hand = [];
  won = applyMove(won, { type: 'play', cardId: 'mind-90' }, 0);
  assert.equal(won.phase, 'gameOver');
  assert.equal(won.result, 'won');
});

test('플레이어 뷰는 상대 손의 값과 ID 및 컴퓨터 내부 일정을 숨긴다', () => {
  const game = createGame({ rng: seeded(41), difficulty: 'hard' });
  const humanView = viewForPlayer(game, 0);
  assert.deepEqual(humanView.players[0].hand, game.players[0].hand);
  assert.ok(humanView.players[1].hand.every(item => item.id === null && item.value === null));
  assert.equal('aiSchedule' in humanView, false);
  assert.equal('deck' in humanView, false);
  assert.equal(humanView.deckCount, game.deck.length);
  const aiView = viewForPlayer(game, 1);
  assert.deepEqual(aiView.players[1].hand, game.players[1].hand);
  assert.ok(aiView.players[0].hand.every(item => item.id === null && item.value === null));
  assert.ok(aiView.aiSchedule);
});

test('컴퓨터는 사람의 숨은 카드가 달라도 같은 공개 정보에서 같은 결정을 한다', () => {
  const first = createGame({ rng: seeded(43), difficulty: 'hard' });
  first.phase = 'playing';
  first.players[1].hand = [card(35), card(80)];
  first.players[0].hand = [card(10), card(90)];
  first.aiSchedule = { 'mind-35': 3000, 'mind-80': 8000 };
  const second = structuredClone(first);
  second.players[0].hand = [card(20), card(99)];
  assert.deepEqual(chooseAiMove(viewForPlayer(first, 1), 3500), chooseAiMove(viewForPlayer(second, 1), 3500));
});

test('컴퓨터는 예정 시각 전에는 기다리고 이후에도 자기 최저 카드만 낸다', () => {
  const game = createGame({ rng: seeded(47), difficulty: 'normal' });
  game.phase = 'playing';
  game.players[1].hand = [card(35), card(80)];
  game.aiSchedule = { 'mind-35': 3000, 'mind-80': 8000 };
  const view = viewForPlayer(game, 1);
  assert.equal(chooseAiMove(view, 2999), null);
  assert.deepEqual(chooseAiMove(view, 3000), { type: 'play', cardId: 'mind-35' });
});

test('난이도가 높을수록 숫자 기반 목표 시각의 평균 오차가 작다', () => {
  const hand = createDeck();
  const error = difficulty => {
    const schedule = createAiSchedule(hand, difficulty, seeded(53), 100);
    return hand.reduce((sum, item) => sum + Math.abs(schedule[item.id] - item.value * 100), 0) / hand.length;
  };
  const easy = error('easy');
  const normal = error('normal');
  const hard = error('hard');
  assert.ok(hard < normal && normal < easy, `쉬움 ${easy}, 보통 ${normal}, 어려움 ${hard}`);
});

function simulateWithPerfectHuman(difficulty, seed) {
  const rng = seeded(seed);
  let game = createGame({ rng, difficulty });
  let steps = 0;
  while (game.phase !== 'gameOver' && steps < 1000) {
    const cards = [...game.deck, ...game.pile, ...game.removed, ...game.players.flatMap(player => player.hand)];
    assert.equal(cards.length, 100);
    assert.equal(new Set(cards.map(item => item.id)).size, 100);
    if (game.phase === 'focus') {
      game = applyMove(game, { type: 'startLevel' }, 0);
      continue;
    }
    if (game.phase === 'paused') {
      game = applyMove(game, { type: 'resume' }, 0);
      continue;
    }
    if (game.phase === 'levelComplete') {
      game = applyMove(game, { type: 'nextLevel' }, 0, rng);
      continue;
    }
    const human = game.players[0].hand[0];
    const computer = game.players[1].hand[0];
    const humanTarget = human ? human.value * 140 : Infinity;
    const computerTarget = computer ? game.aiSchedule[computer.id] : Infinity;
    const elapsed = Math.min(humanTarget, computerTarget);
    if (humanTarget <= computerTarget) {
      game = applyMove(game, { type: 'play', cardId: human.id }, 0, rng);
    } else {
      const move = chooseAiMove(viewForPlayer(game, 1), elapsed);
      assert.ok(legalMoves(game, 1).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
      game = applyMove(game, move, 1, rng);
    }
    steps += 1;
  }
  assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed}가 ${steps}단계에서 끝나지 않았습니다.`);
  return game.level;
}

test('반복 완주 시뮬레이션에서 어려움 컴퓨터가 보통보다, 보통이 쉬움보다 높은 레벨에 도달한다', { timeout: 30000 }, () => {
  const average = difficulty => {
    let total = 0;
    for (let seed = 1; seed <= 120; seed += 1) total += simulateWithPerfectHuman(difficulty, seed * 101);
    return total / 120;
  };
  const easy = average('easy');
  const normal = average('normal');
  const hard = average('hard');
  assert.ok(hard > normal && normal > easy, `쉬움 ${easy}, 보통 ${normal}, 어려움 ${hard}`);
});
