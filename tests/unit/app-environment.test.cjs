const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
for(const environment of ['pre','dev','']) {
 test(`app environment ${environment || 'production'} labels header and installed app consistently`,async()=>{
  const {stampEnvironment}=await import('../../scripts/app-environment.mjs');
  const result=stampEnvironment(html,manifest,environment);
  const suffix=environment ? ` ${environment}` : '';
  assert.equal(result.manifest.name,'바른한자'+suffix);
  assert.equal(result.manifest.short_name,manifest.short_name+suffix);
  assert.ok(result.html.includes(`name="apple-mobile-web-app-title" content="바른한자${suffix}"`));
  assert.equal(result.manifest.start_url,'./');
  assert.equal(result.manifest.scope,'./');
  if(environment) {
   assert.match(result.html,new RegExp(`</button>\\s*<span id="app-environment"[^>]*>${environment}</span>`));
   assert.match(result.html,/color:#f9a8d4/);
  } else assert.ok(!result.html.includes('id="app-environment"'));
  assert.equal(manifest.short_name,'바른한자');
 });
}

test('legacy main manifest also receives the short PC install name',async()=>{
 const {stampEnvironment}=await import('../../scripts/app-environment.mjs');
 const result=stampEnvironment(html,{...manifest,name:'바른한자 : 급수별 쓰기 마스터'},'dev');
 assert.equal(result.manifest.name,'바른한자 dev');
});
