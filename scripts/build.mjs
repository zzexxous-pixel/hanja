// Static packaging only: copy allowlisted assets, compile CSS, stamp version.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { packageStrokes } from './strokes.mjs';
import { stampEnvironment } from './app-environment.mjs';
import { writeAuditReport } from './audit-glyphs.mjs';
const require = createRequire(import.meta.url);
const preview = process.argv.includes('--preview');
const out = resolve('_site');
const scratch = mkdtempSync(join(tmpdir(), 'hanja-build-'));
const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
function snapshot(ref, name) {
  const dest = join(scratch, name); mkdirSync(dest);
  const archive=join(scratch,`${name}.tar`);
  execFileSync('git',['archive','--output',archive,ref]);
  execFileSync('tar',['-xf',archive,'-C',dest]);
  return dest;
}
function pack(src, dest, ref, suffix) {
  mkdirSync(dest, {recursive:true});
  const assets = ['index.html','style.css','hanja_data.js','audioEngine.js','speechEngine.js','writingEngine.js','script.js','bookmarkStore.js','strokeData.js','glyphStore.js','sw.js','manifest.webmanifest','icon-192.png','icon-512.png','favicon.ico','img'];
  for (const file of assets) if (existsSync(join(src,file))) cpSync(join(src,file),join(dest,file),{recursive:true});
  execFileSync(process.execPath,[require.resolve('tailwindcss/lib/cli.js'),'--content', ['index.html','script.js','writingEngine.js'].map(f=>join(src,f)).join(','),'-o',join(dest,'tailwind-build.css'),'--minify'],{stdio:'inherit'});
  if (existsSync(join(src,'data/stroke-overrides/manifest.json'))) {
    packageStrokes(src,dest);
    if (!process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY.endsWith('/hanja-test')) writeAuditReport(src,join(dest,'review'),{glyphBase:'../assets/glyphs',writeGlyphs:false});
  }
  const environment = suffix.includes('preview') ? 'pre' : suffix === '-test' ? 'dev' : '';
  const stamped = stampEnvironment(readFileSync(join(dest,'index.html'),'utf8'), JSON.parse(readFileSync(join(dest,'manifest.webmanifest'),'utf8')), environment);
  writeFileSync(join(dest,'index.html'),stamped.html);
  writeFileSync(join(dest,'manifest.webmanifest'),JSON.stringify(stamped.manifest,null,2)+'\n');
  const base = readFileSync(join(src,'VERSION'),'utf8').trim();
  const versionCommit = git('log','-1','--format=%H',ref,'--','VERSION');
  const patch = git('rev-list','--count',`${versionCommit}..${ref}`);
  const version = `v${base}.${patch}${suffix}`;
  const sha = git('rev-parse',ref);
  const date = git('show','-s','--format=%cI',ref);
  for (const file of ['index.html','script.js','sw.js']) {
    const path = join(dest,file);
    writeFileSync(path,readFileSync(path,'utf8').replaceAll('{{APP_VERSION}}',version).replaceAll('{{COMMIT_DATE}}',date));
  }
  writeFileSync(join(dest,'build-info.json'),JSON.stringify({version,sha,environment},null,2)+'\n');
}
try {
  rmSync(out,{recursive:true,force:true});
  const isTest = !process.env.GITHUB_REPOSITORY || process.env.GITHUB_REPOSITORY.endsWith('/hanja-test');
  if (preview) {
    pack(snapshot('origin/main','main'),out,'origin/main','-test');
    const ref = process.env.PREVIEW_REF || 'HEAD';
    pack(ref==='HEAD'?resolve('.'):snapshot(ref,'preview'),join(out,'preview'),ref,'-test-preview');
  } else pack(resolve('.'),out,'HEAD',isTest?'-test':'');
  writeFileSync(join(out,'.nojekyll'),'');
} finally { rmSync(scratch,{recursive:true,force:true}); }
