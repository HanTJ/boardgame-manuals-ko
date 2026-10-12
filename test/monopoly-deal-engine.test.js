import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMove,
  chooseAiMove,
  createDeck,
  createGame,
  legalMoves,
  PROPERTY_RULES
} from '../games/monopoly-deal/play/engine.js';

function card(deck, predicate, label = 'card') {
  const found = deck.find(predicate);
  assert.ok(found, `${label} fixture not found`);
  return structuredClone(found);
}

function blankState(overrides = {}) {
  return {
    players: [
      { name: '나', hand: [], bank: [], groups: [] },
      { name: '컴퓨터', hand: [], bank: [], groups: [] }
    ],
    deck: [], discard: [], current: 0, phase: 'action', playsLeft: 3,
    pending: null, payment: null, winner: null, turn: 1, nextGroupId: 10,
    log: [], difficulty: 'normal', ...overrides
  };
}

function group(id, color, cards, buildings = {}) {
  return { id, color, cards, house: buildings.house ?? null, hotel: buildings.hotel ?? null };
}

function move(moves, predicate, label = 'move') {
  const found = moves.find(predicate);
  assert.ok(found, `${label} not found in ${JSON.stringify(moves)}`);
  return found;
}

test('공식 B0965 게임용 카드 106장을 정확한 종류와 고유 ID로 만든다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 106);
  assert.equal(new Set(deck.map(item => item.id)).size, 106);
  const kinds = Object.groupBy(deck, item => item.kind);
  assert.equal(kinds.property.length, 28);
  assert.equal(kinds.wild.length, 11);
  assert.equal(kinds.action.length, 47); // 액션 34 + 임대료 13
  assert.equal(kinds.money.length, 20);
  const actions = Object.fromEntries(Object.entries(Object.groupBy(kinds.action, item => item.action)).map(([key, items]) => [key, items.length]));
  assert.deepEqual(actions, {
    dealBreaker: 2, forcedDeal: 3, slyDeal: 3, justSayNo: 3,
    debtCollector: 3, birthday: 3, doubleRent: 2, house: 3,
    hotel: 2, passGo: 10, rent: 13
  });
});

test('부동산별 세트 크기와 임대료 표가 공식 값과 일치한다', () => {
  assert.deepEqual(PROPERTY_RULES, {
    brown: { size: 2, rents: [1, 2] },
    lightBlue: { size: 3, rents: [1, 2, 3] },
    pink: { size: 3, rents: [1, 2, 4] },
    orange: { size: 3, rents: [1, 3, 5] },
    red: { size: 3, rents: [2, 3, 6] },
    yellow: { size: 3, rents: [2, 4, 6] },
    green: { size: 3, rents: [2, 4, 7] },
    darkBlue: { size: 2, rents: [3, 8] },
    railroad: { size: 4, rents: [1, 2, 3, 4] },
    utility: { size: 2, rents: [1, 2] }
  });
});

test('게임 시작 시 5장씩 나눠 준 뒤 첫 플레이어가 2장을 뽑는다', () => {
  const game = createGame({ rng: () => 0.42 });
  assert.equal(game.players[0].hand.length, 7);
  assert.equal(game.players[1].hand.length, 5);
  assert.equal(game.deck.length, 94);
  assert.equal(game.phase, 'action');
  assert.equal(game.playsLeft, 3);
});

test('돈·액션은 은행에, 부동산은 허용된 색에만 낼 수 있다', () => {
  const deck = createDeck();
  const money = card(deck, c => c.kind === 'money');
  const action = card(deck, c => c.action === 'passGo');
  const wild = card(deck, c => c.kind === 'wild' && c.colors.length === 2);
  const game = blankState();
  game.players[0].hand = [money, action, wild];
  const moves = legalMoves(game);
  assert.ok(moves.some(m => m.type === 'bank' && m.cardId === money.id));
  assert.ok(moves.some(m => m.type === 'bank' && m.cardId === action.id));
  assert.equal(moves.filter(m => m.type === 'property' && m.cardId === wild.id).length, 2);
  assert.ok(!moves.some(m => m.type === 'bank' && m.cardId === wild.id));
});

test('Pass Go는 사용 횟수 1회를 쓰고 카드 2장을 뽑는다', () => {
  const deck = createDeck();
  const pass = card(deck, c => c.action === 'passGo');
  const draw = deck.filter(c => c.id !== pass.id).slice(0, 3);
  const game = blankState({ deck: draw });
  game.players[0].hand = [pass];
  const next = applyMove(game, move(legalMoves(game), m => m.type === 'action' && m.action === 'passGo'));
  assert.equal(next.players[0].hand.length, 2);
  assert.equal(next.playsLeft, 2);
  assert.equal(next.discard.at(-1).action, 'passGo');
});

test('임대료와 두 배 카드는 한 행동으로 선택되며 두 장 사용으로 계산한다', () => {
  const deck = createDeck();
  const rent = card(deck, c => c.action === 'rent' && c.colors.includes('brown'));
  const doubleRent = card(deck, c => c.action === 'doubleRent');
  const brown = deck.filter(c => c.kind === 'property' && c.colors[0] === 'brown').slice(0, 2);
  const game = blankState();
  game.players[0].hand = [rent, doubleRent];
  game.players[0].groups = [group('g1', 'brown', brown)];
  game.players[1].bank = [card(deck, c => c.kind === 'money' && c.value === 5)];
  const rentMove = move(legalMoves(game), m => m.type === 'action' && m.action === 'rent' && m.doubleCardIds?.length === 1);
  const pending = applyMove(game, rentMove);
  assert.equal(pending.phase, 'response');
  const accepted = applyMove(pending, move(legalMoves(pending), m => m.type === 'respond' && m.choice === 'accept'));
  assert.equal(accepted.phase, 'payment');
  assert.equal(accepted.payment.amount, 4);
  assert.equal(accepted.playsLeft, 1);
});

test('임대료 두 배 카드 2장을 임대료와 함께 내면 4배이며 행동 3회를 모두 쓴다', () => {
  const deck = createDeck();
  const rent = card(deck, c => c.action === 'rent' && c.colors.includes('brown'));
  const doubles = deck.filter(c => c.action === 'doubleRent');
  const brown = deck.filter(c => c.kind === 'property' && c.colors[0] === 'brown').slice(0, 2);
  const game = blankState();
  game.players[0].hand = [rent, ...doubles];
  game.players[0].groups = [group('g1', 'brown', brown)];
  game.players[1].bank = [card(deck, c => c.kind === 'money' && c.value === 10)];
  const rentMove = move(legalMoves(game), m => m.type === 'action' && m.action === 'rent' && m.doubleCardIds?.length === 2);
  let next = applyMove(game, rentMove);
  next = applyMove(next, move(legalMoves(next), m => m.type === 'respond' && m.choice === 'accept'));
  assert.equal(next.payment.amount, 8);
  assert.equal(next.playsLeft, 0);
});

test('Just Say No 연쇄는 효과의 취소 상태를 번갈아 뒤집는다', () => {
  const deck = createDeck();
  const debt = card(deck, c => c.action === 'debtCollector');
  const nos = deck.filter(c => c.action === 'justSayNo').slice(0, 2);
  const game = blankState();
  game.players[0].hand = [debt, nos[0]];
  game.players[1].hand = [nos[1]];
  game.players[1].bank = [card(deck, c => c.kind === 'money' && c.value === 5)];
  let next = applyMove(game, move(legalMoves(game), m => m.type === 'action' && m.action === 'debtCollector'));
  next = applyMove(next, move(legalMoves(next), m => m.type === 'respond' && m.choice === 'no'));
  assert.equal(next.pending.active, false);
  assert.equal(next.pending.responder, 0);
  next = applyMove(next, move(legalMoves(next), m => m.type === 'respond' && m.choice === 'no'));
  assert.equal(next.pending.active, true);
  assert.equal(next.pending.responder, 1);
  next = applyMove(next, move(legalMoves(next), m => m.type === 'respond' && m.choice === 'accept'));
  assert.equal(next.phase, 'payment');
  assert.equal(next.payment.amount, 5);
});

test('지불자는 공개된 은행·부동산 중 선택하고 거스름돈 없이 넘긴다', () => {
  const deck = createDeck();
  const bank2 = card(deck, c => c.kind === 'money' && c.value === 2);
  const bank3 = card(deck, c => c.kind === 'money' && c.value === 3);
  const brown = card(deck, c => c.kind === 'property' && c.colors[0] === 'brown');
  const game = blankState({ phase: 'payment', payment: { payer: 1, receiver: 0, amount: 4, selected: [], source: '빚' } });
  game.players[1].bank = [bank2, bank3];
  game.players[1].groups = [group('g2', 'brown', [brown])];
  let next = applyMove(game, move(legalMoves(game), m => m.type === 'paymentToggle' && m.assetKey === `bank:${bank2.id}`));
  next = applyMove(next, move(legalMoves(next), m => m.type === 'paymentToggle' && m.assetKey === `bank:${bank3.id}`));
  next = applyMove(next, move(legalMoves(next), m => m.type === 'paymentConfirm'));
  assert.equal(next.players[0].bank.reduce((sum, c) => sum + c.value, 0), 5);
  assert.equal(next.players[1].bank.length, 0);
  assert.equal(next.phase, 'action');
});

test('지불로 완성 세트를 깨면 붙어 있던 집과 호텔은 원래 소유자의 은행으로 이동한다', () => {
  const deck = createDeck();
  const brown = deck.filter(c => c.kind === 'property' && c.colors[0] === 'brown');
  const house = card(deck, c => c.action === 'house');
  const game = blankState({ phase: 'payment', payment: { payer: 1, receiver: 0, amount: 1, selected: [], source: '임대료' } });
  game.players[1].groups = [group('full', 'brown', brown, { house })];
  let next = applyMove(game, move(legalMoves(game), m => m.type === 'paymentToggle' && m.assetKey === `property:full:${brown[0].id}`));
  next = applyMove(next, move(legalMoves(next), m => m.type === 'paymentConfirm'));
  assert.ok(next.players[1].bank.some(c => c.id === house.id));
  assert.equal(next.players[1].groups[0].house, null);
});

test('슬라이 딜은 미완성 세트만, 딜 브레이커는 완성 세트 전체와 건물을 옮긴다', () => {
  const deck = createDeck();
  const sly = card(deck, c => c.action === 'slyDeal');
  const breaker = card(deck, c => c.action === 'dealBreaker');
  const brown = deck.filter(c => c.kind === 'property' && c.colors[0] === 'brown');
  const lightBlue = deck.filter(c => c.kind === 'property' && c.colors[0] === 'lightBlue').slice(0, 2);
  const house = card(deck, c => c.action === 'house');
  const game = blankState();
  game.players[0].hand = [sly, breaker];
  game.players[1].groups = [group('full', 'brown', brown, { house }), group('partial', 'lightBlue', lightBlue)];
  const moves = legalMoves(game);
  assert.ok(moves.some(m => m.action === 'slyDeal' && m.targetGroupId === 'partial'));
  assert.ok(!moves.some(m => m.action === 'slyDeal' && m.targetGroupId === 'full'));
  assert.ok(moves.some(m => m.action === 'dealBreaker' && m.targetGroupId === 'full'));
  assert.ok(!moves.some(m => m.action === 'dealBreaker' && m.targetGroupId === 'partial'));
});

test('집은 완성 세트에, 호텔은 집이 있는 완성 세트에만 놓는다', () => {
  const deck = createDeck();
  const house = card(deck, c => c.action === 'house');
  const hotel = card(deck, c => c.action === 'hotel');
  const brown = deck.filter(c => c.kind === 'property' && c.colors[0] === 'brown');
  const game = blankState();
  game.players[0].hand = [house, hotel];
  game.players[0].groups = [group('g1', 'brown', brown)];
  let moves = legalMoves(game);
  assert.ok(moves.some(m => m.action === 'house' && m.targetGroupId === 'g1'));
  assert.ok(!moves.some(m => m.action === 'hotel'));
  let next = applyMove(game, move(moves, m => m.action === 'house'));
  assert.ok(!next.discard.some(card => card.id === house.id));
  assert.ok(next.players[0].groups[0].house?.id === house.id);
  assert.ok(legalMoves(next).some(m => m.action === 'hotel' && m.targetGroupId === 'g1'));
});

test('차례 종료 시 7장 초과분을 버린 뒤 상대가 카드를 뽑는다', () => {
  const deck = createDeck();
  const game = blankState({ deck: deck.slice(12, 20) });
  game.players[0].hand = deck.slice(0, 8);
  let next = applyMove(game, move(legalMoves(game), m => m.type === 'endTurn'));
  assert.equal(next.phase, 'discard');
  next = applyMove(next, move(legalMoves(next), m => m.type === 'discard'));
  assert.equal(next.current, 1);
  assert.equal(next.players[0].hand.length, 7);
  assert.equal(next.players[1].hand.length, 5);
  assert.equal(next.phase, 'action');
});

test('뽑기 더미가 부족하면 버림 더미를 섞어 계속 뽑는다', () => {
  const deck = createDeck();
  const pass = card(deck, c => c.action === 'passGo');
  const game = blankState({ deck: [deck[0]], discard: [deck[1], deck[2], deck[3]] });
  game.players[0].hand = [pass];
  const next = applyMove(game, move(legalMoves(game), m => m.action === 'passGo'), { rng: () => 0.5 });
  assert.equal(next.players[0].hand.length, 2);
  assert.equal(next.deck.length, 3);
});

test('자기 차례에 서로 다른 완성 세트 3개가 되면 즉시 승리한다', () => {
  const deck = createDeck();
  const colors = ['brown', 'darkBlue', 'utility'];
  const game = blankState();
  game.players[0].groups = colors.slice(0, 2).map((color, index) => group(`g${index}`, color, deck.filter(c => c.kind === 'property' && c.colors[0] === color).slice(0, PROPERTY_RULES[color].size)));
  const utility = deck.filter(c => c.kind === 'property' && c.colors[0] === 'utility');
  game.players[0].groups.push(group('g3', 'utility', [utility[0]]));
  game.players[0].hand = [utility[1]];
  const next = applyMove(game, move(legalMoves(game), m => m.type === 'property' && m.groupId === 'g3'));
  assert.equal(next.phase, 'gameOver');
  assert.equal(next.winner, 0);
});

test('모든 난이도 AI는 언제나 legalMoves 안에서만 선택한다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 0; seed < 40; seed += 1) {
      const game = createGame({ difficulty, rng: () => ((seed * 37 + 11) % 101) / 101 });
      const moves = legalMoves(game);
      const chosen = chooseAiMove(game, difficulty, 0, () => 0.31);
      assert.ok(moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(chosen)));
    }
  }
});

test('자동 대국 중 카드 106장의 ID가 중복되거나 사라지지 않는다', () => {
  let value = 8675309;
  const rng = () => ((value = (value * 48271) % 2147483647) / 2147483647);
  let game = createGame({ difficulty: 'hard', rng });
  for (let step = 0; step < 500 && game.phase !== 'gameOver'; step += 1) {
    const zones = [game.deck, game.discard];
    for (const player of game.players) {
      zones.push(player.hand, player.bank, player.looseBuildings ?? []);
      for (const propertyGroup of player.groups) {
        zones.push(propertyGroup.cards);
        if (propertyGroup.house) zones.push([propertyGroup.house]);
        if (propertyGroup.hotel) zones.push([propertyGroup.hotel]);
      }
    }
    const ids = zones.flat().map(item => item.id);
    assert.equal(ids.length, 106, `step ${step}: card count`);
    assert.equal(new Set(ids).size, 106, `step ${step}: unique IDs`);
    const actor = game.phase === 'payment' ? game.payment.payer : game.phase === 'response' ? game.pending.responder : game.current;
    game = applyMove(game, chooseAiMove(game, 'hard', actor, rng), { rng });
  }
});

test('모든 난이도에서 자동 대국을 반복해 제한 턴 안에 끝낸다', { timeout: 30000 }, () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let match = 0; match < 30; match += 1) {
      let value = (match + 1) * 7919;
      const rng = () => ((value = (value * 48271) % 2147483647) / 2147483647);
      let game = createGame({ difficulty, rng });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 1200) {
        const actor = game.phase === 'payment' ? game.payment.payer : game.phase === 'response' ? game.pending.responder : game.current;
        const selected = chooseAiMove(game, difficulty, actor, rng);
        assert.ok(selected, `no move: ${difficulty} match ${match} phase ${game.phase}`);
        game = applyMove(game, selected, { rng });
        steps += 1;
      }
      assert.equal(game.phase, 'gameOver', `${difficulty} match ${match} exceeded step cap`);
    }
  }
});
