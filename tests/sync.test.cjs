const {test} = require('node:test');
const assert = require('node:assert/strict');
const M = require('../app/sync-core.js');
const make = id => M.clock(id, () => 1000);
test('two offline devices preserve answers to different questions', () => {
  const a = M.update(M.empty(), {}, {'answer:original:a': 1}, make('a'));
  const b = M.update(M.empty(), {}, {'answer:original:b': 3}, make('b'));
  assert.deepEqual(M.values(M.merge(a,b)), {'answer:original:a':1,'answer:original:b':3});
  assert.ok(M.same(M.merge(a,b), M.merge(b,a)));
});
test('reset tombstones defeat an older offline answer', () => {
  const clock = make('a');
  const initial = M.update(M.empty(), {}, {'answer:practice:a':2,'flag:a':true}, clock);
  const reset = M.update(initial, M.values(initial), {}, clock);
  assert.deepEqual(M.values(M.merge(reset,initial)), {'answer:practice:a':null,'flag:a':null});
});
test('a newer answer after reset is retained', () => {
  const clock = make('a');
  let doc = M.update(M.empty(), {}, {'answer:practice:a':2}, clock);
  doc = M.update(doc, M.values(doc), {}, clock);
  doc = M.update(doc, {}, {'answer:practice:a':1}, clock);
  assert.equal(M.values(doc)['answer:practice:a'], 1);
});
test('same question conflicts have a deterministic tie break', () => {
  const a = M.update(M.empty(), {}, {'answer:practice:a':0}, make('a'));
  const b = M.update(M.empty(), {}, {'answer:practice:a':2}, make('b'));
  assert.equal(M.values(M.merge(a,b))['answer:practice:a'],2);
  assert.ok(M.same(M.merge(a,b),M.merge(b,a)));
});
test('logical clock moves forward after receiving a future device clock', () => {
  const future = M.update(M.empty(), {}, {'flag:a':true}, M.clock('future',()=>999999999));
  const local = M.update(future, {'flag:a':true}, {'flag:a':false}, make('local'));
  assert.equal(M.values(M.merge(future,local))['flag:a'],false);
});
test('remote response cannot erase edits made while request was in flight', () => {
  const clock = make('a');
  const sent = M.update(M.empty(), {}, {'flag:a':true}, clock);
  const edited = M.update(sent, {'flag:a':true}, {'flag:a':true,'answer:practice:b':1}, clock);
  assert.equal(M.values(M.merge(edited,sent))['answer:practice:b'],1);
});
test('navigation is atomic, not an order from one device and position from another', () => {
  const a = M.update(M.empty(), {}, {session:{order:['a','b'],position:1}}, make('a'));
  const b = M.update(M.empty(), {}, {session:{order:['b','a'],position:0}}, make('b'));
  assert.deepEqual(M.values(M.merge(a,b)).session,{order:['b','a'],position:0});
});
test('merge is idempotent and rejects unsafe or malformed entries', () => {
  const doc = M.seed({'flag:a':true},'a');
  assert.deepEqual(M.merge(doc,doc),doc);
  assert.throws(()=>M.validate({schema:1,entries:{'__proto__x':{stamp:'x',value:1}}}));
  assert.throws(()=>M.validate({schema:1,entries:{'answer:a':{stamp:'000000000001000:000000:a',value:9}}}));
});
test('JSONB key ordering does not trigger perpetual upload loops', () => {
  assert.ok(M.same({entries:{a:{value:1,stamp:'a'}},schema:1},{schema:1,entries:{a:{stamp:'a',value:1}}}));
});
test('legacy records have a lower priority than actual later edits', () => {
  const seeded = M.seed({'answer:practice:a':2},'legacy');
  const fresh = M.update(M.empty(), {}, {'answer:practice:a':0}, make('new'));
  assert.equal(M.values(M.merge(seeded,fresh))['answer:practice:a'],0);
});
