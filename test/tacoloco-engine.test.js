import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chooseAiMove,
  createDeck,
  createGame,
  legalMoves,
  playCard,
  resolveLegendary,
  scoreGame,
  shouldAiDefend
} from '../games/tacoloco/play/engine.js';

test('공식 구성대로 70장 덱을 만든다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 70);
  const counts = deck.reduce((map, card) => map.set(card.kind === 'number' ? String(card.value) : card.kind, (map.get(card.kind === 'number' ? String(card.value) : card.kind) ?? 0) + 1), new Map());
  assert.deepEqual(Object.fromEntries(counts), {
    '1': 8, '2': 8, '3': 8, '4': 8, '5': 8,
    '6': 6, '7': 4, '8': 4, '9': 4,
    legendary: 6, lonesome: 6
  });
  assert.equal(new Set(deck.map(card => card.id)).size, 70);
});

function state(overrides = {}) {
  return {
    players: [
      { name: '나', hand: [], collected: [] },
      { name: '컴퓨터', hand: [], collected: [] }
    ],
    deck: [],
    piles: [],
    current: 0,
    lastNumber: null,
    pendingLegendary: null,
    nextPileId: 1,
    turn: 1,
    log: [],
    gameOver: false,
    winners: [],
    ...overrides
  };
}

const number = (id, value) => ({ id, kind: 'number', value });
const special = (id, kind) => ({ id, kind });

test('같은 숫자를 연속으로 내면 기존 타코가 아니라 새 타코를 만든다', () => {
  const game = state({
    players: [
      { name: '나', hand: [number('n3-hand', 3)], collected: [] },
      { name: '컴퓨터', hand: [], collected: [] }
    ],
    piles: [{ id: 'pile-1', cards: [number('n3-base', 3)], sum: 3 }],
    lastNumber: 3,
    nextPileId: 2
  });
  const moves = legalMoves(game, 0);
  assert.deepEqual(moves, [{ cardId: 'n3-hand', targetPileId: null }]);
  const next = playCard(game, moves[0]);
  assert.equal(next.piles.length, 2);
  assert.equal(next.piles[1].sum, 3);
});

test('합계 11 타코는 상대에게 주고 11 초과 타코는 낸 사람이 가져간다', () => {
  const basePlayers = [
    { name: '나', hand: [number('n5', 5)], collected: [] },
    { name: '컴퓨터', hand: [], collected: [] }
  ];
  const perfect = playCard(state({
    players: structuredClone(basePlayers),
    piles: [{ id: 'pile-1', cards: [number('n6', 6)], sum: 6 }]
  }), { cardId: 'n5', targetPileId: 'pile-1' });
  assert.equal(perfect.players[1].collected.length, 2);
  assert.equal(perfect.piles.length, 0);

  const burstPlayers = structuredClone(basePlayers);
  burstPlayers[0].hand = [number('n6-hand', 6)];
  const burst = playCard(state({
    players: burstPlayers,
    piles: [{ id: 'pile-1', cards: [number('n6-base', 6)], sum: 6 }]
  }), { cardId: 'n6-hand', targetPileId: 'pile-1' });
  assert.equal(burst.players[0].collected.length, 2);
  assert.equal(burst.piles.length, 0);
});

test('외로운 타코는 합계를 0으로 초기화하지만 기존 카드는 남긴다', () => {
  const game = state({
    players: [
      { name: '나', hand: [special('lonely-1', 'lonesome')], collected: [] },
      { name: '컴퓨터', hand: [], collected: [] }
    ],
    piles: [{ id: 'pile-1', cards: [number('n8', 8)], sum: 8 }]
  });
  const next = playCard(game, { cardId: 'lonely-1', targetPileId: 'pile-1' });
  assert.equal(next.piles[0].sum, 0);
  assert.equal(next.piles[0].cards.length, 2);
});

test('전설의 타코에 외로운 타코로 대응하면 전설 카드를 낸 사람이 전부 가져간다', () => {
  const game = state({
    players: [
      { name: '나', hand: [special('legend-1', 'legendary')], collected: [] },
      { name: '컴퓨터', hand: [special('lonely-1', 'lonesome')], collected: [] }
    ],
    deck: [number('draw-1', 1), number('draw-2', 2)],
    piles: [{ id: 'pile-1', cards: [number('n4', 4)], sum: 4 }]
  });
  const pending = playCard(game, { cardId: 'legend-1', targetPileId: 'pile-1' });
  assert.equal(pending.pendingLegendary.playerIndex, 0);
  const resolved = resolveLegendary(pending, true);
  assert.equal(resolved.players[0].collected.length, 3);
  assert.equal(resolved.players[1].hand.length, 1);
  assert.equal(resolved.players[0].hand.length, 1);
  assert.equal(resolved.current, 1);
});

test('전설의 타코를 방어하지 않으면 상대가 완성된 타코를 받는다', () => {
  const game = state({
    players: [
      { name: '나', hand: [special('legend-1', 'legendary')], collected: [] },
      { name: '컴퓨터', hand: [], collected: [] }
    ],
    piles: [{ id: 'pile-1', cards: [number('n2', 2)], sum: 2 }]
  });
  const pending = playCard(game, { cardId: 'legend-1', targetPileId: 'pile-1' });
  const resolved = resolveLegendary(pending, false);
  assert.equal(resolved.players[1].collected.length, 2);
  assert.equal(resolved.piles.length, 0);
});

test('테이블이 비었을 때 특수 카드도 새 타코로 낼 수 있다', () => {
  for (const kind of ['lonesome', 'legendary']) {
    const game = state({
      players: [
        { name: '나', hand: [special(`${kind}-1`, kind)], collected: [] },
        { name: '컴퓨터', hand: [], collected: [] }
      ]
    });
    assert.deepEqual(legalMoves(game, 0), [{ cardId: `${kind}-1`, targetPileId: null }]);
    const next = playCard(game, { cardId: `${kind}-1`, targetPileId: null });
    assert.equal(next.piles.length, 1);
    assert.equal(next.piles[0].sum, kind === 'lonesome' ? 0 : 11);
  }
});

test('더미 소진 뒤 다음 플레이어의 손이 비었으면 카드가 남은 플레이어가 계속한다', () => {
  const game = state({
    players: [
      { name: '나', hand: [number('n1', 1), number('n2', 2)], collected: [] },
      { name: '컴퓨터', hand: [], collected: [] }
    ],
    piles: [{ id: 'pile-1', cards: [number('base', 3)], sum: 3 }]
  });
  const next = playCard(game, { cardId: 'n1', targetPileId: 'pile-1' });
  assert.equal(next.gameOver, false);
  assert.equal(next.current, 0);
  assert.equal(next.players[0].hand.length, 1);
});

test('쉬움·보통·어려움 AI는 항상 가능한 수 중 하나를 고른다', () => {
  const game = state({
    current: 1,
    players: [
      { name: '나', hand: [], collected: [] },
      { name: '컴퓨터', hand: [number('n2', 2), number('n7', 7), special('lonely-1', 'lonesome')], collected: [] }
    ],
    piles: [
      { id: 'pile-1', cards: [number('base-4', 4)], sum: 4 },
      { id: 'pile-2', cards: [number('base-9', 9)], sum: 9 }
    ],
    lastNumber: 4
  });
  const legal = legalMoves(game, 1).map(JSON.stringify);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const move = chooseAiMove(game, difficulty, () => 0.42);
    assert.ok(legal.includes(JSON.stringify(move)), `${difficulty} returned an illegal move`);
  }
  const hardMove = chooseAiMove(game, 'hard', () => 0.42);
  const hardCard = game.players[1].hand.find(card => card.id === hardMove.cardId);
  const hardPile = game.piles.find(pile => pile.id === hardMove.targetPileId);
  assert.equal(hardPile.sum + hardCard.value, 11);
});

test('더미와 모든 손패가 비면 가장 적게 가져간 플레이어가 승리한다', () => {
  const result = scoreGame(state({
    players: [
      { name: '나', hand: [], collected: [number('a', 1)] },
      { name: '컴퓨터', hand: [], collected: [number('b', 2), number('c', 3)] }
    ],
    deck: []
  }));
  assert.equal(result.gameOver, true);
  assert.deepEqual(result.winners, [0]);
});

test('모든 난이도에서 100번씩 자동 대국을 끝까지 완료한다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let gameIndex = 0; gameIndex < 100; gameIndex += 1) {
      let seed = gameIndex + 17;
      const rng = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      let game = createGame({ difficulty, rng });
      let actions = 0;
      while (!game.gameOver && actions < 300) {
        if (game.pendingLegendary) {
          const defender = (game.pendingLegendary.playerIndex + 1) % 2;
          const canDefend = game.players[defender].hand.some(card => card.kind === 'lonesome');
          const defend = canDefend && (defender === 1 ? shouldAiDefend(game, difficulty, rng) : rng() < 0.5);
          game = resolveLegendary(game, defend);
        } else {
          const move = chooseAiMove(game, game.current === 1 ? difficulty : 'normal', rng);
          assert.ok(move);
          game = playCard(game, move);
        }
        actions += 1;
      }
      assert.equal(game.gameOver, true, `${difficulty} game ${gameIndex} did not finish`);
      assert.equal(game.players[0].hand.length + game.players[1].hand.length + game.deck.length, 0);
      assert.ok(actions < 300);
    }
  }
});
