import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createGame, observe, legalMoves, applyMove } from '../games/coup/play/engine.js';
const aiUrl=new URL('../games/coup/play/ai.js',import.meta.url);
function seeded(seed=1){return ()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);}
test('난이도 보정: 같은 쉬움 상대와 400판씩 대전하면 보통·어려움의 성과가 순서대로 높다',async t=>{
  const {chooseAiMove}=await import(aiUrl);const report=[];
  for(const level of ['easy','normal','hard']){
    let wins=0,maxSteps=0;
    for(let n=0;n<400;n++){
      const rng=seeded(n+10000);let s=createGame({playerCount:2,first:n%2},rng),steps=0;
      while(s.phase!=='over'&&steps++<1600)s=applyMove(s,s.decision,chooseAiMove(observe(s,s.decision),s.decision===0?level:'easy',rng),rng);
      assert.equal(s.phase,'over',`${level} calibration timeout ${n}`);wins+=s.winner===0;maxSteps=Math.max(maxSteps,steps);
    }
    report.push({level,wins,losses:400-wins,maxSteps});
  }
  t.diagnostic(JSON.stringify(report));
  assert.ok(report[1].wins>report[0].wins+40);assert.ok(report[2].wins>report[1].wins+15);
});

function invariant(s){
  const cards=[...s.deck,...s.players.flatMap(p=>p.cards),...(s.pending?.exchange||[])];
  assert.equal(cards.length,15);assert.equal(new Set(cards.map(c=>c.id)).size,15);
  for(const role of ['duke','assassin','captain','ambassador','contessa'])assert.equal(cards.filter(c=>c.role===role).length,3);
  assert.equal(s.treasury+s.players.reduce((n,p)=>n+p.coins,0),50);
  assert.ok(s.treasury>=0);
  for(const p of s.players){assert.ok(p.coins>=0);if(!p.cards.some(c=>!c.revealed)&&!(s.phase==='exchange'&&s.decision===p.id))assert.equal(p.coins,0);}
}

test('AI는 같은 관찰·난수에서 같은 합법 수를 고르며 숨은 카드 교체에 영향받지 않는다',async()=>{
  assert.ok(existsSync(aiUrl),'Coup AI module must exist');const {chooseAiMove}=await import(aiUrl);
  const s=createGame({},seeded(6));const t=structuredClone(s);
  [t.players[1].cards[0],t.deck[0]]=[t.deck[0],t.players[1].cards[0]];
  for(const level of ['easy','normal','hard']){
    assert.deepEqual(observe(s,0),observe(t,0));
    const a=chooseAiMove(observe(s,0),level,seeded(30));
    assert.ok(legalMoves(s,0).some(m=>JSON.stringify(m)===JSON.stringify(a)));
    assert.deepEqual(a,chooseAiMove(observe(t,0),level,seeded(30)));
  }
});

test('모든 난이도·2–6인 완주 중 모든 단계에서 카드와 동전을 보존한다',async()=>{
  const {chooseAiMove}=await import(aiUrl);
  for(const level of ['easy','normal','hard'])for(let n=0;n<60;n++){
    const rng=seeded(n+1000);const count=2+n%5;let s=createGame({playerCount:count,first:n%count},rng);let steps=0;
    while(s.phase!=='over'&&steps++<1600){
      invariant(s);const view=observe(s,s.decision);const m=chooseAiMove(view,level,rng);
      assert.ok(legalMoves(s).some(x=>JSON.stringify(x)===JSON.stringify(m)),`${level} ${s.phase}`);
      s=applyMove(s,s.decision,m,rng);
    }
    invariant(s);assert.equal(s.phase,'over',`simulation timeout ${level} seed ${n}`);
    assert.equal(s.players.filter(p=>p.cards.some(c=>!c.revealed)).length,1);
    assert.deepEqual(legalMoves(s),[]);
  }
});
