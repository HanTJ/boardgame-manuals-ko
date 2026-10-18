import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/dnup/play/', import.meta.url);

async function source(name) {
  return readFile(new URL(name, root), 'utf8');
}

async function manualSource() {
  return readFile(new URL('../index.html', root), 'utf8');
}

test('manual links the solo game and lists official setup counts', async () => {
  const html = await manualSource();
  assert.match(html, /class="play-game-link" href="\.\/play\/"/);
  assert.match(html, /<h3>숫자 카드 40장<\/h3>/);
  assert.match(html, /<h3>숫자 카드 36장<\/h3>/);
  assert.match(html, /<h3>숫자 카드 30장<\/h3>/);
  assert.match(html, /<h3>숫자 카드 26장<\/h3>/);
  assert.match(html, /1명당 13장/);
});

test('dnup solo page exposes difficulty, four areas, actions, and result controls', async () => {
  const html = await source('index.html');
  for (const value of ['easy', 'normal', 'hard']) assert.match(html, new RegExp(`value="${value}"`));
  for (const id of ['human-area-1', 'human-area-2', 'computer-area-1', 'computer-area-2']) assert.match(html, new RegExp(`id="${id}"`));
  for (const id of ['play-set', 'add-actions', 'rotate-hand', 'next-round', 'result-restart']) assert.match(html, new RegExp(`id="${id}"`));
  assert.match(html, /컴퓨터는 자기 손과 공개된 네 구역만 봅니다/);
  assert.match(html, /href="\.\.\/"/);
});

test('UI imports the pure engine and invalidates stale computer timers', async () => {
  const js = await source('game.js');
  assert.match(js, /from '\.\/engine\.js'/);
  assert.match(js, /projectObservation\(game, 1\)/);
  assert.match(js, /chooseAiMove\(observation/);
  assert.match(js, /timerGeneration/);
  assert.match(js, /generation !== timerGeneration/);
  assert.match(js, /resultDialog\.addEventListener\('cancel', event => event\.preventDefault\(\)\)/);
  assert.match(js, /컴퓨터 구역 \$\{area \+ 1\} 세트 가져오기/);
});

test('UI builds card and log content through textContent, not untrusted markup', async () => {
  const js = await source('game.js');
  assert.match(js, /active\.textContent/);
  assert.match(js, /item\.textContent = entry/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
});

test('mobile stylesheet keeps board columns flexible and provides 320px rules', async () => {
  const css = await source('game.css');
  assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /min-width:\s*320px/);
  assert.match(css, /@media \(max-width:\s*420px\)/);
  assert.match(css, /overflow-x:\s*hidden/);
  assert.match(css, /\.choice:focus-within span/);
});
