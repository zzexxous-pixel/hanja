import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import assert from 'node:assert/strict';
for(const file of readdirSync('.').filter(f=>f.endsWith('.js'))) execFileSync(process.execPath,['--check',file]);
const ctx=vm.createContext({});
vm.runInContext(readFileSync('hanja_data.js','utf8')+';globalThis.data=hanjaNewData;globalThis.order=GRADE_ORDER;',ctx);
const expected=[30,50,70,100,250,400,600,800,1000];
const seen=new Set();
ctx.order.forEach((grade,i)=>{
  const local=new Set();
  for(const entry of ctx.data[grade]) {
    assert.equal(Array.from(entry.h).length,1,`${grade}: invalid character`);
    assert.ok(entry.m?.trim(),`${grade}: missing reading`);
    assert.ok(!local.has(entry.h),`${grade}: duplicate ${entry.h}`);local.add(entry.h);seen.add(entry.h);
  }
  if(i<expected.length) assert.equal(seen.size,expected[i],`${grade}: unexpected cumulative count`);
});
console.log('Syntax and dataset structure/counts passed (not an official-source certification).');
