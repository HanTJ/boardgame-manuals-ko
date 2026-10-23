import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/clue-suspect/play/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('게임 화면은 난이도·봉투·두 탐정·질문·고발·기록·결과 영역을 제공한다', async () => {
  const html = await read('index.html');
  for (const marker of [
    'lang="ko"', 'name="difficulty"', 'value="easy"', 'value="normal"', 'value="hard"',
    'id="start-game"', 'id="restart-button"', 'id="envelope"', 'id="computer-zone"',
    'id="human-evidence"', 'id="case-file"', 'id="action-controls"', 'id="accuse-button"',
    'id="game-log"', 'id="result-dialog"', 'id="result-solution"',
    '시작 탐정은 무작위', 'href="../"', 'href="../../../"'
  ]) assert.ok(html.includes(marker), marker);
});

test('모바일 CSS는 320px 재배치·자연스러운 줄바꿈·터치 목표·포커스를 보장한다', async () => {
  const css = await read('game.css');
  for (const pattern of [
    /min-width:\s*320px/,
    /min-width:\s*0/,
    /min-height:\s*44px/,
    /overflow-wrap:\s*anywhere/,
    /:focus-visible/,
    /@media\s*\(max-width:\s*720px\)/,
    /\.workspace\{[^}]*grid-template-columns/s,
    /\.case-file\{[^}]*grid-template-columns/s
  ]) assert.match(css, pattern);
});

test('컨트롤러는 관찰 뷰와 legalMoves를 사용해 안전한 DOM으로 사람·AI 행동을 처리한다', async () => {
  const script = await read('game.js');
  for (const pattern of [
    /projectObservation\(game, 0\)/,
    /projectObservation\(game, actor\)/,
    /legalMoves\(game, 0\)/,
    /chooseAiMove/,
    /applyMove/,
    /document\.createElement/,
    /textContent/,
    /replaceChildren/,
    /runToken \+= 1/,
    /window\.clearTimeout/,
    /token !== runToken/,
    /resultDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/
  ]) assert.match(script, pattern);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
});

test('매뉴얼·README·검사 스크립트가 1인용 게임을 연결한다', async () => {
  const [manual, readme, packageJson] = await Promise.all([
    readFile(new URL('../games/clue-suspect/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8')
  ]);
  assert.match(manual, /<header class="manual-hero">[\s\S]*?<a class="play-game-link" href="\.\/play\/">[\s\S]*?혼자 플레이[\s\S]*?<\/header>/);
  assert.match(readme, /CLUE Suspect Card Game.*1인용 웹 게임.*games\/clue-suspect\/play/s);
  assert.match(readme, /clue-suspect\/[\s\S]*play\//);
  assert.match(packageJson, /clue-suspect\/play\/engine\.js/);
  assert.match(packageJson, /clue-suspect\/play\/game\.js/);
});
