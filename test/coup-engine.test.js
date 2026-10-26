import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const engineUrl = new URL('../games/coup/play/engine.js', import.meta.url);
function give(s,id,roles) {
  roles.forEach((role,slot)=>{
    if(s.players[id].cards[slot].role===role)return;
    const piles=[s.deck,...s.players.map(p=>p.cards)];
    for(const pile of piles){
      const j=pile.findIndex((c,n)=>c.role===role && !(pile===s.players[id].cards&&n<slot));
      if(j>=0){[pile[j],s.players[id].cards[slot]]=[s.players[id].cards[slot],pile[j]];return;}
    }
    throw new Error('fixture cannot find role');
  });
}
function coins(s,id,n){s.treasury+=s.players[id].coins-n;s.players[id].coins=n;}
function step(e,s,m){return e.applyMove(s,s.decision,m,seeded(82));}
function passes(e,s){for(let i=0;i<20&&['challenge','block'].includes(s.phase);i++)s=step(e,s,{type:'pass'});return s;}

test('진짜 캐릭터 증명은 교체 후 도전자만 영향력을 잃고 행동은 계속된다', async()=>{
  const e=await import(engineUrl); let s=e.createGame({},seeded(7));give(s,0,['duke','captain']);
  s=step(e,s,{type:'act',action:'tax'});s=step(e,s,{type:'challenge'});
  assert.equal(s.phase,'proof');assert.equal(s.decision,0);
  assert.ok(e.legalMoves(s).some(m=>m.type==='prove'&&m.slot===0));
  s=step(e,s,{type:'prove',slot:0});assert.equal(s.phase,'loss');assert.equal(s.decision,1);
  assert.equal(s.players[0].cards.filter(c=>c.revealed).length,0);
  s=step(e,s,{type:'lose',slot:1});assert.equal(s.players[0].coins,5);assert.equal(s.turn,1);
  assert.equal(s.deck.length,9);
});

test('거짓 암살자 주장이 도전에 패하면 3개를 환불하고 피해는 없다', async()=>{
  const e=await import(engineUrl);let s=e.createGame({},seeded(8));give(s,0,['duke','captain']);coins(s,0,3);
  s=step(e,s,{type:'act',action:'assassinate',target:1});s=step(e,s,{type:'challenge'});
  assert.equal(s.phase,'proof');assert.deepEqual(e.legalMoves(s),[{type:'concede'}]);
  s=step(e,s,{type:'concede'});s=step(e,s,{type:'lose',slot:0});
  assert.equal(s.players[0].coins,3);assert.ok(s.players[1].cards.every(c=>!c.revealed));assert.equal(s.turn,1);
});

test('진짜 캐릭터도 증명을 포기할 수 있고 마지막 영향력을 잃으면 동전을 반환한다', async()=>{
  const e=await import(engineUrl);let s=e.createGame({playerCount:2},seeded(8));give(s,0,['assassin','duke']);coins(s,0,3);s.players[0].cards[1].revealed=true;
  s=step(e,s,{type:'act',action:'assassinate',target:1});s=step(e,s,{type:'challenge'});s=step(e,s,{type:'concede'});s=step(e,s,{type:'lose',slot:0});
  assert.equal(s.phase,'over');assert.equal(s.winner,1);assert.equal(s.players[0].coins,0);assert.equal(s.treasury+s.players[1].coins,50);
});

test('암살 차단 성공은 비용을 유지하고 거짓 백작부인은 이중 손실로 탈락한다', async()=>{
  const e=await import(engineUrl);
  for(const truthful of [true,false]){
    let s=e.createGame({},seeded(2));coins(s,0,3);give(s,1,truthful?['contessa','duke']:['captain','duke']);
    s=step(e,s,{type:'act',action:'assassinate',target:1});
    while(s.phase==='challenge')s=step(e,s,{type:'pass'});
    assert.equal(s.phase,'block');assert.equal(s.decision,1);
    s=step(e,s,{type:'block',role:'contessa'});
    while(s.phase==='challenge'&&s.decision!==0)s=step(e,s,{type:'pass'});
    s=step(e,s,{type:'challenge'});
    if(truthful){
      s=step(e,s,{type:'prove',slot:0});s=step(e,s,{type:'lose',slot:0});
      assert.equal(s.players[1].cards.filter(c=>!c.revealed).length,2);
    }else{
      s=step(e,s,{type:'concede'});s=step(e,s,{type:'lose',slot:0});
      assert.equal(s.phase,'loss');assert.equal(s.decision,1);
      s=step(e,s,{type:'lose',slot:1});assert.equal(s.players[1].coins,0);
    }
    assert.equal(s.players[0].coins,0);
    assert.equal(s.turn,truthful?1:2);
  }
});

test('미도전 대응은 성공, 원조는 누구나 차단하며 갈취는 대상만 차단한다', async()=>{
  const e=await import(engineUrl); let s=e.createGame({},seeded(4));
  s=step(e,s,{type:'act',action:'aid'});assert.equal(s.decision,1);s=step(e,s,{type:'pass'});assert.equal(s.decision,2);
  s=step(e,s,{type:'block',role:'duke'});s=passes(e,s);assert.equal(s.players[0].coins,2);assert.equal(s.turn,1);
  s=step(e,s,{type:'act',action:'steal',target:0});
  while(s.phase==='challenge')s=step(e,s,{type:'pass'});
  assert.equal(s.decision,0);assert.deepEqual(e.legalMoves(s).filter(m=>m.type==='block').map(m=>m.role),['captain','ambassador']);
  assert.deepEqual(e.legalMoves(s,2),[]);
  s=step(e,s,{type:'pass'});assert.equal(s.players[1].coins,4);assert.equal(s.players[0].coins,0);
});

test('갈취 잔액 1개·암살 대상 도전 패배 후 차단 기회·이미 탈락한 대상은 추가 손실 없음',async()=>{
  const e=await import(engineUrl);let s=e.createGame({},seeded(3));coins(s,1,1);
  s=passes(e,step(e,s,{type:'act',action:'steal',target:1}));assert.equal(s.players[0].coins,3);assert.equal(s.players[1].coins,0);
  s.turn=0;s.decision=0;give(s,0,['assassin','captain']);coins(s,0,3);
  s=step(e,s,{type:'act',action:'assassinate',target:1});s=step(e,s,{type:'challenge'});s=step(e,s,{type:'prove',slot:0});s=step(e,s,{type:'lose',slot:0});
  assert.equal(s.phase,'block');assert.equal(s.decision,1);
  s=step(e,s,{type:'pass'});s=step(e,s,{type:'lose',slot:1});assert.equal(s.turn,2);
  s.turn=0;s.decision=0;give(s,0,['assassin','captain']);coins(s,0,3);
  s.players[2].cards[0].revealed=true;
  s=step(e,s,{type:'act',action:'assassinate',target:2});s=step(e,s,{type:'challenge'});s=step(e,s,{type:'prove',slot:0});s=step(e,s,{type:'lose',slot:1});
  assert.equal(s.phase,'over');assert.equal(s.winner,0);
});

test('대사는 잃은 영향력을 회복하지 않고 비공개 2장을 뽑아 같은 수만 남긴다', async()=>{
  const e=await import(engineUrl);let s=e.createGame({},seeded(1));s.players[0].cards[1].revealed=true;
  s=passes(e,step(e,s,{type:'act',action:'exchange'}));assert.equal(s.phase,'exchange');
  assert.equal(s.deck.length,7);assert.equal(s.pending.exchange.length,3);
  assert.equal(e.legalMoves(s).length,3);
  const before=structuredClone(s);assert.throws(()=>step(e,s,{type:'keep',slots:[0,1]}));assert.deepEqual(s,before);
  s=step(e,s,{type:'keep',slots:[2]});assert.equal(s.phase,'turn');assert.equal(s.deck.length,9);
  assert.equal(s.players[0].cards.filter(c=>c.revealed).length,1);
  assert.equal(new Set([...s.deck,...s.players.flatMap(p=>p.cards)].map(c=>c.id)).size,15);
});

test('관찰에는 상대 숨은 카드·덱 순서·식별자가 없고 교환 선택지는 소유자만 본다',async()=>{
  const e=await import(engineUrl);assert.equal(typeof e.observe,'function');
  let s=e.createGame({},seeded(1));s=passes(e,step(e,s,{type:'act',action:'exchange'}));
  const mine=e.observe(s,0), other=e.observe(s,1);
  assert.equal(mine.privateCards.length,4);assert.equal(other.privateCards.length,0);
  assert.equal(other.players[0].cards.filter(c=>c.role!==null).length,0);
  assert.ok(!JSON.stringify(mine).includes('duke-'));assert.ok(!('deck' in other));
  const t=structuredClone(s);const a=t.players[2].cards[0];t.players[2].cards[0]=t.deck[0];t.deck[0]=a;
  assert.deepEqual(e.observe(s,0),e.observe(t,0));
});

export function seeded(seed=1) { return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0) / 4294967296); }

test('2–6인 기본 준비는 15장·50동전을 보존하며 2인은 선 플레이어만 1개다', async () => {
  assert.ok(existsSync(engineUrl), 'Coup rules engine must exist');
  const { createGame } = await import(engineUrl);
  for (const playerCount of [2,3,4,5,6]) {
    const s = createGame({playerCount, first:1}, seeded(23));
    assert.equal(s.players.length,playerCount);
    assert.equal(s.turn,1);
    assert.equal(s.phase,'turn');
    const cards = [...s.deck, ...s.players.flatMap(p=>p.cards)];
    assert.equal(cards.length,15);
    assert.equal(new Set(cards.map(c=>c.id)).size,15);
    assert.equal(s.treasury+s.players.reduce((n,p)=>n+p.coins,0),50);
    assert.equal(s.players[1].coins,playerCount===2 ? 1 : 2);
    assert.ok(s.players.every(p=>p.cards.length===2));
  }
});

test('일반 행동과 미도전 캐릭터 행동은 비용·대상·강제 쿠를 지킨다', async () => {
  const e=await import(engineUrl);
  assert.equal(typeof e.legalMoves,'function');
  assert.equal(typeof e.applyMove,'function');
  let s=e.createGame({playerCount:3},seeded(5));
  s=e.applyMove(s,0,{type:'act',action:'income'},seeded(6));
  assert.equal(s.players[0].coins,3); assert.equal(s.turn,1);
  s.players[1].coins=10; s.treasury-=8;
  assert.ok(e.legalMoves(s,1).every(m=>m.action==='coup'));
  const before=structuredClone(s);
  assert.throws(()=>e.applyMove(s,1,{type:'act',action:'income'}));
  assert.deepEqual(s,before);
  s=e.applyMove(s,1,{type:'act',action:'coup',target:0});
  assert.equal(s.phase,'loss'); assert.equal(s.decision,0);
  s=e.applyMove(s,0,{type:'lose',slot:0});
  assert.equal(s.players[0].cards.filter(c=>c.revealed).length,1);
  assert.equal(s.turn,2);
  s=e.applyMove(s,2,{type:'act',action:'tax'});
  while(s.phase!=='turn') s=e.applyMove(s,s.decision,{type:'pass'});
  assert.equal(s.players[2].coins,5);
});
