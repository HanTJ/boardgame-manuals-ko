function abilityFor(value) {
  if ([7, 8].includes(value)) return 'peek';
  if ([9, 10].includes(value)) return 'spy';
  if ([11, 12].includes(value)) return 'swap';
  return null;
}

export function createDeck() {
  const cards = [];
  for (let value = 0; value <= 13; value += 1) {
    const copies = [0, 13].includes(value) ? 2 : 4;
    for (let copy = 0; copy < copies; copy += 1) {
      cards.push({ id: `cabo-${value}-${copy}`, value, ability: abilityFor(value) });
    }
  }
  return cards;
}

function shuffle(items, rng) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function createGame({ rng = Math.random, firstPlayer = 0, difficulty = 'normal', manualSetup = false } = {}) {
  const deck = shuffle(createDeck(), rng);
  const players = [0, 1].map(index => {
    const row = deck.splice(0, 4).map(card => ({ card, faceUp: false }));
    return {
      name: index === 0 ? '나' : '컴퓨터',
      row,
      known: manualSetup ? [] : row.slice(0, 2).map(slot => slot.card.id),
      score: 0,
      resetUsed: false,
      lastRound: 0
    };
  });
  const discard = [deck.pop()];
  return {
    players,
    deck,
    discard,
    difficulty,
    manualSetup,
    round: 1,
    starter: firstPlayer,
    current: manualSetup ? 0 : firstPlayer,
    phase: manualSetup ? 'setup' : 'turn',
    drawn: null,
    drawnFrom: null,
    pendingExchange: null,
    caboCaller: null,
    finalTurnsRemaining: null,
    result: null,
    winner: null,
    log: ['첫 번째 라운드가 시작되었습니다.']
  };
}

function combinations(length, maxSize = length) {
  const output = [];
  const visit = (start, picked) => {
    if (picked.length) output.push([...picked]);
    if (picked.length === maxSize) return;
    for (let index = start; index < length; index += 1) {
      picked.push(index);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return output;
}

function sameMove(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function legalMoves(game) {
  if (game.phase === 'gameOver') return [];
  if (game.phase === 'setup') {
    return combinations(game.players[game.current].row.length)
      .filter(indices => indices.length === 2)
      .map(indices => ({ type: 'chooseInitial', indices }));
  }
  if (game.phase === 'turn') {
    const moves = [];
    if (game.deck.length) moves.push({ type: 'drawDeck' });
    if (game.discard.length) moves.push({ type: 'takeDiscard' });
    if (game.caboCaller === null) moves.push({ type: 'callCabo' });
    return moves;
  }
  if (game.phase === 'drawn') {
    const rowLength = game.players[game.current].row.length;
    const moves = combinations(rowLength, rowLength > 12 ? 4 : rowLength)
      .map(indices => ({ type: 'exchange', indices }));
    if (rowLength > 12) moves.push({ type: 'exchange', indices: Array.from({ length: rowLength }, (_, index) => index) });
    if (game.drawnFrom === 'deck') {
      moves.unshift({ type: 'discardDrawn' });
      const ability = game.drawn.card.ability;
      if (ability === 'peek') {
        game.players[game.current].row.forEach((slot, target) => {
          if (!slot.faceUp) moves.push({ type: 'usePeek', target });
        });
      }
      if (ability === 'spy') {
        game.players[1 - game.current].row.forEach((slot, target) => {
          if (!slot.faceUp) moves.push({ type: 'useSpy', target });
        });
      }
      if (ability === 'swap') {
        game.players[game.current].row.forEach((_, own) => {
          game.players[1 - game.current].row.forEach((__, other) => moves.push({ type: 'useSwap', own, other }));
        });
      }
    }
    return moves;
  }
  if (game.phase === 'placeExchange') {
    return game.pendingExchange.indices.map(placeAt => ({ type: 'placeExchange', placeAt }));
  }
  if (game.phase === 'placeFailed') {
    const ends = ['left', 'right'];
    if (!game.pendingExchange.penalty) return ends.map(drawnAt => ({ type: 'placeFailed', drawnAt }));
    return ends.flatMap(drawnAt => ends.map(penaltyAt => ({ type: 'placeFailed', drawnAt, penaltyAt })));
  }
  if (game.phase === 'roundResult') return [{ type: 'nextRound' }];
  return [];
}

export function isLegalMove(game, selected) {
  if (game.phase === 'drawn' && selected?.type === 'exchange') {
    const length = game.players[game.current].row.length;
    return Array.isArray(selected.indices)
      && selected.indices.length > 0
      && selected.indices.every((index, position) => Number.isInteger(index)
        && index >= 0
        && index < length
        && (position === 0 || index > selected.indices[position - 1]));
  }
  return legalMoves(game).some(candidate => sameMove(candidate, selected));
}

function rememberPublic(game, card) {
  for (const player of game.players) if (!player.known.includes(card.id)) player.known.push(card.id);
}

function isKamikaze(player) {
  return player.row.length === 4
    && player.row.map(slot => slot.card.value).sort((a, b) => a - b).join(',') === '12,12,13,13';
}

function finalWinner(game) {
  const lowest = Math.min(...game.players.map(player => player.score));
  let candidates = game.players.map((player, index) => ({ player, index })).filter(item => item.player.score === lowest);
  if (candidates.length === 1) return candidates[0].index;
  const lowestRound = Math.min(...candidates.map(item => item.player.lastRound));
  candidates = candidates.filter(item => item.player.lastRound === lowestRound);
  return candidates.length === 1 ? candidates[0].index : null;
}

function resolveRound(game) {
  const sums = game.players.map(player => player.row.reduce((total, slot) => total + slot.card.value, 0));
  const kamikaze = game.players.findIndex(isKamikaze);
  const roundScores = kamikaze >= 0 ? game.players.map((_, index) => index === kamikaze ? 0 : 50) : [...sums];
  if (kamikaze >= 0 && game.caboCaller !== null && game.caboCaller !== kamikaze) {
    roundScores[game.caboCaller] += 10;
  }
  if (kamikaze < 0 && game.caboCaller !== null) {
    const other = 1 - game.caboCaller;
    roundScores[game.caboCaller] = sums[game.caboCaller] <= sums[other] ? 0 : sums[game.caboCaller] + 10;
  }
  const resets = [];
  game.players.forEach((player, index) => {
    player.lastRound = roundScores[index];
    player.score += roundScores[index];
    if (player.score === 100 && !player.resetUsed) {
      player.score = 50;
      player.resetUsed = true;
      resets.push(index);
    }
  });
  game.result = {
    sums,
    roundScores,
    scores: game.players.map(player => player.score),
    caboCaller: game.caboCaller,
    kamikaze: kamikaze >= 0 ? kamikaze : null,
    resets,
    rows: game.players.map(player => player.row.map(slot => slot.card.value))
  };
  game.log.unshift(`라운드 ${game.round}이 끝났습니다.`);
  if (game.players.some(player => player.score > 100)) {
    game.phase = 'gameOver';
    game.winner = finalWinner(game);
  } else {
    game.phase = 'roundResult';
  }
}

function finishTurn(game) {
  if (game.finalTurnsRemaining !== null) {
    game.finalTurnsRemaining -= 1;
    if (game.finalTurnsRemaining <= 0) {
      resolveRound(game);
      return;
    }
  }
  if (!game.deck.length) {
    resolveRound(game);
    return;
  }
  game.current = 1 - game.current;
  game.phase = 'turn';
}

export function applyMove(source, selected, rng = Math.random) {
  if (!isLegalMove(source, selected)) throw new Error('허용되지 않은 행동입니다.');
  const game = structuredClone(source);

  if (selected.type === 'chooseInitial') {
    game.players[game.current].known = selected.indices.map(index => game.players[game.current].row[index].card.id);
    if (game.current === 0) {
      game.current = 1;
    } else {
      game.current = game.starter;
      game.phase = 'turn';
    }
    return game;
  }

  if (selected.type === 'drawDeck' || selected.type === 'takeDiscard') {
    const fromDeck = selected.type === 'drawDeck';
    game.drawn = { card: fromDeck ? game.deck.pop() : game.discard.pop() };
    game.drawnFrom = fromDeck ? 'deck' : 'discard';
    game.phase = 'drawn';
    if (fromDeck && !game.players[game.current].known.includes(game.drawn.card.id)) {
      game.players[game.current].known.push(game.drawn.card.id);
    }
    return game;
  }

  if (selected.type === 'discardDrawn') {
    game.discard.push(game.drawn.card);
    rememberPublic(game, game.drawn.card);
    game.drawn = null;
    game.drawnFrom = null;
    finishTurn(game);
    return game;
  }

  if (selected.type === 'exchange') {
    const actor = game.current;
    const row = game.players[actor].row;
    const removed = selected.indices.map(candidate => row[candidate]);
    const faceUp = game.drawnFrom === 'discard';
    const matches = selected.indices.length === 1 || removed.every(slot => slot.card.value === removed[0].card.value);
    if (matches && selected.indices.length === 1) {
      game.discard.push(removed[0].card);
      rememberPublic(game, removed[0].card);
      row.splice(selected.indices[0], 1, { card: game.drawn.card, faceUp });
      if (faceUp) rememberPublic(game, game.drawn.card);
      game.drawn = null;
      game.drawnFrom = null;
      finishTurn(game);
      return game;
    }
    if (matches) {
      game.pendingExchange = {
        outcome: 'success',
        indices: [...selected.indices],
        drawn: game.drawn.card,
        faceUp
      };
      game.phase = 'placeExchange';
    } else {
      for (const candidate of selected.indices) {
        row[candidate].faceUp = true;
        rememberPublic(game, row[candidate].card);
      }
      game.pendingExchange = {
        outcome: 'failure',
        indices: [...selected.indices],
        drawn: game.drawn.card,
        faceUp,
        penalty: selected.indices.length >= 3 && game.deck.length ? game.deck.pop() : null
      };
      game.phase = 'placeFailed';
    }
    game.drawn = null;
    game.drawnFrom = null;
    return game;
  }

  if (selected.type === 'placeExchange') {
    const pending = game.pendingExchange;
    const row = game.players[game.current].row;
    const insertAt = selected.placeAt - pending.indices.filter(index => index < selected.placeAt).length;
    const removed = pending.indices.map(index => row[index]);
    for (const slot of removed) {
      game.discard.push(slot.card);
      rememberPublic(game, slot.card);
    }
    for (const index of [...pending.indices].sort((a, b) => b - a)) row.splice(index, 1);
    row.splice(insertAt, 0, { card: pending.drawn, faceUp: pending.faceUp });
    if (pending.faceUp) rememberPublic(game, pending.drawn);
    game.pendingExchange = null;
    finishTurn(game);
    return game;
  }

  if (selected.type === 'placeFailed') {
    const pending = game.pendingExchange;
    const row = game.players[game.current].row;
    const place = (slot, end) => end === 'left' ? row.unshift(slot) : row.push(slot);
    place({ card: pending.drawn, faceUp: pending.faceUp }, selected.drawnAt);
    if (pending.faceUp) rememberPublic(game, pending.drawn);
    if (pending.penalty) place({ card: pending.penalty, faceUp: false }, selected.penaltyAt);
    game.pendingExchange = null;
    finishTurn(game);
    return game;
  }

  if (['usePeek', 'useSpy', 'useSwap'].includes(selected.type)) {
    const actor = game.current;
    game.discard.push(game.drawn.card);
    rememberPublic(game, game.drawn.card);
    if (selected.type === 'usePeek') {
      const target = game.players[actor].row[selected.target].card.id;
      if (!game.players[actor].known.includes(target)) game.players[actor].known.push(target);
    }
    if (selected.type === 'useSpy') {
      const target = game.players[1 - actor].row[selected.target].card.id;
      if (!game.players[actor].known.includes(target)) game.players[actor].known.push(target);
    }
    if (selected.type === 'useSwap') {
      const ownSlot = game.players[actor].row[selected.own];
      game.players[actor].row[selected.own] = game.players[1 - actor].row[selected.other];
      game.players[1 - actor].row[selected.other] = ownSlot;
    }
    game.drawn = null;
    game.drawnFrom = null;
    finishTurn(game);
    return game;
  }

  if (selected.type === 'callCabo') {
    game.caboCaller = game.current;
    game.finalTurnsRemaining = 1;
    game.current = 1 - game.current;
    game.phase = 'turn';
    return game;
  }

  if (selected.type === 'nextRound') {
    const tied = game.players[0].lastRound === game.players[1].lastRound;
    const starter = tied ? game.starter : (game.players[0].lastRound < game.players[1].lastRound ? 0 : 1);
    const deck = shuffle(createDeck(), rng);
    for (const player of game.players) {
      player.row = deck.splice(0, 4).map(card => ({ card, faceUp: false }));
      player.known = game.manualSetup ? [] : player.row.slice(0, 2).map(slot => slot.card.id);
    }
    game.deck = deck;
    game.discard = [game.deck.pop()];
    game.round += 1;
    game.starter = starter;
    game.current = game.manualSetup ? 0 : starter;
    game.phase = game.manualSetup ? 'setup' : 'turn';
    game.drawn = null;
    game.drawnFrom = null;
    game.pendingExchange = null;
    game.caboCaller = null;
    game.finalTurnsRemaining = null;
    game.result = null;
    game.log.unshift(`라운드 ${game.round}이 시작되었습니다.`);
    return game;
  }

  return game;
}

export function viewForPlayer(game, playerIndex) {
  const known = new Set(game.players[playerIndex].known);
  const reveal = ['roundResult', 'gameOver'].includes(game.phase);
  const privateDrawn = game.current === playerIndex ? (game.drawn?.card ?? game.pendingExchange?.drawn ?? null) : null;
  return {
    round: game.round,
    phase: game.phase,
    current: game.current,
    starter: game.starter,
    deckCount: game.deck.length,
    discardTop: game.discard.at(-1) ?? null,
    drawn: privateDrawn,
    drawnFrom: game.drawnFrom ?? (game.pendingExchange ? (game.pendingExchange.faceUp ? 'discard' : 'deck') : null),
    caboCaller: game.caboCaller,
    players: game.players.map(player => ({
      name: player.name,
      score: player.score,
      resetUsed: player.resetUsed,
      lastRound: player.lastRound,
      row: player.row.map(slot => {
        const visible = reveal || slot.faceUp || known.has(slot.card.id);
        return {
          id: visible ? slot.card.id : null,
          value: visible ? slot.card.value : null,
          ability: visible ? slot.card.ability : null,
          faceUp: slot.faceUp
        };
      })
    })),
    result: structuredClone(game.result),
    winner: game.winner,
    log: [...game.log]
  };
}

function randomItem(items, rng) {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

function estimatedValue(card, difficulty) {
  if (card.value !== null) return card.value;
  return difficulty === 'hard' ? 6.25 : 7;
}

function bestKnownGroup(row, moves, drawnValue, difficulty) {
  const groups = moves.filter(move => move.type === 'exchange' && move.indices.length > 1).filter(move => {
    const values = move.indices.map(index => row[index].value);
    return values.every(value => value !== null && value === values[0]);
  }).map(move => {
    const removed = move.indices.reduce((sum, index) => sum + estimatedValue(row[index], difficulty), 0);
    return { move, gain: removed - drawnValue };
  }).sort((left, right) => right.gain - left.gain || right.move.indices.length - left.move.indices.length);
  return groups[0]?.gain > 0 ? groups[0].move : null;
}

export function chooseAiMove(game, difficulty = 'normal', playerIndex = game.current, rng = Math.random) {
  const moves = legalMoves(game);
  if (!moves.length) return null;
  if (moves.length === 1) return moves[0];
  const view = viewForPlayer(game, playerIndex);
  const own = view.players[playerIndex].row;
  const other = view.players[1 - playerIndex].row;

  if (['setup', 'placeExchange', 'placeFailed'].includes(game.phase)) return randomItem(moves, rng);

  if (difficulty === 'easy') {
    if (game.phase === 'turn') {
      const call = moves.find(move => move.type === 'callCabo');
      if (call && rng() < 0.08) return call;
      const nonCall = moves.filter(move => move.type !== 'callCabo');
      return randomItem(nonCall.length ? nonCall : moves, rng);
    }
    if (game.phase === 'drawn') {
      const abilities = moves.filter(move => move.type.startsWith('use'));
      if (abilities.length && rng() < 0.45) return randomItem(abilities, rng);
      if (game.drawnFrom === 'deck' && view.drawn.value >= 8 && rng() < 0.65) {
        return moves.find(move => move.type === 'discardDrawn') ?? randomItem(moves, rng);
      }
      const singles = moves.filter(move => move.type === 'exchange' && move.indices.length === 1);
      return randomItem(singles.length ? singles : moves, rng);
    }
    return randomItem(moves, rng);
  }

  if (game.phase === 'turn') {
    const ownEstimate = own.reduce((sum, item) => sum + estimatedValue(item, difficulty), 0);
    const otherEstimate = other.reduce((sum, item) => sum + estimatedValue(item, difficulty), 0);
    const call = moves.find(move => move.type === 'callCabo');
    const threshold = difficulty === 'hard' ? 15 : 18;
    const margin = difficulty === 'hard' ? 1 : 3;
    if (call && ownEstimate <= threshold && ownEstimate + margin <= otherEstimate) return call;
    const takeDiscard = moves.find(move => move.type === 'takeDiscard');
    const worst = Math.max(...own.map(item => estimatedValue(item, difficulty)));
    if (takeDiscard && view.discardTop.value + (difficulty === 'hard' ? 1 : 0) < worst) return takeDiscard;
    return moves.find(move => move.type === 'drawDeck') ?? takeDiscard ?? call;
  }

  if (game.phase === 'drawn') {
    const drawnValue = view.drawn.value;
    const group = bestKnownGroup(own, moves, drawnValue, difficulty);
    if (group) return group;

    const abilityMoves = moves.filter(move => move.type.startsWith('use'));
    if (view.drawn.ability === 'peek') {
      const unknown = abilityMoves.filter(move => move.type === 'usePeek' && own[move.target].value === null);
      if (unknown.length && drawnValue >= (difficulty === 'hard' ? 5 : 7)) return randomItem(unknown, rng);
    }
    if (view.drawn.ability === 'spy') {
      const unknown = abilityMoves.filter(move => move.type === 'useSpy' && other[move.target].value === null);
      if (unknown.length && drawnValue >= (difficulty === 'hard' ? 7 : 9)) return randomItem(unknown, rng);
    }
    if (view.drawn.ability === 'swap') {
      const ownIndex = own.map((item, index) => ({ index, value: estimatedValue(item, difficulty) }))
        .sort((a, b) => b.value - a.value)[0];
      const otherIndex = other.map((item, index) => ({ index, value: estimatedValue(item, difficulty) }))
        .sort((a, b) => a.value - b.value)[0];
      const swap = moves.find(move => move.type === 'useSwap' && move.own === ownIndex.index && move.other === otherIndex.index);
      if (swap && (ownIndex.value > otherIndex.value || difficulty === 'hard')) return swap;
    }

    const ranked = own.map((item, index) => ({ index, value: estimatedValue(item, difficulty) }))
      .sort((a, b) => b.value - a.value || a.index - b.index);
    if (drawnValue < ranked[0].value) {
      return moves.find(move => move.type === 'exchange' && move.indices.length === 1 && move.indices[0] === ranked[0].index);
    }
    return moves.find(move => move.type === 'discardDrawn')
      ?? moves.find(move => move.type === 'exchange' && move.indices.length === 1 && move.indices[0] === ranked[0].index)
      ?? moves[0];
  }

  return moves[0];
}
