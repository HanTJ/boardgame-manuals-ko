import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const manual = await read('games/coup/index.html');

test('쿠 매뉴얼은 사진의 기본 구성과 공개·비공개 정보를 설명한다', () => {
  for (const marker of ['<strong>15장</strong>', '<strong>6장</strong>', '<strong>50개</strong>',
    '각 3장씩', '동전 수는 항상 다른 사람에게 보이게', '비공식 팬 번역·요약',
    '인쇄 연도는 사진에서 확인되지 않아', '원문 사진은 이 사이트에 재배포하지 않습니다']) {
    assert.ok(manual.includes(marker), marker);
  }
});

test('도전·대응·비용 환불과 암살 이중 손실을 구분한다', () => {
  for (const marker of ['차례 시작 시 동전이 10개 이상이면 반드시 쿠',
    '도전도 차단도 불가능', '행동 비용으로 낸 동전은 돌려받습니다',
    '암살자가 낸 3개는 금고에 남습니다', '무작위로 새 카드 한 장',
    '직접 대상이 아닌 플레이어도', '진행이 넘어간 뒤 소급해서 도전할 수는 없습니다',
    '두 번째 손실은 이어지는 암살까지 성공했을 때', '암살·갈취를 대신 막아줄 수는 없습니다']) {
    assert.ok(manual.includes(marker), marker);
  }
});

test('2인용 선 플레이어 동전과 선택 준비 변형을 구분한다', () => {
  for (const marker of ['선 플레이어가 동전 1개, 후 플레이어가 동전 2개',
    '5장씩 세 세트', '비밀리에 한 장을 선택', '남은 세 장',
    '제외된 카드는 궁정 덱에 섞지 않습니다', '동전을 주거나 빌려줄 수 없습니다']) {
    assert.ok(manual.includes(marker), marker);
  }
});

test('쿠는 13번째 매뉴얼로 등록되고 총수는 실제 목록과 일치한다', async () => {
  const [catalog, readme] = await Promise.all([read('index.html'), read('README.md')]);
  assert.match(catalog, /href="\.\/games\/coup\/"/);
  assert.match(catalog, /<div class="manual-number" aria-hidden="true">13<\/div>/);
  const rowCount = [...catalog.matchAll(/class="manual-row"/g)].length;
  assert.ok(rowCount >= 13);
  assert.ok(catalog.includes(`<span class="count-badge">${rowCount}개</span>`));
  assert.ok(readme.includes('[쿠 (Coup)](./games/coup/)'));
});
