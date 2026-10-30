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
console.log(`Static deployment smoke passed: ${base} ${info.version}`);
