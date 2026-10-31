// HTTP-only post-deploy smoke: no browser install or npm dependencies needed.
import assert from 'node:assert/strict';
const base=process.env.SMOKE_URL;
assert.ok(base,'SMOKE_URL is required');
async function get(file) {
 const response=await fetch(new URL(file,base),{cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,`${file}: HTTP ${response.status}`);return response;
}
const info=await (await get('build-info.json')).json();
if(process.env.EXPECTED_SHA) assert.equal(info.sha,process.env.EXPECTED_SHA);
const html=await (await get('./')).text();
assert.ok(html.includes('바른한자'));assert.ok(!html.includes('{{APP_VERSION}}'));
for(const file of ['script.js','bookmarkStore.js','hanja_data.js','tailwind-build.css','sw.js']) assert.ok((await (await get(file)).text()).length>0);
const manifest=await (await get('manifest.webmanifest')).json();
const suffix=info.environment ? ` ${info.environment}` : '';
assert.equal(manifest.short_name,`바른한자${suffix}`);
assert.equal(manifest.name,`바른한자 : 급수별 쓰기 마스터${suffix}`);
if(info.environment) assert.ok(html.includes(`>${info.environment}</span>`));
else assert.ok(!html.includes('id="app-environment"'));
if(new URL(base).pathname.endsWith('/preview/')) {
  const root=new URL('../',base);
  const rootHtml=await (await fetch(root,{cache:'no-store'})).text();
  const rootManifest=await (await fetch(new URL('manifest.webmanifest',root),{cache:'no-store'})).json();
  assert.ok(rootHtml.includes('>dev</span>'));
  assert.equal(rootManifest.short_name,'바른한자 dev');
}
console.log(`Static deployment smoke passed: ${base} ${info.version}`);
