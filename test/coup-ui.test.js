import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFile(new URL(p,root),'utf8');
test('쿠 웹 게임은 난이도·인원·응답·교환·로그·결과 화면을 제공한다',async()=>{
  assert.ok(existsSync(new URL('games/coup/play/index.html',root)),'playable game shell required');
  const html=await read('games/coup/play/index.html');
  for(const id of ['start-game','difficulty','player-count','game-screen','opponents','human-cards','action-controls','phase-title','phase-help','game-log','result-dialog','restart-dialog','speed'])assert.ok(html.includes(`id="${id}"`),id);
  assert.match(html,/href="\.\.\/"/);assert.match(html,/type="module"/);
});
test('컨트롤러는 관찰 뷰만 렌더링하고 재시작 타이머와 결과 취소를 처리한다',async()=>{
  assert.ok(existsSync(new URL('games/coup/play/game.js',root)),'browser controller required');
  const js=await read('games/coup/play/game.js');
  for(const marker of ['observe(state, 0)','chooseAiMove(observe(state, state.decision)','clearTimeout','cancel','preventDefault','generation','textContent'])assert.ok(js.includes(marker),marker);
  assert.ok(!js.includes('localStorage'));assert.ok(!js.includes('innerHTML'));
});
test('매뉴얼과 README에서 쿠 웹 게임으로 이동하며 CI가 신규 모듈을 검사한다',async()=>{
  const [manual,readme,pkg]=await Promise.all([read('games/coup/index.html'),read('README.md'),read('package.json')]);
  assert.ok(manual.includes('href="./play/"'),'manual play link');
  assert.ok(readme.includes('./games/coup/play/'));
  for(const name of ['engine','ai','game'])assert.ok(pkg.includes(`node --check games/coup/play/${name}.js`));
});
