const SPECIAL_COUNTS = {
  joker: 4,
  dog: 4,
  bone: 2,
  jackhammer: 3,
  wreckingBall: 1,
  milkshake: 3,
  donutTruck: 1,
  thief: 3,
  superThief: 1
};

export function createDeck() {
  const cards = [];
  for (let value = 1; value <= 8; value += 1) {
    for (let copy = 0; copy < 4; copy += 1) cards.push({ id: `gotown-floor-${value}-${copy}`, type: 'floor', value });
  }
  for (const [type, count] of Object.entries(SPECIAL_COUNTS)) {
    for (let copy = 0; copy < count; copy += 1) cards.push({ id: `gotown-${type}-${copy}`, type, value: null });
  }
  return cards;
}

function shuffle(items, rng) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function drawOne(game, playerIndex, rng = Math.random) {
  if (!game.deck.length && game.discard.length) game.deck = shuffle(game.discard.splice(0), rng);
  const drawn = game.deck.pop();
  if (drawn) game.players[playerIndex].hand.push(drawn);
  return drawn;
}

function beginAvailableTurn(game, rng = Math.random) {
  while (game.players[game.current].milkshakes.length) {
    const skipped = game.players[game.current].milkshakes.shift();
    game.discard.push(skipped);
    game.log.unshift(`${game.players[game.current].name}의 차례가 밀크셰이크로 건너뛰어졌습니다.`);
    game.current = 1 - game.current;
    game.turn += 1;
  }
  const player = game.players[game.current];
  if (player.hand.length < 8) drawOne(game, game.current, rng);
  game.phase = 'action';
}

export function createGame({ rng = Math.random, firstPlayer = 0, difficulty = 'normal', targetFloors = 5 } = {}) {
  const deck = shuffle(createDeck(), rng);
  const players = [0, 1].map(index => ({
    name: index === 0 ? '나' : '컴퓨터',
    hand: deck.splice(0, 5),
    floors: [],
    milkshakes: []
  }));
  const game = {
    players,
    deck,
    discard: [],
    difficulty,
    targetFloors,
    current: firstPlayer,
    phase: 'setup',
    winner: null,
    result: null,
    extraTurn: false,
    donutCard: null,
    actedThisTurn: false,
    forcedPasses: 0,
    turn: 1,
    log: ['게임을 시작했습니다.']
  };
  beginAvailableTurn(game, rng);
  return game;
}

function pairValues(first, second) {
  if (first.type === 'floor' && second.type === 'floor' && first.value + second.value === 9) return [first.value, second.value];
  if (first.type === 'joker' && second.type === 'floor') return [9 - second.value, second.value];
  if (second.type === 'joker' && first.type === 'floor') return [first.value, 9 - first.value];
  return null;
}

function sameMove(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cardAt(player, index, type) {
  return player.hand[index]?.type === type;
}

export function legalMoves(game) {
  if (game.phase !== 'action') return [];
  const player = game.players[game.current];
  const opponent = game.players[1 - game.current];
  const moves = [];

  for (let left = 0; left < player.hand.length; left += 1) {
    for (let right = left + 1; right < player.hand.length; right += 1) {
      if (pairValues(player.hand[left], player.hand[right])) moves.push({ type: 'build', cards: [left, right] });
    }
  }

  const top = opponent.floors.at(-1);
  if (top && !top.dog) {
    player.hand.forEach((held, card) => {
      if (held.type !== 'floor') return;
      top.cards.forEach((slot, stolen) => {
        if (held.value + slot.effectiveValue === 9) moves.push({ type: 'stealFloor', card, stolen });
      });
    });
  }

  player.hand.forEach((held, card) => {
    if (held.type === 'dog') {
      player.floors.forEach((candidate, floor) => {
        if (!candidate.dog) moves.push({ type: 'guard', card, floor });
      });
    }
    if (held.type === 'bone') {
      opponent.floors.forEach((candidate, floor) => {
        if (candidate.dog) moves.push({ type: 'bone', card, floor });
      });
    }
    if (held.type === 'jackhammer' && top && !top.dog) moves.push({ type: 'destroy', card });
    if (held.type === 'wreckingBall' && top) moves.push({ type: 'destroy', card });
    if (['thief', 'superThief'].includes(held.type) && opponent.hand.length) moves.push({ type: 'thief', card });
    if (held.type === 'milkshake') moves.push({ type: 'milkshake', card });
    if (held.type === 'donutTruck' && !game.extraTurn) moves.push({ type: 'donutTruck', card });
  });

  moves.push({ type: 'endTurn' });
  return moves;
}

function takeHandCard(player, index) {
  return player.hand.splice(index, 1)[0];
}

function finishTurn(game, rng, forcedPass) {
  const player = game.players[game.current];
  while (player.hand.length < 3 && (game.deck.length || game.discard.length)) drawOne(game, game.current, rng);
  game.forcedPasses = forcedPass ? game.forcedPasses + 1 : 0;
  game.actedThisTurn = false;
  if (game.donutCard) {
    game.discard.push(game.donutCard);
    game.donutCard = null;
  }
  if (game.extraTurn) {
    game.extraTurn = false;
  } else {
    game.current = 1 - game.current;
  }
  game.turn += 1;
  beginAvailableTurn(game, rng);
  if (game.forcedPasses >= 2 && game.players[0].hand.length === 8 && game.players[1].hand.length === 8 && legalMoves(game).length === 1) {
    game.phase = 'gameOver';
    game.winner = null;
    game.result = 'stalemate';
    game.log.unshift('두 플레이어 모두 낼 수 있는 카드가 없어 게임이 종료되었습니다.');
  }
}

function completeFloor(game, playerIndex, floor) {
  game.players[playerIndex].floors.push(floor);
  if (game.players[playerIndex].floors.length >= game.targetFloors) {
    game.phase = 'gameOver';
    game.winner = playerIndex;
    const winner = playerIndex === 0 ? '내가' : '컴퓨터가';
    game.log.unshift(`${winner} ${game.targetFloors}층을 완성했습니다.`);
  }
}

export function applyMove(source, move, rng = Math.random) {
  if (!legalMoves(source).some(candidate => sameMove(candidate, move))) throw new Error('허용되지 않은 행동입니다.');
  const game = structuredClone(source);
  const actor = game.current;
  const player = game.players[actor];
  const opponent = game.players[1 - actor];
  if (move.type !== 'endTurn') {
    game.actedThisTurn = true;
    game.forcedPasses = 0;
  }

  if (move.type === 'build') {
    const selected = move.cards.map(index => player.hand[index]);
    const values = pairValues(...selected);
    for (const index of [...move.cards].sort((a, b) => b - a)) takeHandCard(player, index);
    completeFloor(game, actor, {
      cards: selected.map((item, index) => ({ card: item, effectiveValue: values[index] })),
      dog: null
    });
    return game;
  }

  if (move.type === 'stealFloor') {
    const played = takeHandCard(player, move.card);
    const stolenFloor = opponent.floors.pop();
    const stolen = stolenFloor.cards[move.stolen];
    const remaining = stolenFloor.cards[1 - move.stolen];
    game.discard.push(remaining.card);
    completeFloor(game, actor, {
      cards: [{ card: played, effectiveValue: played.value }, stolen],
      dog: null
    });
    return game;
  }

  if (move.type === 'guard') {
    player.floors[move.floor].dog = takeHandCard(player, move.card);
    return game;
  }

  if (move.type === 'bone') {
    const bone = takeHandCard(player, move.card);
    const dog = opponent.floors[move.floor].dog;
    opponent.floors[move.floor].dog = null;
    game.discard.push(bone, dog);
    return game;
  }

  if (move.type === 'destroy') {
    const action = takeHandCard(player, move.card);
    const destroyed = opponent.floors.pop();
    game.discard.push(action, ...destroyed.cards.map(slot => slot.card));
    if (destroyed.dog) game.discard.push(destroyed.dog);
    return game;
  }

  if (move.type === 'thief') {
    const action = takeHandCard(player, move.card);
    game.discard.push(action);
    const stolenIndex = Math.min(opponent.hand.length - 1, Math.floor(rng() * opponent.hand.length));
    player.hand.push(takeHandCard(opponent, stolenIndex));
    return game;
  }

  if (move.type === 'milkshake') {
    opponent.milkshakes.push(takeHandCard(player, move.card));
    return game;
  }

  if (move.type === 'donutTruck') {
    game.donutCard = takeHandCard(player, move.card);
    game.extraTurn = true;
    return game;
  }

  if (move.type === 'endTurn') {
    const forcedPass = !source.actedThisTurn && legalMoves(source).length === 1;
    finishTurn(game, rng, forcedPass);
    return game;
  }

  return game;
}

export function viewForPlayer(game, playerIndex) {
  return {
    phase: game.phase,
    current: game.current,
    winner: game.winner,
    result: game.result,
    targetFloors: game.targetFloors,
    turn: game.turn,
    deckCount: game.deck.length,
    discardTop: structuredClone(game.discard.at(-1) ?? null),
    extraTurn: game.extraTurn,
    players: game.players.map((player, index) => ({
      name: player.name,
      hand: index === playerIndex
        ? structuredClone(player.hand)
        : player.hand.map(() => ({ id: null, type: null, value: null })),
      handCount: player.hand.length,
      floors: structuredClone(player.floors),
      milkshakeCount: player.milkshakes.length
    })),
    log: [...game.log]
  };
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function scoreMove(game, move, difficulty) {
  const actor = game.current;
  const ownFloors = game.players[actor].floors.length;
  const otherFloors = game.players[1 - actor].floors.length;
  const hard = difficulty === 'hard';
  if (move.type === 'build') {
    if (ownFloors + 1 >= game.targetFloors) return 10000;
    return hard ? 500 + ownFloors * 60 : 100 + ownFloors * 10;
  }
  if (move.type === 'stealFloor') {
    if (ownFloors + 1 >= game.targetFloors) return 10000;
    return hard ? 700 + ownFloors * 50 + otherFloors * 50 : 180 + otherFloors * 16;
  }
  if (move.type === 'destroy') {
    if (hard && otherFloors >= game.targetFloors - 1) return 900;
    return hard ? 300 + otherFloors * 30 : 120 + otherFloors * 14;
  }
  if (move.type === 'bone') return hard ? 350 : 75;
  if (move.type === 'milkshake') return hard ? 150 + otherFloors * 30 : 38 + otherFloors * 8;
  if (move.type === 'donutTruck') return hard ? 160 : 55;
  if (move.type === 'guard') return hard ? (move.floor === ownFloors - 1 ? 180 : 70) : (move.floor === ownFloors - 1 ? 45 : 18);
  if (move.type === 'thief') return hard ? 90 : 32;
  return 0;
}

export function chooseAiMove(game, difficulty = 'normal', playerIndex = game.current, rng = Math.random) {
  if (playerIndex !== game.current) throw new Error('현재 플레이어만 행동을 선택할 수 있습니다.');
  const moves = legalMoves(game);
  if (!moves.length) return null;
  if (difficulty === 'easy') return randomItem(moves, rng);
  if (difficulty === 'normal') {
    const actions = moves.filter(move => move.type !== 'endTurn');
    return actions.length ? randomItem(actions, rng) : moves[0];
  }
  const ranked = moves.map(move => ({
    move,
    score: scoreMove(game, move, difficulty)
  })).sort((left, right) => right.score - left.score);
  return ranked[0].move;
}
