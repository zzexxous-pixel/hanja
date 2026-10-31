const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'block'});
test.beforeEach(async({page})=>{
 await page.goto('./');
 // Main snapshot retains its old UI until explicitly merged; test new feature in preview.
 test.skip(await page.locator('#btn-install-app').count()===0,'Legacy main snapshot');
});
test('card and popup preserve numbers and show earliest grade, even in cumulative selection',async({page})=>{
 const check=async()=>{
  const labels=await page.evaluate(()=>{
   const first=new Map();for(const g of GRADE_ORDER)for(const item of hanjaNewData[g]||[])if(!first.has(item.h))first.set(item.h,g);
   return hanjaData.slice(0,50).map((item,i)=>`#${i+1}. ${first.get(item.h)}`);
  });
  const cards=page.locator('.hanja-card-wrapper');
  await expect(cards).toHaveCount(labels.length);
  for(let i=0;i<labels.length;i++)await expect(cards.nth(i).locator('.card-status-label')).toHaveText(labels[i]);
  await cards.first().locator('[data-action="open-modal"]').click();
  await expect(page.locator('#modal-idx')).toHaveText(labels[0]);
 };
 await check();
 await page.locator('[data-action="close-modal"]').click();
 await page.locator('[data-action="open-grade-modal"]').click();
 await page.locator('#grade-grid-container button').filter({has:page.locator('span', {hasText:/^8급$/})}).click();
 await check();
});
test('settings install button stays visible but only enables for a native install prompt',async({page})=>{
 await page.locator('[data-action="open-settings-modal"]').click();
 await expect(page.locator('#btn-install-app')).toBeVisible();
 await expect(page.locator('#btn-install-app')).toBeDisabled();
 await expect(page.locator('#app-install-status')).toContainText('이미 설치했거나');
 await page.evaluate(()=>{
  window.promptCount=0;
  const event=new Event('beforeinstallprompt',{cancelable:true});
  event.prompt=async()=>{window.promptCount++;};event.userChoice=Promise.resolve({outcome:'dismissed'});
  window.dispatchEvent(event);
 });
 await expect(page.locator('#btn-install-app')).toBeEnabled();
 await page.locator('#btn-install-app').click();
 await expect(page.locator('#app-install-status')).toContainText('취소');
 expect(await page.evaluate(()=>window.promptCount)).toBe(1);
 await expect(page.locator('#btn-install-app')).toBeVisible();
 await expect(page.locator('#btn-install-app')).toBeDisabled();
 expect(await page.evaluate(()=>window.promptCount)).toBe(1);
 const installBlock=page.locator('#btn-install-app').locator('..');
 await expect(installBlock).toHaveJSProperty('nextElementSibling',null);
 await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));
 await expect(page.locator('#btn-install-app')).toBeDisabled();
 await expect(page.locator('#app-install-status')).toContainText('설치가 완료');
});
