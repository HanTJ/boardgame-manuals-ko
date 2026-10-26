import { ACTIONS } from './engine.js';
const pick=(items,rng)=>items[Math.floor(rng()*items.length)];
const values={duke:5,captain:4.4,assassin:3.8,contessa:3.2,ambassador:2};
const living=p=>p.cards.filter(c=>!c.revealed);
function has(view,role){return living(view.players[view.viewer]).some(c=>c.role===role);}
function knownCount(view,role){return view.players.flatMap(p=>p.cards).filter(c=>c.role===role).length;}
// Only own cards and public revealed cards enter this estimate. Claims are not facts.
function roleChance(view,id,role){
  const known=view.players.flatMap(p=>p.cards).filter(c=>c.role!==null).length;
  const copies=3-knownCount(view,role), unknown=15-known;
  let missing=1;
  for(let i=0;i<view.players[id].influence;i++)missing*=Math.max(0,unknown-copies-i)/Math.max(1,unknown-i);
  return 1-missing;
}
function setValue(roles){return roles.reduce((n,r)=>n+values[r],0)-2*(roles.length-new Set(roles).size);}
function targetScore(view,id){const p=view.players[id];return (p.influence===1?2:0)+p.coins*.14;}
export function chooseAiMove(view,level='normal',rng=Math.random){
  const moves=view.moves;if(!moves.length)throw new Error('AI has no legal decision');
  if(!['easy','normal','hard'].includes(level))throw new Error('Unknown difficulty');
  const me=view.players[view.viewer];
  if(view.phase==='proof')return moves.find(m=>m.type==='prove')||moves[0];
  if(view.phase==='loss'){
    if(level==='easy')return pick(moves,rng);
    return moves.reduce((best,m)=>{
      const remaining=living(me).filter(c=>c.slot!==m.slot).map(c=>c.role);
      return setValue(remaining)>setValue(living(me).filter(c=>c.slot!==best.slot).map(c=>c.role))?m:best;
    });
  }
  if(view.phase==='exchange'){
    if(level==='easy')return pick(moves,rng);
    return moves.reduce((a,b)=>setValue(b.slots.map(i=>view.privateCards[i].role))>setValue(a.slots.map(i=>view.privateCards[i].role))?b:a);
  }
  if(view.phase==='challenge'){
    const claim=view.pending.claim;const pass=moves.find(m=>m.type==='pass');const challenge=moves.find(m=>m.type==='challenge');
    if(level==='easy')return rng()<.13?challenge:pass;
    if(knownCount(view,claim.role)===3)return challenge;
    if(level==='normal')return rng()<.06?challenge:pass;
    const prior=roleChance(view,claim.owner,claim.role);
    const likelyTruth=.35+.6*prior;
    const personal=view.pending.target===view.viewer||view.pending.actor===view.viewer;
    const threshold=me.influence===1?.3:personal?.49:.29;
    return likelyTruth<threshold?challenge:pass;
  }
  if(view.phase==='block'){
    const blocks=moves.filter(m=>m.type==='block');const trueBlock=blocks.find(m=>has(view,m.role));
    if(trueBlock)return trueBlock;
    if(level==='easy')return rng()<.09?pick(blocks,rng):moves[0];
    if(level==='normal')return rng()<.08?pick(blocks,rng):moves[0];
    const assassination=view.pending.action==='assassinate';
    // A doomed one-influence target can bluff without worsening the outcome.
    if(assassination&&me.influence===1)return blocks[0];
    const bluff=blocks.find(m=>knownCount(view,m.role)<3);
    return bluff&&rng()<(assassination?.30:.12)?bluff:moves[0];
  }
  if(level==='easy')return pick(moves,rng);
  const score=m=>{
    const role=ACTIONS[m.action].role;const trueClaim=!role||has(view,role);const target=m.target===undefined?null:view.players[m.target];
    let value={income:1,aid:1.6,tax:trueClaim?3.8:1.1,steal:trueClaim?3.6:.7,exchange:trueClaim?.8:.1,assassinate:trueClaim?6:.6,coup:8}[m.action];
    if(m.action==='steal'){
      value*=Math.min(2,target.coins)/2;
      if(level==='hard')value-=view.history.slice(-12).filter(h=>h.player===me.id&&h.action==='steal').length*1.6;
    }
    if(m.action==='assassinate'&&level==='hard')value-=roleChance(view,m.target,'contessa')*3;
    if(m.action==='exchange'&&trueClaim&&!has(view,'duke')&&!has(view,'captain'))value+=.6;
    if(m.action==='aid'&&level==='hard')value-=view.players.filter(p=>p.id!==view.viewer&&p.influence).reduce((n,p)=>n+roleChance(view,p.id,'duke'),0)*.8;
    if(target&&level==='hard')value+=targetScore(view,target.id);
    value-=view.history.slice(-18).filter(h=>h.player===me.id&&h.action==='blocked'&&h.blockedAction===m.action&&h.target===m.target).length*4;
    if(role&&!trueClaim&&knownCount(view,role)===3)value=-5;
    if(level==='normal')value+=(rng()-.5)*1.5;
    else value+=(rng()-.5)*.18;
    return value;
  };
  return moves.map(m=>({m,v:score(m)})).reduce((a,b)=>b.v>a.v?b:a).m;
}
