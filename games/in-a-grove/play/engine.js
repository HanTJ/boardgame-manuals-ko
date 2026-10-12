const TILE_VALUES = Object.freeze([2, 3, 4, 5, 6, 7, 8]);
const SUSPECTS = Object.freeze([0, 1, 2]);

function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function dealScene(rng) {
  const tiles = shuffle(TILE_VALUES.map(value => ({ id: `person-${value}`, value })), rng);
  return {
    alibis: tiles.slice(0, 2),
    publicTile: tiles[2],
    suspects: tiles.slice(3, 6),
    victim: tiles[6]
  };
}

export function determineCriminal(suspects) {
  const values = suspects.map(tile => tile.value);
  const target = values.includes(5) ? Math.min(...values) : Math.max(...values);
  return values.indexOf(target);
}

export function createGame({ rng = Math.random, firstPlayer = 0, difficulty = 'normal' } = {}) {
  const scene = dealScene(rng);
  return {
    ...scene,
    players: [
      { name: '나', supply: 7, penalties: [] },
      { name: '컴퓨터', supply: 7, penalties: [] }
    ],
    difficulty,
    round: 1,
    firstPlayer,
    current: firstPlayer,
    phase: 'inspect',
    observations: [[], []],
    unviewed: null,
    accusations: [],
    stacks: [[], [], []],
    result: null,
    winner: null,
    log: ['첫 번째 사건이 시작되었습니다.']
  };
}

export function legalMoves(game) {
  if (game.phase === 'gameOver') return [];
  if (game.phase === 'inspect') return SUSPECTS.map(suspect => ({ type: 'inspect', suspect }));
  if (game.phase === 'accuse') return SUSPECTS.map(suspect => ({ type: 'accuse', suspect }));
  if (game.phase === 'roundResult') return [{ type: 'nextRound' }];
  return [];
}

function sameMove(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function winnerFor(game) {
  const counts = game.players.map(player => player.penalties.length);
  if (counts[0] !== counts[1]) return counts[0] < counts[1] ? 0 : 1;
  const own = game.players.map((player, index) => player.penalties.filter(chip => chip.owner === index).length);
  if (own[0] !== own[1]) return own[0] < own[1] ? 0 : 1;
  return game.firstPlayer;
}

function resolveRound(game) {
  const criminal = determineCriminal(game.suspects);
  const awards = [0, 0];
  for (const suspect of SUSPECTS) {
    const stack = game.stacks[suspect];
    if (suspect === criminal || !stack.length) continue;
    const recipient = stack.at(-1);
    for (const owner of stack) game.players[recipient].penalties.push({ owner, round: game.round });
    awards[recipient] += stack.length;
  }
  game.result = { criminal, awards, suspects: game.suspects.map(tile => tile.value) };
  game.log.unshift(`사건 ${game.round}: ${criminal + 1}번 용의자가 범인이었습니다.`);
  const ended = game.players.some(player => player.penalties.length >= 5 || player.supply === 0);
  if (ended) {
    game.phase = 'gameOver';
    game.winner = winnerFor(game);
    game.log.unshift(game.winner === 0 ? '당신이 최종 승리했습니다.' : '컴퓨터가 최종 승리했습니다.');
  } else {
    game.phase = 'roundResult';
  }
}

export function applyMove(source, selected, rng = Math.random) {
  const allowed = legalMoves(source);
  if (!allowed.some(candidate => sameMove(candidate, selected))) throw new Error('허용되지 않은 행동입니다.');
  const game = structuredClone(source);

  if (selected.type === 'inspect') {
    game.unviewed = selected.suspect;
    game.observations[game.current] = SUSPECTS.filter(index => index !== selected.suspect);
    game.phase = 'accuse';
    game.log.unshift(`${game.players[game.current].name}이(가) 두 용의자를 확인했습니다.`);
    return game;
  }

  if (selected.type === 'accuse') {
    const actor = game.current;
    game.accusations.push({ player: actor, suspect: selected.suspect });
    game.stacks[selected.suspect].push(actor);
    game.players[actor].supply -= 1;
    game.log.unshift(`${game.players[actor].name}이(가) ${selected.suspect + 1}번 용의자를 지목했습니다.`);
    if (game.accusations.length === 1) {
      game.current = 1 - actor;
      game.observations[game.current] = SUSPECTS.filter(index => index !== selected.suspect);
    } else {
      resolveRound(game);
    }
    return game;
  }

  if (selected.type === 'nextRound') {
    const scene = dealScene(rng);
    Object.assign(game, scene);
    game.round += 1;
    game.firstPlayer = 1 - game.firstPlayer;
    game.current = game.firstPlayer;
    game.phase = 'inspect';
    game.observations = [[], []];
    game.unviewed = null;
    game.accusations = [];
    game.stacks = [[], [], []];
    game.result = null;
    game.log.unshift(`사건 ${game.round}이 시작되었습니다.`);
    return game;
  }

  return game;
}

export function viewForPlayer(game, playerIndex) {
  const reveal = ['roundResult', 'gameOver'].includes(game.phase);
  const visible = new Set(game.observations[playerIndex]);
  return {
    round: game.round,
    phase: game.phase,
    current: game.current,
    firstPlayer: game.firstPlayer,
    ownAlibi: game.alibis[playerIndex].value,
    publicTile: game.publicTile.value,
    suspects: game.suspects.map((tile, index) => ({
      index,
      value: reveal || visible.has(index) ? tile.value : null,
      observed: visible.has(index)
    })),
    victim: reveal ? game.victim.value : null,
    unviewed: game.unviewed,
    accusations: structuredClone(game.accusations),
    stacks: structuredClone(game.stacks),
    players: game.players.map(player => ({ name: player.name, supply: player.supply, penalties: player.penalties.length })),
    result: structuredClone(game.result),
    winner: game.winner,
    log: [...game.log]
  };
}

function permutations(values, count) {
  if (count === 0) return [[]];
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const rest = values.filter((_, candidate) => candidate !== index);
    for (const tail of permutations(rest, count - 1)) output.push([values[index], ...tail]);
  }
  return output;
}

function criminalProbabilities(game, playerIndex) {
  const view = viewForPlayer(game, playerIndex);
  const known = new Set([view.ownAlibi, view.publicTile]);
  for (const suspect of view.suspects) if (suspect.value !== null) known.add(suspect.value);
  const unknownIndices = view.suspects.filter(suspect => suspect.value === null).map(suspect => suspect.index);
  const remaining = TILE_VALUES.filter(value => !known.has(value));
  const possibilities = permutations(remaining, unknownIndices.length);
  const counts = [0, 0, 0];
  let total = 0;
  for (const assignment of possibilities) {
    const suspects = view.suspects.map(suspect => suspect.value);
    unknownIndices.forEach((index, offset) => { suspects[index] = assignment[offset]; });
    counts[determineCriminal(suspects.map(value => ({ value })))] += 1;
    total += 1;
  }
  return counts.map(count => count / Math.max(total, 1));
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

export function chooseAiMove(game, difficulty = 'normal', playerIndex = game.current, rng = Math.random) {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  if (game.phase === 'inspect' || difficulty === 'easy') return randomItem(moves, rng);

  const probabilities = criminalProbabilities(game, playerIndex);
  const priorAccusation = game.accusations[0]?.suspect;
  const ranked = moves.map(candidate => {
    const matchRisk = priorAccusation === candidate.suspect ? 2 : 1;
    const expectedPenalty = (1 - probabilities[candidate.suspect]) * matchRisk;
    const score = probabilities[candidate.suspect] * 100
      - expectedPenalty * (difficulty === 'hard' ? 42 : 8);
    return { candidate, score };
  }).sort((left, right) => right.score - left.score || left.candidate.suspect - right.candidate.suspect);

  if (difficulty === 'hard') return ranked[0].candidate;
  const close = ranked.filter(item => item.score >= ranked[0].score - 35);
  return randomItem(close, rng).candidate;
}
