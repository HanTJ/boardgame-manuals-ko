export const PROPERTY_RULES = Object.freeze({
  brown: { size: 2, rents: [1, 2] },
  lightBlue: { size: 3, rents: [1, 2, 3] },
  pink: { size: 3, rents: [1, 2, 4] },
  orange: { size: 3, rents: [1, 3, 5] },
  red: { size: 3, rents: [2, 3, 6] },
  yellow: { size: 3, rents: [2, 4, 6] },
  green: { size: 3, rents: [2, 4, 7] },
  darkBlue: { size: 2, rents: [3, 8] },
  railroad: { size: 4, rents: [1, 2, 3, 4] },
  utility: { size: 2, rents: [1, 2] }
});

export const COLOR_NAMES = Object.freeze({
  brown: '갈색', lightBlue: '하늘색', pink: '분홍색', orange: '주황색', red: '빨간색',
  yellow: '노란색', green: '초록색', darkBlue: '진한 파란색', railroad: '철도', utility: '공공시설'
});

const PROPERTY_VALUES = { brown: 1, lightBlue: 1, pink: 2, orange: 2, red: 3, yellow: 3, green: 4, darkBlue: 4, railroad: 2, utility: 2 };
const ALL_COLORS = Object.keys(PROPERTY_RULES);
const ACTION_SPECS = {
  dealBreaker: [2, 5, '딜 브레이커'], forcedDeal: [3, 3, '포스드 딜'], slyDeal: [3, 3, '슬라이 딜'],
  justSayNo: [3, 4, '그냥 안 돼'], debtCollector: [3, 3, '빚 받기'], birthday: [3, 2, '생일 축하해'],
  doubleRent: [2, 1, '임대료 두 배'], house: [3, 3, '집'], hotel: [2, 4, '호텔'], passGo: [10, 1, '출발']
};
const RENT_SPECS = [
  [['lightBlue', 'brown'], 2], [['pink', 'orange'], 2], [['red', 'yellow'], 2],
  [['darkBlue', 'green'], 2], [['railroad', 'utility'], 2], [ALL_COLORS, 3]
];
const WILD_SPECS = [
  [['lightBlue', 'brown'], 1, 1], [['lightBlue', 'railroad'], 4, 1], [['pink', 'orange'], 2, 2],
  [['red', 'yellow'], 3, 2], [['darkBlue', 'green'], 4, 1], [['green', 'railroad'], 4, 1],
  [['railroad', 'utility'], 2, 1], [ALL_COLORS, 0, 2]
];

function clone(value) { return structuredClone(value); }
function shuffle(cards, rng = Math.random) {
  const result = [...cards];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
function addCopies(deck, count, factory, prefix) {
  for (let index = 1; index <= count; index += 1) deck.push({ id: `${prefix}-${index}`, ...factory(index) });
}

export function createDeck() {
  const deck = [];
  for (const [color, rule] of Object.entries(PROPERTY_RULES)) {
    addCopies(deck, rule.size, () => ({ kind: 'property', name: `${COLOR_NAMES[color]} 부동산`, value: PROPERTY_VALUES[color], colors: [color] }), `property-${color}`);
  }
  WILD_SPECS.forEach(([colors, value, count], specIndex) => addCopies(deck, count, () => ({ kind: 'wild', name: colors.length === ALL_COLORS.length ? '모든 색 와일드' : `${colors.map(color => COLOR_NAMES[color]).join('/')} 와일드`, value, colors: [...colors] }), `wild-${specIndex}`));
  for (const [action, [count, value, name]] of Object.entries(ACTION_SPECS)) {
    addCopies(deck, count, () => ({ kind: 'action', action, name, value }), `action-${action}`);
  }
  RENT_SPECS.forEach(([colors, count], specIndex) => addCopies(deck, count, () => ({ kind: 'action', action: 'rent', name: colors.length === ALL_COLORS.length ? '다색 임대료' : `${colors.map(color => COLOR_NAMES[color]).join('/')} 임대료`, value: colors.length === ALL_COLORS.length ? 3 : 1, colors: [...colors] }), `action-rent-${specIndex}`));
  for (const [value, count] of [[1, 6], [2, 5], [3, 3], [4, 3], [5, 2], [10, 1]]) {
    addCopies(deck, count, () => ({ kind: 'money', name: `${value}M`, value }), `money-${value}`);
  }
  return deck;
}

function ensurePlayer(player) {
  player.hand ??= [];
  player.bank ??= [];
  player.groups ??= [];
  player.looseBuildings ??= [];
}
function normalize(game) {
  game.players.forEach(ensurePlayer);
  game.discard ??= [];
  game.log ??= [];
  game.nextGroupId ??= 1;
  return game;
}
function recycleIfNeeded(game, rng) {
  if (!game.deck.length && game.discard.length) {
    game.deck = shuffle(game.discard, rng);
    game.discard = [];
    game.log.push('버림 더미를 섞어 새 뽑기 더미를 만들었습니다.');
  }
}
function drawCards(game, playerIndex, count, rng = Math.random) {
  for (let drawn = 0; drawn < count; drawn += 1) {
    recycleIfNeeded(game, rng);
    if (!game.deck.length) break;
    game.players[playerIndex].hand.push(game.deck.pop());
  }
}
function completed(group) { return group.cards.length >= PROPERTY_RULES[group.color].size; }
function completedColors(player) { return new Set(player.groups.filter(completed).map(group => group.color)); }
function checkWin(game) {
  if (completedColors(game.players[game.current]).size >= 3) {
    game.phase = 'gameOver';
    game.winner = game.current;
    game.log.push(`${game.players[game.current].name}의 완성 세트가 3개가 되어 승리했습니다.`);
    return true;
  }
  return false;
}
function beginTurn(game, rng = Math.random) {
  game.phase = 'action';
  game.playsLeft = 3;
  game.pending = null;
  game.payment = null;
  if (completedColors(game.players[game.current]).size >= 3) return checkWin(game);
  const amount = game.players[game.current].hand.length === 0 ? 5 : 2;
  drawCards(game, game.current, amount, rng);
  game.log.push(`${game.players[game.current].name}이(가) 카드 ${amount}장을 뽑았습니다.`);
}

export function createGame({ difficulty = 'normal', rng = Math.random, startingPlayer = 0 } = {}) {
  const game = normalize({
    players: [
      { name: '나', hand: [], bank: [], groups: [], looseBuildings: [] },
      { name: '컴퓨터', hand: [], bank: [], groups: [], looseBuildings: [] }
    ],
    deck: shuffle(createDeck(), rng), discard: [], current: startingPlayer, phase: 'setup', playsLeft: 3,
    pending: null, payment: null, winner: null, turn: 1, nextGroupId: 1, difficulty,
    log: ['Monopoly Deal 게임을 시작합니다.']
  });
  for (let round = 0; round < 5; round += 1) {
    drawCards(game, 0, 1, rng);
    drawCards(game, 1, 1, rng);
  }
  beginTurn(game, rng);
  return game;
}

function cardById(hand, cardId) { return hand.find(card => card.id === cardId); }
function removeCard(hand, cardId) {
  const index = hand.findIndex(card => card.id === cardId);
  if (index < 0) throw new Error(`카드를 찾을 수 없습니다: ${cardId}`);
  return hand.splice(index, 1)[0];
}
function incompleteGroups(player, color) { return player.groups.filter(group => group.color === color && !completed(group)); }
function propertyMoves(game, card) {
  const player = game.players[game.current];
  return card.colors.flatMap(color => {
    const existing = incompleteGroups(player, color).map(group => ({ type: 'property', cardId: card.id, color, groupId: group.id }));
    return existing.length ? existing : [{ type: 'property', cardId: card.id, color, groupId: null }];
  });
}
function movablePropertyCards(player) {
  return player.groups.flatMap(group => completed(group) ? [] : group.cards.map(card => ({ group, card })));
}
function rentForGroup(group) {
  if (!group.cards.length) return 0;
  const count = Math.min(group.cards.length, PROPERTY_RULES[group.color].size);
  let rent = PROPERTY_RULES[group.color].rents[count - 1] ?? 0;
  if (group.cards.every(card => card.kind === 'wild' && card.value === 0)) rent = 0;
  if (completed(group)) {
    if (group.house) rent += 3;
    if (group.hotel) rent += 4;
  }
  return rent;
}
function actionMoves(game, card) {
  const actor = game.players[game.current];
  const opponent = game.players[(game.current + 1) % 2];
  const base = { type: 'action', action: card.action, cardId: card.id };
  if (card.action === 'passGo' || card.action === 'debtCollector' || card.action === 'birthday') return [base];
  if (card.action === 'justSayNo' || card.action === 'doubleRent') return [];
  if (card.action === 'rent') {
    const doubles = actor.hand.filter(candidate => candidate.action === 'doubleRent');
    const moves = actor.groups.filter(group => card.colors.includes(group.color) && rentForGroup(group) > 0).map(group => ({ ...base, groupId: group.id, color: group.color, doubleCardIds: [] }));
    if (game.playsLeft >= 2) for (const candidate of [...moves]) for (const doubleCard of doubles) moves.push({ ...candidate, doubleCardIds: [doubleCard.id] });
    if (game.playsLeft >= 3 && doubles.length >= 2) {
      for (const candidate of moves.filter(move => move.doubleCardIds.length === 0)) {
        for (let first = 0; first < doubles.length - 1; first += 1) for (let second = first + 1; second < doubles.length; second += 1) {
          moves.push({ ...candidate, doubleCardIds: [doubles[first].id, doubles[second].id] });
        }
      }
    }
    return moves;
  }
  if (card.action === 'house') return actor.groups.filter(group => completed(group) && !group.house && !['railroad', 'utility'].includes(group.color)).map(group => ({ ...base, targetGroupId: group.id }));
  if (card.action === 'hotel') return actor.groups.filter(group => completed(group) && group.house && !group.hotel && !['railroad', 'utility'].includes(group.color)).map(group => ({ ...base, targetGroupId: group.id }));
  if (card.action === 'slyDeal') return movablePropertyCards(opponent).map(({ group, card: target }) => ({ ...base, targetGroupId: group.id, targetCardId: target.id }));
  if (card.action === 'forcedDeal') {
    const own = movablePropertyCards(actor);
    const targets = movablePropertyCards(opponent);
    return own.flatMap(({ group: ownGroup, card: ownCard }) => targets.map(({ group: targetGroup, card: targetCard }) => ({ ...base, ownGroupId: ownGroup.id, ownCardId: ownCard.id, targetGroupId: targetGroup.id, targetCardId: targetCard.id })));
  }
  if (card.action === 'dealBreaker') return opponent.groups.filter(completed).map(group => ({ ...base, targetGroupId: group.id }));
  return [];
}
function reassignMoves(game) {
  const player = game.players[game.current];
  const moves = [];
  for (const group of player.groups) for (const card of group.cards.filter(item => item.kind === 'wild')) {
    if ((group.house || group.hotel) && group.cards.length <= PROPERTY_RULES[group.color].size) continue;
    for (const color of card.colors) {
      if (color === group.color) continue;
      for (const target of incompleteGroups(player, color)) moves.push({ type: 'reassignWild', cardId: card.id, fromGroupId: group.id, color, groupId: target.id });
      moves.push({ type: 'reassignWild', cardId: card.id, fromGroupId: group.id, color, groupId: null });
    }
  }
  return moves;
}
function publicAssets(player) {
  const assets = player.bank.filter(card => card.value > 0).map(card => ({ key: `bank:${card.id}`, value: card.value, zone: 'bank', card }));
  for (const group of player.groups) {
    for (const card of group.cards.filter(item => item.value > 0)) assets.push({ key: `property:${group.id}:${card.id}`, value: card.value, zone: 'property', card, group });
  }
  return assets;
}

export function legalMoves(source, playerIndex = null) {
  const game = normalize(clone(source));
  if (game.phase === 'gameOver') return [];
  if (game.phase === 'response') {
    const responder = game.pending.responder;
    if (playerIndex !== null && playerIndex !== responder) return [];
    const moves = [{ type: 'respond', choice: 'accept' }];
    const noCards = game.players[responder].hand.filter(card => card.action === 'justSayNo');
    for (const card of noCards) moves.push({ type: 'respond', choice: 'no', cardId: card.id });
    return moves;
  }
  if (game.phase === 'payment') {
    const payer = game.payment.payer;
    if (playerIndex !== null && playerIndex !== payer) return [];
    const assets = publicAssets(game.players[payer]);
    const selected = new Set(game.payment.selected);
    const moves = assets.map(asset => ({ type: 'paymentToggle', assetKey: asset.key }));
    const selectedValue = assets.filter(asset => selected.has(asset.key)).reduce((sum, asset) => sum + asset.value, 0);
    const total = assets.reduce((sum, asset) => sum + asset.value, 0);
    if (selectedValue >= game.payment.amount || (total < game.payment.amount && selected.size === assets.length)) moves.push({ type: 'paymentConfirm' });
    return moves;
  }
  if (game.phase === 'discard') {
    if (playerIndex !== null && playerIndex !== game.current) return [];
    return game.players[game.current].hand.map(card => ({ type: 'discard', cardId: card.id }));
  }
  if (playerIndex !== null && playerIndex !== game.current) return [];
  const player = game.players[game.current];
  const moves = [{ type: 'endTurn' }, ...reassignMoves(game)];
  if (game.playsLeft <= 0) return moves;
  for (const card of player.hand) {
    if (card.kind === 'property' || card.kind === 'wild') moves.push(...propertyMoves(game, card));
    else {
      if (card.value > 0) moves.push({ type: 'bank', cardId: card.id });
      moves.push(...actionMoves(game, card));
    }
  }
  return moves;
}

function sameMove(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function validateMove(game, move) {
  if (!legalMoves(game).some(candidate => sameMove(candidate, move))) throw new Error(`허용되지 않은 행동입니다: ${JSON.stringify(move)}`);
}
function placeProperty(game, playerIndex, card, color, groupId = null) {
  const player = game.players[playerIndex];
  let group = groupId ? player.groups.find(candidate => candidate.id === groupId) : null;
  if (!group) {
    group = { id: `group-${game.nextGroupId++}`, color, cards: [], house: null, hotel: null };
    player.groups.push(group);
  }
  group.cards.push(card);
  return group;
}
function placeReceivedProperty(game, playerIndex, card, color) {
  const target = incompleteGroups(game.players[playerIndex], color)[0];
  return placeProperty(game, playerIndex, card, color, target?.id ?? null);
}
function cleanupGroup(player, group) {
  if (!completed(group)) {
    if (group.house) player.bank.push(group.house);
    if (group.hotel) player.bank.push(group.hotel);
    group.house = null;
    group.hotel = null;
  }
  if (!group.cards.length) player.groups = player.groups.filter(candidate => candidate.id !== group.id);
}
function removeProperty(player, groupId, cardId) {
  const group = player.groups.find(candidate => candidate.id === groupId);
  if (!group) throw new Error('부동산 세트를 찾을 수 없습니다.');
  const card = removeCard(group.cards, cardId);
  cleanupGroup(player, group);
  return { card, color: group.color };
}
function discardFromHand(game, playerIndex, cardId) { game.discard.push(removeCard(game.players[playerIndex].hand, cardId)); }
function completePlay(game) {
  if (checkWin(game)) return;
  game.phase = 'action';
  game.pending = null;
}
function hostile(game, effect) {
  game.phase = 'response';
  game.pending = { effect, active: true, responder: effect.target, actor: game.current };
}
function startPayment(game, payer, receiver, amount, source) {
  game.phase = 'payment';
  game.pending = null;
  game.payment = { payer, receiver, amount, selected: [], source };
  if (!publicAssets(game.players[payer]).length) {
    game.log.push(`${game.players[payer].name}에게 지불할 공개 카드가 없습니다.`);
    game.payment = null;
    completePlay(game);
  }
}
function applyEffect(game, effect) {
  const actor = effect.actor;
  const target = effect.target;
  if (effect.kind === 'debt') startPayment(game, target, actor, 5, '빚 받기');
  else if (effect.kind === 'birthday') startPayment(game, target, actor, 2, '생일 축하해');
  else if (effect.kind === 'rent') startPayment(game, target, actor, effect.amount, '임대료');
  else if (effect.kind === 'sly') {
    const moved = removeProperty(game.players[target], effect.targetGroupId, effect.targetCardId);
    placeReceivedProperty(game, actor, moved.card, moved.color);
    completePlay(game);
  } else if (effect.kind === 'forced') {
    const own = removeProperty(game.players[actor], effect.ownGroupId, effect.ownCardId);
    const theirs = removeProperty(game.players[target], effect.targetGroupId, effect.targetCardId);
    placeReceivedProperty(game, actor, theirs.card, theirs.color);
    placeReceivedProperty(game, target, own.card, own.color);
    completePlay(game);
  } else if (effect.kind === 'breaker') {
    const player = game.players[target];
    const index = player.groups.findIndex(group => group.id === effect.targetGroupId);
    const [taken] = player.groups.splice(index, 1);
    game.players[actor].groups.push(taken);
    completePlay(game);
  }
}
function nextTurn(game, rng) {
  game.current = (game.current + 1) % 2;
  game.turn += 1;
  beginTurn(game, rng);
}
function finishTurn(game, rng) {
  if (game.players[game.current].hand.length > 7) game.phase = 'discard';
  else nextTurn(game, rng);
}

export function applyMove(source, move, { rng = Math.random } = {}) {
  const game = normalize(clone(source));
  validateMove(game, move);
  if (move.type === 'endTurn') { finishTurn(game, rng); return game; }
  if (move.type === 'discard') {
    discardFromHand(game, game.current, move.cardId);
    if (game.players[game.current].hand.length <= 7) nextTurn(game, rng);
    return game;
  }
  if (move.type === 'bank') {
    const card = removeCard(game.players[game.current].hand, move.cardId);
    game.players[game.current].bank.push(card);
    game.playsLeft -= 1;
    game.log.push(`${game.players[game.current].name}이(가) ${card.name} 카드를 은행에 넣었습니다.`);
    if (game.playsLeft === 0) finishTurn(game, rng);
    return game;
  }
  if (move.type === 'property') {
    const card = removeCard(game.players[game.current].hand, move.cardId);
    placeProperty(game, game.current, card, move.color, move.groupId);
    game.playsLeft -= 1;
    game.log.push(`${game.players[game.current].name}이(가) ${COLOR_NAMES[move.color]} 부동산을 놓았습니다.`);
    if (!checkWin(game) && game.playsLeft === 0) finishTurn(game, rng);
    return game;
  }
  if (move.type === 'reassignWild') {
    const moved = removeProperty(game.players[game.current], move.fromGroupId, move.cardId);
    placeProperty(game, game.current, moved.card, move.color, move.groupId);
    checkWin(game);
    return game;
  }
  if (move.type === 'respond') {
    if (move.choice === 'no') {
      discardFromHand(game, game.pending.responder, move.cardId);
      game.pending.active = !game.pending.active;
      game.pending.responder = (game.pending.responder + 1) % 2;
      game.log.push('‘그냥 안 돼’로 효과의 적용 여부가 뒤집혔습니다.');
      return game;
    }
    const effect = game.pending.effect;
    if (game.pending.active) applyEffect(game, effect);
    else completePlay(game);
    return game;
  }
  if (move.type === 'paymentToggle') {
    const selected = new Set(game.payment.selected);
    if (selected.has(move.assetKey)) selected.delete(move.assetKey); else selected.add(move.assetKey);
    game.payment.selected = [...selected];
    return game;
  }
  if (move.type === 'paymentConfirm') {
    const { payer, receiver, selected, source: label } = game.payment;
    const payerPlayer = game.players[payer];
    const receiverPlayer = game.players[receiver];
    const assets = new Map(publicAssets(payerPlayer).map(asset => [asset.key, asset]));
    let paid = 0;
    for (const key of selected) {
      const asset = assets.get(key);
      if (!asset) continue;
      paid += asset.value;
      if (asset.zone === 'bank') receiverPlayer.bank.push(removeCard(payerPlayer.bank, asset.card.id));
      else if (asset.zone === 'property') {
        const moved = removeProperty(payerPlayer, asset.group.id, asset.card.id);
        placeReceivedProperty(game, receiver, moved.card, moved.color);
      }
    }
    game.log.push(`${payerPlayer.name}이(가) ${label}로 ${paid}M을 지불했습니다.`);
    game.payment = null;
    completePlay(game);
    return game;
  }
  if (move.type === 'action') {
    const actor = game.current;
    const target = (actor + 1) % 2;
    const actionCard = removeCard(game.players[actor].hand, move.cardId);
    if (!['house', 'hotel'].includes(move.action)) game.discard.push(actionCard);
    game.playsLeft -= 1;
    for (const doubleCardId of move.doubleCardIds ?? []) {
      game.discard.push(removeCard(game.players[actor].hand, doubleCardId));
      game.playsLeft -= 1;
    }
    game.log.push(`${game.players[actor].name}이(가) ${actionCard.name} 카드를 사용했습니다.`);
    if (move.action === 'passGo') {
      drawCards(game, actor, 2, rng);
      if (game.playsLeft === 0) finishTurn(game, rng);
    } else if (move.action === 'house' || move.action === 'hotel') {
      const group = game.players[actor].groups.find(candidate => candidate.id === move.targetGroupId);
      group[move.action] = actionCard;
      if (game.playsLeft === 0) finishTurn(game, rng);
    } else if (move.action === 'rent') {
      const group = game.players[actor].groups.find(candidate => candidate.id === move.groupId);
      hostile(game, { kind: 'rent', actor, target, amount: rentForGroup(group) * (2 ** (move.doubleCardIds?.length ?? 0)) });
    } else if (move.action === 'debtCollector') hostile(game, { kind: 'debt', actor, target });
    else if (move.action === 'birthday') hostile(game, { kind: 'birthday', actor, target });
    else if (move.action === 'slyDeal') hostile(game, { kind: 'sly', actor, target, targetGroupId: move.targetGroupId, targetCardId: move.targetCardId });
    else if (move.action === 'forcedDeal') hostile(game, { kind: 'forced', actor, target, ownGroupId: move.ownGroupId, ownCardId: move.ownCardId, targetGroupId: move.targetGroupId, targetCardId: move.targetCardId });
    else if (move.action === 'dealBreaker') hostile(game, { kind: 'breaker', actor, target, targetGroupId: move.targetGroupId });
    return game;
  }
  throw new Error(`처리되지 않은 행동입니다: ${move.type}`);
}

function propertyProgress(player) {
  return player.groups.reduce((score, group) => score + Math.min(group.cards.length / PROPERTY_RULES[group.color].size, 1) * 12 + (completed(group) ? 25 : 0), 0);
}
function positionValue(game, playerIndex) {
  const player = game.players[playerIndex];
  return completedColors(player).size * 120 + propertyProgress(player) + player.bank.reduce((sum, card) => sum + card.value, 0) * 0.7 + player.hand.length * 0.4;
}
function moveScore(game, candidate, playerIndex) {
  if (candidate.type === 'paymentConfirm') return 1000;
  if (candidate.type === 'respond') {
    if (candidate.choice === 'accept') return game.pending.active ? 0 : 60;
    return game.pending.active ? 65 : 30;
  }
  if (candidate.type === 'discard') {
    const card = cardById(game.players[playerIndex].hand, candidate.cardId);
    return -(card.kind === 'property' || card.kind === 'wild' ? 20 : card.value);
  }
  if (candidate.type === 'paymentToggle') {
    const asset = publicAssets(game.players[playerIndex]).find(item => item.key === candidate.assetKey);
    const propertyPenalty = asset.zone === 'property' ? 15 : asset.zone === 'building' ? 12 : 0;
    return -asset.value - propertyPenalty;
  }
  if (candidate.type === 'endTurn') return game.playsLeft === 3 ? -20 : 1;
  if (candidate.type === 'reassignWild') return 2;
  if (candidate.type === 'bank') {
    const card = cardById(game.players[playerIndex].hand, candidate.cardId);
    return card.kind === 'money' ? 16 + card.value : 4 + card.value;
  }
  if (candidate.type === 'property') {
    const colorRule = PROPERTY_RULES[candidate.color];
    const target = candidate.groupId ? game.players[playerIndex].groups.find(group => group.id === candidate.groupId) : null;
    const completing = target && target.cards.length + 1 >= colorRule.size;
    return completing ? 150 : 35 + (target?.cards.length ?? 0) * 8;
  }
  if (candidate.type === 'action') {
    return ({ dealBreaker: 180, slyDeal: 75, forcedDeal: 65, rent: candidate.doubleCardIds?.length ? 72 + candidate.doubleCardIds.length * 8 : 50, debtCollector: 42, birthday: 32, house: 38, hotel: 48, passGo: 24 }[candidate.action] ?? 5);
  }
  return 0;
}

export function chooseAiMove(game, difficulty = 'normal', playerIndex = null, rng = Math.random) {
  const actor = playerIndex ?? (game.phase === 'payment' ? game.payment.payer : game.phase === 'response' ? game.pending.responder : game.current);
  const moves = legalMoves(game, actor);
  if (!moves.length) return null;
  if (game.phase === 'payment') {
    const confirm = moves.find(candidate => candidate.type === 'paymentConfirm');
    if (confirm) return confirm;
    const toggles = moves.filter(candidate => candidate.type === 'paymentToggle' && !game.payment.selected.includes(candidate.assetKey));
    if (toggles.length) return [...toggles].sort((a, b) => moveScore(game, b, actor) - moveScore(game, a, actor))[0];
  }
  const stableMoves = moves.filter(candidate => candidate.type !== 'reassignWild');
  const decisionMoves = stableMoves.length ? stableMoves : moves;
  if (difficulty === 'easy') {
    const productive = decisionMoves.filter(candidate => candidate.type !== 'endTurn');
    const pool = game.phase === 'action' && game.playsLeft > 0 && productive.length && rng() < 0.78 ? productive : decisionMoves;
    return pool[Math.floor(rng() * pool.length)];
  }
  const ranked = decisionMoves.map(candidate => ({ candidate, score: moveScore(game, candidate, actor) })).sort((a, b) => b.score - a.score);
  if (difficulty === 'hard') return ranked[0].candidate;
  const near = ranked.filter(item => item.score >= ranked[0].score - 55).slice(0, 8);
  return near[Math.floor(rng() * near.length)].candidate;
}

export function summarizePlayer(player) {
  return {
    bank: player.bank.reduce((sum, card) => sum + card.value, 0),
    completedSets: completedColors(player).size,
    properties: player.groups.reduce((sum, group) => sum + group.cards.length, 0),
    hand: player.hand.length
  };
}
