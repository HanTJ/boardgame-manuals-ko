export const ROLES = ['duke','assassin','captain','ambassador','contessa'];
export const ROLE_NAMES = {duke:'공작',assassin:'암살자',captain:'사령관',ambassador:'대사',contessa:'백작부인'};
export const ACTIONS = {
  income:{name:'소득',cost:0}, aid:{name:'해외 원조',cost:0}, coup:{name:'쿠',cost:7,target:true},
  tax:{name:'징세',cost:0,role:'duke'}, assassinate:{name:'암살',cost:3,role:'assassin',target:true},
  steal:{name:'갈취',cost:0,role:'captain',target:true}, exchange:{name:'교환',cost:0,role:'ambassador'}
};
const live = p => p.cards.filter(c=>!c.revealed);
function shuffle(cards,rng) { for(let i=cards.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[cards[i],cards[j]]=[cards[j],cards[i]];} return cards; }
const alive = (s,id) => live(s.players[id]).length>0;
function others(s,id) { return Array.from({length:s.players.length-1},(_,n)=>(id+n+1)%s.players.length).filter(p=>alive(s,p)); }
function note(s,text) { s.log.push(text); }
function finish(s) {
  const survivors=s.players.filter(p=>live(p).length);
  if(survivors.length===1) { s.winner=survivors[0].id;s.phase='over';s.decision=null;s.pending=null;note(s,`${survivors[0].name} 승리!`);return; }
  const next=others(s,s.turn)[0]; s.turn=next;s.decision=next;s.phase='turn';s.pending=null;s.round++;
}
function take(s,id,n) { const amount=Math.min(n,s.treasury);s.treasury-=amount;s.players[id].coins+=amount; }
function pay(s,id,n) { s.players[id].coins-=n;s.treasury+=n; }
function loss(s,id,after) { if(!alive(s,id)){resume(s,after);return;}s.phase='loss';s.decision=id;s.pending.after=after; }
function resume(s,after) {
  if(after==='finish'){finish(s);return;}
  const p=s.pending;
  if(after==='actionTrue'){offerBlock(s);return;}
  if(after==='actionFalse'){
    if(alive(s,p.actor)){s.treasury-=p.cost;s.players[p.actor].coins+=p.cost;}
    note(s,'행동 취소 · 비용 환불 (탈락자는 금고 반환)');finish(s);return;
  }
  if(after==='blockTrue'){s.history.push({player:p.actor,action:'blocked',blockedAction:p.action,target:p.target});note(s,'대응 성공 · 행동 차단, 비용은 금고에 유지');finish(s);return;}
  if(after==='blockFalse')resolve(s);
}
function resolve(s) {
  const p=s.pending;
  if(p.target!==undefined&&!alive(s,p.target)){finish(s);return;}
  if(p.action==='income')take(s,p.actor,1);
  if(p.action==='aid')take(s,p.actor,2);
  if(p.action==='tax')take(s,p.actor,3);
  if(p.action==='steal'){const n=Math.min(2,s.players[p.target].coins);s.players[p.target].coins-=n;s.players[p.actor].coins+=n;}
  if(p.action==='exchange'){p.exchange=[...live(s.players[p.actor]),...s.deck.splice(0,2)];s.players[p.actor].cards=s.players[p.actor].cards.filter(c=>c.revealed);s.phase='exchange';s.decision=p.actor;return;}
  if(['coup','assassinate'].includes(p.action)){loss(s,p.target,'finish');return;}
  finish(s);
}
function offerBlock(s) {
  const p=s.pending;
  if(p.target!==undefined&&!alive(s,p.target)){finish(s);return;}
  p.blockQueue=p.action==='aid'?others(s,p.actor):['steal','assassinate'].includes(p.action)?[p.target]:[];
  nextBlock(s);
}
function nextBlock(s) {
  const p=s.pending;
  const id=p.blockQueue.shift();
  if(id===undefined){resolve(s);return;}
  s.phase='block';s.decision=id;
}
function nextChallenge(s) {
  const p=s.pending;const id=p.challengeQueue.shift();
  if(id===undefined){if(p.claim.kind==='block')resume(s,'blockTrue');else offerBlock(s);return;}
  s.phase='challenge';s.decision=id;
}
function combos(n,k,start=0,prefix=[]) { if(k===0)return [prefix];return Array.from({length:n-start},(_,j)=>start+j).flatMap(i=>combos(n,k-1,i+1,[...prefix,i])); }
export function legalMoves(s,id=s.decision) {
  if(id!==s.decision||s.phase==='over')return [];
  if(s.phase==='turn') {
    const p=s.players[id];return Object.entries(ACTIONS).flatMap(([action,a])=>{
      if(p.coins<a.cost||p.coins>=10&&action!=='coup')return [];
      return a.target?others(s,id).map(target=>({type:'act',action,target})):[{type:'act',action}];
    });
  }
  if(s.phase==='challenge')return [{type:'pass'},{type:'challenge'}];
  if(s.phase==='block')return [{type:'pass'},...((s.pending.action==='aid'?['duke']:s.pending.action==='steal'?['captain','ambassador']:['contessa']).map(role=>({type:'block',role})))];
  if(s.phase==='proof')return [...s.players[id].cards.flatMap((c,slot)=>!c.revealed&&c.role===s.pending.claim.role?[{type:'prove',slot}]:[]),{type:'concede'}];
  if(s.phase==='exchange')return combos(s.pending.exchange.length,2-s.players[id].cards.length).map(slots=>({type:'keep',slots}));
  if(s.phase==='loss')return s.players[id].cards.flatMap((c,slot)=>c.revealed?[]:[{type:'lose',slot}]);
  return [];
}
function sameMove(a,b) {return a.type===b.type&&a.action===b.action&&a.target===b.target&&a.role===b.role&&a.slot===b.slot&&JSON.stringify(a.slots)===JSON.stringify(b.slots);}
export function applyMove(state,id,move,rng=Math.random) {
  if(!legalMoves(state,id).some(m=>sameMove(m,move)))throw new Error('Illegal move');
  const s=structuredClone(state);const p=s.players[id];
  if(move.type==='act') {
    const a=ACTIONS[move.action];pay(s,id,a.cost);
    s.history.push({player:id,action:move.action});
    s.pending={actor:id,action:move.action,...(move.target===undefined?{}:{target:move.target}),cost:a.cost};
    note(s,`${p.name}: ${a.name}${move.target===undefined?'':` → ${s.players[move.target].name}`}`);
    if(a.role){s.pending.claim={owner:id,role:a.role,kind:'action'};s.pending.challengeQueue=others(s,id);nextChallenge(s);}
    else if(move.action==='aid')offerBlock(s);
    else resolve(s);
  } else if(move.type==='pass') {
    if(s.phase==='challenge')nextChallenge(s);else nextBlock(s);
  } else if(move.type==='block') {
    s.pending.claim={owner:id,role:move.role,kind:'block'};s.pending.challengeQueue=others(s,id);
    note(s,`${p.name}: ${ROLE_NAMES[move.role]} 대응 주장`);nextChallenge(s);
  } else if(move.type==='challenge') {
    s.pending.challenger=id;s.phase='proof';s.decision=s.pending.claim.owner;
    note(s,`${p.name}: ${s.players[s.decision].name}의 ${ROLE_NAMES[s.pending.claim.role]} 주장에 도전`);
  } else if(move.type==='prove') {
    const claim=s.pending.claim; const shown=p.cards[move.slot];
    s.deck.push(shown);shuffle(s.deck,rng);p.cards[move.slot]=s.deck.pop();
    note(s,`${p.name}: ${ROLE_NAMES[claim.role]} 증명 후 궁정 덱에 섞고 새 카드 획득`);
    loss(s,s.pending.challenger,claim.kind==='action'?'actionTrue':'blockTrue');
  } else if(move.type==='concede') {
    note(s,`${p.name}: 주장 증명 포기`);
    loss(s,id,s.pending.claim.kind==='action'?'actionFalse':'blockFalse');
  } else if(move.type==='keep') {
    const cards=s.pending.exchange; p.cards.push(...cards.filter((_,i)=>move.slots.includes(i)));
    s.deck.push(...cards.filter((_,i)=>!move.slots.includes(i)));shuffle(s.deck,rng);
    note(s,`${p.name}: 교환 완료 (카드 비공개)`);finish(s);
  } else if(move.type==='lose') {
    p.cards[move.slot].revealed=true;note(s,`${p.name}: ${ROLE_NAMES[p.cards[move.slot].role]} 공개, 영향력 상실`);
    if(!live(p).length){pay(s,id,p.coins);note(s,`${p.name} 탈락`);}
    const after=s.pending.after;delete s.pending.after;resume(s,after);
  }
  return s;
}

export function observe(s,id) {
  const cardView=(c,slot,own)=>({slot,role:own||c.revealed?c.role:null,revealed:c.revealed});
  const p=s.pending;
  return {viewer:id,phase:s.phase,turn:s.turn,decision:s.decision,round:s.round,winner:s.winner,treasury:s.treasury,deckCount:s.deck.length,
    players:s.players.map(player=>({id:player.id,name:player.name,coins:player.coins,cards:player.cards.map((c,i)=>cardView(c,i,player.id===id)),influence:live(player).length+(s.phase==='exchange'&&p.actor===player.id?2-player.cards.length:0)})),
    pending:p?{actor:p.actor,action:p.action,target:p.target,cost:p.cost,claim:p.claim?{...p.claim}:null,challenger:p.challenger}:null,
    privateCards:s.phase==='exchange'&&id===p.actor?p.exchange.map((c,i)=>cardView(c,i,true)):[],
    moves:legalMoves(s,id),history:structuredClone(s.history),log:[...s.log]};
}

export function createGame({playerCount=3,first=0}={},rng=Math.random) {
  if(!Number.isInteger(playerCount)||playerCount<2||playerCount>6||!Number.isInteger(first)||first<0||first>=playerCount) throw new Error('Invalid setup');
  const deck=shuffle(ROLES.flatMap(role=>Array.from({length:3},(_,n)=>({id:`${role}-${n}`,role,revealed:false}))),rng);
  const players=Array.from({length:playerCount},(_,id)=>({id,name:id===0?'나':`컴퓨터 ${id}`,coins:playerCount===2&&id===first?1:2,cards:deck.splice(0,2)}));
  return {players,deck,treasury:50-players.reduce((n,p)=>n+p.coins,0),turn:first,phase:'turn',decision:first,pending:null,log:[],history:[],round:1,winner:null};
}
