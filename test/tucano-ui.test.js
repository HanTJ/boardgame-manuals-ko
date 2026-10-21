import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/tucano/play/', import.meta.url);
const read = name => readFile(new URL(name, root), 'utf8');

test('Korean game shell exposes difficulty, zones, columns, actions, log, and result', async () => {
  const html = await read('index.html');
  for (const marker of [
    'lang="ko"', 'name="difficulty"', 'value="easy"', 'value="normal"', 'value="hard"',
    'id="start-game"', 'id="restart-button"', 'id="player-0"', 'id="player-1"',
    'id="column-0"', 'id="column-1"', 'id="column-2"', 'data-column-index="0"',
    'id="action-controls"', 'id="game-log"', 'id="result-dialog"', 'id="score-breakdown"',
    'href="../"', 'href="../../../"'
  ]) assert.ok(html.includes(marker), marker);
});

test('controller renders safely from human observation and validates every human and AI action', async () => {
  const script = await read('game.js');
  assert.match(script, /FRUIT_RULES/);
  assert.match(script, /scoreLabel/);
  assert.match(script, /projectObservation\(game, 0\)/);
  assert.match(script, /chooseAiMove\(projectObservation\(game, actor\)/);
  assert.match(script, /legalMoves\(game, actor\)/);
  assert.match(script, /legalMoves\(game, 0\)/);
  assert.match(script, /document\.createElement/);
  assert.match(script, /textContent/);
  assert.match(script, /replaceChildren/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /dataset\.cardId/);
  assert.match(script, /dataset\.fruit/);
});

test('restart invalidates timers and result dialog cannot be canceled', async () => {
  const script = await read('game.js');
  assert.match(script, /runToken \+= 1/);
  assert.match(script, /window\.clearTimeout/);
  assert.match(script, /token !== runToken/);
  assert.match(script, /resultDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/);
  assert.match(script, /resultShown/);
});

test('mobile CSS prevents page overflow and keeps controls accessible', async () => {
  const css = await read('game.css');
  assert.match(css, /--accent:\s*#a33f00/);
  assert.match(css, /--muted:\s*#5f6f69/);
  assert.match(css, /\.kicker\{[^}]*color:var\(--accent\)/);
  assert.match(css, /\.status button:focus-visible\{outline-color:var\(--lime\)\}/);
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /min-width:\s*0/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /overflow-x:\s*auto/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /input:focus-visible\+span/);
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
});

test('manual, README, and package check integrate the solo game', async () => {
  const [manual, game, readme, packageJson] = await Promise.all([
    readFile(new URL('../games/tucano/index.html', import.meta.url), 'utf8'), read('index.html'),
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../package.json', import.meta.url), 'utf8')
  ]);
  assert.match(manual, /href="\.\/play\/"/);
  assert.match(manual, /혼자 플레이/);
  assert.match(manual, /컴퓨터/);
  assert.match(game, /href="\.\.\/"/);
  assert.match(readme, /Tucano.*1인용 웹 게임.*games\/tucano\/play/s);
  assert.match(readme, /tucano\/[\s\S]*play\//);
  assert.match(packageJson, /tucano\/play\/engine\.js/);
  assert.match(packageJson, /tucano\/play\/game\.js/);
});
