import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {characters,selectData,codePoint,glyphSvg} from './strokes.mjs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
export function isShapeReviewed(reference,svg) {
 return reference?.shapeReviewed===true && reference.shapeSvgSha256===createHash('sha256').update(svg).digest('hex');
}
export function writeAuditReport(src,output,{glyphBase='glyphs',writeGlyphs=true}={}) {
const overrides=JSON.parse(readFileSync(join(src,'data/stroke-overrides/manifest.json')));
const references=JSON.parse(readFileSync(join(src,'data/glyph-reference.json')));
mkdirSync(output,{recursive:true});if(writeGlyphs)mkdirSync(output+'/glyphs',{recursive:true});
const rows=characters(src).map(item=>{
 const {data,base,override}=selectData(src,item,overrides),reference=references.characters[item.h];
 const svg=glyphSvg(data),hasOfficialCount=Number.isInteger(reference?.strokeCount);
 if(writeGlyphs)writeFileSync(`${output}/glyphs/${codePoint(item.h)}.svg`,svg);
 return {character:item.h,reading:item.m,grade:item.grade,codePoint:codePoint(item.h),defaultStrokes:base?.strokes.length??null,effectiveStrokes:data.strokes.length,officialStrokes:reference?.strokeCount??null,defaultCountMismatch:hasOfficialCount?base?.strokes.length!==reference.strokeCount:null,effectiveCountMismatch:hasOfficialCount?data.strokes.length!==reference.strokeCount:null,shapeStatus:isShapeReviewed(reference,svg)?'reviewed':'pending',orderStatus:reference?.orderReviewed?'reviewed':'pending',source:override?.sourceUrl||'hanzi-writer-data@2.0.1',evidence:reference?.evidence??null,shapeEvidence:reference?.shapeSourceId?references.shapeReview?.sources[reference.shapeSourceId]??null:null};
});
const summary={total:rows.length,officialCountKnown:rows.filter(r=>r.officialStrokes!==null).length,defaultMissing:rows.filter(r=>r.defaultStrokes===null).length,defaultConfirmedCountMismatches:rows.filter(r=>r.defaultCountMismatch===true&&r.defaultStrokes!==null).map(r=>r.character),effectiveConfirmedCountMismatches:rows.filter(r=>r.effectiveCountMismatch===true).map(r=>r.character),shapePending:rows.filter(r=>r.shapeStatus==='pending').length,orderPending:rows.filter(r=>r.orderStatus==='pending').length};
writeFileSync(output+'/report.json',JSON.stringify({summary,rows},null,2)+'\n');
writeFileSync(output+'/report.csv','character,grade,codePoint,defaultStrokes,effectiveStrokes,officialStrokes,shapeStatus,orderStatus\n'+rows.map(r=>[r.character,r.grade,r.codePoint,r.defaultStrokes??'',r.effectiveStrokes,r.officialStrokes??'',r.shapeStatus,r.orderStatus].join(',')).join('\n')+'\n');
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
writeFileSync(output+'/index.html',`<!doctype html><html lang="ko"><meta charset="utf-8"><title>대한검정회 자형 대조 검수 목록</title><style>body{font:16px sans-serif;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ddd;padding:8px}img{width:70px;height:70px}input{padding:10px}tr[hidden]{display:none}</style><h1>자형 대조 검수 목록</h1><p>reviewed는 사용자 제공 PDF와 완성 자형을 1차 육안 대조했다는 뜻입니다(서체 차이 허용). 기관 인증이나 획수·획순 검증 완료가 아닙니다. 글꼴 미리보기는 공식 견본이 아닙니다.</p><pre>${escape(JSON.stringify(summary,null,2))}</pre><p><input id="search" placeholder="한자·훈음·급수 검색"></p><table><thead><tr><th>한자 / 글꼴 비교용</th><th>실제 SVG</th><th>훈음 / 급수</th><th>기본 → 적용 / 공식 획수</th><th>자형 / 획순</th><th>출처</th></tr></thead><tbody>${rows.map(r=>`<tr><td style="font-size:50px">${r.character}</td><td><img src="${glyphBase}/${r.codePoint}.svg" loading="lazy" alt="${r.character} 적용 자형"></td><td>${escape(r.reading)} / ${r.grade}</td><td>${r.defaultStrokes??'없음'} → ${r.effectiveStrokes} / ${r.officialStrokes??'미확인'}</td><td>${r.shapeStatus} / ${r.orderStatus}</td><td>${r.source.startsWith('https:')?`<a href="${escape(r.source)}">원본</a>`:r.source}</td></tr>`).join('')}</tbody></table><script>document.querySelector('#search').oninput=e=>document.querySelectorAll('tbody tr').forEach(r=>r.hidden=!r.textContent.includes(e.target.value));</script></html>`);
console.log(JSON.stringify(summary,null,2));

return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)writeAuditReport('.',process.env.AUDIT_OUTPUT||'_audit');
