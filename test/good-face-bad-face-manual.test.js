import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manual = await readFile(new URL('../games/good-face-bad-face/index.html', import.meta.url), 'utf8');
const catalog = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('Good Face Bad Face 매뉴얼은 실물 구성물과 인원별 공식 기본 덱 구성을 기록한다', () => {
  for (const marker of [
    '<strong>29장</strong><span>카드</span>', '<strong>1장</strong><span>규칙서</span>',
    '좋은 9 · 나쁜 5', '좋은 10 · 나쁜 5', '좋은 14 · 나쁜 6', '좋은 18 · 나쁜 7',
    '무작위 2장을 게임에서 제외', '2명 게임은 제외 작업 뒤 각 6장'
  ]) assert.ok(manual.includes(marker), marker);
});

test('좋은 얼굴·나쁜 얼굴·스택 귀환과 즉시 승리 흐름을 명시한다', () => {
  for (const marker of [
    '1장 이상', '왼쪽 플레이어', '맨 위 카드 1장을 반드시 뒤집습니다',
    '좋은 얼굴과 파티의 나쁜 얼굴 1장을 함께 자기 손으로 가져옵니다',
    '기존 좋은 얼굴만 모두 손으로 돌아가고, 방금 공개한 나쁜 얼굴은 파티에 남습니다',
    '나쁜 얼굴 3장을 모두 자기 손으로 가져옵니다', '좋은 얼굴 4장을 모으는 즉시'
  ]) assert.ok(manual.includes(marker), marker);
});

test('새 매뉴얼은 카탈로그와 README 구조에서 접근 가능하다', async () => {
  const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(catalog, /href="\.\/games\/good-face-bad-face\/"/);
  assert.match(catalog, /<span class="count-badge">10개<\/span>/);
  assert.match(readme, /games\/good-face-bad-face/);
});
