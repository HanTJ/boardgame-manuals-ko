import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('CLUE Suspect 매뉴얼은 카드 구성과 기본 준비를 공식 규칙대로 기록한다', async () => {
  const manual = await read('games/clue-suspect/index.html');
  for (const marker of [
    '<strong>15장</strong><span>주황색 증거 카드</span>',
    '<strong>60장</strong><span>흰색 사건 파일 카드</span>',
    '용의자 6 · 장소 3 · 흉기 3',
    '비밀 봉투에 뒷면으로 넣습니다',
    '같은 기호로 된 흰색 사건 파일 카드 12장',
    '가장 나이가 많은 플레이어부터 시작합니다'
  ]) assert.ok(manual.includes(marker), marker);
});

test('질문·응답·소거 흐름과 비공개 정보 처리를 빠짐없이 설명한다', async () => {
  const manual = await read('games/clue-suspect/index.html');
  for (const marker of [
    '항목 2개', '같은 종류의 항목 둘을 물어도 됩니다',
    '원하는 카드 1장만 골라 질문자에게 보여 줍니다',
    '누군가 카드 1장을 보여 주면 질문은 즉시 끝납니다',
    '하나 또는 둘 모두', '뒷면으로 자기 무죄 더미에 놓습니다'
  ]) assert.ok(manual.includes(marker), marker);
});

test('고발 순서·탈락 후 응답·고급 게임과 2인 특별 규칙을 명시한다', async () => {
  const manual = await read('games/clue-suspect/index.html');
  for (const marker of [
    '용의자 1장·흉기 1장·장소 1장',
    '질문하거나 다시 고발할 수 없지만',
    '가장 먼저 고발한 플레이어',
    '고급 게임은 <strong>2–4명</strong>',
    '권총 1개, 거실·홀 2곳',
    '한 명이 고발하면 다른 플레이어도 반드시 즉시 고발합니다'
  ]) assert.ok(manual.includes(marker), marker);
});

test('CLUE Suspect는 카탈로그와 README에 12번째 매뉴얼로 등록된다', async () => {
  const [catalog, readme] = await Promise.all([read('index.html'), read('README.md')]);
  assert.match(catalog, /href="\.\/games\/clue-suspect\/"/);
  assert.match(catalog, /<div class="manual-number" aria-hidden="true">12<\/div>/);
  const rowCount = [...catalog.matchAll(/class="manual-row"/g)].length;
  assert.ok(rowCount > 0);
  assert.ok(catalog.includes(`<span class="count-badge">${rowCount}개</span>`));
  assert.match(readme, /\[CLUE Suspect Card Game\]\(\.\/games\/clue-suspect\/\)/);
});