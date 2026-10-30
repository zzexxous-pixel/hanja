const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync('speechEngine.js','utf8')+';globalThis.engine=speechEngine;',ctx);
test('Korean decomposition and edit-distance boundaries',()=>{
 const e=ctx.engine;
 assert.equal(e.disassembleKorean('값 가'),'ㄱㅏㅄㄱㅏ');
 assert.equal(e.getLevenshteinDistance('','abc'),3);
 assert.equal(e.getLevenshteinDistance('abc','abc'),0);
 assert.equal(e.getLevenshteinDistance('abc','axc'),1);
 assert.equal(e.calculatePhoneticSimilarity('값 가','값가'),1);
 assert.equal(e.calculatePhoneticSimilarity('',''),1);
 assert.ok(e.calculatePhoneticSimilarity('값가','엉뚱한발음')<0.6);
});
