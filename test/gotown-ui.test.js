import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/gotown/play/', import.meta.url);

test('GoTown 게임 셸은 난이도·단축 게임·게임판·결과 대화상자와 매뉴얼 링크를 제공한다', async () => {
  const html = await readFile(new URL('index.html', root), 'utf8');
  for (const marker of [
    'name="difficulty"', 'value="easy"', 'value="normal"', 'value="hard"',
    'name="target"', 'value="4"', 'value="5"',
    'id="start-game"', 'id="human-hand"', 'id="computer-hand"',
    'id="human-tower"', 'id="computer-tower"', 'id="legal-actions"',
    'id="result-dialog"', 'href="../"'
  ]) assert.ok(html.includes(marker), marker);
});

test('브라우저 컨트롤러는 엔진의 legalMoves를 사용하고 AI 타이머를 새 게임 때 무효화한다', async () => {
  const script = await readFile(new URL('game.js', root), 'utf8');
  assert.match(script, /legalMoves\(game\)/);
  assert.match(script, /chooseAiMove\(/);
  assert.match(script, /runToken \+= 1/);
  assert.match(script, /resultDialog\.addEventListener\('cancel'/);
  assert.match(script, /view\.winner === 0 \? '당신이' : '컴퓨터가'/);
  assert.doesNotMatch(script, /이\(가\)/);
  assert.doesNotMatch(script, /\.innerHTML\s*=\s*user/i);
});

test('게임 CSS는 모바일에서 폭을 줄일 수 있고 터치 목표와 줄바꿈을 보장한다', async () => {
  const css = await readFile(new URL('game.css', root), 'utf8');
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});
