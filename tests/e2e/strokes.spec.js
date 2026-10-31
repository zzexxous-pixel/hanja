const {test,expect}=require('@playwright/test');
// Fault injection must reach the page fetch, not be served by a service-worker cache.
test.use({serviceWorkers:'block'});
async function openCharacter(page,character){
 const index=await page.evaluate(c=>hanjaData.findIndex(item=>item.h===c),character);
 expect(index).toBeGreaterThanOrEqual(0);
 await page.evaluate(i=>HanjaApp.switchTab(Math.floor(i/50)+1),index);
 await page.locator(`[data-action="open-modal"][data-index="${index}"]`).click();
}
async function drawStroke(page,character,index,backwards=false){return page.evaluate(async({character,index,backwards})=>{
  const data=await StrokeData.load(character);
  const svg=document.querySelector('#writingContainer > div > svg');
  const rect=svg.getBoundingClientRect();
  const size=Number(svg.getAttribute('width'));
  const t=HanziWriter.getScalingTransform(size,size,Math.max(10,Math.round(size*0.05)));
  const points=[...data.medians[index]];if(backwards)points.reverse();
  const event=(type,point)=>svg.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:rect.left+t.x+point[0]*t.scale,clientY:rect.top+size-t.y-point[1]*t.scale}));
  event('mousedown',points[0]);for(const point of points.slice(1))event('mousemove',point);event('mouseup',points.at(-1));
 },{character,index,backwards});
}


test.beforeEach(async({page})=>{
 await page.route(/https:\/\//,route=>route.abort());
 await page.goto('./');
});
test('cards use static outlines, and 13-stroke 敬 shares data with the real local writer',async({page})=>{
 await expect(page.locator('.hanja-card-wrapper .hanja-outline')).toHaveCount(50);
 await expect(page.locator('.hanja-card-wrapper .hanja-outline[data-state="ready"]')).toHaveCount(50);
 await openCharacter(page,'敬');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 13획');
 await expect(page.locator('#chip-radical-strokes')).toHaveText('부수 4획 (잔여 9획)');
 const data=await page.evaluate(()=>StrokeData.load('敬'));
 expect(data.strokes).toHaveLength(13);
 const svg=await (await page.request.get(new URL('assets/glyphs/656C.svg',page.url()).href)).text();
 for(const path of data.strokes)expect(svg).toContain(`d="${path}"`);
 await expect(page.locator('#modal-stroke-status')).toContainText('바로 써보세요');
 await expect(page.locator('#writingContainer div svg')).toBeVisible();
});
test('override failure never downgrades to 12 strokes; reopening retries successfully',async({page})=>{
 await page.route('**/assets/strokes/656C.json',route=>route.fulfill({status:503,body:'offline'}));
 await openCharacter(page,'敬');
 await expect(page.locator('#writingContainer [role="alert"]')).toContainText('불러오지 못했습니다');
 await expect(page.locator('#chip-total-strokes')).toHaveText('획 데이터 없음');
 await page.locator('[data-action="close-modal"]').click();
 await expect(page.locator('#detail-modal')).toBeHidden();
 await page.unroute('**/assets/strokes/656C.json');
 await openCharacter(page,'敬');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 13획');
});
test('exact-codepoint characters missing from default data still display and write',async({page})=>{
 await openCharacter(page,'敎');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 11획');
 await expect(page.locator('#chip-radical-strokes')).toHaveText('부수 정보 미확인');
 await expect(page.locator('#modal-hanja .hanja-outline')).toHaveAttribute('data-glyph','654E');
});
test('13 real strokes can be graded to completion from the converted medians',async({page})=>{
 await openCharacter(page,'敬');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 13획');
 const draw=(index,backwards=false)=>drawStroke(page,'敬',index,backwards);
 await draw(0,true);
 await expect(page.locator('#modal-stroke-status')).toContainText('올바르지 않습니다');
 for(let i=0;i<13;i++){
  await draw(i);
  await expect(page.locator('#modal-stroke-badge')).toHaveText(`획순: ${i+1} / 13`);
 }
 await expect(page.locator('#modal-stroke-status')).toHaveText('🎉 완벽하게 작성했습니다!');
});
test('産 is full width in the card and shares the corrected outline with writing',async({page})=>{
 await openCharacter(page,'産');
 await expect(page.locator('#modal-hanja')).toHaveText('産');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 11획');
 await expect(page.locator('#chip-radical-strokes')).toHaveText('부수 5획 (잔여 6획)');
 const data=await page.evaluate(()=>StrokeData.load('産'));
 const xs=data.medians.flat().map(p=>p[0]);
 expect(Math.max(...xs)-Math.min(...xs)).toBeGreaterThan(650);
 expect(Math.max(...xs)).toBeGreaterThan(800);
 const source=new URL('assets/glyphs/7523.svg',page.url()).href;
 const svg=await (await page.request.get(source)).text();
 for(const path of data.strokes)expect(svg).toContain(`d="${path}"`);
 await expect(page.locator('#modal-hanja .hanja-outline')).toHaveAttribute('data-glyph','7523');
 await page.locator('[data-action="close-modal"]').click();
 await expect(page.locator('#detail-modal')).toBeHidden();
 const card=page.locator('.hanja-card-wrapper').filter({has:page.locator('[data-glyph="7523"]')});
 await expect(card).toBeVisible();
 await expect(card.locator('.hanja-outline')).toHaveAttribute('data-state','ready');
 expect(await card.locator('path').count()).toBe(11);
});

test('50 cards use one glyph batch, not 50 individual image requests',async({page})=>{
 const requests=[];
 page.on('request',request=>{if(request.url().includes('/assets/glyphs/'))requests.push(request.url());});
 await page.reload();
 await expect(page.locator('.hanja-card-wrapper .hanja-outline[data-state="ready"]')).toHaveCount(50);
 expect(requests).toHaveLength(1);
 expect(requests[0]).toMatch(/batch-\d+-[a-f0-9]+\.json$/);
 expect(await page.locator('.hanja-card-wrapper img').count()).toBe(0);
});
test('transient glyph HTTP failure retries without reloading',async({page})=>{
 let count=0;
 const file=await page.evaluate(()=>GLYPH_INDEX.files[GLYPH_INDEX.grades['4급'][0]]);
 await page.route('**/assets/glyphs/'+file,route=>{
  if(++count===1)return route.fulfill({status:503,body:'temporary'});
  return route.continue();
 });
 await page.reload();
 await expect(page.locator('.hanja-card-wrapper .hanja-outline[data-state="ready"]')).toHaveCount(50);
 expect(count).toBe(2);
});
test('invalid batches fall back readably then recover on reconnect without a page reload',async({page})=>{
 let failed=true,count=0;
 const file=await page.evaluate(()=>GLYPH_INDEX.files[GLYPH_INDEX.grades['4급'][0]]);
 await page.route('**/assets/glyphs/'+file,route=>{
  count++;
  return failed?route.fulfill({status:200,contentType:'application/json',body:'{}'}):route.continue();
 });
 await page.reload();
 await expect(page.locator('.hanja-card-wrapper .hanja-outline[data-state="fallback"]')).toHaveCount(50);
 expect(count).toBe(3);
 expect(await page.locator('.hanja-card-wrapper .hanja-outline text').count()).toBe(50);
 failed=false;
 await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect(page.locator('.hanja-card-wrapper .hanja-outline[data-state="ready"]')).toHaveCount(50);
 expect(count).toBe(4);
});
test('every grade batch matches the runtime Korean-reading page order',async({page})=>{
 const mismatches=await page.evaluate(()=>{
  const errors=[];
  for(const [grade,pages] of Object.entries(GLYPH_INDEX.grades)){
   HanjaApp.setGrade(grade);
   const sorted=[...hanjaData];
   pages.forEach((batch,page)=>{
    const expected=sorted.slice(page*50,page*50+50).map(item=>item.h.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).sort();
    if(JSON.stringify(expected)!==JSON.stringify([...GLYPH_INDEX.members[batch]].sort()))errors.push(`${grade}:${page+1}`);
   });
  }
  return errors;
 });
 expect(mismatches).toEqual([]);
});
test('main card typography is 55pt hanja and 17pt hun',async({page})=>{
 const sizes=await page.evaluate(()=>({
  hanja:parseFloat(getComputedStyle(document.querySelector('.dynamic-hanja-size')).fontSize),
  hun:parseFloat(getComputedStyle(document.querySelector('.dynamic-hun-size')).fontSize)
 }));
 expect(sizes.hanja).toBeCloseTo(55*96/72,2);
 expect(sizes.hun).toBeCloseTo(17*96/72,2);
 const glyph=page.locator('.hanja-card-wrapper .hanja-outline').first();
 const box=await glyph.boundingBox();expect(box.width).toBeCloseTo(sizes.hanja,0);expect(box.height).toBeCloseTo(sizes.hanja,0);
});

test('phones fit two cards at 320, 360, and 390 CSS pixels without shrinking glyphs',async({page})=>{
 for(const width of [320,360,390]){
  await page.setViewportSize({width,height:844});
  const boxes=await page.locator('.hanja-card-wrapper').evaluateAll(nodes=>nodes.slice(0,3).map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right};}));
  expect(Math.abs(boxes[0].y-boxes[1].y)).toBeLessThan(2);
  expect(boxes[1].x).toBeGreaterThan(boxes[0].x);
  expect(boxes[2].y).toBeGreaterThan(boxes[0].y);
  expect(boxes[1].right).toBeLessThanOrEqual(width);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('one writing surface allows demo, handwriting, undo, and replay without mode tabs',async({page})=>{
 await openCharacter(page,'敬');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 13획');
 await expect(page.locator('#btn-mode-demo, #btn-mode-practice')).toHaveCount(0);
 await page.locator('[data-action="step-next-modal-stroke"]').click();
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 1 / 13');
 await drawStroke(page,'敬',1);
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 2 / 13');
 await page.locator('[data-action="step-prev-modal-stroke"]').click();
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 1 / 13');
 await drawStroke(page,'敬',1);
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 2 / 13');
 await page.locator('[data-action="reset-modal-writing"]').click();
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 0 / 13');
 await page.locator('[data-action="toggle-modal-writing"]').click();
 await drawStroke(page,'敬',0);
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 1 / 13');
 // A delayed demo callback must not advance the shared cursor after handwriting takes control.
 await page.waitForTimeout(1200);
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 1 / 13');
 await page.locator('[data-action="step-prev-modal-stroke"]').click();
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 0 / 13');
});
test('automatic stroke draws once in final ink, without the red fade-out hint pass',async({page})=>{
 await openCharacter(page,'一');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 1획');
 await page.evaluate(()=>{
  window.demoHintCalls=0;
  const original=HanziWriter.prototype.highlightStroke;
  HanziWriter.prototype.highlightStroke=function(...args){window.demoHintCalls++;return original.apply(this,args);};
 });
 await page.locator('[data-action="toggle-modal-writing"]').click();
 const ink=page.locator('.demo-stroke-ink');
 await expect(ink).toHaveCount(1);
 expect(await ink.getAttribute('stroke')).toMatch(/^rgba\((30,41,59|37,99,235),1\)$/);
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 1 / 1');
 await expect(page.locator('.demo-stroke-ink')).toHaveCount(0);
 expect(await page.evaluate(()=>demoHintCalls)).toBe(0);
 await page.locator('[data-action="step-prev-modal-stroke"]').click();
 await page.locator('[data-action="step-next-modal-stroke"]').click();
 await expect(ink).toHaveCount(1);
 await page.locator('[data-action="toggle-modal-writing"]').click();
 await expect(page.locator('.demo-stroke-ink')).toHaveCount(0);
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 0 / 1');
});

test('the same rendered stroke stays opaque and never restarts during auto playback',async({page})=>{
 await openCharacter(page,'一');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 1획');
 await page.evaluate(()=>{
  const svg=document.querySelector('#writingContainer > div > svg');
  const node=svg.querySelectorAll('path[clip-path]')[1];
  window.strokeProbe={node,frames:0,increases:0,transparent:0,last:Infinity,started:false,running:true};
  const tick=()=>{
   const p=window.strokeProbe;
   if(node.classList.contains('demo-stroke-ink'))p.started=true;
   if(p.started){
    const offset=parseFloat(node.style.strokeDashoffset);
    if(offset>p.last+0.01)p.increases++;
    if(Number(getComputedStyle(node).opacity)<0.999)p.transparent++;
    p.last=offset;p.frames++;
   }
   if(p.running)requestAnimationFrame(tick);
  };requestAnimationFrame(tick);
 });
 const button=page.locator('#btn-toggle-writing');
 await expect(button).toHaveText('재생');
 await button.click();await expect(button).toHaveText('정지');
 await expect(page.locator('#modal-stroke-badge')).toHaveText('획순: 1 / 1');
 await expect(button).toHaveText('재생');
 await page.waitForTimeout(300);
 const probe=await page.evaluate(()=>{
  const p=strokeProbe;p.running=false;
  return {frames:p.frames,increases:p.increases,transparent:p.transparent,connected:p.node.isConnected,offset:p.last};
 });
 expect(probe.frames).toBeGreaterThan(5);expect(probe.increases).toBe(0);
 expect(probe.transparent).toBe(0);expect(probe.connected).toBe(true);expect(probe.offset).toBe(0);
 await expect(page.locator('[data-action="pause-modal-writing"], [data-action="play-modal-writing"]')).toHaveCount(0);
});
