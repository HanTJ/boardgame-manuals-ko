import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/the-mind/play/', import.meta.url);

const read = name => readFile(new URL(name, root), 'utf8');

test('The Mind 게임 셸은 세 난이도·자원·두 비공개 손·수리검·결과 대화상자를 제공한다', async () => {
  const html = await read('index.html');
  for (const marker of [
    'name="difficulty"', 'value="easy"', 'value="normal"', 'value="hard"',
    'id="start-game"', 'id="focus-button"', 'id="throwing-star"',
    'id="human-hand"', 'id="computer-hand"', 'id="play-pile"',
    'id="life-count"', 'id="star-count"', 'id="result-dialog"', 'href="../"'
  ]) assert.ok(html.includes(marker), marker);
});

test('브라우저 컨트롤러는 숨김 뷰로 AI를 호출하고 새 게임에서 예약 작업을 무효화하며, 손에서 내기에 승인된 카드만 활성화한다', async () => {
  const script = await read('game.js');
  assert.match(script, /viewForPlayer\(game, 1\)/);
  assert.match(script, /chooseAiMove\(/);
  assert.match(script, /legalMoves\(game, 0\)/);
  assert.match(script, /playableCardId/);
  assert.match(script, /type: 'pause'/);
  assert.match(script, /type: 'resume'/);
  assert.match(script, /runToken \+= 1/);
  assert.match(script, /resultDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/);
  assert.doesNotMatch(script, /innerHTML\s*=\s*user/i);
  assert.match(script, /card\.id !== playableCardId/);
});

test('게임 CSS는 모바일 재배치·줄바꿈·44px 터치 목표를 보장한다', async () => {
  const css = await read('game.css');
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('매뉴얼과 게임은 서로 연결된다', async () => {
  const [manual, game] = await Promise.all([
    readFile(new URL('../games/the-mind/index.html', import.meta.url), 'utf8'),
    read('index.html')
  ]);
  assert.match(manual, /href="\.\/play\/"/);
  assert.match(game, /href="\.\.\/"/);
});
