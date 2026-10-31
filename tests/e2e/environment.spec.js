const {test,expect}=require('@playwright/test');
test('environment label is pink and right of grade selector, with matching install name',async({page,request})=>{
 await page.goto('./');
 const info=await (await request.get('build-info.json')).json();
 const environment=info.environment;
 const manifest=await (await request.get('manifest.webmanifest')).json();
 const suffix=environment ? ` ${environment}` : '';
 expect(manifest.short_name).toBe(`바른한자${suffix}`);
 expect(manifest.name).toBe(`바른한자 : 급수별 쓰기 마스터${suffix}`);
 await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content',`바른한자${suffix}`);
 if(environment){
  const badge=page.locator('#app-environment');
  await expect(badge).toHaveText(environment);
  await expect(badge).toHaveCSS('color','rgb(249, 168, 212)');
  const grade=await page.locator('[data-action="open-grade-modal"]').boundingBox();
  const label=await badge.boundingBox();
  expect(label.x).toBeGreaterThanOrEqual(grade.x+grade.width);
  expect(Math.abs((label.y+label.height/2)-(grade.y+grade.height/2))).toBeLessThan(5);
 }else await expect(page.locator('#app-environment')).toHaveCount(0);
});
