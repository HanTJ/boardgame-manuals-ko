import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/thats-not-a-hat/play/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('게임 셸은 세 난이도, 세 플레이어, 받기·거절·선물 이름 선택, 결과 대화상자를 제공한다', async () => {
  const html = await read('index.html');
  for (const marker of [
    'name="difficulty"', 'value="easy"', 'value="normal"', 'value="hard"',
    'id="start-game"', 'id="player-0"', 'id="player-1"', 'id="player-2"',
    'id="accept-button"', 'id="reject-button"', 'id="claim-select"', 'id="claim-button"',
    'id="shop-card"', 'id="offer-card"', 'id="reveal-dialog"', 'id="reveal-card"',
    'id="result-dialog"', 'href="../"'
  ]) assert.ok(html.includes(marker), marker);
});

test('컨트롤러는 AI에 관찰 뷰만 전달하고, legalMoves로 사람 행동을 검증하며, 예약 AI 작업을 재시작 때 무효화한다', async () => {
  const script = await read('game.js');
  assert.match(script, /projectObservation\(game, actor\)/);
  assert.match(script, /chooseAiMove\(/);
  assert.match(script, /legalMoves\(game, 0\)/);
  assert.match(script, /runToken \+= 1/);
  assert.match(script, /window\.clearTimeout/);
  assert.match(script, /function showReveal/);
  assert.match(script, /revealDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/);
  assert.match(script, /resultDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('게임 CSS는 모바일 재배치, 자연스러운 줄바꿈, 44px 터치 목표와 내부 스크롤을 제공한다', async () => {
  const css = await read('game.css');
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /overflow-x:\s*auto/);
});

test('매뉴얼과 게임은 서로 연결되고 게임 자산은 사이트 검사 대상이다', async () => {
  const [manual, game, packageJson, readme] = await Promise.all([
    readFile(new URL('../games/thats-not-a-hat/index.html', import.meta.url), 'utf8'),
    read('index.html'),
    readFile(new URL('../package.json', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8')
  ]);
  assert.match(manual, /href="\.\/play\/"/);
  assert.match(game, /href="\.\.\/"/);
  assert.match(packageJson, /thats-not-a-hat\/play\/engine\.js/);
  assert.match(packageJson, /thats-not-a-hat\/play\/game\.js/);
  assert.match(readme, /thats-not-a-hat\/play/);
});
