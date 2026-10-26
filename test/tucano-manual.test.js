import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('Tucano 매뉴얼은 공식 구성물과 기본 진행을 기록한다', async () => {
  const manual = await read('games/tucano/index.html');
  for (const marker of [
    '70장', '투칸 카드 12장', '과일 카드 58장',
    '첫 번째 열 1장', '가운데 열 2장', '마지막 열 1장',
    'class="turn-flow"', '세 열 각각에 카드 1장씩',
    '열 하나를 골라 그 열의 카드를 모두', '뽑기 더미에 가까운 열부터'
  ]) assert.ok(manual.includes(marker), marker);
});

test('Tucano 매뉴얼은 세 투칸 능력과 보호 규칙을 빠짐없이 설명한다', async () => {
  const manual = await read('games/tucano/index.html');
  for (const marker of [
    '내 앞의 앞면 과일 카드 1장을 다른 플레이어에게 줍니다',
    '다른 플레이어의 앞면 과일 카드 1장을 가져옵니다',
    '내 앞의 과일 카드를 모두 뒤집어',
    '다시 확인할 수 없고', '주거나 빼앗을 수 없습니다',
    '효과를 사용할 수 없다면 능력을 쓰지 않고 버립니다',
    '원하는 순서로 해결'
  ]) assert.ok(manual.includes(marker), marker);
});

test('Tucano 매뉴얼은 점수 유형·조커·종료 처리를 명시한다', async () => {
  const manual = await read('games/tucano/index.html');
  for (const marker of [
    '1장 = -2점', '2장 = 0점', '3장 = 9점', '4장 = 16점',
    '혼자 가장 많이 모은 플레이어', '오른쪽 점수', '왼쪽 점수',
    '바나나는 단독 최다일 때 장당 2점', '석류는 단독 최다일 때 장당 +1점',
    '완성된 세트에는 추가할 수 없습니다',
    '테이블에 열이 1개만 남을 때', '남은 열은 버립니다',
    '남은 두 열 중 한 열을 가져가며'
  ]) assert.ok(manual.includes(marker), marker);
});

test('Tucano는 카탈로그와 README에 11번째 매뉴얼로 등록된다', async () => {
  const [catalog, readme] = await Promise.all([read('index.html'), read('README.md')]);
  assert.match(catalog, /href="\.\/games\/tucano\/"/);
  const rowCount = [...catalog.matchAll(/class="manual-row"/g)].length;
  assert.ok(rowCount > 0);
  assert.ok(catalog.includes(`<span class="count-badge">${rowCount}개</span>`));
  assert.match(readme, /\[Tucano\]\(\.\/games\/tucano\/\)/);
});
