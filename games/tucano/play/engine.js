export const FRUIT_RULES = Object.freeze({
  acai: { count: 6, scores: [1, 2, 3, 5, 8, 13] },
  avocado: { count: 5, majority: [3, 1] },
  banana: { count: 5, majority: [2, 0] },
  carambola: { count: 5, scores: [1, 3, 6, 10, 15] },
  coconut: { count: 6, scores: [8, 6, 4, 2, 0, -2] },
  fig: { count: 4, scores: [-2, 0, 9, 16] },
  lime: { count: 2, scores: [-2, -8] },
  lychee: { count: 2, scores: [5, 12] },
  orange: { count: 4, scores: [4, 8, 12, 0] },
  papaya: { count: 4, scores: [1, 1, 9, 20] },
  pineapple: { count: 3, scores: [0, -2, -4] },
  pomegranate: { count: 6, majority: [1, -1] },
  rambutan: { count: 5, scores: [3, 6, 9, 12, 15] }
});
const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

export function createDeck() {
  const cards = [];
  for (const [fruit, rule] of Object.entries(FRUIT_RULES)) {
    for (let index = 1; index <= rule.count; index += 1) cards.push({ id: `${fruit}-${index}`, type: 'fruit', fruit });
  }
  cards.push({ id: 'joker-1', type: 'joker' });
  for (const effect of ['give', 'steal', 'hide']) {
    for (let index = 1; index <= 4; index += 1) cards.push({ id: `toucan-${effect}-${index}`, type: 'toucan', effect });
  }
  return cards;
}

function shuffle(cards, rng) {
  const result = cards.map(card => ({ ...card }));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.floor(rng() * (index + 1)));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createGame({ difficulty = 'normal', rng = Math.random } = {}) {
  if (!DIFFICULTIES.has(difficulty)) throw new Error('알 수 없는 난이도입니다.');
  if (typeof rng !== 'function') throw new Error('rng가 필요합니다.');
  const deck = createDeck();
  const collectibles = shuffle(deck.filter(card => card.type !== 'toucan'), rng);
  const top = collectibles.slice(0, 29);
  const bottom = shuffle([...collectibles.slice(29), ...deck.filter(card => card.type === 'toucan')], rng);
  const drawPile = [...top, ...bottom];
  const columns = [[drawPile.shift()], [drawPile.shift(), drawPile.shift()], [drawPile.shift()]];
  return {
    difficulty, phase: 'chooseColumn', currentPlayer: 0, turn: 1, turnsTaken: [0, 0],
    drawPile, columns,
    players: [
      { name: '나', kind: 'human', faceUp: [], faceDown: [], jokerFruit: null },
      { name: '컴퓨터', kind: 'ai', faceUp: [], faceDown: [], jokerFruit: null }
    ],
    pendingToucans: [], activeToucan: null, toucanDiscard: [], finalDiscard: [],
    winnerIndex: null, scores: null, log: ['사람 플레이어가 먼저 시작합니다.']
  };
}

function collected(player) { return [...player.faceUp, ...player.faceDown]; }

export function scoreGame(game, assignments = null) {
  const counts = game.players.map((player, playerIndex) => {
    const result = Object.fromEntries(Object.keys(FRUIT_RULES).map(name => [name, 0]));
    for (const card of collected(player)) if (card.type === 'fruit') result[card.fruit] += 1;
    const hasJoker = collected(player).some(card => card.type === 'joker');
    const assignment = assignments?.[playerIndex] ?? player.jokerFruit;
    if (hasJoker && assignment && result[assignment] < FRUIT_RULES[assignment].count) result[assignment] += 1;
    return result;
  });
  const players = game.players.map((player, playerIndex) => {
    const byFruit = {};
    for (const [fruit, rule] of Object.entries(FRUIT_RULES)) {
      const count = counts[playerIndex][fruit];
      if (!count) byFruit[fruit] = 0;
      else if (rule.scores) byFruit[fruit] = rule.scores[count - 1];
      else {
        const other = counts[1 - playerIndex][fruit];
        byFruit[fruit] = count > other ? count * rule.majority[0] : count * rule.majority[1];
      }
    }
    return { total: Object.values(byFruit).reduce((sum, score) => sum + score, 0), byFruit, counts };
  });
  return { players };
}

function movesForJoker(game, playerIndex) {
  const player = game.players[playerIndex];
  const cards = collected(player);
  if (!cards.some(card => card.type === 'joker')) return [];
  const counts = Object.fromEntries(Object.keys(FRUIT_RULES).map(fruit => [fruit, 0]));
  for (const card of cards) if (card.type === 'fruit') counts[card.fruit] += 1;
  return Object.entries(FRUIT_RULES)
    .filter(([fruit, rule]) => counts[fruit] < rule.count)
    .map(([fruit]) => ({ type: 'assignJoker', fruit }));
}

export function legalMoves(game, playerIndex) {
  if (!game || playerIndex !== game.currentPlayer || game.phase === 'gameOver') return [];
  if (game.phase === 'chooseColumn') return game.columns.flatMap((column, columnIndex) =>
    column.length ? [{ type: 'chooseColumn', columnIndex }] : []);
  if (game.phase === 'chooseToucan') return game.pendingToucans.map(card => ({ type: 'chooseToucan', cardId: card.id }));
  if (game.phase === 'giveTarget') return game.players[playerIndex].faceUp.map(card => ({ type: 'giveTarget', cardId: card.id }));
  if (game.phase === 'stealTarget') return game.players[1 - playerIndex].faceUp.map(card => ({ type: 'stealTarget', cardId: card.id }));
  if (game.phase === 'jokerAssignment') return movesForJoker(game, playerIndex);
  return [];
}

function sameMove(first, second) {
  return first && second && Object.keys(first).length === Object.keys(second).length &&
    Object.entries(first).every(([key, value]) => second[key] === value);
}

function startScoring(game) {
  for (const player of game.players) {
    player.faceUp.push(...player.faceDown);
    player.faceDown = [];
  }
  game.log.unshift('보호된 카드를 모두 공개하고 점수를 계산합니다.');
  const owner = game.players.findIndex(player => collected(player).some(card => card.type === 'joker'));
  if (owner >= 0) {
    game.phase = 'jokerAssignment';
    game.currentPlayer = owner;
    game.log.unshift(`${game.players[owner].name}이(가) 조커 과일을 정합니다.`);
    return;
  }
  finalizeScore(game);
}

function finalizeScore(game) {
  game.scores = scoreGame(game);
  const [human, computer] = game.scores.players.map(player => player.total);
  game.winnerIndex = human === computer ? null : human > computer ? 0 : 1;
  game.phase = 'gameOver';
  game.log.unshift(human === computer ? `최종 ${human}점으로 동점입니다.` : `${game.players[game.winnerIndex].name} 승리!`);
}

function finishTurn(game) {
  game.turnsTaken[game.currentPlayer] += 1;
  if (game.drawPile.length) {
    for (let index = 0; index < 3; index += 1) {
      if (game.drawPile.length) game.columns[index].push(game.drawPile.shift());
    }
  }
  const nonempty = game.columns.filter(column => column.length);
  if (!game.drawPile.length && nonempty.length <= 1 && game.turnsTaken[0] === game.turnsTaken[1]) {
    if (nonempty.length) game.finalDiscard.push(...nonempty[0]);
    game.columns = [[], [], []];
    startScoring(game);
    return;
  }
  game.currentPlayer = 1 - game.currentPlayer;
  game.turn = game.turnsTaken[0] + game.turnsTaken[1] + 1;
  game.phase = 'chooseColumn';
}

function afterToucan(game) {
  if (game.pendingToucans.length) game.phase = 'chooseToucan';
  else finishTurn(game);
}

function discardActive(game) {
  if (game.activeToucan) game.toucanDiscard.push(game.activeToucan);
  game.activeToucan = null;
  afterToucan(game);
}

export function applyMove(game, move, playerIndex) {
  if (!legalMoves(game, playerIndex).some(candidate => sameMove(candidate, move))) throw new Error('허용되지 않은 행동입니다.');
  const next = structuredClone(game);
  const actor = next.players[playerIndex];
  const opponent = next.players[1 - playerIndex];
  if (move.type === 'chooseColumn') {
    const taken = next.columns[move.columnIndex];
    next.columns[move.columnIndex] = [];
    const collectibles = taken.filter(card => card.type !== 'toucan');
    const toucans = taken.filter(card => card.type === 'toucan');
    actor.faceUp.push(...collectibles);
    next.pendingToucans.push(...toucans);
    next.log.unshift(`${actor.name}이(가) ${move.columnIndex + 1}번 열 ${taken.length}장을 가져왔습니다.`);
    if (toucans.length) next.phase = 'chooseToucan';
    else finishTurn(next);
    return next;
  }
  if (move.type === 'chooseToucan') {
    const index = next.pendingToucans.findIndex(card => card.id === move.cardId);
    next.activeToucan = next.pendingToucans.splice(index, 1)[0];
    if (next.activeToucan.effect === 'hide') {
      if (actor.faceUp.length) {
        actor.faceDown.push(...actor.faceUp);
        actor.faceUp = [];
        next.log.unshift(`${actor.name}이(가) 공개 과일을 모두 보호했습니다.`);
      } else {
        next.log.unshift(`${actor.name}이(가) 과일 보호 효과를 사용할 수 없어 버렸습니다.`);
      }
      discardActive(next);
    } else if (next.activeToucan.effect === 'give') {
      if (actor.faceUp.length) next.phase = 'giveTarget';
      else {
        next.log.unshift(`${actor.name}이(가) 과일 주기 효과를 사용할 수 없어 버렸습니다.`);
        discardActive(next);
      }
    } else if (opponent.faceUp.length) next.phase = 'stealTarget';
    else {
      next.log.unshift(`${actor.name}이(가) 과일 빼앗기 효과를 사용할 수 없어 버렸습니다.`);
      discardActive(next);
    }
    return next;
  }
  if (move.type === 'giveTarget' || move.type === 'stealTarget') {
    const source = move.type === 'giveTarget' ? actor : opponent;
    const target = move.type === 'giveTarget' ? opponent : actor;
    const index = source.faceUp.findIndex(card => card.id === move.cardId);
    target.faceUp.push(...source.faceUp.splice(index, 1));
    next.log.unshift(`${actor.name}이(가) 카드 1장을 ${move.type === 'giveTarget' ? '주었습니다.' : '빼앗았습니다.'}`);
    discardActive(next);
    return next;
  }
  actor.jokerFruit = move.fruit;
  finalizeScore(next);
  return next;
}

const hiddenCard = () => ({ id: null, type: null });

export function projectObservation(game, playerIndex) {
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) throw new Error('알 수 없는 플레이어입니다.');
  return {
    difficulty: game.difficulty, phase: game.phase, currentPlayer: game.currentPlayer,
    playerIndex, turn: game.turn, turnsTaken: [...game.turnsTaken],
    drawPile: game.drawPile.map(hiddenCard),
    columns: game.columns.map(column => column.map(card => ({ ...card }))),
    players: game.players.map(player => ({ name: player.name, kind: player.kind,
      faceUp: player.faceUp.map(card => ({ ...card })), faceDown: player.faceDown.map(hiddenCard),
      jokerFruit: game.phase === 'gameOver' ? player.jokerFruit : null })),
    pendingToucans: game.pendingToucans.map(card => ({ ...card })),
    activeToucan: game.activeToucan ? { ...game.activeToucan } : null,
    toucanDiscardCount: game.toucanDiscard.length, finalDiscardCount: game.finalDiscard.length,
    winnerIndex: game.winnerIndex, scores: game.scores ? structuredClone(game.scores) : null,
    log: [...game.log], moves: legalMoves(game, playerIndex)
  };
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}
function visibleCardValue(card) {
  if (card.type === 'joker') return 8;
  if (card.type === 'toucan') return card.effect === 'hide' ? 3 : 2;
  const rule = FRUIT_RULES[card.fruit];
  return rule.scores ? Math.max(...rule.scores) / rule.count : rule.majority[0];
}
function visibleFruitCount(player, fruit) {
  return player.faceUp.filter(card => card.type === 'fruit' && card.fruit === fruit).length;
}
function fruitScore(rule, count, otherCount) {
  if (!count) return 0;
  return rule.scores ? rule.scores[count - 1] : count * (count > otherCount ? rule.majority[0] : rule.majority[1]);
}
function jokerGain(observation, move) {
  const actor = observation.players[observation.playerIndex];
  const opponent = observation.players[1 - observation.playerIndex];
  const rule = FRUIT_RULES[move.fruit];
  const own = visibleFruitCount(actor, move.fruit);
  const other = visibleFruitCount(opponent, move.fruit);
  const before = fruitScore(rule, own, other) - fruitScore(rule, other, own);
  const after = fruitScore(rule, own + 1, other) - fruitScore(rule, other, own + 1);
  return after - before;
}
function fruitDifferential(rule, own, other) {
  return fruitScore(rule, own, other) - fruitScore(rule, other, own);
}
function transferGain(observation, card, fromActor) {
  if (card.type === 'joker') return fromActor ? -8 : 8;
  const actor = observation.players[observation.playerIndex];
  const opponent = observation.players[1 - observation.playerIndex];
  const rule = FRUIT_RULES[card.fruit];
  const own = visibleFruitCount(actor, card.fruit);
  const other = visibleFruitCount(opponent, card.fruit);
  const before = fruitDifferential(rule, own, other);
  const after = fromActor
    ? fruitDifferential(rule, own - 1, other + 1)
    : fruitDifferential(rule, own + 1, other - 1);
  return after - before;
}
function hardColumnValue(observation, move) {
  const actor = observation.players[observation.playerIndex];
  const opponent = observation.players[1 - observation.playerIndex];
  const cards = observation.columns[move.columnIndex];
  let value = cards.reduce((sum, card) => sum + visibleCardValue(card), 0);
  for (const [fruit, rule] of Object.entries(FRUIT_RULES)) {
    const added = cards.filter(card => card.type === 'fruit' && card.fruit === fruit).length;
    if (!added) continue;
    const own = visibleFruitCount(actor, fruit);
    const other = visibleFruitCount(opponent, fruit);
    value += fruitDifferential(rule, own + added, other) - fruitDifferential(rule, own, other);
  }
  for (const card of cards.filter(item => item.type === 'toucan')) {
    if (card.effect === 'steal' && opponent.faceUp.length) value += Math.max(...opponent.faceUp.map(target => transferGain(observation, target, false)));
    else if (card.effect === 'hide' && actor.faceUp.length + cards.filter(item => item.type !== 'toucan').length) value += 1;
    else if (card.effect === 'give' && actor.faceUp.length) value += Math.max(...actor.faceUp.map(target => transferGain(observation, target, true)));
  }
  return value;
}
export function chooseAiMove(observation, rng = Math.random) {
  const moves = observation?.moves ?? [];
  if (!moves.length) return null;
  if (observation.difficulty === 'easy') return randomItem(moves, rng);
  const actor = observation.players[observation.playerIndex];
  const opponent = observation.players[1 - observation.playerIndex];
  let ranked = moves;
  if (observation.phase === 'chooseColumn') {
    const visibleScore = move => observation.columns[move.columnIndex].reduce((sum, card) => sum + visibleCardValue(card), 0);
    const bestVisible = Math.max(...moves.map(visibleScore));
    ranked = moves.filter(move => visibleScore(move) === bestVisible);
    if (observation.difficulty === 'hard' && ranked.length > 1) {
      const bestStrategic = Math.max(...ranked.map(move => hardColumnValue(observation, move)));
      ranked = ranked.filter(move => hardColumnValue(observation, move) === bestStrategic);
    }
  } else if (observation.phase === 'chooseToucan') {
    const priority = cardId => {
      const card = observation.pendingToucans.find(item => item.id === cardId);
      if (card.effect === 'steal' && opponent.faceUp.length) return 6;
      if (card.effect === 'hide' && actor.faceUp.length) return observation.difficulty === 'hard' ? 5 : 3;
      if (card.effect === 'give' && actor.faceUp.length) return 2;
      return 0;
    };
    const best = Math.max(...moves.map(move => priority(move.cardId))); ranked = moves.filter(move => priority(move.cardId) === best);
  } else if (observation.phase === 'giveTarget') {
    const visibleScore = move => -visibleCardValue(actor.faceUp.find(item => item.id === move.cardId));
    const bestVisible = Math.max(...moves.map(visibleScore));
    ranked = moves.filter(move => visibleScore(move) === bestVisible);
    if (observation.difficulty === 'hard' && ranked.length > 1) {
      const strategicScore = move => transferGain(observation, actor.faceUp.find(item => item.id === move.cardId), true);
      const bestStrategic = Math.max(...ranked.map(strategicScore));
      ranked = ranked.filter(move => strategicScore(move) === bestStrategic);
    }
  } else if (observation.phase === 'stealTarget') {
    const visibleScore = move => visibleCardValue(opponent.faceUp.find(item => item.id === move.cardId));
    const bestVisible = Math.max(...moves.map(visibleScore));
    ranked = moves.filter(move => visibleScore(move) === bestVisible);
    if (observation.difficulty === 'hard' && ranked.length > 1) {
      const strategicScore = move => transferGain(observation, opponent.faceUp.find(item => item.id === move.cardId), false);
      const bestStrategic = Math.max(...ranked.map(strategicScore));
      ranked = ranked.filter(move => strategicScore(move) === bestStrategic);
    }
  } else if (observation.phase === 'jokerAssignment') {
    const score = observation.difficulty === 'hard'
      ? move => jokerGain(observation, move)
      : move => FRUIT_RULES[move.fruit].scores?.at(-1) ?? FRUIT_RULES[move.fruit].majority[0] * FRUIT_RULES[move.fruit].count;
    const best = Math.max(...moves.map(score)); ranked = moves.filter(move => score(move) === best);
  }
  return observation.difficulty === 'hard' ? ranked[0] : randomItem(ranked, rng);
}
