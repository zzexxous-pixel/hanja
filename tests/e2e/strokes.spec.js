const {test,expect}=require('@playwright/test');
// Fault injection must reach the page fetch, not be served by a service-worker cache.
test.use({serviceWorkers:'block'});
async function openCharacter(page,character){
 const index=await page.evaluate(c=>hanjaData.findIndex(item=>item.h===c),character);
 expect(index).toBeGreaterThanOrEqual(0);
 await page.evaluate(i=>HanjaApp.switchTab(Math.floor(i/50)+1),index);
 await page.locator(`[data-action="open-modal"][data-index="${index}"]`).click();
}
test.beforeEach(async({page})=>{
 await page.route(/https:\/\//,route=>route.abort());
 await page.goto('./');
});
test('cards use static outlines, and 13-stroke 敬 shares data with the real local writer',async({page})=>{
 await expect(page.locator('.hanja-card-wrapper .hanja-outline')).toHaveCount(50);
 await expect.poll(()=>page.locator('.hanja-outline').first().evaluate(img=>img.complete&&img.naturalWidth>0)).toBe(true);
 await openCharacter(page,'敬');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 13획');
 await expect(page.locator('#chip-radical-strokes')).toHaveText('부수 4획 (잔여 9획)');
 const data=await page.evaluate(()=>StrokeData.load('敬'));
 expect(data.strokes).toHaveLength(13);
 const svg=await (await page.request.get(new URL('assets/glyphs/656C.svg',page.url()).href)).text();
 for(const path of data.strokes)expect(svg).toContain(`d="${path}"`);
 await page.locator('#btn-mode-practice').click();
 await expect(page.locator('#modal-stroke-status')).toContainText('직접 한자를 써보세요');
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
 await expect(page.locator('#modal-hanja .hanja-outline')).toHaveAttribute('src','assets/glyphs/654E.svg');
});
test('13 real strokes can be graded to completion from the converted medians',async({page})=>{
 await openCharacter(page,'敬');
 await expect(page.locator('#chip-total-strokes')).toHaveText('총 13획');
 await page.locator('#btn-mode-practice').click();
 const draw=async(index,backwards=false)=>page.evaluate(async({index,backwards})=>{
  const data=await StrokeData.load('敬');
  const svg=document.querySelector('#writingContainer > div > svg');
  const rect=svg.getBoundingClientRect();
  const size=Number(svg.getAttribute('width'));
  const t=HanziWriter.getScalingTransform(size,size,Math.max(10,Math.round(size*0.05)));
  const points=[...data.medians[index]];if(backwards)points.reverse();
  const event=(type,point)=>svg.dispatchEvent(new MouseEvent(type,{bubbles:true,cancelable:true,clientX:rect.left+t.x+point[0]*t.scale,clientY:rect.top+size-t.y-point[1]*t.scale}));
  event('mousedown',points[0]);for(const point of points.slice(1))event('mousemove',point);event('mouseup',points.at(-1));
 },{index,backwards});
 await draw(0,true);
 await expect(page.locator('#modal-stroke-status')).toContainText('올바르지 않습니다');
 for(let i=0;i<13;i++){
  await draw(i);
  await expect(page.locator('#modal-stroke-badge')).toHaveText(`획순: ${i+1} / 13`);
 }
 await expect(page.locator('#modal-stroke-status')).toHaveText('🎉 완벽하게 작성했습니다!');
});
