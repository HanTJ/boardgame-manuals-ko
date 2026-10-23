import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMove, chooseAiMove, createCardManifest, createGame, ITEMS, legalMoves, projectObservation } from '../games/clue-suspect/play/engine.js';

test('고급 2인 게임 구성은 증거 15장과 사건 파일 60장이다', () => {
  const cards = createCardManifest();
  assert.equal(cards.length, 75);
  assert.equal(new Set(cards.map(card => card.id)).size, 75);
  assert.equal(cards.filter(card => card.kind === 'evidence').length, 15);
  assert.equal(cards.filter(card => card.kind === 'caseFile').length, 60);
  assert.deepEqual(
    Object.fromEntries(['suspect', 'location', 'weapon'].map(category => [category, ITEMS.filter(item => item.category === category).length])),
    { suspect: 6, location: 5, weapon: 4 }
  );
  for (const item of ITEMS) {
    assert.equal(cards.filter(card => card.itemKey === item.key && card.kind === 'evidence').length, 1);
    assert.equal(cards.filter(card => card.itemKey === item.key && card.kind === 'caseFile').length, 4);
  }
});

test('새 게임은 범인·장소·흉기를 하나씩 숨기고 증거를 6장씩 나눈다', () => {
  const game = createGame({ difficulty: 'hard', rng: () => 0.25 });
  assert.equal(game.phase, 'ask');
  assert.equal(game.currentPlayer, 0);
  assert.equal(game.solution.length, 3);
  assert.deepEqual(game.solution.map(card => card.category).sort(), ['location', 'suspect', 'weapon']);
  assert.deepEqual(game.players.map(player => player.evidence.length), [6, 6]);
  assert.equal(new Set([...game.solution, ...game.players.flatMap(player => player.evidence)].map(card => card.id)).size, 15);
  for (const player of game.players) {
    assert.deepEqual(player.knownInnocent.slice().sort(), player.evidence.map(card => card.itemKey).sort());
    assert.deepEqual(player.knownSolution, []);
  }
  assert.equal(game.difficulty, 'hard');
  assert.equal(game.turn, 1);
});

test('질문자는 서로 다른 항목 두 개를 묻고 응답자는 가진 증거 한 장만 보여 준다', () => {
  const game = createGame({ rng: () => 0.4 });
  const opening = legalMoves(game, 0);
  assert.equal(opening.filter(move => move.type === 'ask').length, 105);
  assert.equal(opening.filter(move => move.type === 'accuse').length, 120);
  assert.deepEqual(legalMoves(game, 1), []);

  const pair = game.players[1].evidence.slice(0, 2).map(card => card.itemKey);
  const asked = applyMove(game, { type: 'ask', itemKeys: pair }, 0);
  assert.ok(pair.every(itemKey => asked.log[0].includes(ITEMS.find(item => item.key === itemKey).name)));
  assert.equal(asked.phase, 'answer');
  assert.equal(asked.currentPlayer, 0);
  assert.deepEqual(legalMoves(asked, 1).map(move => move.cardId).sort(), game.players[1].evidence.slice(0, 2).map(card => card.id).sort());
  assert.deepEqual(legalMoves(asked, 0), []);

  const shownCard = game.players[1].evidence[0];
  const answered = applyMove(asked, { type: 'showEvidence', cardId: shownCard.id }, 1);
  assert.equal(answered.phase, 'ask');
  assert.equal(answered.currentPlayer, 1);
  assert.equal(answered.turn, 2);
  assert.ok(answered.players[0].knownInnocent.includes(shownCard.itemKey));
  assert.ok(answered.log[0].includes(ITEMS.find(item => item.key === shownCard.itemKey).name));
  assert.equal(answered.question, null);
  assert.deepEqual(game.players[0].knownInnocent.includes(shownCard.itemKey), false);
});

test('2인 게임에서 상대가 도울 수 없으면 내 손에도 없는 질문 항목은 정답으로 확정된다', () => {
  const game = createGame({ rng: () => 0.6, startingPlayer: 0 });
  const solution = game.solution[0];
  const ownCard = game.players[0].evidence[0];
  const asked = applyMove(game, { type: 'ask', itemKeys: [solution.itemKey, ownCard.itemKey] }, 0);
  assert.deepEqual(legalMoves(asked, 1), [{ type: 'cannotHelp' }]);
  const answered = applyMove(asked, { type: 'cannotHelp' }, 1);
  assert.ok(answered.players[0].knownSolution.includes(solution.itemKey));
  assert.ok(!answered.players[0].knownSolution.includes(ownCard.itemKey));
  assert.equal(answered.currentPlayer, 1);
});

function wrongAccusation(game) {
  return ['suspect', 'location', 'weapon'].map(category => {
    const answer = game.solution.find(card => card.category === category).itemKey;
    return ITEMS.find(item => item.category === category && item.key !== answer).key;
  });
}

test('2인 고발은 상대도 반드시 고발하고 첫 고발자의 정답을 먼저 판정한다', () => {
  const game = createGame({ rng: () => 0.2 });
  const correct = ['suspect', 'location', 'weapon'].map(category => game.solution.find(card => card.category === category).itemKey);
  const first = applyMove(game, { type: 'accuse', itemKeys: correct }, 0);
  assert.equal(first.phase, 'counterAccuse');
  assert.equal(legalMoves(first, 1).filter(move => move.type === 'counterAccuse').length, 120);
  assert.deepEqual(legalMoves(first, 0), []);

  const result = applyMove(first, { type: 'counterAccuse', itemKeys: wrongAccusation(game) }, 1);
  assert.equal(result.phase, 'gameOver');
  assert.equal(result.winnerIndex, 0);
  assert.deepEqual(result.accusations, [correct, wrongAccusation(game)]);
});

test('첫 고발이 틀리고 상대 고발이 맞으면 상대가 이기며 둘 다 틀리면 범인이 이긴다', () => {
  const game = createGame({ rng: () => 0.7, startingPlayer: 0 });
  const correct = ['suspect', 'location', 'weapon'].map(category => game.solution.find(card => card.category === category).itemKey);
  const wrong = wrongAccusation(game);
  const firstWrong = applyMove(game, { type: 'accuse', itemKeys: wrong }, 0);
  const secondCorrect = applyMove(firstWrong, { type: 'counterAccuse', itemKeys: correct }, 1);
  assert.equal(secondCorrect.winnerIndex, 1);

  const bothWrong = applyMove(firstWrong, { type: 'counterAccuse', itemKeys: wrong }, 1);
  assert.equal(bothWrong.phase, 'gameOver');
  assert.equal(bothWrong.winnerIndex, null);
  assert.equal(bothWrong.outcome, 'culprit');
});

test('관찰 뷰는 상대 증거와 봉투 정답의 ID와 항목을 게임 종료 전까지 숨긴다', () => {
  const game = createGame({ rng: () => 0.35 });
  const view = projectObservation(game, 1);
  assert.deepEqual(view.players[1].evidence, game.players[1].evidence);
  assert.equal(view.players[0].evidence.length, 6);
  assert.ok(view.players[0].evidence.every(card => card.id === null && card.itemKey === null));
  assert.ok(view.solution.every(card => card.id === null && card.itemKey === null));
  assert.deepEqual(view.knowledge.knownInnocent.slice().sort(), game.players[1].knownInnocent.slice().sort());

  const hiddenVariant = structuredClone(game);
  const solutionIndex = hiddenVariant.solution.findIndex(card => card.category === 'suspect');
  const handIndex = hiddenVariant.players[0].evidence.findIndex(card => card.category === 'suspect');
  const priorSolution = hiddenVariant.solution[solutionIndex];
  hiddenVariant.solution[solutionIndex] = hiddenVariant.players[0].evidence[handIndex];
  hiddenVariant.players[0].evidence[handIndex] = priorSolution;
  hiddenVariant.players[0].knownInnocent = hiddenVariant.players[0].evidence.map(card => card.itemKey);
  assert.deepEqual(projectObservation(hiddenVariant, 1), view);
});

test('쉬움·보통·어려움 AI는 모든 단계에서 legalMoves 안의 행동만 고른다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let game = createGame({ difficulty, rng: () => 0.3 });
    game.currentPlayer = 1;
    let view = projectObservation(game, 1);
    let move = chooseAiMove(view, () => 0.4);
    assert.ok(view.moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
    game = applyMove(game, move, 1);
    view = projectObservation(game, 0);
    move = chooseAiMove(view, () => 0.4);
    assert.ok(view.moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
  }
});

test('정답 후보가 하나씩 남으면 AI는 질문하지 않고 정확히 고발한다', () => {
  const game = createGame({ difficulty: 'hard', rng: () => 0.45 });
  game.currentPlayer = 1;
  const answers = game.solution.map(card => card.itemKey);
  game.players[1].knownInnocent = ITEMS.filter(item => !answers.includes(item.key)).map(item => item.key);
  game.players[1].knownSolution = [...answers];
  const move = chooseAiMove(projectObservation(game, 1), () => 0.2);
  assert.equal(move.type, 'accuse');
  assert.deepEqual(new Set(move.itemKeys), new Set(answers));
});

test('어려움 AI는 미확정 후보 하나와 자기 무죄 증거 하나를 묶어 질문한다', () => {
  const game = createGame({ difficulty: 'hard', rng: () => 0.2 });
  game.currentPlayer = 1;
  const view = projectObservation(game, 1);
  const move = chooseAiMove(view, () => 0.1);
  assert.equal(move.type, 'ask');
  const innocent = new Set(view.knowledge.knownInnocent);
  assert.equal(move.itemKeys.filter(itemKey => innocent.has(itemKey)).length, 1);
  assert.equal(move.itemKeys.filter(itemKey => !innocent.has(itemKey)).length, 1);
});

test('나이를 비교할 수 없는 컴퓨터 대전은 난수로 시작 플레이어를 정한다', () => {
  assert.equal(createGame({ rng: () => 0.1 }).currentPlayer, 0);
  assert.equal(createGame({ rng: () => 0.9 }).currentPlayer, 1);
});

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

test('모든 난이도의 자동 대국은 카드 보존과 합법 행동을 지키며 끝난다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 30; seed += 1) {
      const rng = seeded(seed);
      let game = createGame({ difficulty, rng });
      for (let step = 0; step < 250 && game.phase !== 'gameOver'; step += 1) {
        const actor = game.phase === 'ask' ? game.currentPlayer : 1 - game.currentPlayer;
        const view = projectObservation(game, actor);
        const move = chooseAiMove(view, rng);
        assert.ok(view.moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(move)));
        game = applyMove(game, move, actor);
        const cards = [...game.solution, ...game.players.flatMap(player => player.evidence)];
        assert.equal(cards.length, 15);
        assert.equal(new Set(cards.map(card => card.id)).size, 15);
      }
      assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed}`);
    }
  }
});

test('숨은 사람 증거와 봉투 정답이 달라도 같은 AI 관찰에서는 같은 행동을 고른다', () => {
  const game = createGame({ difficulty: 'hard', rng: () => 0.35 });
  game.currentPlayer = 1;
  const variant = structuredClone(game);
  const solutionIndex = variant.solution.findIndex(card => card.category === 'location');
  const handIndex = variant.players[0].evidence.findIndex(card => card.category === 'location');
  [variant.solution[solutionIndex], variant.players[0].evidence[handIndex]] = [variant.players[0].evidence[handIndex], variant.solution[solutionIndex]];
  variant.players[0].knownInnocent = variant.players[0].evidence.map(card => card.itemKey);
  const first = projectObservation(game, 1);
  const second = projectObservation(variant, 1);
  assert.deepEqual(first, second);
  assert.deepEqual(chooseAiMove(first, () => 0.25), chooseAiMove(second, () => 0.25));
});

test('난이도 전략은 같은 보통 상대에게 쉬움보다 보통이, 보통보다 어려움이 강하다', () => {
  const wins = {};
  for (const difficulty of ['easy', 'normal', 'hard']) {
    wins[difficulty] = 0;
    for (let seed = 1; seed <= 300; seed += 1) {
      const rng = seeded(seed * 17 + 3);
      let game = createGame({ difficulty, rng });
      for (let step = 0; step < 250 && game.phase !== 'gameOver'; step += 1) {
        const actor = game.phase === 'ask' ? game.currentPlayer : 1 - game.currentPlayer;
        const observation = projectObservation(game, actor);
        const policyView = { ...observation, difficulty: actor === 1 ? difficulty : 'normal' };
        game = applyMove(game, chooseAiMove(policyView, rng), actor);
      }
      assert.equal(game.phase, 'gameOver');
      if (game.winnerIndex === 1) wins[difficulty] += 1;
    }
  }
  assert.ok(wins.normal > wins.easy, JSON.stringify(wins));
  assert.ok(wins.hard > wins.normal, JSON.stringify(wins));
});
