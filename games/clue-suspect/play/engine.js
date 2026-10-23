export const ITEMS = Object.freeze([
  { key: 'scarlet', category: 'suspect', name: '스칼렛' },
  { key: 'mustard', category: 'suspect', name: '머스터드' },
  { key: 'white', category: 'suspect', name: '화이트' },
  { key: 'green', category: 'suspect', name: '그린' },
  { key: 'peacock', category: 'suspect', name: '피콕' },
  { key: 'plum', category: 'suspect', name: '플럼' },
  { key: 'kitchen', category: 'location', name: '주방' },
  { key: 'spa', category: 'location', name: '스파' },
  { key: 'dining-room', category: 'location', name: '식당' },
  { key: 'living-room', category: 'location', name: '거실' },
  { key: 'hall', category: 'location', name: '홀' },
  { key: 'candlestick', category: 'weapon', name: '촛대' },
  { key: 'knife', category: 'weapon', name: '칼' },
  { key: 'rope', category: 'weapon', name: '밧줄' },
  { key: 'pistol', category: 'weapon', name: '권총' }
]);

export function createCardManifest() {
  const cards = ITEMS.map(item => ({ id: `evidence-${item.key}`, kind: 'evidence', itemKey: item.key, category: item.category }));
  for (let set = 0; set < 4; set += 1) {
    for (const item of ITEMS) cards.push({ id: `case-${set}-${item.key}`, kind: 'caseFile', set, itemKey: item.key, category: item.category });
  }
  return cards;
}

const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);

function shuffle(cards, rng) {
  const result = cards.map(card => ({ ...card }));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.floor(rng() * (index + 1)));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createGame({ difficulty = 'normal', rng = Math.random, startingPlayer = null } = {}) {
  if (!DIFFICULTIES.has(difficulty)) throw new Error('알 수 없는 난이도입니다.');
  if (typeof rng !== 'function') throw new Error('rng가 필요합니다.');
  if (startingPlayer !== null && startingPlayer !== 0 && startingPlayer !== 1) throw new Error('알 수 없는 시작 플레이어입니다.');
  const evidence = createCardManifest().filter(card => card.kind === 'evidence');
  const solution = ['suspect', 'location', 'weapon'].map(category => shuffle(evidence.filter(card => card.category === category), rng)[0]);
  const solutionIds = new Set(solution.map(card => card.id));
  const dealt = shuffle(evidence.filter(card => !solutionIds.has(card.id)), rng);
  const players = [
    { name: '나', kind: 'human', evidence: dealt.slice(0, 6) },
    { name: '컴퓨터', kind: 'ai', evidence: dealt.slice(6) }
  ].map(player => ({
    ...player,
    knownInnocent: player.evidence.map(card => card.itemKey),
    knownSolution: [],
    shownToOpponent: []
  }));
  const firstPlayer = startingPlayer ?? (rng() < 0.5 ? 0 : 1);
  return {
    difficulty,
    phase: 'ask',
    currentPlayer: firstPlayer,
    turn: 1,
    solution,
    players,
    question: null,
    accusations: [null, null],
    winnerIndex: null,
    outcome: null,
    log: [`${players[firstPlayer].name} 탐정이 먼저 수사를 시작합니다.`]
  };
}

function accusationMoves() {
  const groups = Object.fromEntries(['suspect', 'location', 'weapon'].map(category => [category, ITEMS.filter(item => item.category === category)]));
  return groups.suspect.flatMap(suspect => groups.location.flatMap(location => groups.weapon.map(weapon => ({
    type: 'accuse', itemKeys: [suspect.key, location.key, weapon.key]
  }))));
}

function questionMoves() {
  const moves = [];
  for (let first = 0; first < ITEMS.length; first += 1) {
    for (let second = first + 1; second < ITEMS.length; second += 1) {
      moves.push({ type: 'ask', itemKeys: [ITEMS[first].key, ITEMS[second].key] });
    }
  }
  return moves;
}

export function legalMoves(game, playerIndex) {
  if (!game || game.phase === 'gameOver') return [];
  if (game.phase === 'ask') return playerIndex === game.currentPlayer ? [...questionMoves(), ...accusationMoves()] : [];
  if (game.phase === 'answer') {
    if (playerIndex !== 1 - game.currentPlayer) return [];
    const matching = game.players[playerIndex].evidence.filter(card => game.question.itemKeys.includes(card.itemKey));
    return matching.length
      ? matching.map(card => ({ type: 'showEvidence', cardId: card.id }))
      : [{ type: 'cannotHelp' }];
  }
  if (game.phase === 'counterAccuse') {
    if (playerIndex !== 1 - game.currentPlayer) return [];
    return accusationMoves().map(move => ({ ...move, type: 'counterAccuse' }));
  }
  return [];
}

function sameMove(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function finishTurn(game) {
  game.currentPlayer = 1 - game.currentPlayer;
  game.turn += 1;
  game.phase = 'ask';
  game.question = null;
}

function accusationIsCorrect(game, itemKeys) {
  const answer = new Set(game.solution.map(card => card.itemKey));
  return itemKeys.length === answer.size && itemKeys.every(itemKey => answer.has(itemKey));
}

export function applyMove(game, move, playerIndex) {
  if (!legalMoves(game, playerIndex).some(candidate => sameMove(candidate, move))) throw new Error('허용되지 않은 행동입니다.');
  const next = structuredClone(game);
  if (move.type === 'ask') {
    next.question = { asker: playerIndex, responder: 1 - playerIndex, itemKeys: [...move.itemKeys] };
    next.phase = 'answer';
    const names = move.itemKeys.map(itemKey => ITEMS.find(item => item.key === itemKey).name);
    next.log.unshift(`${next.players[playerIndex].name}이(가) ${names.join(' · ')}을(를) 질문했습니다.`);
    return next;
  }
  if (move.type === 'accuse') {
    next.accusations[playerIndex] = [...move.itemKeys];
    next.phase = 'counterAccuse';
    next.log.unshift(`${next.players[playerIndex].name}이(가) 고발했습니다. 상대도 반드시 고발해야 합니다.`);
    return next;
  }
  if (move.type === 'counterAccuse') {
    next.accusations[playerIndex] = [...move.itemKeys];
    const first = next.currentPlayer;
    const second = 1 - first;
    if (accusationIsCorrect(next, next.accusations[first])) next.winnerIndex = first;
    else if (accusationIsCorrect(next, next.accusations[second])) next.winnerIndex = second;
    else next.winnerIndex = null;
    next.outcome = next.winnerIndex === null ? 'culprit' : 'detective';
    next.phase = 'gameOver';
    next.log.unshift(next.winnerIndex === null ? '두 탐정의 고발이 모두 틀렸습니다.' : `${next.players[next.winnerIndex].name}의 고발이 맞았습니다.`);
    return next;
  }
  if (move.type === 'showEvidence') {
    const responder = next.players[playerIndex];
    const asker = next.players[next.currentPlayer];
    const card = responder.evidence.find(candidate => candidate.id === move.cardId);
    if (!asker.knownInnocent.includes(card.itemKey)) asker.knownInnocent.push(card.itemKey);
    if (!responder.shownToOpponent.includes(card.itemKey)) responder.shownToOpponent.push(card.itemKey);
    const name = ITEMS.find(item => item.key === card.itemKey).name;
    next.log.unshift(`${responder.name}이(가) 질문자에게 ${name} 증거를 보여 주었습니다.`);
    finishTurn(next);
    return next;
  }
  if (move.type === 'cannotHelp') {
    const asker = next.players[next.currentPlayer];
    const ownEvidence = new Set(asker.evidence.map(card => card.itemKey));
    for (const itemKey of next.question.itemKeys) {
      if (!ownEvidence.has(itemKey) && !asker.knownInnocent.includes(itemKey) && !asker.knownSolution.includes(itemKey)) {
        asker.knownSolution.push(itemKey);
      }
    }
    next.log.unshift(`${next.players[playerIndex].name}은(는) 해당 증거가 없습니다.`);
    finishTurn(next);
    return next;
  }
  throw new Error('아직 처리할 수 없는 행동입니다.');
}

const hiddenEvidence = card => ({ id: null, kind: card.kind, itemKey: null, category: null });
const hiddenSolution = card => ({ id: null, kind: card.kind, itemKey: null, category: card.category });

export function projectObservation(game, playerIndex) {
  if (!Number.isInteger(playerIndex) || playerIndex < 0 || playerIndex > 1) throw new Error('알 수 없는 플레이어입니다.');
  const revealed = game.phase === 'gameOver';
  return {
    difficulty: game.difficulty,
    phase: game.phase,
    currentPlayer: game.currentPlayer,
    playerIndex,
    turn: game.turn,
    solution: game.solution.map(card => ({ ...(revealed ? card : hiddenSolution(card)) })),
    players: game.players.map((player, index) => ({
      name: player.name,
      kind: player.kind,
      evidence: player.evidence.map(card => ({ ...(revealed || index === playerIndex ? card : hiddenEvidence(card)) }))
    })),
    knowledge: {
      knownInnocent: [...game.players[playerIndex].knownInnocent],
      knownSolution: [...game.players[playerIndex].knownSolution],
      shownToOpponent: [...game.players[playerIndex].shownToOpponent]
    },
    question: game.question ? structuredClone(game.question) : null,
    accusations: game.accusations.map((accusation, index) => revealed || index === playerIndex ? (accusation ? [...accusation] : null) : null),
    winnerIndex: game.winnerIndex,
    outcome: game.outcome,
    log: [...game.log],
    moves: legalMoves(game, playerIndex)
  };
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function candidatesByCategory(observation) {
  const innocent = new Set(observation.knowledge.knownInnocent);
  const confirmed = new Set(observation.knowledge.knownSolution);
  return Object.fromEntries(['suspect', 'location', 'weapon'].map(category => {
    const certain = ITEMS.filter(item => item.category === category && confirmed.has(item.key));
    const candidates = certain.length ? certain : ITEMS.filter(item => item.category === category && !innocent.has(item.key));
    return [category, candidates.map(item => item.key)];
  }));
}

function matchingAccusationMove(moves, keys) {
  const wanted = new Set(keys);
  return moves.find(move => (move.type === 'accuse' || move.type === 'counterAccuse') && move.itemKeys.every(key => wanted.has(key)));
}

function matchingAskMove(moves, keys) {
  const wanted = new Set(keys);
  return moves.find(move => move.type === 'ask' && move.itemKeys.every(key => wanted.has(key)));
}

export function chooseAiMove(observation, rng = Math.random) {
  const moves = observation?.moves ?? [];
  if (!moves.length) return null;
  if (observation.phase === 'answer') {
    const cannotHelp = moves.find(move => move.type === 'cannotHelp');
    if (cannotHelp) return cannotHelp;
    const repeated = moves.filter(move => {
      const card = observation.players[observation.playerIndex].evidence.find(candidate => candidate.id === move.cardId);
      return observation.knowledge.shownToOpponent.includes(card.itemKey);
    });
    return randomItem(repeated.length && observation.difficulty !== 'easy' ? repeated : moves, rng);
  }

  const candidates = candidatesByCategory(observation);
  const uniqueKeys = ['suspect', 'location', 'weapon'].map(category => candidates[category].length === 1 ? candidates[category][0] : null);
  const accusationReady = uniqueKeys.every(Boolean);
  if (observation.phase === 'counterAccuse') {
    if (accusationReady) return matchingAccusationMove(moves, uniqueKeys);
    const plausible = moves.filter(move => move.itemKeys.every(key => Object.values(candidates).flat().includes(key)));
    return observation.difficulty === 'hard' ? plausible[0] ?? moves[0] : randomItem(plausible.length ? plausible : moves, rng);
  }
  if (accusationReady) return matchingAccusationMove(moves, uniqueKeys);

  const asks = moves.filter(move => move.type === 'ask');
  if (observation.difficulty === 'easy') return randomItem(asks, rng);
  const unresolved = Object.entries(candidates).filter(([, keys]) => keys.length > 1);
  if (observation.difficulty === 'hard') {
    unresolved.sort((first, second) => second[1].length - first[1].length);
    const target = unresolved[0]?.[1][0] ?? Object.values(candidates).flat()[0];
    const ownEvidence = observation.players[observation.playerIndex].evidence.map(card => card.itemKey).filter(key => key !== target);
    const anchor = ownEvidence[0];
    return matchingAskMove(asks, [target, anchor]) ?? asks[0];
  }
  const candidateKeys = unresolved.flatMap(([, keys]) => keys);
  const informative = asks.filter(move => move.itemKeys.every(key => candidateKeys.includes(key)));
  return randomItem(informative.length ? informative : asks, rng);
}
