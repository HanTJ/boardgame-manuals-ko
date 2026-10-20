import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/good-face-bad-face/play/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('게임 화면은 난이도·세 플레이어·스택 만들기·뒤집기·넘기기·회수 종료를 제공한다', async () => {
  const html = await read('index.html');
  for (const marker of [
    'name="difficulty"', 'value="easy"', 'value="normal"', 'value="hard"',
    'id="start-game"', 'id="player-0"', 'id="player-1"', 'id="player-2"',
    'id="hand-cards"', 'id="stack-order"', 'id="build-stack"',
    'id="flip-card"', 'id="pass-stack"', 'id="take-back"',
    'id="result-dialog"', 'href="../"'
  ]) assert.ok(html.includes(marker), marker);
});

test('브라우저 컨트롤러는 관찰 뷰와 legalMoves를 사용하고 새 게임 때 예약 작업을 무효화한다', async () => {
  const script = await read('game.js');
  assert.match(script, /projectObservation\(game, actor\)/);
  assert.match(script, /chooseAiMove\(/);
  assert.match(script, /legalMoves\(game, 0\)/);
  assert.match(script, /runToken \+= 1/);
  assert.match(script, /window\.clearTimeout/);
  assert.match(script, /resultDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('게임 CSS는 모바일 재배치·자연스러운 줄바꿈·44px 터치 목표·스택 내부 스크롤을 제공한다', async () => {
  const css = await read('game.css');
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /overflow-x:\s*auto/);
});

test('매뉴얼과 게임은 서로 연결되고 게임 자산은 검사 대상이다', async () => {
  const [manual, game, packageJson, readme] = await Promise.all([
    readFile(new URL('../games/good-face-bad-face/index.html', import.meta.url), 'utf8'),
    read('index.html'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8')
  ]);
  assert.match(manual, /href="\.\/play\/"/);
  assert.match(game, /href="\.\.\/"/);
  assert.match(packageJson, /good-face-bad-face\/play\/engine\.js/);
  assert.match(packageJson, /good-face-bad-face\/play\/game\.js/);
  assert.match(readme, /good-face-bad-face\/play/);
});
