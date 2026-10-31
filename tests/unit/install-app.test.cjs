const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
function setup({standalone=false,ios=false}={}){
 const listeners={},button={addEventListener(type,handler){this[type]=handler;}},status={};
 const context={window:{matchMedia:()=>({matches:standalone}),addEventListener(type,fn){listeners[type]=fn;}},navigator:{userAgent:ios?'iPhone':'Chrome',platform:'',maxTouchPoints:0},document:{getElementById:id=>id==='btn-install-app'?button:status}};
 vm.runInNewContext(fs.readFileSync('installApp.js','utf8'),context);
 return {listeners,button,status};
}
test('install uses a deferred prompt once and cancellation allows browser menu guidance',async()=>{
 const s=setup();assert.equal(s.button.hidden,false);let prompts=0,prevented=false;
 s.listeners.beforeinstallprompt({preventDefault(){prevented=true;},async prompt(){prompts++;},userChoice:Promise.resolve({outcome:'dismissed'})});
 assert.equal(prevented,true);assert.equal(s.button.hidden,false);await s.button.click();assert.equal(prompts,1);
 assert.match(s.status.textContent,/취소/);await s.button.click();assert.equal(prompts,1);assert.match(s.status.textContent,/브라우저 메뉴/);
});
test('iOS without browser install event offers Safari home screen instructions',async()=>{
 const s=setup({ios:true});await s.button.click();assert.match(s.status.textContent,/Safari.*공유.*홈 화면에 추가/);
});
test('standalone and appinstalled keep the button visible and explain existing installation',async()=>{
 const s=setup({standalone:true});assert.equal(s.button.disabled,false);assert.equal(s.button.hidden,false);await s.button.click();assert.match(s.status.textContent,/이미 앱으로 실행/);
 const t=setup();t.listeners.appinstalled();assert.equal(t.button.disabled,false);assert.equal(t.button.hidden,false);await t.button.click();assert.match(t.status.textContent,/설치가 완료/);assert.equal(t.button.textContent,'앱 설치');
});
test('prompt failure is handled and accepted request is not claimed as completed install',async()=>{
 const s=setup();s.listeners.beforeinstallprompt({preventDefault(){},prompt(){throw Error('blocked');}});
 await s.button.click();assert.match(s.status.textContent,/열지 못/);assert.equal(s.button.disabled,false);
 s.listeners.beforeinstallprompt({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'accepted'})});
 await s.button.click();assert.match(s.status.textContent,/요청/);assert.equal(s.button.disabled,false);
});

test('no native prompt never claims installation is still being checked or definitely absent',async()=>{
 const s=setup();assert.doesNotMatch(s.status.textContent,/확인 중|설치 준비/);
 assert.equal(s.button.hidden,false);assert.equal(s.button.disabled,false);
 await s.button.click();assert.match(s.status.textContent,/이미 설치했거나/);
 assert.match(s.status.textContent,/지원하지 않습니다/);
});
