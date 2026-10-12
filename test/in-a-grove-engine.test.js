import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyMove,
  chooseAiMove,
  createGame,
  determineCriminal,
  legalMoves,
  viewForPlayer
} from '../games/in-a-grove/play/engine.js';

const tile = value => ({ id: `person-${value}`, value });
const seeded = seed => {
  let value = seed;
  return () => ((value = (value * 48271) % 2147483647) / 2147483647);
};
const move = (moves, predicate) => {
  const found = moves.find(predicate);
  assert.ok(found, `expected move not found in ${JSON.stringify(moves)}`);
  return found;
};

function fixedGame({ suspects = [2, 5, 8], firstPlayer = 0 } = {}) {
  const game = createGame({ rng: seeded(41), firstPlayer });
  game.suspects = suspects.map(tile);
  game.alibis = [tile(3), tile(4)];
  game.publicTile = tile(6);
  game.victim = tile(7);
  return game;
}

test('2인 게임은 숫자 2–8 타일을 중복 없이 사용해 사건을 준비한다', () => {
  const game = createGame({ rng: () => 0.25, firstPlayer: 0 });
  const values = [...game.alibis, game.publicTile, ...game.suspects, game.victim].map(card => card.value).sort((a, b) => a - b);
  assert.deepEqual(values, [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(new Set([...game.alibis, game.publicTile, ...game.suspects, game.victim].map(card => card.id)).size, 7);
  assert.equal(game.phase, 'inspect');
  assert.equal(game.current, 0);
  assert.deepEqual(game.players.map(player => player.supply), [7, 7]);
});

test('용의자 중 5가 없으면 가장 큰 숫자, 있으면 가장 작은 숫자가 범인이다', () => {
  assert.equal(determineCriminal([tile(2), tile(6), tile(8)]), 2);
  assert.equal(determineCriminal([tile(2), tile(5), tile(8)]), 0);
});

test('최초 도착자는 보지 않을 용의자를 정하고 나머지 둘만 확인한다', () => {
  let game = fixedGame();
  assert.deepEqual(legalMoves(game).map(item => item.suspect), [0, 1, 2]);
  game = applyMove(game, { type: 'inspect', suspect: 1 });
  assert.equal(game.phase, 'accuse');
  assert.deepEqual(game.observations[0], [0, 2]);
  assert.equal(viewForPlayer(game, 0).suspects[1].value, null);
  assert.equal(viewForPlayer(game, 0).suspects[0].value, 2);
});

test('사건 공개 뒤에도 실제로 확인했던 용의자와 공개로 알게 된 용의자를 구분한다', () => {
  let game = fixedGame();
  game = applyMove(game, { type: 'inspect', suspect: 1 });
  game = applyMove(game, { type: 'accuse', suspect: 2 });
  game = applyMove(game, { type: 'accuse', suspect: 2 });
  const view = viewForPlayer(game, 0);
  assert.equal(view.suspects[1].value, 5);
  assert.equal(view.suspects[1].observed, false);
  assert.equal(view.suspects[0].observed, true);
});

test('두 번째 탐정은 첫 지목 용의자를 보지 않고 나머지 둘만 확인한다', () => {
  let game = fixedGame();
  game = applyMove(game, { type: 'inspect', suspect: 1 });
  game = applyMove(game, { type: 'accuse', suspect: 2 });
  assert.equal(game.current, 1);
  assert.equal(game.phase, 'accuse');
  assert.deepEqual(game.observations[1], [0, 1]);
  assert.equal(viewForPlayer(game, 1).suspects[2].value, null);
  assert.deepEqual(game.stacks[2], [0]);
});

test('범인 칩은 제거하고 무고한 더미는 맨 위 칩 주인이 전부 받는다', () => {
  let game = fixedGame(); // 5가 있어 suspect 0이 범인
  game = applyMove(game, { type: 'inspect', suspect: 0 });
  game = applyMove(game, { type: 'accuse', suspect: 1 });
  game = applyMove(game, { type: 'accuse', suspect: 1 });
  assert.equal(game.phase, 'roundResult');
  assert.equal(game.result.criminal, 0);
  assert.deepEqual(game.players[0].penalties, []);
  assert.deepEqual(game.players[1].penalties.map(chip => chip.owner), [0, 1]);
  assert.deepEqual(game.players.map(player => player.supply), [6, 6]);
});

test('서로 다른 무고한 용의자를 지목하면 각자 자기 칩 하나를 받는다', () => {
  let game = fixedGame();
  game = applyMove(game, { type: 'inspect', suspect: 2 });
  game = applyMove(game, { type: 'accuse', suspect: 1 });
  game = applyMove(game, { type: 'accuse', suspect: 2 });
  assert.deepEqual(game.players.map(player => player.penalties.length), [1, 1]);
});

test('다음 사건은 최초 도착자가 번갈아 바뀌고 두 사람의 정보가 초기화된다', () => {
  let game = fixedGame();
  game = applyMove(game, { type: 'inspect', suspect: 2 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  game = applyMove(game, { type: 'nextRound' }, seeded(99));
  assert.equal(game.round, 2);
  assert.equal(game.firstPlayer, 1);
  assert.equal(game.current, 1);
  assert.equal(game.phase, 'inspect');
  assert.deepEqual(game.observations, [[], []]);
});

test('무능한 탐정 칩 5개 이상이면 즉시 게임이 끝난다', () => {
  let game = fixedGame();
  game.players[1].penalties = [0, 0, 0].map((owner, index) => ({ owner, round: -index }));
  game = applyMove(game, { type: 'inspect', suspect: 0 });
  game = applyMove(game, { type: 'accuse', suspect: 1 });
  game = applyMove(game, { type: 'accuse', suspect: 1 });
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, 0);
});

test('일곱 번째 사건 뒤 탐정 칩이 소진되면 더 적은 벌점의 플레이어가 승리한다', () => {
  let game = fixedGame();
  game.players[0].supply = 1;
  game.players[1].supply = 1;
  game.players[0].penalties = [{ owner: 0, round: 1 }];
  game.players[1].penalties = [{ owner: 0, round: 1 }, { owner: 1, round: 2 }];
  game = applyMove(game, { type: 'inspect', suspect: 2 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  assert.equal(game.phase, 'gameOver');
  assert.equal(game.winner, 0);
});

test('최종 벌점이 같으면 자기 색 벌점이 적은 플레이어가 앞선다', () => {
  let game = fixedGame({ firstPlayer: 0 });
  game.players[0].supply = 1;
  game.players[1].supply = 1;
  game.players[0].penalties = [{ owner: 0, round: 1 }, { owner: 0, round: 2 }];
  game.players[1].penalties = [{ owner: 0, round: 1 }, { owner: 1, round: 2 }];
  game = applyMove(game, { type: 'inspect', suspect: 2 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  assert.equal(game.winner, 1);
});

test('벌점과 자기 색 벌점까지 같으면 현재 최초 도착자가 앞선다', () => {
  let game = fixedGame({ firstPlayer: 0 });
  game.players[0].supply = 1;
  game.players[1].supply = 1;
  game.players[0].penalties = [{ owner: 1, round: 1 }];
  game.players[1].penalties = [{ owner: 0, round: 1 }];
  game = applyMove(game, { type: 'inspect', suspect: 2 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  game = applyMove(game, { type: 'accuse', suspect: 0 });
  assert.equal(game.winner, 0);
});

test('모든 난이도의 컴퓨터는 항상 legalMoves 중 하나만 선택한다', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    let game = createGame({ rng: seeded(811), difficulty, firstPlayer: 1 });
    for (let step = 0; step < 80 && game.phase !== 'gameOver'; step += 1) {
      const moves = legalMoves(game);
      const selected = chooseAiMove(game, difficulty, game.current, seeded(step + 3));
      assert.ok(moves.some(candidate => JSON.stringify(candidate) === JSON.stringify(selected)));
      game = applyMove(game, selected, seeded(step + 91));
    }
  }
});

test('어려움 AI는 보지 못한 타일의 실제 값이 달라도 같은 정보에서는 같은 선택을 한다', () => {
  let first = fixedGame({ suspects: [2, 5, 8] });
  first = applyMove(first, { type: 'inspect', suspect: 1 });
  first = applyMove(first, { type: 'accuse', suspect: 2 });
  const second = structuredClone(first);
  [second.suspects[2], second.victim] = [second.victim, second.suspects[2]];
  assert.equal(viewForPlayer(first, 1).suspects[2].value, null);
  assert.equal(viewForPlayer(second, 1).suspects[2].value, null);
  assert.deepEqual(chooseAiMove(first, 'hard', 1, () => 0.1), chooseAiMove(second, 'hard', 1, () => 0.1));
});

test('난이도 전략은 쉬움보다 보통이, 보통보다 어려움이 자동 대국에서 강하다', () => {
  const match = (humanLevel, computerLevel, games = 400) => {
    const wins = [0, 0];
    for (let seed = 1; seed <= games; seed += 1) {
      const rng = seeded(seed * 149);
      let game = createGame({ rng, firstPlayer: seed % 2 });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 80) {
        const level = game.current === 0 ? humanLevel : computerLevel;
        game = applyMove(game, chooseAiMove(game, level, game.current, rng), rng);
        steps += 1;
      }
      wins[game.winner] += 1;
    }
    return wins;
  };
  const normalVsEasy = match('normal', 'easy');
  const normalVsHard = match('normal', 'hard');
  assert.ok(normalVsEasy[0] > 240, JSON.stringify(normalVsEasy));
  assert.ok(normalVsHard[1] > 220, JSON.stringify(normalVsHard));
});

test('모든 난이도에서 200번씩 자동 대국이 제한 행동 안에 끝난다', { timeout: 30000 }, () => {
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = seeded(seed * 101);
      let game = createGame({ rng, difficulty, firstPlayer: seed % 2 });
      let steps = 0;
      while (game.phase !== 'gameOver' && steps < 80) {
        const selected = chooseAiMove(game, difficulty, game.current, rng);
        game = applyMove(game, selected, rng);
        steps += 1;
      }
      assert.equal(game.phase, 'gameOver', `${difficulty} seed ${seed}`);
      assert.ok(game.players.every(player => player.supply >= 0));
      assert.ok(game.players.every(player => player.penalties.length <= 6));
    }
  }
});

test('엔진은 목록에 없는 행동을 거부한다', () => {
  const game = fixedGame();
  assert.throws(() => applyMove(game, { type: 'accuse', suspect: 0 }), /허용되지 않은 행동/);
});
