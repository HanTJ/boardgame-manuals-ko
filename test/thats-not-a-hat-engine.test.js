import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyMove, chooseAiMove, createDeck, createGame, GIFT_LABELS, legalMoves, projectObservation
} from '../games/thats-not-a-hat/play/engine.js';

const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};

test('선물 덱은 서로 다른 이름과 ID를 가진 110장이고 양쪽 화살표를 포함한다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 110);
  assert.equal(new Set(deck.map(card => card.id)).size, 110);
  assert.equal(new Set(deck.map(card => card.label)).size, 110);
  assert.deepEqual(new Set(deck.map(card => card.direction)), new Set(['left', 'right']));
});

test('1인 게임은 사람 1명과 컴퓨터 2명, 공개 선물 1장씩, 첫 선물 제안으로 시작한다', () => {
  const game = createGame({ difficulty: 'normal', rng: seeded(7) });
  assert.deepEqual(game.players.map(player => player.kind), ['human', 'ai', 'ai']);
  assert.deepEqual(game.players.map(player => player.gifts.length), [1, 1, 1]);
  assert.ok(game.players.every(player => player.gifts[0].faceUp));
  assert.equal(game.shop.length, 106);
  assert.equal(game.phase, 'awaitResponse');
  assert.equal(game.pendingOffer.giver, 0);
  assert.equal(game.pendingOffer.claim, game.pendingOffer.card.label);
  assert.notEqual(game.pendingOffer.receiver, 0);
  assert.equal(game.log.some(message => message.includes(game.pendingOffer.card.label)), false);
});

test('선물을 받으면 새 선물을 위에 놓고 가장 오래된 선물만 다음에 건넨다', () => {
  let game = createGame({ rng: seeded(11) });
  const receiver = game.pendingOffer.receiver;
  const incomingId = game.pendingOffer.card.id;
  const oldestId = game.players[receiver].gifts[0].id;
  assert.deepEqual(legalMoves(game, receiver), [{ type: 'accept' }, { type: 'reject' }]);

  game = applyMove(game, { type: 'accept' }, receiver);
  assert.equal(game.phase, 'awaitClaim');
  assert.equal(game.pendingPass.actor, receiver);
  assert.equal(game.pendingPass.card.id, oldestId);
  assert.equal(game.pendingPass.card.faceUp, false);
  assert.equal(game.players[receiver].gifts.length, 1);
  assert.equal(game.players[receiver].gifts[0].id, incomingId);

  const claim = game.pendingPass.card.label;
  game = applyMove(game, { type: 'claim', label: claim }, receiver);
  assert.equal(game.phase, 'awaitResponse');
  assert.equal(game.pendingOffer.giver, receiver);
  assert.equal(game.pendingOffer.card.id, oldestId);
  assert.equal(game.pendingOffer.claim, claim);
});

test('잘못 말한 선물을 거절하면 준 사람이 벌점 카드를 받고 새 선물을 즉시 건넨다', () => {
  let game = createGame({ rng: seeded(13) });
  const giver = game.pendingOffer.giver;
  const receiver = game.pendingOffer.receiver;
  const revealed = game.pendingOffer.card;
  game.pendingOffer.claim = GIFT_LABELS.find(label => label !== revealed.label);
  const shopBefore = game.shop.length;

  game = applyMove(game, { type: 'reject' }, receiver);
  assert.equal(game.players[giver].penalties.length, 1);
  assert.equal(game.players[giver].penalties[0].id, revealed.id);
  assert.equal(game.players[receiver].penalties.length, 0);
  assert.equal(game.shop.length, shopBefore - 1);
  assert.equal(game.phase, 'awaitResponse');
  assert.equal(game.pendingOffer.giver, giver);
  assert.equal(game.pendingOffer.claim, game.pendingOffer.card.label);
});

test('정확히 말한 선물을 거절하면 거절한 사람이 벌점을 받는다', () => {
  let game = createGame({ rng: seeded(17) });
  const receiver = game.pendingOffer.receiver;
  const revealedId = game.pendingOffer.card.id;
  game = applyMove(game, { type: 'reject' }, receiver);
  assert.equal(game.players[receiver].penalties.length, 1);
  assert.equal(game.players[receiver].penalties[0].id, revealedId);
  assert.equal(game.pendingOffer.giver, receiver);
});

test('세 번째 벌점은 즉시 게임을 끝내며 새 선물을 뽑지 않는다', () => {
  let game = createGame({ rng: seeded(19) });
  const receiver = game.pendingOffer.receiver;
  game.players[receiver].penalties = createDeck().slice(0, 2);
  const shopBefore = game.shop.length;
  game = applyMove(game, { type: 'reject' }, receiver);
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.shop.length, shopBefore);
  assert.equal(game.pendingOffer, null);
  assert.equal(game.players[receiver].penalties.length, 3);
  assert.ok(game.winnerIndexes.every(index => index !== receiver));
  assert.deepEqual(legalMoves(game, receiver), []);
});

test('관찰 뷰는 뒷면 선물의 실제 이름과 다른 컴퓨터의 기억을 숨긴다', () => {
  const game = createGame({ difficulty: 'hard', rng: seeded(23) });
  const observer = game.pendingOffer.receiver;
  const view = projectObservation(game, observer);
  assert.equal(view.pendingOffer.card.label, null);
  assert.equal(view.pendingOffer.card.icon, null);
  assert.ok(view.players.flatMap(player => player.gifts).filter(card => card.faceUp).every(card => card.direction === null));
  assert.equal(view.shopTop.direction, null);
  assert.equal('shop' in view, false);
  assert.equal('memories' in view, false);
  assert.ok(view.memory);
  assert.ok(view.players.flatMap(player => player.gifts).every(card => card.faceUp || card.label === null));
});

test('컴퓨터 결정은 실제 뒷면 값이 아니라 자신의 기억과 공개 정보에만 좌우된다', () => {
  const first = createGame({ difficulty: 'hard', rng: seeded(29) });
  const actor = first.pendingOffer.receiver;
  const second = structuredClone(first);
  second.pendingOffer.card.label = GIFT_LABELS.find(label => label !== first.pendingOffer.card.label);
  second.pendingOffer.card.icon = '❓';
  const rngA = seeded(31);
  const rngB = seeded(31);
  assert.deepEqual(
    chooseAiMove(projectObservation(first, actor), rngA),
    chooseAiMove(projectObservation(second, actor), rngB)
  );
});

test('모든 난이도의 컴퓨터는 legalMoves 안에서만 행동한다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let game = createGame({ difficulty, rng: seeded(37) });
    let actor = game.pendingOffer.receiver;
    let move = chooseAiMove(projectObservation(game, actor), seeded(41));
    assert.ok(legalMoves(game, actor).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
    game = applyMove(game, { type: 'accept' }, actor);
    actor = game.pendingPass.actor;
    move = chooseAiMove(projectObservation(game, actor), seeded(43));
    assert.ok(legalMoves(game, actor).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
  }
});

test('난이도가 높을수록 같은 기억의 신뢰도가 오래 유지된다', () => {
  const confidence = difficulty => {
    const game = createGame({ difficulty, rng: seeded(47) });
    game.turn += 6;
    const actor = game.pendingOffer.receiver;
    return Object.values(projectObservation(game, actor).memory)[0].confidence;
  };
  assert.ok(confidence('hard') > confidence('normal'));
  assert.ok(confidence('normal') > confidence('easy'));
});

function assertCardConservation(game) {
  const cards = [
    ...game.shop,
    ...game.players.flatMap(player => [...player.gifts, ...player.penalties]),
    ...(game.pendingOffer ? [game.pendingOffer.card] : []),
    ...(game.pendingPass ? [game.pendingPass.card] : [])
  ];
  assert.equal(cards.length, 110);
  assert.equal(new Set(cards.map(card => card.id)).size, 110);
}

function simulate(difficulty, seed) {
  const rng = seeded(seed);
  let game = createGame({ difficulty, rng });
  let steps = 0;
  while (game.phase !== 'gameOver' && steps < 2000) {
    assertCardConservation(game);
    const actor = game.phase === 'awaitResponse' ? game.pendingOffer.receiver : game.pendingPass.actor;
    const player = game.players[actor];
    let move;
    if (player.kind === 'ai') {
      move = chooseAiMove(projectObservation(game, actor), rng);
    } else if (game.phase === 'awaitResponse') {
      move = { type: game.pendingOffer.claim === game.pendingOffer.card.label ? 'accept' : 'reject' };
    } else {
      move = { type: 'claim', label: game.pendingPass.card.label };
    }
    assert.ok(legalMoves(game, actor).some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
    game = applyMove(game, move, actor);
    steps += 1;
  }
  assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed} exceeded turn cap`);
  assert.ok(steps < 2000);
  assertCardConservation(game);
  return game;
}

test('각 난이도에서 200게임씩 규칙 위반이나 카드 유실 없이 끝난다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 200; seed += 1) simulate(difficulty, seed * 97);
  }
});
