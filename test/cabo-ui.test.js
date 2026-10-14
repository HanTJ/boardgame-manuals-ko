import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../games/cabo/', import.meta.url);

async function text(path) {
  return readFile(new URL(path, root), 'utf8');
}

test('CABO 매뉴얼과 1인용 게임은 서로 연결되고 게임 화면은 필수 조작을 제공한다', async () => {
  const [manual, page, controller, styles] = await Promise.all([
    text('index.html'),
    text('play/index.html'),
    text('play/game.js'),
    text('play/game.css')
  ]);

  assert.match(manual, /href="\.\/play\/"/);
  assert.match(page, /href="\.\.\/"/);
  assert.match(page, /name="difficulty"[\s\S]*value="easy"/);
  assert.match(page, /value="normal"/);
  assert.match(page, /value="hard"/);
  assert.match(page, /id="draw-deck"/);
  assert.match(page, /id="take-discard"/);
  assert.match(page, /id="call-cabo"/);
  assert.match(page, /id="exchange-cards"/);
  assert.match(page, /id="discard-drawn"/);
  assert.match(page, /id="use-ability"/);
  assert.match(page, /id="placement-actions"/);
  assert.match(page, /id="confirm-initial"/);
  assert.match(page, /id="peek-dialog"/);
  assert.match(page, /id="finish-peek"/);
  assert.match(controller, /legalMoves\(game\)/);
  assert.match(controller, /chooseAiMove\(game/);
  assert.match(controller, /visibleCardIds/);
  assert.match(controller, /placeExchange/);
  assert.match(controller, /placeFailed/);
  assert.match(controller, /chooseInitial/);
  assert.match(controller, /move\.indices\.map\(index => index \+ 1\)/);
  assert.match(controller, /컴퓨터.*move\.placeAt \+ 1/);
  assert.match(controller, /컴퓨터.*move\.own \+ 1.*move\.other \+ 1/);
  assert.match(controller, /peekDialog\.addEventListener\('cancel'/);
  assert.match(controller, /addEventListener\('cancel'/);
  assert.match(styles, /@media \(max-width: 680px\)/);
  assert.match(styles, /min-height: 44px/);
});
