import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, chooseAiMove, createDeck, createGame, legalMoves, viewForPlayer } from '../games/gotown/play/engine.js';

test('GoTown 덱은 고유 ID를 가진 공식 구성 54장이다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 54);
  assert.equal(new Set(deck.map(card => card.id)).size, 54);
  for (let value = 1; value <= 8; value += 1) {
    assert.equal(deck.filter(card => card.type === 'floor' && card.value === value).length, 4);
  }
  assert.deepEqual(Object.fromEntries(
    ['joker', 'dog', 'bone', 'jackhammer', 'wreckingBall', 'milkshake', 'donutTruck', 'thief', 'superThief']
      .map(type => [type, deck.filter(card => card.type === type).length])
  ), {
    joker: 4, dog: 4, bone: 2, jackhammer: 3, wreckingBall: 1,
    milkshake: 3, donutTruck: 1, thief: 3, superThief: 1
  });
});

const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};
const card = (type, value = null, id = `fixed-${type}-${value}`) => ({ id, type, value });

test('새 게임은 각자 5장을 받고 시작 플레이어가 규칙대로 1장을 뽑는다', () => {
  const game = createGame({ rng: seeded(7), firstPlayer: 0 });
  assert.deepEqual(game.players.map(player => player.hand.length), [6, 5]);
  assert.equal(game.deck.length, 43);
  assert.equal(game.current, 0);
  assert.equal(game.phase, 'action');
  assert.deepEqual(game.players.map(player => player.floors), [[], []]);
  assert.ok(legalMoves(game).some(move => move.type === 'endTurn'));
});

test('합이 9인 층 카드 두 장 또는 층 카드와 조커만 한 층으로 건설한다', () => {
  let game = createGame({ rng: seeded(11), firstPlayer: 0 });
  game.players[0].hand = [card('floor', 3, 'three'), card('floor', 6, 'six'), card('floor', 4, 'four'), card('joker', null, 'wild')];
  const moves = legalMoves(game).filter(move => move.type === 'build');
  assert.ok(moves.some(move => move.cards.join(',') === '0,1'));
  assert.ok(moves.some(move => move.cards.join(',') === '2,3'));
  assert.ok(!moves.some(move => move.cards.join(',') === '0,2'));
  game = applyMove(game, { type: 'build', cards: [2, 3] });
  assert.equal(game.players[0].floors.length, 1);
  assert.deepEqual(game.players[0].floors[0].cards.map(item => item.effectiveValue), [4, 5]);
  assert.equal(game.players[0].hand.length, 2);
});

const floor = (left, right, dog = null) => ({
  cards: [
    { card: card(left === 'joker' ? 'joker' : 'floor', left === 'joker' ? null : left, `floor-a-${left}`), effectiveValue: left === 'joker' ? 9 - right : left },
    { card: card(right === 'joker' ? 'joker' : 'floor', right === 'joker' ? null : right, `floor-b-${right}`), effectiveValue: right === 'joker' ? 9 - left : right }
  ],
  dog
});

test('차례 종료 때 3장까지 보충하고 다음 플레이어는 1장을 뽑으며 버림 더미도 재활용한다', () => {
  let game = createGame({ rng: seeded(13), firstPlayer: 0 });
  game.players[0].hand = [card('floor', 1, 'only')];
  game.players[1].hand = Array.from({ length: 8 }, (_, index) => card('floor', 1, `eight-${index}`));
  game.deck = [];
  game.discard = [card('floor', 2, 'recycle-a'), card('floor', 3, 'recycle-b'), card('floor', 4, 'recycle-c')];
  game = applyMove(game, { type: 'endTurn' }, () => 0);
  assert.equal(game.players[0].hand.length, 3);
  assert.equal(game.players[1].hand.length, 8, '8장이면 다음 차례 시작에 뽑지 않는다');
  assert.equal(game.current, 1);
  assert.equal(game.discard.length, 0);
});

test('층 훔치기는 보호받지 않는 꼭대기에서만 가능하고 남은 카드는 버린다', () => {
  let game = createGame({ rng: seeded(17), firstPlayer: 0 });
  game.players[0].hand = [card('floor', 3, 'played')];
  game.players[1].floors = [floor(4, 5), floor(3, 6)];
  const steal = legalMoves(game).find(move => move.type === 'stealFloor' && move.card === 0 && move.stolen === 1);
  assert.ok(steal);
  game = applyMove(game, steal);
  assert.equal(game.players[0].floors.length, 1);
  assert.equal(game.players[1].floors.length, 1);
  assert.deepEqual(game.players[0].floors[0].cards.map(item => item.effectiveValue), [3, 6]);
  assert.equal(game.discard.at(-1).value, 3);

  game.current = 0;
  game.phase = 'action';
  game.players[0].hand = [card('floor', 4, 'blocked')];
  game.players[1].floors.at(-1).dog = card('dog', null, 'guard');
  assert.ok(!legalMoves(game).some(move => move.type === 'stealFloor'));
});

test('상대 층에서 훔친 조커는 원래 대신하던 값을 유지한다', () => {
  let game = createGame({ rng: seeded(19), firstPlayer: 0 });
  game.players[0].hand = [card('floor', 3, 'played-three')];
  game.players[1].floors = [floor(3, 'joker')];
  const steal = legalMoves(game).find(move => move.type === 'stealFloor' && move.stolen === 1);
  game = applyMove(game, steal);
  assert.equal(game.players[0].floors[0].cards[1].card.type, 'joker');
  assert.equal(game.players[0].floors[0].cards[1].effectiveValue, 6);
});

test('경비견은 내 완성 층을 지키고 뼈다귀는 어느 보호견이든 제거한다', () => {
  let game = createGame({ rng: seeded(23), firstPlayer: 0 });
  game.players[0].floors = [floor(1, 8), floor(2, 7)];
  game.players[0].hand = [card('dog', null, 'dog')];
  game = applyMove(game, { type: 'guard', card: 0, floor: 0 });
  assert.equal(game.players[0].floors[0].dog.id, 'dog');

  game.current = 1;
  game.phase = 'action';
  game.players[1].hand = [card('bone', null, 'bone')];
  game = applyMove(game, { type: 'bone', card: 0, floor: 0 });
  assert.equal(game.players[0].floors[0].dog, null);
  assert.deepEqual(game.discard.slice(-2).map(item => item.type), ['bone', 'dog']);
});

test('착암기는 보호받지 않는 꼭대기만, 쇠공은 경비견까지 파괴한다', () => {
  let game = createGame({ rng: seeded(29), firstPlayer: 0 });
  game.players[1].floors = [floor(1, 8), floor(2, 7, card('dog', null, 'top-dog'))];
  game.players[0].hand = [card('jackhammer', null, 'jack'), card('wreckingBall', null, 'ball')];
  assert.ok(!legalMoves(game).some(move => move.type === 'destroy' && move.card === 0));
  assert.ok(legalMoves(game).some(move => move.type === 'destroy' && move.card === 1));
  game = applyMove(game, { type: 'destroy', card: 1 });
  assert.equal(game.players[1].floors.length, 1);
  assert.deepEqual(game.discard.slice(-4).map(item => item.type).sort(), ['dog', 'floor', 'floor', 'wreckingBall'].sort());
});

test('도둑 계열은 상대 손에서 보지 않고 무작위 한 장을 가져온다', () => {
  let game = createGame({ rng: seeded(31), firstPlayer: 0 });
  game.players[0].hand = [card('thief', null, 'thief')];
  game.players[1].hand = [card('floor', 1, 'first'), card('floor', 8, 'second')];
  game = applyMove(game, { type: 'thief', card: 0 }, () => 0.99);
  assert.equal(game.players[0].hand[0].id, 'second');
  assert.equal(game.players[1].hand.length, 1);
  assert.equal(game.discard.at(-1).type, 'thief');
});

test('밀크셰이크는 상대의 다음 차례를 건너뛰고 도넛 푸드트럭은 같은 플레이어에게 새 차례를 준다', () => {
  let game = createGame({ rng: seeded(37), firstPlayer: 0 });
  game.players[0].hand = [card('milkshake', null, 'shake'), card('donutTruck', null, 'truck'), card('floor', 1, 'keep')];
  game = applyMove(game, { type: 'milkshake', card: 0 });
  assert.equal(game.players[1].milkshakes.length, 1);
  game = applyMove(game, { type: 'donutTruck', card: 0 });
  game = applyMove(game, { type: 'endTurn' }, seeded(39));
  assert.equal(game.current, 0, '도넛으로 즉시 연속 차례');
  assert.equal(game.extraTurn, false);
  game = applyMove(game, { type: 'endTurn' }, seeded(41));
  assert.equal(game.current, 0, '컴퓨터의 밀크셰이크 차례를 자동으로 건너뜀');
  assert.equal(game.players[1].milkshakes.length, 0);
  assert.ok(game.discard.some(item => item.type === 'milkshake'));
});

test('다섯 번째 층을 완성하는 즉시 게임이 끝난다', () => {
  let game = createGame({ rng: seeded(43), firstPlayer: 0 });
  game.players[0].floors = [floor(1, 8), floor(2, 7), floor(3, 6), floor(4, 5)];
  game.players[0].hand = [card('floor', 1, 'win-a'), card('floor', 8, 'win-b')];
  game = applyMove(game, { type: 'build', cards: [0, 1] });
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, 0);
  assert.equal(game.log[0], '내가 5층을 완성했습니다.');
  assert.deepEqual(legalMoves(game), []);
});

test('행동할 카드가 없는 8장 손이 양쪽에 고정되면 규칙상 진행 불가로 무승부 처리한다', () => {
  let game = createGame({ rng: seeded(49), firstPlayer: 0 });
  const locked = prefix => [1, 1, 3, 3, 4, 4, 7, 7].map((value, index) => card('floor', value, `${prefix}-${index}`));
  game.players[0].hand = locked('a');
  game.players[1].hand = locked('b');
  game.players[0].floors = [];
  game.players[1].floors = [];
  game = applyMove(game, { type: 'endTurn' }, seeded(50));
  assert.equal(game.phase, 'action');
  game = applyMove(game, { type: 'endTurn' }, seeded(51));
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, null);
  assert.equal(game.result, 'stalemate');
});

test('플레이어 뷰는 상대 손의 값과 ID를 숨기되 공개된 빌딩은 보여 준다', () => {
  const game = createGame({ rng: seeded(47), firstPlayer: 0 });
  game.players[1].floors = [floor(3, 6)];
  const view = viewForPlayer(game, 0);
  assert.equal(view.players[1].hand.length, game.players[1].hand.length);
  assert.ok(view.players[1].hand.every(item => item.type === null && item.id === null));
  assert.deepEqual(view.players[1].floors[0].cards.map(item => item.effectiveValue), [3, 6]);
});

test('쉬움·보통·어려움 AI는 모두 legalMoves 안에서 고르고 전략이 구분된다', () => {
  const game = createGame({ rng: seeded(53), firstPlayer: 1 });
  game.players[1].hand = [card('floor', 1, 'a'), card('floor', 8, 'b'), card('milkshake', null, 'c')];
  game.players[0].floors = [floor(4, 5), floor(3, 6), floor(2, 7), floor(1, 8)];
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const move = chooseAiMove(game, difficulty, 1, () => 0.1);
    assert.ok(legalMoves(game).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
  }
  assert.notDeepEqual(chooseAiMove(game, 'easy', 1, () => 0.99), chooseAiMove(game, 'hard', 1, () => 0.99));
});

test('보통·어려움 AI는 보지 못하는 상대 손의 실제 내용이 달라도 같은 행동을 고른다', () => {
  const first = createGame({ rng: seeded(55), firstPlayer: 1, difficulty: 'hard' });
  first.players[1].hand = [card('floor', 1, 'own-a'), card('floor', 8, 'own-b'), card('milkshake', null, 'own-c')];
  const second = structuredClone(first);
  second.players[0].hand = second.players[0].hand.map((_, index) => card(index % 2 ? 'wreckingBall' : 'joker', null, `hidden-${index}`));
  for (const difficulty of ['normal', 'hard']) {
    assert.deepEqual(
      chooseAiMove(first, difficulty, 1, () => 0.2),
      chooseAiMove(second, difficulty, 1, () => 0.2)
    );
  }
});

test('자동 대국 중 54장 카드의 ID는 어느 영역에서도 사라지거나 중복되지 않는다', () => {
  const rng = seeded(57);
  let game = createGame({ rng, firstPlayer: 0 });
  const collect = state => [
    ...state.deck,
    ...state.discard,
    ...(state.donutCard ? [state.donutCard] : []),
    ...state.players.flatMap(player => [
      ...player.hand,
      ...player.milkshakes,
      ...player.floors.flatMap(level => [...level.cards.map(slot => slot.card), ...(level.dog ? [level.dog] : [])])
    ])
  ];
  for (let step = 0; step < 300 && game.phase !== 'gameOver'; step += 1) {
    const cards = collect(game);
    assert.equal(cards.length, 54);
    assert.equal(new Set(cards.map(item => item.id)).size, 54);
    game = applyMove(game, chooseAiMove(game, 'normal', game.current, rng), rng);
  }
});

test('어려움 AI는 같은 보통 상대에게 보통 AI보다 뚜렷하게 더 자주 승리한다', { timeout: 30000 }, () => {
  const wins = difficulty => {
    let total = 0;
    for (let seed = 1; seed <= 240; seed += 1) {
      const rng = seeded(seed * 149);
      let game = createGame({ rng, firstPlayer: seed % 2, difficulty });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 1200) {
        const level = game.current === 1 ? difficulty : 'normal';
        game = applyMove(game, chooseAiMove(game, level, game.current, rng), rng);
        steps += 1;
      }
      assert.equal(game.phase, 'gameOver');
      if (game.winner === 1) total += 1;
    }
    return total;
  };
  const normalWins = wins('normal');
  const hardWins = wins('hard');
  assert.ok(hardWins >= normalWins + 15, `보통 ${normalWins}, 어려움 ${hardWins}`);
});

test('모든 난이도의 자동 대국이 행동 제한 안에서 종료된다', { timeout: 30000 }, () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 80; seed += 1) {
      const rng = seeded(seed * 97);
      let game = createGame({ rng, firstPlayer: seed % 2, difficulty });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 1200) {
        const move = chooseAiMove(game, game.current === 1 ? difficulty : 'normal', game.current, rng);
        assert.ok(legalMoves(game).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
        game = applyMove(game, move, rng);
        steps += 1;
      }
      assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed} stopped after ${steps}`);
    }
  }
});

test('손이 8장 미만이고 덱에 drawable 카드가 남아 있으면 연속 무행동 후에도 게임이 계속된다', () => {
  let game = createGame({ rng: seeded(201), firstPlayer: 0 });
  game.players[0].hand = [card('floor', 1, 'a1'), card('floor', 2, 'a2'), card('floor', 3, 'a3')];
  game.players[1].hand = [card('floor', 1, 'b1'), card('floor', 2, 'b2'), card('floor', 3, 'b3')];
  game.deck = [card('floor', 4, 'd1'), card('floor', 5, 'd2')];
  game.phase = 'action';
  game.current = 0;
  game.forcedPasses = 0;
  game.actedThisTurn = false;
  let steps = 0;
  while (game.phase !== 'gameOver' && steps < 20) {
    assert.ok(game.deck.length || game.discard.length || game.players.some(p => p.hand.length >= 3),
      `아직 drawable 카드 또는 보충 여지가 있는데 무승부로 끝나면 안 됩니다 (step ${steps})`);
    assert.ok(legalMoves(game).some(move => move.type === 'endTurn'), 'endTurn은 항상 가능해야 합니다');
    game = applyMove(game, { type: 'endTurn' });
    steps += 1;
  }
  assert.notEqual(game.phase, 'gameOver', '손이 8장 미만이고 덱에 카드가 남아 있으면 무승부로 끝나면 안 됩니다');
});

test('도둑으로 손이 9장이 되면 다음 차례 시작에 추가 드로가 없어야 한다', () => {
  let game = createGame({ rng: seeded(302), firstPlayer: 0 });
  game.players[0].hand = [
    ...Array.from({ length: 8 }, (_, index) => card('floor', 1, `held-${index}`)),
    card('thief', null, 'thief')
  ];
  game.players[1].hand = Array.from({ length: 8 }, (_, index) => card('floor', 1, `target-${index}`));
  game.deck = [card('floor', 4, 'draw-marker-a'), card('floor', 5, 'draw-marker-b')];
  game.phase = 'action';
  game.current = 0;
  game.actedThisTurn = false;

  game = applyMove(game, { type: 'thief', card: 8 }, () => 0);
  assert.equal(game.players[0].hand.length, 9, '도둑 카드를 내고 상대 카드 한 장을 가져와 손이 9장으로 유지됩니다');
  game = applyMove(game, { type: 'endTurn' });
  assert.equal(game.current, 1);
  game = applyMove(game, { type: 'endTurn' });
  assert.equal(game.current, 0);
  assert.equal(game.players[0].hand.length, 9, '도둑으로 9장이 된 손에는 다음 차례 시작 드로가 없어야 합니다');
  assert.equal(game.deck.length, 1, '뽑지 않은 카드는 덱에 남아야 합니다');
});
