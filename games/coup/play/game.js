import { createGame, observe, applyMove, ROLE_NAMES, ACTIONS } from './engine.js';
import { chooseAiMove } from './ai.js';
const $=id=>document.getElementById(id);
const levels={easy:'쉬움',normal:'보통',hard:'어려움'};
const descriptions={income:'금고에서 동전 1개 · 차단 불가',aid:'금고에서 동전 2개 · 공작으로 차단 가능',tax:'금고에서 동전 3개',coup:'비용 7개 · 대상 영향력 1개 제거, 차단 불가',assassinate:'비용 3개 · 대상 영향력 1개 제거',steal:'대상의 동전 최대 2개 가져오기',exchange:'궁정 덱 2장을 보고 뒷면 카드 교환'};
let state=null, difficulty='normal', timer=null, generation=0, selectedTarget=null, selectedCards=[], resultShown=false;
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;}
function button(text,fn,cls=''){const b=node('button',cls,text);b.type='button';b.addEventListener('click',fn);return b;}
function clearAi(){clearTimeout(timer);timer=null;generation++;}
function reset(){clearAi();state=null;selectedCards=[];resultShown=false;for(const id of ['restart-dialog','result-dialog'])if($(id).open)$(id).close();$('game-screen').hidden=true;$('start-screen').hidden=false;$('start-game').focus();}
function move(m){
  try{state=applyMove(state,state.decision,m);selectedCards=[];$('error-message').textContent='';render();}
  catch(error){$('error-message').textContent=`입력을 처리하지 못했습니다. ${error.message}`;}
}
function start(){
  clearAi();difficulty=$('difficulty').value;const count=Number($('player-count').value);
  state=createGame({playerCount:count,first:Math.floor(Math.random()*count)});
  selectedTarget=null;selectedCards=[];resultShown=false;
  $('start-screen').hidden=true;$('game-screen').hidden=false;
  $('match-info').textContent=`${levels[difficulty]} · ${count}인 · 선 플레이어 ${state.players[state.turn].name}`;
  render();$('phase-title').focus({preventScroll:true});
}
function drawCard(c){
  const card=node('div',`role-card ${c.role===null?'back':''} ${c.revealed?'revealed':''}`);
  card.append(node('small','',c.revealed?'공개 · 영향력 없음':c.role===null?'비공개':'내 비공개 카드'));
  card.append(node('span','seal',c.role===null?'C':ROLE_NAMES[c.role].slice(0,1)));
  card.append(node('b','',c.role===null?'숨은 영향력':ROLE_NAMES[c.role]));
  if(c.role!==null)card.append(node('small','',c.role.toUpperCase()));
  return card;
}
function cardRow(cards){
  const row=node('div','card-row');const groups=new Map();
  for(const c of cards){const key=`${c.role}-${c.revealed}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
  for(const group of groups.values()){
    const stack=node('div','card-stack');stack.append(node('span','stack-count',`${group.length}장`));
    for(const c of group)stack.append(drawCard(c));row.append(stack);
  }
  return row;
}
function renderBoard(view){
  const opponents=$('opponents');opponents.replaceChildren();
  for(const p of view.players.filter(p=>p.id!==0)){
    const zone=node('section',`player-zone ${p.id===view.decision?'active':''} ${!p.influence?'eliminated':''}`);zone.dataset.player=String(p.id);
    const title=node('div','zone-title');title.append(node('h3','',p.name),node('strong','',`동전 ${p.coins}개`));
    // During a private exchange the old hand is temporarily in escrow. Still render two hidden/revealed positions.
    const cards=[...p.cards];while(cards.length<2)cards.push({role:null,revealed:false});
    zone.append(title,cardRow(cards),node('p','player-meta',p.influence?`영향력 ${p.influence} · ${p.id===view.decision?'응답 중':p.id===view.turn?'행동 중':'대기'}`:'탈락'));
    opponents.append(zone);
  }
  const me=view.players[0];$('human-coins').textContent=`동전 ${me.coins}개`;
  $('human-cards').replaceChildren(cardRow(me.cards));
  $('human-state').textContent=me.influence?`남은 영향력 ${me.influence} · 공개 전까지 내 카드만 볼 수 있습니다.`:'내 영향력이 모두 사라졌습니다. 컴퓨터들의 대전을 관전할 수 있습니다.';
  $('treasury').textContent=`금고 ${view.treasury}개`;$('deck-count').textContent=`궁정 덱 ${view.deckCount}장`;$('turn-count').textContent=`차례 ${view.round}`;
  $('turn-title').textContent=view.phase==='over'?`${view.players[view.winner].name} 승리`:`${view.players[view.turn].name}의 차례`;
  $('latest-event').textContent=view.log.at(-1)||`${view.players[view.turn].name}부터 시작합니다.`;
  const log=$('game-log');const bottom=log.scrollHeight-log.scrollTop-log.clientHeight<45;log.replaceChildren(...view.log.map(text=>node('li','',text)));if(bottom)log.scrollTop=log.scrollHeight;
}
function setPhase(title,help){$('phase-title').textContent=title;$('phase-help').textContent=help;}
function responseButton(controls,m,text,cls=''){const b=button(text,()=>move(m),cls);b.dataset.move=m.type;if(m.role)b.dataset.role=m.role;if(m.slot!==undefined)b.dataset.slot=String(m.slot);controls.append(b);}
function renderActions(view){
  const controls=$('action-controls');controls.replaceChildren();
  if(view.phase==='over'){
    setPhase('게임 종료',`${view.players[view.winner].name}만 영향력을 유지했습니다. 아래에서 궁정 기록을 확인하거나 다시 플레이할 수 있습니다.`);
    controls.append(button('다시 플레이',reset,'primary'));
    if(!resultShown){resultShown=true;$('result-title').textContent=view.winner===0?'승리했습니다!':'게임 종료';$('result-copy').textContent=`${view.players[view.winner].name} 승리 · ${view.round}번째 차례 · ${levels[difficulty]} 난이도`;$('result-dialog').showModal();}
    return;
  }
  if(view.decision!==0){setPhase(view.players[0].influence?`${view.players[view.decision].name} 판단 중…`:'관전 중', '컴퓨터는 자기 카드와 공개 정보만으로 행동합니다. 내 응답 차례가 되면 자동으로 멈춥니다.');return;}
  const me=view.players[0],p=view.pending;
  if(view.phase==='turn'){
    setPhase(me.coins>=10?'동전 10개 이상 · 쿠를 해야 합니다':'내 행동을 선택하세요','캐릭터가 없어도 능력을 주장할 수 있습니다. 단, 도전받으면 해당 카드를 증명하거나 영향력을 잃어야 합니다.');
    const targets=view.players.filter(p=>p.id!==0&&p.influence);
    if(!targets.some(p=>p.id===selectedTarget))selectedTarget=targets[0].id;
    const label=node('label','target-label','공격 대상');const select=node('select');select.id='target-player';
    for(const target of targets){const option=node('option','',`${target.name} · 동전 ${target.coins} · 영향력 ${target.influence}`);option.value=String(target.id);option.selected=target.id===selectedTarget;select.append(option);}
    select.addEventListener('change',()=>{selectedTarget=Number(select.value);});label.append(select);controls.append(label);
    const grid=node('div','action-grid');
    for(const [action,a] of Object.entries(ACTIONS)){
      const available=view.moves.some(m=>m.action===action);const own=a.role&&me.cards.some(c=>!c.revealed&&c.role===a.role);
      const b=button('',()=>{const chosen=view.moves.find(m=>m.action===action&&(!a.target||m.target===selectedTarget));if(chosen)move(chosen);},`action-button ${action==='coup'?'danger':''}`);b.dataset.action=action;b.disabled=!available;
      b.append(node('b','',a.name),node('small','',descriptions[action]));
      if(a.role)b.append(node('span','claim-note',`${ROLE_NAMES[a.role]} 주장 · ${own?'보유':'허세 가능'}`));
      if(!available)b.append(node('small','',me.coins>=10?'이번 차례는 쿠 필수':`동전 ${a.cost}개 필요`));grid.append(b);
    }
    controls.append(grid);return;
  }
  if(view.phase==='challenge'){
    const c=p.claim;setPhase(`${view.players[c.owner].name}의 ${ROLE_NAMES[c.role]} 주장을 도전할까요?`,`${c.kind==='block'?'대응':'행동'} 주장입니다. 상대가 증명하면 내가 영향력 1개를 잃습니다. 도전하지 않아도 이후 별도의 대응 주장에는 도전할 수 있습니다.`);
    const group=node('div','response-buttons');responseButton(group,{type:'pass'},'도전하지 않기');responseButton(group,{type:'challenge'},'도전하기','danger');controls.append(group);
  }else if(view.phase==='block'){
    setPhase(`${ACTIONS[p.action].name}을 막을까요?`,'해당 캐릭터가 없어도 대응을 주장할 수 있지만 도전받을 수 있습니다. 허세가 들통나면 영향력을 잃고 원래 행동도 계속됩니다.');
    responseButton(controls,{type:'pass'},'대응하지 않기');
    for(const m of view.moves.filter(m=>m.type==='block'))responseButton(controls,m,`${ROLE_NAMES[m.role]} 주장 · 차단 (${me.cards.some(c=>!c.revealed&&c.role===m.role)?'보유':'허세'})`);
  }else if(view.phase==='proof'){
    setPhase(`${ROLE_NAMES[p.claim.role]} 카드를 증명하세요`,'증명한 카드는 궁정 덱에 섞고 새 카드로 교체됩니다. 증명하지 않으면 내가 영향력 1개를 잃습니다.');
    for(const m of view.moves)responseButton(controls,m,m.type==='prove'?`${ROLE_NAMES[p.claim.role]} 증명하기`:'증명 포기 · 영향력 상실',m.type==='prove'?'primary':'danger');
  }else if(view.phase==='loss'){
    setPhase('잃을 영향력 한 장을 선택하세요','선택한 카드는 공개되며 더 이상 능력을 제공하지 않습니다. 두 장 모두 공개되면 탈락합니다.');
    for(const m of view.moves)responseButton(controls,m,`${ROLE_NAMES[me.cards[m.slot].role]} 공개하기`,'danger');
  }else if(view.phase==='exchange'){
    const needed=view.moves[0].slots.length;setPhase(`유지할 카드 ${needed}장을 선택하세요`,'새로 뽑은 카드와 기존 비공개 카드 중에서 선택하세요. 나머지 두 장은 궁정 덱에 반환합니다. 공개 카드는 바뀌지 않습니다.');
    const cards=node('div','exchange-cards');
    for(const c of view.privateCards){const b=button('',()=>{if(selectedCards.includes(c.slot))selectedCards=selectedCards.filter(i=>i!==c.slot);else if(selectedCards.length<needed)selectedCards.push(c.slot);renderActions(view);},'exchange-choice');b.dataset.exchangeSlot=String(c.slot);b.setAttribute('aria-pressed',String(selectedCards.includes(c.slot)));b.append(node('b','',ROLE_NAMES[c.role]),node('small','',selectedCards.includes(c.slot)?'선택됨':'유지할 카드 선택'));cards.append(b);}
    const confirm=button(`선택 완료 (${selectedCards.length}/${needed})`,()=>move({type:'keep',slots:[...selectedCards].sort((a,b)=>a-b)}),'primary');confirm.disabled=selectedCards.length!==needed;confirm.id='confirm-exchange';controls.append(cards,confirm);
  }
}
function scheduleAi(){
  clearAi();if(!state||state.phase==='over'||state.decision===0||$('restart-dialog').open)return;
  const token=generation;
  const eliminated=!observe(state, 0).players[0].influence;
  timer=setTimeout(()=>{if(token!==generation||!state)return;try{move(chooseAiMove(observe(state, state.decision),difficulty));}catch(error){$('error-message').textContent=`컴퓨터 판단 오류: ${error.message}`;}},eliminated?Math.min(150,Number($('speed').value)):Number($('speed').value));
}
function render(){const view=observe(state, 0);renderBoard(view);renderActions(view);scheduleAi();}
$('setup').addEventListener('submit',event=>{event.preventDefault();start();});
$('restart-button').addEventListener('click',()=>{clearAi();$('restart-dialog').showModal();});
$('keep-playing').addEventListener('click',()=>{$('restart-dialog').close();scheduleAi();});
$('restart-dialog').addEventListener('cancel',()=>{setTimeout(scheduleAi,0);});
$('confirm-restart').addEventListener('click',reset);
$('result-dialog').addEventListener('cancel',event=>event.preventDefault());
$('view-board').addEventListener('click',()=>{$('result-dialog').close();$('phase-title').focus({preventScroll:true});});
$('result-restart').addEventListener('click',reset);
$('speed').addEventListener('change',scheduleAi);
