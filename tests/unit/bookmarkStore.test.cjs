const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createBookmarkStore } = require('../../bookmarkStore.js');
function storage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return { getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
}
const data = [{ h: '敬' }, { h: '學' }];
test('legacy migration is silent, deduplicated, persisted and repeatable', () => {
    const s = storage({ hanja_bookmarks: '[1,0,1,-1,99,null,"0"]' });
    const b = createBookmarkStore(s); b.migrateLegacy(data);
    assert.deepEqual(b.indices(data), [1,0]);
    assert.equal(s.getItem('hanja_bookmarks'), null);
    assert.deepEqual(createBookmarkStore(s).indices(data), [1,0]);
});
test('grade changes use character identity and retain hidden bookmarks', () => {
    const s = storage(); const b = createBookmarkStore(s); b.toggle('敬');
    assert.deepEqual(b.indices([{h:'學'}]), []);
    assert.deepEqual(b.indices([{h:'學'},{h:'敬'}]), [1]);
    b.toggle('敬'); assert.equal(createBookmarkStore(s).has('敬'), false);
});
test('current format wins over legacy values', () => {
    const s = storage({hanja_bookmarks:'[0]',hanja_bookmarks_v2:'{"schemaVersion":2,"characters":["學"]}'});
    const b = createBookmarkStore(s); b.migrateLegacy(data);
    assert.deepEqual(b.indices(data), [1]);
});
test('malformed legacy does not crash or get overwritten', () => {
    const s = storage({hanja_bookmarks:'{broken'}); const b = createBookmarkStore(s);
    b.migrateLegacy(data); assert.deepEqual(b.indices(data), []);
    assert.equal(s.getItem('hanja_bookmarks'), '{broken');
});
test('failed migration write preserves legacy and permits next-load retry', () => {
    const s = storage({hanja_bookmarks:'[0]'}); const original = s.setItem;
    s.setItem = () => {throw Error('quota');};
    const b = createBookmarkStore(s); b.migrateLegacy(data);
    assert.equal(b.has('敬'), true); assert.equal(s.getItem('hanja_bookmarks'), '[0]');
    s.setItem = original; const retry = createBookmarkStore(s); retry.migrateLegacy(data);
    assert.equal(s.getItem('hanja_bookmarks'), null); assert.equal(retry.has('敬'), true);
});
