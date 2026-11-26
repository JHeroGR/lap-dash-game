// Deployment readiness: PWA (online / installable), offline use, no external requests, phone emulation, Capacitor config.
const test=require('node:test'), assert=require('node:assert/strict');
const path=require('path'), fs=require('fs'), http=require('http');
let chromium,devices; try{({chromium,devices}=require('playwright'));}catch(e){}
if(!chromium){ test('playwright is installed',{skip:'playwright not available'},()=>{}); return; }
const WWW=path.join(__dirname,'..','www'), ROOT=path.join(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webmanifest':'application/manifest+json'};

test.describe('deploy',()=>{
  let browser,server,base;
  test.before(async()=>{
    browser=await chromium.launch();
    server=http.createServer((q,r)=>{const f=path.join(WWW,q.url.split('?')[0]==='/'?'index.html':q.url.split('?')[0]);
      if(!f.startsWith(WWW)||!fs.existsSync(f)){r.writeHead(404);return r.end();} r.writeHead(200,{'content-type':MIME[path.extname(f)]||'application/octet-stream'}); r.end(fs.readFileSync(f));});
    await new Promise(r=>server.listen(0,r)); base='http://localhost:'+server.address().port+'/';
  });
  test.after(async()=>{await browser.close(); server.close();});

  test('web manifest: name, landscape, fullscreen, icons exist with the right sizes (incl. maskable)',()=>{
    const m=JSON.parse(fs.readFileSync(path.join(WWW,'manifest.webmanifest'),'utf8'));
    assert.equal(m.name,'Lap Dash'); assert.equal(m.orientation,'landscape'); assert.match(m.display,/fullscreen|standalone/); assert.equal(m.background_color,'#000000');
    assert.ok(m.icons.some(i=>i.sizes==='192x192')&&m.icons.some(i=>i.sizes==='512x512')&&m.icons.some(i=>i.purpose==='maskable'));
    for(const i of m.icons){const f=path.join(WWW,i.src); assert.ok(fs.existsSync(f),i.src); const b=fs.readFileSync(f); assert.equal(b.slice(1,4).toString(),'PNG'); const w=b.readUInt32BE(16); assert.equal(w+'x'+w,i.sizes);}
    assert.equal(fs.readFileSync(path.join(WWW,'icons/apple-touch-icon.png')).readUInt32BE(16),180);
  });

  test('page head: iOS/Android install tags, viewport-fit=cover, theme colour, manifest link',()=>{
    const h=fs.readFileSync(path.join(WWW,'index.html'),'utf8');
    for(const re of [/rel="manifest"/,/apple-mobile-web-app-capable/,/apple-touch-icon/,/viewport-fit=cover/,/theme-color/,/mobile-web-app-capable/,/<title>Lap Dash<\/title>/]) assert.match(h,re);
    assert.doesNotMatch(h,/https?:\/\/(?!localhost)[a-z0-9.-]+\.[a-z]{2,}\//i.source?new RegExp('(src|href)="https?://','i'):/x/,'no external resources');
  });

  test('served over HTTP: loads with no errors, no external requests, registers a service worker',async()=>{
    const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true}); const p=await ctx.newPage(); const errs=[],reqs=[];
    p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error') errs.push(m.text());}); p.on('request',r=>reqs.push(r.url()));
    await p.goto(base); await p.waitForTimeout(1200);
    await p.evaluate(()=>navigator.serviceWorker.ready); assert.deepEqual(errs,[]);
    const external=reqs.filter(u=>!u.startsWith(base)&&!u.startsWith('data:')&&!u.startsWith('blob:')); assert.deepEqual(external,[],'only same-origin requests');
    assert.equal(await p.evaluate(()=>typeof game),'object');
    const cached=await p.evaluate(async()=>{const ks=await caches.keys(); return (await (await caches.open(ks[0])).keys()).length;}); assert.ok(cached>=7,'cached files '+cached);
    await ctx.close();
  });

  test('offline: after the first visit the game reloads and plays with the network cut',async()=>{
    const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.goto(base); await p.evaluate(()=>navigator.serviceWorker.ready); await p.reload(); await p.waitForTimeout(800);
    assert.ok(await p.evaluate(()=>!!navigator.serviceWorker.controller),'page is controlled by the worker');
    await ctx.setOffline(true); await p.reload(); await p.waitForTimeout(800);
    assert.equal(await p.evaluate(()=>typeof game),'object','loaded offline'); await p.click('#go'); await p.waitForTimeout(4500);
    assert.equal(await p.evaluate(()=>game.race.state),'racing'); assert.deepEqual(errs,[]); await ctx.close();
  });

  test('works from file:// too (no service worker is attempted, no errors)',async()=>{
    const ctx=await browser.newContext({viewport:{width:844,height:390}}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error') errs.push(m.text());});
    await p.goto('file://'+path.join(WWW,'index.html')); await p.waitForTimeout(500); assert.equal(await p.evaluate(()=>typeof game),'object'); assert.deepEqual(errs,[]); await ctx.close();
  });

  const PHONES=[['iPhone 13 landscape',{width:844,height:390,deviceScaleFactor:3}],['iPhone SE landscape',{width:667,height:375,deviceScaleFactor:2}],['iPhone 15 Pro Max landscape',{width:932,height:430,deviceScaleFactor:3}],
    ['Pixel 7 landscape',{width:915,height:412,deviceScaleFactor:2.6}],['Galaxy S8 landscape',{width:740,height:360,deviceScaleFactor:4}],['small Android landscape',{width:568,height:320,deviceScaleFactor:2}],['iPad landscape',{width:1180,height:820,deviceScaleFactor:2}]];
  for(const [name,vp] of PHONES) for(const racers of ['3','7']) test(`phone: ${name}, ${racers} racers: menu fits, race fits, no scrolling, HUD clear of the track`,async()=>{
    const ctx=await browser.newContext({viewport:{width:vp.width,height:vp.height},deviceScaleFactor:vp.deviceScaleFactor,hasTouch:true,isMobile:true}); const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(r=>localStorage.setItem('lapdash.v1',JSON.stringify({racers:r})),racers);
    await p.goto(base); await p.waitForTimeout(400);
    const m=await p.evaluate(()=>{const mw=document.querySelector('.mwrap').getBoundingClientRect(); return {fit:mw.top>=-1&&mw.bottom<=innerHeight+1&&mw.left>=-1&&mw.right<=innerWidth+1,sx:document.documentElement.scrollWidth-innerWidth,sy:document.documentElement.scrollHeight-innerHeight};});
    assert.ok(m.fit,'menu inside the screen'); assert.ok(m.sx<=0&&m.sy<=0);
    await p.click('#go'); await p.waitForTimeout(500);
    const g=await p.evaluate(()=>{const T=game.track,VB=game.viewport.vb,W=innerWidth,H=innerHeight,pad=T.TW/2+T.EDGE/2; let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      for(let u=0;u<T.L;u+=4)for(const d of [-pad,pad]){const q=T.pointAt(u,d),x=VB.cx+(q.x-T.bx)*VB.sc,y=VB.cy+(q.y-T.by)*VB.sc;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
      const top=document.querySelector('#top').getBoundingClientRect().bottom, btn=[...document.querySelectorAll('button.tb')].map(b=>b.getBoundingClientRect());
      return {inside:x0>=-1&&y0>=-1&&x1<=W+1&&y1<=H+1,below:y0>=top-2,btnIn:btn.every(r=>r.left>=0&&r.right<=W&&r.top>=0&&r.bottom<=H),small:Math.min(...btn.map(r=>Math.min(r.width,r.height))),sx:document.documentElement.scrollWidth-W,sy:document.documentElement.scrollHeight-H,rot:document.querySelector('#rotate').hidden};});
    assert.ok(g.inside,'track on screen'); assert.ok(g.below,'track under the top bar'); assert.ok(g.btnIn,'buttons on screen'); assert.ok(g.small>=44,'button size '+g.small); assert.ok(g.sx<=0&&g.sy<=0); assert.ok(g.rot);
    assert.deepEqual(errs,[]); await ctx.close();
  });

  test('phone: portrait shows the "turn your phone" notice instead of the game, on every phone size',async()=>{
    for(const [w,h] of [[390,844],[360,740],[375,667]]){
      const ctx=await browser.newContext({viewport:{width:w,height:h},isMobile:true,hasTouch:true}); const p=await ctx.newPage(); await p.goto(base); await p.waitForTimeout(300);
      assert.equal(await p.evaluate(()=>document.querySelector('#rotate').hidden),false,`${w}x${h}`); await ctx.close();
    }
  });

  test('safe areas: the HUD and buttons use the notch/home-bar insets (viewport-fit=cover + env())',()=>{
    const css=fs.readFileSync(path.join(ROOT,'src/styles.css'),'utf8'); assert.match(css,/env\(safe-area-inset-left/); assert.match(css,/env\(safe-area-inset-bottom|env\(safe-area-inset-right/);
  });

  test('native wrapper config: Capacitor points at www and the app id/name are set',()=>{
    const c=JSON.parse(fs.readFileSync(path.join(ROOT,'capacitor.config.json'),'utf8')); assert.equal(c.webDir,'www'); assert.match(c.appId,/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/); assert.equal(c.appName,'Lap Dash');
    assert.ok(fs.existsSync(path.join(ROOT,'docs','DEPLOY.md')),'deploy guide present');
  });

  test('size & hygiene: bundle is small, no source maps/secrets, www has exactly the deployable files',()=>{
    const sz=fs.statSync(path.join(WWW,'index.html')).size; assert.ok(sz<400*1024,'page '+sz);
    const files=fs.readdirSync(WWW).sort(); assert.deepEqual(files,['_headers','icons','index.html','manifest.webmanifest','sw.js']);
    assert.doesNotMatch(fs.readFileSync(path.join(WWW,'index.html'),'utf8'),/sourceMappingURL|api[_-]?key|secret/i);
  });
});
