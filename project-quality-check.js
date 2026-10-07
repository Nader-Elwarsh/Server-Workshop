const fs=require('fs'),path=require('path'),assert=require('assert');
const root=__dirname;
const read=n=>fs.readFileSync(path.join(root,n),'utf8');
const htmlFiles=fs.readdirSync(root).filter(n=>n.endsWith('.html'));
const jsFiles=fs.readdirSync(root).filter(n=>n.endsWith('.js')&&!n.endsWith('-tests.js')&&!['project-quality-check.js','critical-path-smoke.js'].includes(n));
assert(fs.existsSync(path.join(root,'PROJECT_STRUCTURE.md')),'project structure document is required');
assert(htmlFiles.includes('compcodes.html'),'compressor page must exist');
for(const name of htmlFiles){const s=read(name);if(name!=='compcodes.html')assert(!s.includes('compressor-db.js'),'compressor database must not load on unrelated pages')}
const comp=read('app-compressor-codes.js');
assert(comp.includes('_modelNorm'),'search records must precompute normalized model');
assert(comp.includes('searchCache'),'search cache must remain enabled');
assert(comp.includes('compressor-index.js')&&comp.includes('loadAllCompressorBrands'),'compressor database must load through index and lazy brand chunks');
assert(comp.includes('window.CompressorRef')&&comp.includes('ensureAll')&&comp.includes('isReady'),'compressor module must expose a lean public API for global search reuse');
assert(comp.includes('function computeAlternatives'),'compressor page must offer cross-brand spec-matched alternatives');
assert(comp.includes('للاسترشاد فقط'),'alternatives list must keep the non-certified disclaimer');
assert(comp.includes('function exportCustomCompressors')&&comp.includes('function importCustomCompressorsFile'),'custom compressor additions must be shareable like fault codes');
const gs=read('global-search.js');
assert(gs.includes('compressor:')&&gs.includes('CompressorRef'),'global search must include a lazy-loaded compressor category');
assert(gs.includes('function loadCompressorModule')&&gs.includes('script.src = "app-compressor-codes.js"'),'global search must load compressor support on demand');
assert(read('compcodes.html').includes('app-compressor-codes.js'),'compressor page must keep its direct feature module');
for(const page of htmlFiles){if(page!=='compcodes.html')assert(!read(page).includes('app-compressor-codes.js'),`compressor support must not be downloaded eagerly by ${page}`)}
const compHtml0=read('compcodes.html');
assert(compHtml0.includes('id="compExportCustom"')&&compHtml0.includes('id="compImportCustom"'),'compressor page must offer export/import for manual additions');
assert(read('settings.html').includes('data-action="backup"')&&!read('settings.html').includes('onclick="backupAllData()"'),'settings static controls must use delegated actions');
assert(fs.existsSync(path.join(root,'browser-smoke.sh')),'browser smoke test is required');
assert(fs.existsSync(path.join(root,'compressor-index.js')),'compressor index is required');
assert(fs.readdirSync(root).filter(n=>/^brand-\d+\.js$/.test(n)).length>=50,'split compressor brand files are required');
for(const name of htmlFiles){
  const s=read(name);
  if(!s.includes('<script src="app-lock.js"></script>')) continue;
  assert(!s.includes('<script src="app-lock.js" defer>'),'app lock must remain synchronous before page interaction');
  const external=[...s.matchAll(/<script\s+src="([^"]+)"([^>]*)><\/script>/g)];
  for(const m of external){
    // white-label*.js بيتحمّل متزامن عمدًا في <head> عشان ألوان وهوية النسخة تتطبّق قبل أول رسم للصفحة (من غير وميض).
    if(m[1]==='app-lock.js'||m[1]==='white-label.js'||m[1]==='white-label-config.js'||m[1]==='workshop-idb.js') continue;
    assert(/\bdefer\b/.test(m[2]),`${name}: external script ${m[1]} should use defer`);
  }
}
const sw=read('service-worker.js');
assert(!/"\.\/brand-\d+\.js"/.test(sw.split('self.addEventListener("install"')[0]),'large compressor brand chunks must stay lazy and not be part of the initial cache install');
const cached=new Set((sw.match(/["']\.\/([\w.\-]+\.(?:html|js|css))["']/g)||[]).map(s=>s.slice(3,-1)));
const referenced=new Set();
for(const name of htmlFiles){
  const s=read(name);
  for(const m of s.matchAll(/(?:src|href)="([\w.\-]+\.(?:js|css))(?:\?[^"]*)?"/g))referenced.add(m[1]);
}
for(const name of htmlFiles){if(name==='browser-interactive.html')continue;const s=read(name);assert(s.includes('<script src="workshop-idb.js"></script>'),`${name}: IndexedDB storage bootstrap must load synchronously`);}
const directLegacy=htmlFiles.filter(name=>/\blocalStorage\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(/.test(read(name)));
assert.strictEqual(directLegacy.length,0,`HTML must not access browser localStorage directly: ${directLegacy.join(', ')}`);
const directLegacyJs=jsFiles.filter(name=>name!=='workshop-idb.js'&&/\blocalStorage\s*\.\s*(?:getItem|setItem|removeItem|clear)\s*\(/.test(read(name)));
assert.strictEqual(directLegacyJs.length,0,`Production JavaScript must not access browser localStorage directly: ${directLegacyJs.join(', ')}`);
const uncached=[...referenced].filter(f=>!cached.has(f));
assert.strictEqual(uncached.length,0,`file(s) loaded by an HTML page but missing from service-worker.js offline cache: ${uncached.join(', ')}`);
console.log(`project-quality-check: PASS (${htmlFiles.length} HTML pages; lazy compressor DB verified)`);
