const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('all supported characters resolve, and only 敬 has confirmed official count so far',async()=>{
 const {characters,selectData,validateStrokeData,glyphSvg}=await import('../../scripts/strokes.mjs');
 const manifest=JSON.parse(fs.readFileSync('data/stroke-overrides/manifest.json'));
 const list=characters('.'); assert.equal(list.length,1000);
 let missing=0;
 for(const item of list){const selected=selectData('.',item,manifest);validateStrokeData(selected.data);if(!selected.base)missing++;
  assert.equal((glyphSvg(selected.data).match(/<path /g)||[]).length,selected.data.strokes.length);
 }
 assert.equal(missing,16);
 const {data,base}=selectData('.',{h:'敬'},manifest);
 assert.equal(base.strokes.length,12);assert.equal(data.strokes.length,13);
 assert.deepEqual(data.radStrokes,[9,10,11,12]);
 assert.ok(data.medians[0][0][1]>data.medians[0].at(-1)[1],'first stroke points down in rendered coordinates');
 const bad={...manifest.characters['敬'],sourceSha256:'wrong'};
 const {convertOverride}=await import('../../scripts/strokes.mjs');assert.throws(()=>convertOverride('.',bad),/checksum/);
});
test('resolver deduplicates loads, caches successes, and retries failures without a default fallback',async()=>{
 const vm=require('node:vm');let calls=[];let fail=true;
 const entry={file:'656C.json',strokes:13};
 const ctx=vm.createContext({window:{},fetch:async path=>{
  calls.push(path);return {ok:!path.endsWith('656C.json')||!fail,status:503,json:async()=>path.endsWith('manifest.json')?{characters:{'敬':entry}}:{strokes:Array(13).fill('M0 0L1 1'),medians:Array(13).fill([[0,0],[1,1]])}};
 }});
 vm.runInContext(fs.readFileSync('strokeData.js','utf8'),ctx);
 const loader=ctx.window.StrokeData;
 const first=loader.load('敬');assert.equal(loader.load('敬'),first);await assert.rejects(first);
 assert.equal(calls.filter(p=>p.endsWith('656C.json')).length,1);
 fail=false;await loader.load('敬');await loader.load('敬');
 assert.equal(calls.filter(p=>p.endsWith('656C.json')).length,2);
 assert.ok(calls.every(p=>p.startsWith('assets/strokes/')));
});
test('産 uses a full standalone outline instead of the narrow default component',async()=>{
 const {selectData,glyphSvg}=await import('../../scripts/strokes.mjs');
 const m=JSON.parse(fs.readFileSync('data/stroke-overrides/manifest.json'));
 const {base,data,override}=selectData('.',{h:'産'},m);
 const extent=d=>{const x=d.medians.flat().map(p=>p[0]);return {min:Math.min(...x),max:Math.max(...x)};};
 assert.ok(extent(base).max<600,'regression fixture is the narrow original');
 assert.ok(extent(data).max>800,'replacement reaches the right side');
 assert.ok(extent(data).max-extent(data).min>650,'replacement spans the standalone glyph width');
 assert.equal(data.strokes.length,11);assert.equal(data.medians.length,11);
 assert.equal(override.codePoint,'7523');
 assert.deepEqual(data.radStrokes,[6,7,8,9,10]);
 for(const path of data.strokes)assert.ok(glyphSvg(data).includes(`d="${path}"`));
});
