const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

export function createDeck() {
  return Array.from({ length: 100 }, (_, index) => ({
    id: `mind-${index + 1}`,
    value: index + 1
  }));
}

function shuffle(items, rng) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

const TIMING_SPREAD = { easy: 0.42, normal: 0.2, hard: 0.07 };

export function createAiSchedule(hand, difficulty, rng = Math.random, pace = 140) {
  if (!DIFFICULTIES.has(difficulty)) throw new Error('지원하지 않는 난이도입니다.');
  const spread = TIMING_SPREAD[difficulty];
  return Object.fromEntries(hand.map(card => {
    const factor = 1 + (rng() - 0.5) * 2 * spread;
    return [card.id, Math.max(100, Math.round(card.value * pace * factor))];
  }));
}

export function createGame({ rng = Math.random, difficulty = 'normal' } = {}) {
  if (!DIFFICULTIES.has(difficulty)) throw new Error('지원하지 않는 난이도입니다.');
  const deck = shuffle(createDeck(), rng);
  const players = [
    { name: '나', hand: deck.splice(0, 1).sort((a, b) => a.value - b.value) },
    { name: '컴퓨터', hand: deck.splice(0, 1).sort((a, b) => a.value - b.value) }
  ];
  const game = {
    level: 1,
    maxLevel: 12,
    lives: 2,
    stars: 1,
    difficulty,
    phase: 'focus',
    players,
    deck,
    pile: [],
    removed: [],
    starProposal: null,
    reward: null,
    result: null,
    log: ['레벨 1을 준비했습니다.']
  };
  game.aiSchedule = createAiSchedule(game.players[1].hand, difficulty, rng);
  return game;
}

function sameMove(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function legalMoves(game, playerIndex) {
  if (game.phase === 'focus') return playerIndex === 0 ? [{ type: 'startLevel' }] : [];
  if (game.phase === 'paused') return playerIndex === 0 ? [{ type: 'resume' }] : [];
  if (game.phase === 'starVote') return playerIndex === 1 ? [{ type: 'acceptStar' }] : [];
  if (game.phase === 'levelComplete') return playerIndex === 0 ? [{ type: 'nextLevel' }] : [];
  if (game.phase !== 'playing' || !game.players[playerIndex]) return [];
  const lowest = game.players[playerIndex].hand[0];
  const moves = lowest ? [{ type: 'play', cardId: lowest.id }] : [];
  if (game.stars > 0 && playerIndex === 0 && game.players.some(player => player.hand.length)) moves.push({ type: 'proposeStar' });
  moves.push({ type: 'pause' });
  return moves;
}

function takeCardById(player, cardId) {
  const index = player.hand.findIndex(card => card.id === cardId);
  return player.hand.splice(index, 1)[0];
}

function completeIfReady(game) {
  if (game.lives <= 0) {
    game.phase = 'gameOver';
    game.result = 'lost';
    game.log.unshift('마지막 생명을 잃어 게임이 끝났습니다.');
    return;
  }
  if (game.players.some(player => player.hand.length)) return;
  if (game.level === game.maxLevel) {
    game.phase = 'gameOver';
    game.result = 'won';
    game.log.unshift('12레벨을 완수했습니다.');
    return;
  }
  const starRewards = new Set([2, 5, 8]);
  const lifeRewards = new Set([3, 6, 9]);
  game.reward = starRewards.has(game.level) ? 'star' : lifeRewards.has(game.level) ? 'life' : null;
  if (game.reward === 'star') game.stars = Math.min(3, game.stars + 1);
  if (game.reward === 'life') game.lives = Math.min(5, game.lives + 1);
  game.phase = 'levelComplete';
  game.log.unshift(`레벨 ${game.level}을 완수했습니다.`);
}

function prepareNextLevel(game, rng) {
  game.level += 1;
  const deck = shuffle(createDeck(), rng);
  for (const player of game.players) player.hand = deck.splice(0, game.level).sort((a, b) => a.value - b.value);
  game.deck = deck;
  game.pile = [];
  game.removed = [];
  game.starProposal = null;
  game.reward = null;
  game.aiSchedule = createAiSchedule(game.players[1].hand, game.difficulty, rng);
  game.phase = 'focus';
  game.log.unshift(`레벨 ${game.level}을 준비했습니다.`);
}

export function applyMove(source, move, playerIndex, rng = Math.random) {
  if (!legalMoves(source, playerIndex).some(candidate => sameMove(candidate, move))) {
    throw new Error('허용되지 않은 행동입니다.');
  }
  const game = structuredClone(source);

  if (move.type === 'startLevel') {
    game.phase = 'playing';
    game.log.unshift(`레벨 ${game.level}을 시작했습니다.`);
    return game;
  }

  if (move.type === 'pause') {
    game.phase = 'paused';
    game.log.unshift(`${game.players[playerIndex].name}가 잠시 멈추자고 했습니다.`);
    return game;
  }

  if (move.type === 'resume') {
    game.phase = 'playing';
    game.log.unshift('다시 집중하고 같은 레벨을 계속합니다.');
    return game;
  }

  if (move.type === 'nextLevel') {
    prepareNextLevel(game, rng);
    return game;
  }

  if (move.type === 'proposeStar') {
    game.phase = 'starVote';
    game.starProposal = { proposer: playerIndex };
    game.log.unshift('수리검 사용을 컴퓨터에게 제안했습니다.');
    return game;
  }

  if (move.type === 'acceptStar') {
    game.stars -= 1;
    for (const player of game.players) {
      if (player.hand.length) game.removed.push(player.hand.shift());
    }
    game.starProposal = null;
    game.log.unshift('컴퓨터가 동의해 수리검을 사용했습니다.');
    game.phase = 'paused';
    game.log.unshift('집중이 흐트러졌습니다. 다시 집중하고 계속하세요.');
    completeIfReady(game);
    return game;
  }

  const played = takeCardById(game.players[playerIndex], move.cardId);
  const skipped = [];
  for (const player of game.players) {
    const lower = player.hand.filter(card => card.value < played.value);
    skipped.push(...lower);
    player.hand = player.hand.filter(card => card.value >= played.value);
  }
  if (skipped.length) {
    game.lives -= 1;
    game.removed.push(...skipped);
    game.phase = 'paused';
    game.log.unshift(`${played.value}보다 낮은 카드 ${skipped.length}장을 놓쳐 생명 1개를 잃었습니다.`);
  }
  game.pile.push(played);
  game.log.unshift(`${game.players[playerIndex].name}가 ${played.value}을 냈습니다.`);
  completeIfReady(game);
  return game;
}

export function viewForPlayer(game, playerIndex) {
  if (![0, 1].includes(playerIndex)) throw new Error('존재하지 않는 플레이어입니다.');
  const view = structuredClone(game);
  view.players[1 - playerIndex].hand = view.players[1 - playerIndex].hand.map(() => ({ id: null, value: null }));
  view.deckCount = view.deck.length;
  delete view.deck;
  if (playerIndex !== 1) delete view.aiSchedule;
  return view;
}

export function chooseAiMove(aiView, elapsedMs) {
  if (aiView.phase !== 'playing') return null;
  const lowest = aiView.players[1]?.hand[0];
  if (!lowest) return null;
  const target = aiView.aiSchedule?.[lowest.id];
  if (!Number.isFinite(target) || elapsedMs < target) return null;
  return { type: 'play', cardId: lowest.id };
}
