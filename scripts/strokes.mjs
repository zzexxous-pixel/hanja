// One data selection path for static glyphs, writing and audit. No runtime SVG conversion.
import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import svgpath from 'svgpath';
import {svgPathProperties} from 'svg-path-properties';
const require=createRequire(import.meta.url);
export const codePoint=c=>c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0');
export function characters(src) {
 const ctx=vm.createContext({});
 vm.runInContext(readFileSync(join(src,'hanja_data.js'),'utf8')+';globalThis.data=hanjaNewData;globalThis.order=GRADE_ORDER;',ctx);
 const map=new Map();
 for(const grade of ctx.order) for(const item of ctx.data[grade]) if(!map.has(item.h))map.set(item.h,{...item,grade});
 return [...map.values()];
}
export function validateStrokeData(data,count) {
 assert.ok(Array.isArray(data.strokes)&&data.strokes.length>0,'No strokes');
 assert.equal(data.medians.length,data.strokes.length,'Median count mismatch');
 if(count)assert.equal(data.strokes.length,count,'Unexpected stroke count');
 data.strokes.forEach(p=>assert.ok(typeof p==='string' && !/[<>"&]/.test(p),'Unsafe SVG path'));
 data.medians.forEach(points=>{
  assert.ok(points.length>=2,'Incomplete median');
  points.forEach(p=>assert.ok(p.length===2&&p.every(Number.isFinite),'Invalid coordinate'));
 });
 for(const n of data.radStrokes||[])assert.ok(Number.isInteger(n)&&n>=0&&n<data.strokes.length,'Invalid radical index');
 return data;
}
export function convertOverride(src,entry) {
 const raw=readFileSync(join(src,'data/stroke-overrides',entry.sourceFile));
 assert.equal(createHash('sha256').update(raw).digest('hex'),entry.sourceSha256,'Source checksum changed');
 const text=raw.toString();
 const outlines=[...text.matchAll(/<path id="z\d+d(\d+)" d="([^"]+)"/g)];
 const centerlines=new Map([...text.matchAll(/clip-path="url\(#z\d+c(\d+)\)" d="([^"]+)"/g)].map(m=>[Number(m[1]),m[2]]));
 assert.equal(outlines.length,entry.expectedStrokes);assert.equal(centerlines.size,outlines.length);
 const strokes=[],medians=[];
 for(let i=0;i<outlines.length;i++) {
  assert.equal(Number(outlines[i][1]),i+1,'Nonsequential source strokes');
  strokes.push(svgpath(outlines[i][2]).matrix([1,0,0,-1,0,900]).round(2).toString());
  const curve=new svgPathProperties(centerlines.get(i+1));
  const length=curve.getTotalLength(),segments=Math.max(1,Math.ceil(length/24));
  medians.push(Array.from({length:segments+1},(_,j)=>{
   const point=curve.getPointAtLength(length*j/segments);
   return [Math.round(point.x*100)/100,Math.round((900-point.y)*100)/100];
  }));
 }
 return validateStrokeData({strokes,medians,radStrokes:entry.radStrokes,radChar:entry.radChar},entry.expectedStrokes);
}
export function selectData(src,item,manifest) {
 const entry=manifest.characters[item.h];
 let base;
 try { base=require(`hanzi-writer-data/${item.h}.json`); } catch(error) { if(error.code!=='MODULE_NOT_FOUND')throw error; if(!entry?.enabled)throw error; }
 const data=entry?.enabled?convertOverride(src,entry):validateStrokeData(base);
 return {data,base,override:entry?.enabled?entry:null};
}
export function glyphSvg(data) {
 validateStrokeData(data);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g fill="#0f172a" transform="translate(0 900) scale(1 -1)">${data.strokes.map(p=>`<path d="${p}"/>`).join('')}</g></svg>`;
}
export function packageStrokes(src,dest) {
 const manifest=JSON.parse(readFileSync(join(src,'data/stroke-overrides/manifest.json')));
 const assets=join(dest,'assets');
 for(const part of ['strokes','glyphs','vendor','licenses'])mkdirSync(join(assets,part),{recursive:true});
 const entries={}, outlines={};
 const list=characters(src);
 for(const item of list) {
  const {data,override}=selectData(src,item,manifest),code=codePoint(item.h);
  writeFileSync(join(assets,'strokes',code+'.json'),JSON.stringify(data));
  writeFileSync(join(assets,'glyphs',code+'.svg'),glyphSvg(data));
  outlines[code]=data.strokes;
  entries[item.h]={file:code+'.json',strokes:data.strokes.length,source:override?'override':'hanzi-writer-data@2.0.1',sourceUrl:override?.sourceUrl||'https://github.com/chanind/hanzi-writer-data',license:'Arphic Public License',reviewStatus:override?.reviewStatus||'unreviewed'};
 }
 const files=[],members=[],grades={},seenHashes=new Map();
 const eum=m=>m.trim().split(/\s+/).at(-1).split(',')[0];
 const order=[...new Set(list.map(item=>item.grade))];
 for(let g=0;g<order.length;g++) {
  const sorted=list.filter(item=>order.indexOf(item.grade)<=g).sort((a,b)=>eum(a.m).localeCompare(eum(b.m),'ko') || a.m.localeCompare(b.m,'ko'));
  grades[order[g]]=[];
  for(let i=0;i<sorted.length;i+=50) {
   const batch=Object.fromEntries(sorted.slice(i,i+50).map(item=>[codePoint(item.h),outlines[codePoint(item.h)]]));
   const text=JSON.stringify(batch),hash=createHash('sha256').update(text).digest('hex').slice(0,16);
   let number=seenHashes.get(hash);
   if(number===undefined) {
    number=files.length; const file=`batch-${number}-${hash}.json`;
    writeFileSync(join(assets,'glyphs',file),text);
    files.push(file); members.push(Object.keys(batch)); seenHashes.set(hash,number);
   }
   grades[order[g]].push(number);
  }
 }
 writeFileSync(join(dest,'glyph-index.js'),`window.GLYPH_INDEX=${JSON.stringify({files,members,grades})};\n`);
 writeFileSync(join(assets,'strokes/manifest.json'),JSON.stringify({schemaVersion:1,characters:entries}));
 cpSync(join(dirname(require.resolve('hanzi-writer/package.json')),'dist/hanzi-writer.min.js'),join(assets,'vendor/hanzi-writer.min.js'));
 cpSync(join(dirname(require.resolve('hanzi-writer/package.json')),'LICENSE'),join(assets,'licenses/hanzi-writer-MIT.txt'));
 cpSync(join(dirname(require.resolve('hanzi-writer-data/package.json')),'ARPHICPL.TXT'),join(assets,'licenses/Arphic-Public-License.txt'));
 cpSync(join(src,'data/stroke-overrides/manifest.json'),join(assets,'licenses/stroke-overrides.json'));
 cpSync(join(src,'data/licenses/AnimCJK-COPYING.txt'),join(assets,'licenses/AnimCJK-COPYING.txt'));
 writeFileSync(join(assets,'licenses/NOTICE.txt'),'Hanzi Writer 3.7.3: MIT, David Chanin.\nDefault strokes: hanzi-writer-data 2.0.1 / Make Me a Hanzi / Arphic fonts, Arphic Public License.\nException outlines and centerlines modified from AnimCJK, FM-SH 2016–2026, Arphic Public License. Per-character sources: stroke-overrides.json.\nSource: '+manifest.characters['敬'].sourceUrl+'\nModification: transformed coordinates and sampled medians. See stroke manifest for per-character source/review status.\n');
 console.log(`Packaged ${Object.keys(entries).length} static glyphs and writing data (${Object.keys(manifest.characters).length} overrides).`);
}
