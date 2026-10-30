const {test,expect}=require('@playwright/test');
test('card layout baseline (opt-in; pin browser and fonts before accepting)',async({page})=>{
 await page.route(/https:\/\//,r=>r.abort());
 await page.goto('./');
 await expect(page.locator('.hanja-card-wrapper')).toHaveCount(50);
 await expect(page.locator('#table-view-container')).toHaveScreenshot('cards.png',{animations:'disabled'});
});
