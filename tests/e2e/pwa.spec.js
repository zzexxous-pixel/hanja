const {test,expect}=require('@playwright/test');
test.use({serviceWorkers:'allow'});
test('real manifest, decoded icons and service worker meet Chromium mobile/desktop installability checks',async({page,context})=>{
 await page.goto('./');
 await page.evaluate(async()=>{
  await navigator.serviceWorker.ready;
  if(!navigator.serviceWorker.controller) await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
 });
 const session=await context.newCDPSession(page);
 await session.send('Page.enable');
 const manifest=await session.send('Page.getAppManifest');
 expect(manifest.errors).toEqual([]);
 const data=JSON.parse(manifest.data);
 expect(data.name).toBe(data.short_name);
 const icons=await page.evaluate(async()=>{
  const manifest=await (await fetch(document.querySelector('link[rel="manifest"]').href)).json();
  return Promise.all(manifest.icons.filter(icon=>icon.purpose==='any').map(async icon=>{
   const image=await createImageBitmap(await (await fetch(icon.src)).blob());
   const size=[image.width,image.height];image.close();return size;
  }));
 });
 expect(icons).toContainEqual([192,192]);expect(icons).toContainEqual([512,512]);
 const result=await session.send('Page.getInstallabilityErrors');
 expect(result.installabilityErrors).toEqual([]);
});
