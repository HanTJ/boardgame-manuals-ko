const GIFT_DATA = [
  ['모자','🎩'],['우산','☂️'],['브로콜리','🥦'],['기타','🎸'],['안경','👓'],['시계','⌚'],['카메라','📷'],['열쇠','🔑'],['책','📕'],['연필','✏️'],
  ['가위','✂️'],['망치','🔨'],['전구','💡'],['양초','🕯️'],['자석','🧲'],['종','🔔'],['풍선','🎈'],['선물 상자','🎁'],['테니스공','🎾'],['축구공','⚽'],
  ['농구공','🏀'],['주사위','🎲'],['퍼즐','🧩'],['요요','🪀'],['연','🪁'],['곰 인형','🧸'],['로봇','🤖'],['왕관','👑'],['반지','💍'],['보석','💎'],
  ['지갑','👛'],['가방','🎒'],['신발','👟'],['양말','🧦'],['장갑','🧤'],['목도리','🧣'],['우비','🧥'],['바지','👖'],['드레스','👗'],['티셔츠','👕'],
  ['사과','🍎'],['바나나','🍌'],['포도','🍇'],['딸기','🍓'],['수박','🍉'],['레몬','🍋'],['복숭아','🍑'],['체리','🍒'],['당근','🥕'],['옥수수','🌽'],
  ['빵','🍞'],['치즈','🧀'],['달걀','🥚'],['피자','🍕'],['햄버거','🍔'],['감자튀김','🍟'],['도넛','🍩'],['쿠키','🍪'],['초콜릿','🍫'],['사탕','🍬'],
  ['커피','☕'],['주스','🧃'],['물병','🧴'],['컵','🥤'],['숟가락','🥄'],['포크','🍴'],['냄비','🍲'],['프라이팬','🍳'],['소화기','🧯'],['빗자루','🧹'],
  ['칫솔','🪥'],['비누','🧼'],['휴지','🧻'],['빗','🪮'],['거울','🪞'],['침대','🛏️'],['의자','🪑'],['문','🚪'],['창문','🪟'],['화분','🪴'],
  ['선인장','🌵'],['꽃','🌻'],['나무','🌳'],['버섯','🍄'],['조개','🐚'],['달','🌙'],['별','⭐'],['해','☀️'],['구름','☁️'],['무지개','🌈'],
  ['고양이','🐈'],['강아지','🐕'],['토끼','🐇'],['여우','🦊'],['판다','🐼'],['개구리','🐸'],['문어','🐙'],['물고기','🐟'],['나비','🦋'],['달팽이','🐌'],
  ['자동차','🚗'],['자전거','🚲'],['버스','🚌'],['기차','🚆'],['비행기','✈️'],['배','⛵'],['로켓','🚀'],['지도','🗺️'],['나침반','🧭'],['망원경','🔭']
];

export const GIFT_LABELS = Object.freeze(GIFT_DATA.map(([label]) => label));

export function createDeck() {
  return GIFT_DATA.map(([label, icon], index) => ({
    id: `gift-${String(index + 1).padStart(3, '0')}`,
    label,
    icon,
    direction: index % 2 === 0 ? 'left' : 'right',
    faceUp: true
  }));
}

function shuffle(items, rng) {
  const result = items.map(item => ({ ...item }));
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function neighbor(index, direction, count) {
  return (index + (direction === 'left' ? 1 : count - 1)) % count;
}

const MEMORY_PROFILE = Object.freeze({
  easy: { initial: 0.58, decay: 0.075, falseReject: 0.16, unknownReject: 0.22 },
  normal: { initial: 0.82, decay: 0.035, falseReject: 0.06, unknownReject: 0.16 },
  hard: { initial: 0.98, decay: 0.01, falseReject: 0.015, unknownReject: 0.1 }
});

function rememberCards(game, cards) {
  const confidence = MEMORY_PROFILE[game.difficulty].initial;
  for (let playerIndex = 0; playerIndex < game.players.length; playerIndex += 1) {
    if (game.players[playerIndex].kind !== 'ai') continue;
    for (const card of cards) {
      game.memories[playerIndex][card.id] = { label: card.label, confidence, seenTurn: game.turn };
    }
  }
}

function faceCard(card) {
  if (!card) return null;
  return { ...card, direction: null, faceUp: true };
}

function hiddenCard(card) {
  if (!card) return null;
  return { id: card.id, label: null, icon: null, direction: card.direction, faceUp: false };
}

export function projectObservation(game, playerIndex) {
  const profile = MEMORY_PROFILE[game.difficulty];
  const ownMemory = game.memories[playerIndex] ?? {};
  const memory = Object.fromEntries(Object.entries(ownMemory).map(([id, item]) => [id, {
    label: item.label,
    confidence: Math.max(0.05, item.confidence - profile.decay * Math.max(0, game.turn - item.seenTurn))
  }]));
  return {
    phase: game.phase,
    difficulty: game.difficulty,
    playerIndex,
    turn: game.turn,
    players: game.players.map(player => ({
      name: player.name,
      kind: player.kind,
      gifts: player.gifts.map(card => card.faceUp ? faceCard(card) : hiddenCard(card)),
      penalties: player.penalties.map(card => faceCard(card))
    })),
    shopCount: game.shop.length,
    shopTop: faceCard(game.shop.at(-1)),
    pendingPass: game.pendingPass ? { actor: game.pendingPass.actor, card: hiddenCard(game.pendingPass.card) } : null,
    pendingOffer: game.pendingOffer ? {
      giver: game.pendingOffer.giver,
      receiver: game.pendingOffer.receiver,
      claim: game.pendingOffer.claim,
      card: hiddenCard(game.pendingOffer.card)
    } : null,
    winnerIndexes: [...game.winnerIndexes],
    log: [...game.log],
    memory,
    moves: legalMoves(game, playerIndex)
  };
}

export function chooseAiMove(observation, rng = Math.random) {
  const moves = observation.moves ?? [];
  if (!moves.length) return null;
  if (observation.phase === 'awaitClaim') {
    const remembered = observation.memory[observation.pendingPass.card.id];
    if (remembered && rng() < remembered.confidence) return { type: 'claim', label: remembered.label };
    return moves[Math.floor(rng() * moves.length)];
  }
  if (observation.phase === 'awaitResponse') {
    const remembered = observation.memory[observation.pendingOffer.card.id];
    const profile = MEMORY_PROFILE[observation.difficulty];
    if (!remembered) return { type: rng() < profile.unknownReject ? 'reject' : 'accept' };
    const mismatch = remembered.label !== observation.pendingOffer.claim;
    if (mismatch) return { type: rng() < remembered.confidence ? 'reject' : 'accept' };
    return { type: rng() < profile.falseReject ? 'reject' : 'accept' };
  }
  return moves[0];
}

export function legalMoves(game, playerIndex) {
  if (game.phase === 'awaitResponse' && game.pendingOffer?.receiver === playerIndex) {
    return [{ type: 'accept' }, { type: 'reject' }];
  }
  if (game.phase === 'awaitClaim' && game.pendingPass?.actor === playerIndex) {
    return GIFT_LABELS.map(label => ({ type: 'claim', label }));
  }
  return [];
}

function sameMove(first, second) {
  return first.type === second.type && (first.type !== 'claim' || first.label === second.label);
}

export function applyMove(game, move, playerIndex) {
  if (!legalMoves(game, playerIndex).some(candidate => sameMove(candidate, move))) {
    throw new Error('허용되지 않은 행동입니다.');
  }
  const next = structuredClone(game);
  if (move.type === 'accept') {
    const offer = next.pendingOffer;
    const receiver = next.players[playerIndex];
    receiver.gifts.unshift({ ...offer.card, faceUp: false });
    const oldest = receiver.gifts.pop();
    next.pendingOffer = null;
    next.pendingPass = { actor: playerIndex, card: { ...oldest, faceUp: false } };
    next.phase = 'awaitClaim';
    next.turn += 1;
    next.log.unshift(`${receiver.name}이(가) 선물을 받고 오래된 선물을 준비합니다.`);
    return next;
  }
  if (move.type === 'claim') {
    const pass = next.pendingPass;
    const card = { ...pass.card, faceUp: false };
    next.pendingOffer = {
      giver: playerIndex,
      receiver: neighbor(playerIndex, card.direction, next.players.length),
      card,
      claim: move.label
    };
    next.pendingPass = null;
    next.phase = 'awaitResponse';
    next.turn += 1;
    next.log.unshift(`${next.players[playerIndex].name}이(가) ‘${move.label}’이라고 말하며 선물을 건넸습니다.`);
    return next;
  }
  if (move.type === 'reject') {
    const offer = next.pendingOffer;
    const claimWasCorrect = offer.claim === offer.card.label;
    const penalized = claimWasCorrect ? offer.receiver : offer.giver;
    const player = next.players[penalized];
    player.penalties.push({ ...offer.card, faceUp: true });
    rememberCards(next, [offer.card]);
    next.log.unshift(`${player.name}이(가) ‘${offer.card.label}’ 카드를 벌점으로 받았습니다.`);
    next.pendingOffer = null;
    next.turn += 1;
    if (player.penalties.length >= 3) {
      next.phase = 'gameOver';
      const minimum = Math.min(...next.players.map(candidate => candidate.penalties.length));
      next.winnerIndexes = next.players
        .map((candidate, index) => candidate.penalties.length === minimum ? index : -1)
        .filter(index => index >= 0);
      next.log.unshift('세 번째 벌점이 나와 게임이 끝났습니다.');
      return next;
    }
    const replacement = next.shop.pop();
    if (!replacement) throw new Error('선물 가게가 비었습니다.');
    const hidden = { ...replacement, faceUp: false };
    rememberCards(next, [replacement]);
    next.pendingOffer = {
      giver: penalized,
      receiver: neighbor(penalized, hidden.direction, next.players.length),
      card: hidden,
      claim: replacement.label
    };
    next.phase = 'awaitResponse';
    next.log.unshift(`${player.name}이(가) 새 선물을 공개하고 건넸습니다.`);
    return next;
  }
  throw new Error('아직 구현되지 않은 행동입니다.');
}

export function createGame({ difficulty = 'normal', rng = Math.random } = {}) {
  if (!['easy', 'normal', 'hard'].includes(difficulty)) throw new Error('지원하지 않는 난이도입니다.');
  const deck = shuffle(createDeck(), rng);
  const players = [
    { name: '나', kind: 'human', gifts: [], penalties: [] },
    { name: '컴퓨터 A', kind: 'ai', gifts: [], penalties: [] },
    { name: '컴퓨터 B', kind: 'ai', gifts: [], penalties: [] }
  ];
  for (const player of players) player.gifts.push(deck.pop());
  const card = deck.pop();
  const game = {
    phase: 'awaitResponse',
    difficulty,
    players,
    shop: deck,
    pendingPass: null,
    pendingOffer: {
      giver: 0,
      receiver: neighbor(0, card.direction, players.length),
      card: { ...card, faceUp: false },
      claim: card.label
    },
    memories: players.map(() => ({})),
    turn: 1,
    winnerIndexes: [],
    log: [`${players[0].name}이(가) 새 선물을 공개하고 건넸습니다.`]
  };
  rememberCards(game, [...players.flatMap(player => player.gifts), card]);
  return game;
}
