// Shared local resolver. Overrides are selected at build time, never silently downgraded.
(function(global){
 'use strict';
 const cache=new Map();
 let manifestPromise;
 async function getJSON(path){
  const response=await fetch(path);
  if(!response.ok)throw new Error(`획 데이터 로딩 실패 (${response.status})`);
  return response.json();
 }
 function manifest(){
  if(!manifestPromise)manifestPromise=getJSON('assets/strokes/manifest.json').catch(error=>{manifestPromise=null;throw error;});
  return manifestPromise;
 }
 function load(character){
  if(cache.has(character))return cache.get(character);
  const promise=manifest().then(async info=>{
   const entry=info.characters[character];
   if(!entry)throw new Error('지원하지 않는 한자입니다.');
   const data=await getJSON('assets/strokes/'+entry.file);
   if(!Array.isArray(data.strokes)||data.strokes.length!==entry.strokes||data.medians?.length!==entry.strokes)throw new Error('획 데이터 검증에 실패했습니다.');
   return data;
  }).catch(error=>{cache.delete(character);throw error;});
  cache.set(character,promise);
  if(cache.size>64)cache.delete(cache.keys().next().value);
  return promise;
 }
 global.StrokeData={load};
})(window);
