import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, chooseAiMove, createDeck, createGame, isLegalMove, legalMoves, viewForPlayer } from '../games/cabo/play/engine.js';

const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};
const card = (value, id = `fixed-${value}-${Math.random()}`) => ({
  id,
  value,
  ability: [7, 8].includes(value) ? 'peek' : [9, 10].includes(value) ? 'spy' : [11, 12].includes(value) ? 'swap' : null
});
const setRow = (game, player, values, prefix = `p${player}`) => {
  game.players[player].row = values.map((value, index) => ({ card: card(value, `${prefix}-${index}`), faceUp: false }));
  game.players[player].known = game.players[player].row.map(slot => slot.card.id);
};

test('CABO 2판은 0·13 두 장과 1–12 네 장씩인 52장 덱을 사용한다', () => {
  const deck = createDeck();
  assert.equal(deck.length, 52);
  assert.equal(new Set(deck.map(card => card.id)).size, 52);
  for (let value = 0; value <= 13; value += 1) {
    assert.equal(deck.filter(card => card.value === value).length, [0, 13].includes(value) ? 2 : 4);
  }
  assert.ok(deck.filter(card => [7, 8].includes(card.value)).every(card => card.ability === 'peek'));
  assert.ok(deck.filter(card => [9, 10].includes(card.value)).every(card => card.ability === 'spy'));
  assert.ok(deck.filter(card => [11, 12].includes(card.value)).every(card => card.ability === 'swap'));
});

test('새 게임은 두 사람에게 뒷면 카드 4장씩 주고 각자 첫 두 장만 기억시킨다', () => {
  const game = createGame({ rng: seeded(17), firstPlayer: 0 });
  assert.deepEqual(game.players.map(player => player.row.length), [4, 4]);
  assert.ok(game.players.flatMap(player => player.row).every(slot => slot.faceUp === false));
  assert.deepEqual(game.players.map(player => player.known.length), [2, 2]);
  assert.equal(game.deck.length, 43);
  assert.equal(game.discard.length, 1);
  assert.equal(game.phase, 'turn');
  assert.equal(game.current, 0);
});

test('수동 준비에서는 사람이 원하는 두 장을 본 뒤 컴퓨터도 두 장을 보고 시작한다', () => {
  let game = createGame({ rng: seeded(19), firstPlayer: 0, manualSetup: true });
  assert.equal(game.phase, 'setup');
  assert.deepEqual(game.players.map(player => player.known.length), [0, 0]);
  assert.ok(legalMoves(game).some(move => JSON.stringify(move) === JSON.stringify({ type: 'chooseInitial', indices: [1, 3] })));
  game = applyMove(game, { type: 'chooseInitial', indices: [1, 3] });
  assert.deepEqual(game.players[0].known, [game.players[0].row[1].card.id, game.players[0].row[3].card.id]);
  assert.equal(game.current, 1);
  game = applyMove(game, { type: 'chooseInitial', indices: [0, 2] });
  assert.equal(game.phase, 'turn');
  assert.equal(game.current, 0);
});

test('차례에는 덱 뽑기·버림 더미 가져오기·CABO 선언만 할 수 있다', () => {
  const game = createGame({ rng: seeded(23), firstPlayer: 0 });
  assert.deepEqual(legalMoves(game), [
    { type: 'drawDeck' },
    { type: 'takeDiscard' },
    { type: 'callCabo' }
  ]);
  assert.throws(() => applyMove(game, { type: 'discardDrawn' }), /허용되지 않은 행동/);
});

test('덱에서 뽑은 카드는 확인 후 버리거나 자기 카드와 뒷면으로 교환한다', () => {
  let game = createGame({ rng: seeded(29), firstPlayer: 0 });
  const before = game.players[0].row[2].card.id;
  game = applyMove(game, { type: 'drawDeck' });
  const drawn = game.drawn.card;
  assert.equal(game.phase, 'drawn');
  assert.equal(viewForPlayer(game, 0).drawn.value, drawn.value);
  assert.equal(viewForPlayer(game, 1).drawn, null);
  assert.ok(legalMoves(game).some(move => move.type === 'exchange' && move.indices.join(',') === '2'));
  game = applyMove(game, { type: 'exchange', indices: [2] });
  assert.equal(game.players[0].row[2].card.id, drawn.id);
  assert.equal(game.players[0].row[2].faceUp, false);
  assert.equal(game.discard.at(-1).id, before);
  assert.equal(game.current, 1);
  assert.equal(game.phase, 'turn');
});

test('버림 더미에서 가져온 카드는 반드시 교환하고 앞면으로 유지한다', () => {
  let game = createGame({ rng: seeded(31), firstPlayer: 0 });
  const top = game.discard.at(-1);
  game = applyMove(game, { type: 'takeDiscard' });
  assert.equal(game.phase, 'drawn');
  assert.ok(legalMoves(game).every(move => move.type === 'exchange'));
  game = applyMove(game, { type: 'exchange', indices: [1] });
  assert.equal(game.players[0].row[1].card.id, top.id);
  assert.equal(game.players[0].row[1].faceUp, true);
  assert.ok(game.players.every(player => player.known.includes(top.id)));
});

test('같은 숫자 여러 장은 뽑은 한 장과 성공적으로 교환하고 놓을 자리를 고른다', () => {
  let game = createGame({ rng: seeded(37), firstPlayer: 0 });
  game.players[0].row[0].card = card(6, 'pair-a');
  game.players[0].row[2].card = card(6, 'pair-b');
  game.deck.push(card(2, 'replacement'));
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'exchange', indices: [0, 2] });
  assert.equal(game.phase, 'placeExchange');
  assert.equal(viewForPlayer(game, 0).drawn.id, 'replacement');
  assert.equal(viewForPlayer(game, 1).drawn, null);
  assert.deepEqual(legalMoves(game), [
    { type: 'placeExchange', placeAt: 0 },
    { type: 'placeExchange', placeAt: 2 }
  ]);
  game = applyMove(game, { type: 'placeExchange', placeAt: 2 });
  assert.equal(game.players[0].row.length, 3);
  assert.equal(game.players[0].row[1].card.id, 'replacement');
  assert.deepEqual(game.discard.slice(-2).map(item => item.value), [6, 6]);
});

test('여러 장 교환이 틀리면 공개한 뒤 뽑은 카드를 놓을 줄 끝을 고른다', () => {
  let game = createGame({ rng: seeded(41), firstPlayer: 0 });
  game.players[0].row[0].card = card(5, 'wrong-a');
  game.players[0].row[1].card = card(6, 'wrong-b');
  game.deck.push(card(3, 'failed-draw'));
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'exchange', indices: [0, 1] });
  assert.equal(game.phase, 'placeFailed');
  assert.ok(game.players[0].row.slice(0, 2).every(slot => slot.faceUp));
  assert.deepEqual(legalMoves(game), [
    { type: 'placeFailed', drawnAt: 'left' },
    { type: 'placeFailed', drawnAt: 'right' }
  ]);
  game = applyMove(game, { type: 'placeFailed', drawnAt: 'left' });
  assert.equal(game.players[0].row.length, 5);
  assert.equal(game.players[0].row[0].card.id, 'failed-draw');
});

test('세 장 이상 교환 실패는 뽑은 카드와 보지 않은 벌칙 카드의 양 끝을 고른다', () => {
  let game = createGame({ rng: seeded(43), firstPlayer: 0 });
  [4, 4, 5].forEach((value, index) => { game.players[0].row[index].card = card(value, `triple-${index}`); });
  game.deck.push(card(2, 'triple-draw'));
  const penalty = game.deck.at(-2).id;
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'exchange', indices: [0, 1, 2] });
  assert.equal(game.phase, 'placeFailed');
  assert.equal(legalMoves(game).length, 4);
  game = applyMove(game, { type: 'placeFailed', drawnAt: 'right', penaltyAt: 'left' });
  assert.equal(game.players[0].row.length, 6);
  assert.equal(game.players[0].row[0].card.id, penalty);
  assert.equal(game.players[0].row.at(-1).card.id, 'triple-draw');
  assert.equal(game.players[0].row[0].faceUp, false);
  assert.ok(!game.players[0].known.includes(penalty));
});

test('카드가 다섯 장 이상이면 네 장을 넘는 같은 숫자도 한 번에 교환할 수 있다', () => {
  let game = createGame({ rng: seeded(45), firstPlayer: 0 });
  setRow(game, 0, [3, 3, 3, 3, 3]);
  game.deck.push(card(1, 'five-replacement'));
  game = applyMove(game, { type: 'drawDeck' });
  assert.ok(legalMoves(game).some(move => move.type === 'exchange' && move.indices.length === 5));
});

test('긴 줄에서도 모든 조합을 폭발적으로 만들지 않고 임의의 여러 장 교환을 검증한다', () => {
  let game = createGame({ rng: seeded(451), firstPlayer: 0 });
  setRow(game, 0, Array.from({ length: 20 }, (_, index) => index % 14));
  game.deck.push(card(1, 'long-row-draw'));
  game = applyMove(game, { type: 'drawDeck' });
  const selected = { type: 'exchange', indices: [0, 3, 7, 12, 19] };
  assert.equal(isLegalMove(game, selected), true);
  assert.ok(legalMoves(game).length < 10000);
});

test('마지막 덱 카드를 뽑아 여러 장 교환하면 자리 선택까지 마친 뒤 라운드가 끝난다', () => {
  let game = createGame({ rng: seeded(46), firstPlayer: 0 });
  game.players[0].row[0].card = card(2, 'last-pair-a');
  game.players[0].row[1].card = card(2, 'last-pair-b');
  game.deck = [card(0, 'last-draw')];
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'exchange', indices: [0, 1] });
  assert.equal(game.phase, 'placeExchange');
  game = applyMove(game, { type: 'placeExchange', placeAt: 0 });
  assert.equal(game.phase, 'roundResult');
  assert.equal(game.players[0].row[0].card.id, 'last-draw');
});

test('PEEK·SPY·SWAP은 덱에서 뽑아 버릴 때만 합법적으로 정보를 바꾼다', () => {
  let peek = createGame({ rng: seeded(47), firstPlayer: 0 });
  peek.deck.push(card(7, 'peek-action'));
  peek = applyMove(peek, { type: 'drawDeck' });
  assert.ok(legalMoves(peek).some(move => move.type === 'usePeek' && move.target === 2));
  const ownHidden = peek.players[0].row[2].card.id;
  peek = applyMove(peek, { type: 'usePeek', target: 2 });
  assert.ok(peek.players[0].known.includes(ownHidden));

  let spy = createGame({ rng: seeded(53), firstPlayer: 0 });
  spy.deck.push(card(9, 'spy-action'));
  spy = applyMove(spy, { type: 'drawDeck' });
  const otherHidden = spy.players[1].row[2].card.id;
  spy = applyMove(spy, { type: 'useSpy', target: 2 });
  assert.ok(spy.players[0].known.includes(otherHidden));
  assert.ok(!spy.players[1].known.includes(otherHidden));

  let swap = createGame({ rng: seeded(59), firstPlayer: 0 });
  swap.deck.push(card(11, 'swap-action'));
  const mine = swap.players[0].row[0].card.id;
  const theirs = swap.players[1].row[1].card.id;
  swap = applyMove(swap, { type: 'drawDeck' });
  swap = applyMove(swap, { type: 'useSwap', own: 0, other: 1 });
  assert.equal(swap.players[0].row[0].card.id, theirs);
  assert.equal(swap.players[1].row[1].card.id, mine);
});

test('CABO 선언 뒤 상대가 마지막 차례를 마치면 성공한 선언자는 0점을 기록한다', () => {
  let game = createGame({ rng: seeded(61), firstPlayer: 0 });
  setRow(game, 0, [0, 1, 2, 3]);
  setRow(game, 1, [4, 5, 6, 7]);
  game.deck.push(card(13, 'last-turn-draw'));
  game = applyMove(game, { type: 'callCabo' });
  assert.equal(game.current, 1);
  assert.ok(!legalMoves(game).some(move => move.type === 'callCabo'));
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.equal(game.phase, 'roundResult');
  assert.deepEqual(game.result.roundScores, [0, 22]);
  assert.deepEqual(game.players.map(player => player.score), [0, 22]);
});

test('CABO 선언자가 최저가 아니면 카드 합에 10점 벌점을 더한다', () => {
  let game = createGame({ rng: seeded(67), firstPlayer: 0 });
  setRow(game, 0, [5, 5, 5, 5]);
  setRow(game, 1, [0, 1, 2, 3]);
  game.deck.push(card(13, 'bad-cabo-draw'));
  game = applyMove(game, { type: 'callCabo' });
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.deepEqual(game.result.roundScores, [30, 6]);
});

test('12·12·13·13만 가진 카미카제는 0점이고 상대는 50점이다', () => {
  let game = createGame({ rng: seeded(71), firstPlayer: 0 });
  setRow(game, 0, [12, 12, 13, 13]);
  setRow(game, 1, [1, 2, 3, 4]);
  game.deck = [card(6, 'kamikaze-last')];
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.equal(game.result.kamikaze, 0);
  assert.deepEqual(game.result.roundScores, [0, 50]);
});

test('카미카제 상대가 실패한 CABO 선언자라면 50점에 실패 벌점 10점을 더한다', () => {
  let game = createGame({ rng: seeded(72), firstPlayer: 1 });
  setRow(game, 0, [12, 12, 13, 13]);
  setRow(game, 1, [1, 2, 3, 4]);
  game.deck = [card(6, 'kamikaze-cabo-last')];
  game = applyMove(game, { type: 'callCabo' });
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.equal(game.result.kamikaze, 0);
  assert.deepEqual(game.result.roundScores, [0, 60]);
});

test('누적 점수 정확히 100은 한 번만 50으로 재설정한다', () => {
  let game = createGame({ rng: seeded(73), firstPlayer: 0 });
  game.players[0].score = 90;
  setRow(game, 0, [1, 2, 3, 4]);
  setRow(game, 1, [0, 0, 0, 1]);
  game.deck = [card(8, 'reset-last')];
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.equal(game.players[0].score, 50);
  assert.equal(game.players[0].resetUsed, true);
});

test('누군가 100점을 초과하면 누적 점수가 낮은 사람이 승리한다', () => {
  let game = createGame({ rng: seeded(79), firstPlayer: 0 });
  game.players[0].score = 95;
  game.players[1].score = 80;
  setRow(game, 0, [5, 5]);
  setRow(game, 1, [1, 1]);
  game.deck = [card(7, 'game-over-last')];
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, 1);
  assert.deepEqual(game.players.map(player => player.score), [105, 82]);
});

test('다음 라운드는 직전 라운드 점수가 낮은 플레이어부터 새 덱으로 시작한다', () => {
  let game = createGame({ rng: seeded(83), firstPlayer: 0 });
  setRow(game, 0, [1, 2]);
  setRow(game, 1, [4, 5]);
  game.deck = [card(7, 'next-round-last')];
  game = applyMove(game, { type: 'drawDeck' });
  game = applyMove(game, { type: 'discardDrawn' });
  assert.equal(game.phase, 'roundResult');
  game = applyMove(game, { type: 'nextRound' }, seeded(89));
  assert.equal(game.round, 2);
  assert.equal(game.starter, 0);
  assert.equal(game.current, 0);
  assert.deepEqual(game.players.map(player => player.row.length), [4, 4]);
  assert.equal(game.deck.length, 43);

  game.phase = 'roundResult';
  game.players[0].lastRound = 8;
  game.players[1].lastRound = 8;
  game.starter = 0;
  const tied = applyMove(game, { type: 'nextRound' }, seeded(97));
  assert.equal(tied.starter, 0);
});

test('모든 난이도의 컴퓨터는 매 단계에서 legalMoves 안의 행동만 선택한다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const rng = seeded(101 + difficulty.length);
    let game = createGame({ rng, firstPlayer: 1, difficulty });
    for (let step = 0; step < 300 && game.phase !== 'gameOver'; step += 1) {
      const moves = legalMoves(game);
      const selected = chooseAiMove(game, difficulty, game.current, rng);
      assert.ok(moves.some(move => JSON.stringify(move) === JSON.stringify(selected)), `${difficulty}: ${JSON.stringify(selected)}`);
      game = applyMove(game, selected, rng);
    }
  }
});

test('어려움 AI는 자신이 모르는 카드의 실제 값이 달라도 같은 선택을 한다', () => {
  let first = createGame({ rng: seeded(109), firstPlayer: 1, difficulty: 'hard' });
  first.deck.push(card(3, 'known-draw'));
  first = applyMove(first, { type: 'drawDeck' });
  const second = structuredClone(first);
  assert.equal(viewForPlayer(first, 1).players[1].row[2].value, null);
  assert.equal(viewForPlayer(first, 1).players[1].row[2].id, null);
  second.players[1].row[2].card.value = first.players[1].row[2].card.value === 13 ? 0 : 13;
  assert.equal(viewForPlayer(second, 1).players[1].row[2].value, null);
  assert.equal(viewForPlayer(second, 1).players[1].row[2].id, null);
  assert.deepEqual(chooseAiMove(first, 'hard', 1, () => 0.2), chooseAiMove(second, 'hard', 1, () => 0.2));
});

test('모든 난이도의 자동 대국이 제한 행동 안에 게임 종료까지 진행된다', { timeout: 30000 }, () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = seeded(seed * 127);
      let game = createGame({ rng, firstPlayer: seed % 2, difficulty });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 3000) {
        game = applyMove(game, chooseAiMove(game, difficulty, game.current, rng), rng);
        steps += 1;
      }
      assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed} stopped at ${game.phase}`);
      assert.ok(game.players.some(player => player.score > 100));
    }
  }
});

test('어려움은 보통 상대에게 쉬움보다 뚜렷하게 높은 승률을 기록한다', { timeout: 30000 }, () => {
  const winsAgainstNormal = difficulty => {
    let wins = 0;
    for (let seed = 1; seed <= 160; seed += 1) {
      const rng = seeded(seed + 1907);
      let game = createGame({ rng, firstPlayer: seed % 2 });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 3000) {
        const level = game.current === 0 ? 'normal' : difficulty;
        game = applyMove(game, chooseAiMove(game, level, game.current, rng), rng);
        steps += 1;
      }
      assert.equal(game.phase, 'gameOver');
      if (game.winner === 1) wins += 1;
    }
    return wins;
  };

  const easyWins = winsAgainstNormal('easy');
  const hardWins = winsAgainstNormal('hard');
  assert.ok(easyWins < 20, `쉬움 승리 ${easyWins}/160`);
  assert.ok(hardWins > 80, `어려움 승리 ${hardWins}/160`);
  assert.ok(hardWins > easyWins + 60, `쉬움 ${easyWins}, 어려움 ${hardWins}`);
});
