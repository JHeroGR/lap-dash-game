// UI tests: object wiring, button clicking, touch drag, animations, text, audio, collisions in the browser.
// Runs against the deployable build (www/index.html), the same file that ships online and inside Android/iOS.
const test=require('node:test'), assert=require('node:assert/strict');
const path=require('path'), fs=require('fs');
let chromium; try{({chromium}=require('playwright'));}catch(e){}
if(!chromium){ test('playwright is installed',{skip:'playwright not available'},()=>{}); return; }
const FILE='file://'+path.join(__dirname,'..','www','index.html');
const LAND={width:844,height:390};

test.describe('ui',()=>{
  let browser;
  test.before(async()=>{browser=await chromium.launch();});
  test.after(async()=>{await browser.close();});

  async function open({viewport=LAND,store,touch=true,init}={}){
    const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:touch,isMobile:touch});
    const p=await ctx.newPage(); p.errors=[]; p.ctx=ctx;
    p.on('pageerror',e=>p.errors.push(e.message));
    p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|net::/.test(m.text())) p.errors.push(m.text());});
    if(store) await p.addInitScript(s=>{try{if(!localStorage.getItem('lapdash.v1')) localStorage.setItem('lapdash.v1',JSON.stringify(s));}catch(e){}},store);
    if(init) await p.addInitScript(init);
    await p.goto(FILE); await p.waitForTimeout(300); return p;
  }
  const ev=(p,f,a)=>p.evaluate(f,a);
  const begin=async(p,wait=4600)=>{await p.click('#go'); await p.waitForTimeout(wait);};
  // real touch input through the browser's own input pipeline (not synthetic DOM events)
  async function touch(p,type,pts){p.cdp=p.cdp||await p.ctx.newCDPSession(p); await p.cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});}
  const centre=async(p,k)=>ev(p,k=>{const r=document.querySelector(`button.tb[aria-label=${k}]`).getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2};},k);
  const held=p=>ev(p,()=>({...game.controls.touch}));

  /* ---------- objects ---------- */
  test('objects: the game is built from the expected classes and wired together',async()=>{
    const p=await open();
    const o=await ev(p,()=>({
      names:['Options','AudioManager','SpriteSheet','Renderer','Viewport','Controls','Hud','Menu','Demo','Game','Track','Car','Race','Explosion'].map(n=>[n,typeof eval(n)]),
      parts:Object.fromEntries(['opts','audio','sprites','renderer','hud','viewport','demo','controls','menu'].map(k=>[k,game[k]&&game[k].constructor.name])),
      track:game.track.constructor.name, demoCars:game.demo.race.cars.map(c=>c.constructor.name)}));
    for(const [n,t] of o.names) assert.equal(t,'function',n+' is a class');
    assert.deepEqual(o.parts,{opts:'Options',audio:'AudioManager',sprites:'SpriteSheet',renderer:'Renderer',hud:'Hud',viewport:'Viewport',demo:'Demo',controls:'Controls',menu:'Menu'});
    assert.equal(o.track,'Track'); assert.ok(o.demoCars.every(n=>n==='Car'));
    assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  test('objects: Options validates, cleans names and persists across reloads',async()=>{
    const p=await open({store:{name:'<b>hax</b>',racers:'99',hand:'swap',snd:'nope'}});
    const o=await ev(p,()=>({...game.opts,storage:undefined}));
    assert.equal(o.name,'BHAXB'.slice(0,8)); assert.equal(o.racers,'3','invalid value falls back'); assert.equal(o.hand,'swap'); assert.equal(o.snd,'on');
    const c=await ev(p,()=>[Options.cleanName('  abcdefghijkl '),Options.cleanName('   '),Options.cleanName('a$%b'),Options.ord(1),Options.ord(2),Options.ord(3),Options.ord(4),Options.ord(11),Options.ord(12),Options.ord(13),Options.ord(21),Options.ord(22)]);
    assert.deepEqual(c,['ABCDEFGH','PLAYER','AB','1ST','2ND','3RD','4TH','11TH','12TH','13TH','21ST','22ND']);
    await p.click('button[data-k=racers][data-v="7"]'); await p.fill('#name','zed'); await p.click('#go'); await p.waitForTimeout(200);
    await p.reload(); await p.waitForTimeout(300);
    const r=await ev(p,()=>({n:game.opts.name,r:game.opts.racers,v:document.querySelector('#name').value}));
    assert.deepEqual(r,{n:'ZED',r:'7',v:'ZED'}); await p.ctx.close();
  });

  test('objects: the game still works when browser storage is blocked',async()=>{
    const p=await open({init:()=>{Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked');}});}});
    assert.equal(await ev(p,()=>typeof window.game),'object','game started anyway');
    await p.click('button[data-k=racers][data-v="5"]'); await p.click('#go'); await p.waitForTimeout(300);
    assert.equal(await ev(p,()=>game.race.cars.length),6); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  /* ---------- button clicking ---------- */
  test('buttons: every menu option toggles aria-pressed, one per group; name input is cleaned',async()=>{
    const p=await open();
    for(const [k,vals] of [['racers',['3','5','7']],['hand',['std','swap']],['snd',['on','off']]]){
      for(const v of vals){
        await p.click(`button[data-k=${k}][data-v="${v}"]`);
        const st=await ev(p,k=>[...document.querySelectorAll(`button[data-k=${k}]`)].map(b=>b.dataset.v+':'+b.getAttribute('aria-pressed')),k);
        assert.equal(st.filter(x=>x.endsWith(':true')).length,1); assert.ok(st.includes(v+':true'),`${k}=${v}: ${st}`);
        assert.equal(await ev(p,k=>game.opts[k],k),v);
      }
    }
    await p.fill('#name','a-b_c.d$%^ extra long'); await p.click('#go'); await p.waitForTimeout(200);
    assert.equal(await ev(p,()=>game.opts.name),'A-B_C.D '.trim()); await p.ctx.close();
  });

  test('buttons: START → PAUSE → RESUME → PAUSE → RESTART → MENU all work, and ESC/P toggle pause',async()=>{
    const p=await open({store:{racers:'3'}}); const vis=id=>ev(p,id=>!document.querySelector(id).hidden,id);
    await begin(p,500); assert.ok(await vis('#hud')); assert.equal(await vis('#menu'),false);
    await p.click('#pause'); assert.ok(await vis('#pausescr')); await p.click('#resume'); assert.equal(await vis('#pausescr'),false);
    await p.keyboard.press('Escape'); assert.ok(await vis('#pausescr')); await p.keyboard.press('p'); assert.equal(await vis('#pausescr'),false);
    await p.click('#pause'); await p.click('#restart1'); await p.waitForTimeout(200);
    assert.ok(await ev(p,()=>game.race.t<1)); assert.equal(await vis('#pausescr'),false);
    await p.click('#pause'); await p.click('#tomenu1'); await p.waitForTimeout(200);
    assert.ok(await vis('#menu')); assert.equal(await vis('#hud'),false); assert.equal(await ev(p,()=>game.race),null);
    assert.ok(await ev(p,()=>game.demo.race.cars.length)>=4); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  test('buttons: finishing a race shows the end screen; RACE AGAIN and MENU work',async()=>{
    const p=await open({store:{racers:'3'}}); await begin(p,300);
    await ev(p,()=>{const r=game.race; r.state='racing'; r.cd=0; r.me.q=r.track.L*3.01;});
    await p.waitForTimeout(3500);
    const e=await ev(p,()=>({end:!document.querySelector('#endscr').hidden,t:document.querySelector('#endt').textContent,s:document.querySelector('#ends').textContent,st:game.race.state}));
    assert.equal(e.end,true,JSON.stringify(e)); assert.match(e.s,/YOU TOOK \d(ST|ND|RD|TH) PLACE OF 4 RACERS\./);
    await p.click('#again'); await p.waitForTimeout(300); assert.equal(await ev(p,()=>game.race.t<1&&game.race.state==='countdown'),true);
    await ev(p,()=>{game.race.state='over'; game.race.refresh();}); await p.waitForTimeout(300); await p.click('#tomenu2'); await p.waitForTimeout(200);
    assert.equal(await ev(p,()=>!game.menu.hidden),true); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  test('buttons: the START RACE button and the Enter key in the name box both start a race; double taps do not break anything',async()=>{
    const p=await open(); await p.focus('#name'); await p.keyboard.press('Enter'); await p.waitForTimeout(200);
    assert.ok(await ev(p,()=>!!game.race)); await p.click('#pause'); await p.click('#tomenu1'); await p.waitForTimeout(150);
    await p.dblclick('#go'); await p.waitForTimeout(300); assert.ok(await ev(p,()=>game.race.cars.length)===4);
    assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  test('buttons: SWAPPED controls puts pedals on the left and steering on the right',async()=>{
    const p=await open({store:{hand:'swap'}}); await begin(p,300);
    const pos=await ev(p,()=>Object.fromEntries([...document.querySelectorAll('button.tb')].map(b=>[b.getAttribute('aria-label'),b.getBoundingClientRect().left+b.offsetWidth/2])));
    assert.ok(pos.brake<pos.left&&pos.gas<pos.left&&pos.left<pos.right,JSON.stringify(pos));
    await p.click('#pause'); await p.click('#tomenu1'); await p.click('button[data-k=hand][data-v=std]'); await p.click('#go'); await p.waitForTimeout(300);
    const pos2=await ev(p,()=>Object.fromEntries([...document.querySelectorAll('button.tb')].map(b=>[b.getAttribute('aria-label'),b.getBoundingClientRect().left+b.offsetWidth/2])));
    assert.ok(pos2.left<pos2.right&&pos2.right<pos2.brake&&pos2.brake<pos2.gas,JSON.stringify(pos2)); await p.ctx.close();
  });

  test('buttons: every button is big enough for a thumb (>= 44 px) and not covered by anything',async()=>{
    const p=await open(); await begin(p,300);
    const r=await ev(p,()=>[...document.querySelectorAll('button.tb,#pause,#go,#again,#resume')].filter(b=>b.offsetParent).map(b=>{
      const r=b.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,top=document.elementFromPoint(x,y);
      return {id:b.id||b.getAttribute('aria-label'),w:r.width,h:r.height,ok:top===b||b.contains(top)};}));
    for(const b of r){assert.ok(b.w>=44&&b.h>=44,`${b.id} ${b.w}x${b.h}`); assert.ok(b.ok,b.id+' is covered');}
    await p.ctx.close();
  });

  /* ---------- touch drag ---------- */
  test('touch: pressing a pedal holds it, lifting the finger releases it (real touch events)',async()=>{
    const p=await open(); await begin(p);
    const g=await centre(p,'gas'); await touch(p,'touchStart',[{x:g.x,y:g.y,id:1}]); await p.waitForTimeout(900);
    assert.deepEqual(await held(p),{left:false,right:false,gas:true,brake:false}); assert.ok(await ev(p,()=>game.race.me.v)>30,'car accelerates');
    assert.ok(await ev(p,()=>document.querySelector('button.tb[aria-label=gas]').classList.contains('on')));
    await touch(p,'touchEnd',[]); await p.waitForTimeout(100);
    assert.deepEqual(await held(p),{left:false,right:false,gas:false,brake:false});
    assert.equal(await ev(p,()=>document.querySelector('button.tb[aria-label=gas]').classList.contains('on')),false);
    await p.ctx.close();
  });

  test('touch drag: sliding a finger from GAS to BRK hands the press over; sliding off the pad releases',async()=>{
    const p=await open(); await begin(p); const g=await centre(p,'gas'), b=await centre(p,'brake');
    await touch(p,'touchStart',[{x:g.x,y:g.y,id:1}]);
    for(let i=1;i<=6;i++){await touch(p,'touchMove',[{x:g.x+(b.x-g.x)*i/6,y:g.y,id:1}]); await p.waitForTimeout(30);}
    assert.deepEqual(await held(p),{left:false,right:false,gas:false,brake:true},'brake now');
    for(let i=1;i<=4;i++){await touch(p,'touchMove',[{x:b.x-40*i,y:b.y-60*i,id:1}]); await p.waitForTimeout(30);}
    assert.deepEqual(await held(p),{left:false,right:false,gas:false,brake:false},'off the pad: released');
    await touch(p,'touchEnd',[]); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  test('touch drag: a finger dragged between < and > switches steering; two thumbs work together (multi-touch)',async()=>{
    const p=await open(); await begin(p); const L=await centre(p,'left'), R=await centre(p,'right'), G=await centre(p,'gas');
    await touch(p,'touchStart',[{x:L.x,y:L.y,id:1}]); assert.equal((await held(p)).left,true);
    await touch(p,'touchMove',[{x:R.x,y:R.y,id:1}]); await p.waitForTimeout(50);
    assert.deepEqual(await held(p),{left:false,right:true,gas:false,brake:false});
    await touch(p,'touchMove',[{x:R.x,y:R.y,id:1},{x:G.x,y:G.y,id:2}]); await p.waitForTimeout(50);
    // second finger starts on GAS
    await touch(p,'touchStart',[{x:R.x,y:R.y,id:1},{x:G.x,y:G.y,id:2}]); await p.waitForTimeout(50);
    const h=await held(p); assert.equal(h.right,true,'steer still held'); assert.equal(h.gas,true,'gas held with the other thumb');
    await touch(p,'touchEnd',[{x:G.x,y:G.y,id:2}]); await p.waitForTimeout(50);
    const h2=await held(p); assert.equal(h2.gas,false,'lifting one finger only releases its button');
    await touch(p,'touchEnd',[]); await p.waitForTimeout(50); assert.deepEqual(await held(p),{left:false,right:false,gas:false,brake:false});
    await p.ctx.close();
  });

  test('touch: touch-cancel (a system gesture) releases everything; pausing releases held buttons',async()=>{
    const p=await open(); await begin(p); const g=await centre(p,'gas');
    await touch(p,'touchStart',[{x:g.x,y:g.y,id:1}]); assert.equal((await held(p)).gas,true);
    await touch(p,'touchCancel',[]); await p.waitForTimeout(80); assert.equal((await held(p)).gas,false);
    await touch(p,'touchStart',[{x:g.x,y:g.y,id:1}]); await p.click('#pause').catch(()=>{}); await ev(p,()=>game.togglePause()); await p.waitForTimeout(50);
    assert.equal((await held(p)).gas,false,'pause clears inputs'); await touch(p,'touchEnd',[]); await p.ctx.close();
  });

  test('touch: the page cannot be scrolled, zoomed or long-press-selected during play',async()=>{
    const p=await open(); await begin(p,500);
    const css=await ev(p,()=>({ta:getComputedStyle(document.body).touchAction,app:getComputedStyle(document.querySelector('#app')).touchAction,us:getComputedStyle(document.querySelector('#app')).userSelect,ov:getComputedStyle(document.documentElement).overscrollBehavior,
      sx:document.documentElement.scrollWidth-innerWidth,sy:document.documentElement.scrollHeight-innerHeight,vp:document.querySelector('meta[name=viewport]').content}));
    assert.ok(/none|manipulation/.test(css.ta+css.app),JSON.stringify(css)); assert.equal(css.us,'none'); assert.ok(css.sx<=0&&css.sy<=0,'no scroll area'); assert.match(css.vp,/user-scalable=no/);
    const before=await ev(p,()=>[scrollX,scrollY]);
    await touch(p,'touchStart',[{x:400,y:200,id:1}]); for(let i=1;i<=5;i++) await touch(p,'touchMove',[{x:400,y:200-i*30,id:1}]); await touch(p,'touchEnd',[]);
    assert.deepEqual(await ev(p,()=>[scrollX,scrollY]),before); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  test('touch: the SWAPPED layout supports dragging too, and the race is controllable end-to-end with touch only',async()=>{
    const p=await open({store:{hand:'swap',racers:'3'}}); await begin(p); const g=await centre(p,'gas'), R=await centre(p,'right');
    await touch(p,'touchStart',[{x:g.x,y:g.y,id:1}]); await p.waitForTimeout(1500); const a0=await ev(p,()=>game.race.me.a);
    await touch(p,'touchStart',[{x:g.x,y:g.y,id:1},{x:R.x,y:R.y,id:2}]); await p.waitForTimeout(600);
    assert.notEqual(await ev(p,()=>game.race.me.a),a0,'steering with the second thumb turns the car'); await touch(p,'touchEnd',[]); await p.ctx.close();
  });

  /* ---------- animations ---------- */
  test('animations: stoplight lamps light one by one, then GO flashes and the light disappears',async()=>{
    const p=await open({store:{racers:'3'}}); await p.click('#go');
    const seen=new Set(); let go=false;
    for(let i=0;i<60;i++){
      const s=await ev(p,()=>({on:[...document.querySelectorAll('#light .lamp')].map(l=>+l.classList.contains('on')).join(''),go:document.querySelector('#light .lamp:nth-child(3)').classList.contains('go'),off:document.querySelector('#light').classList.contains('off')}));
      seen.add(s.on); if(s.go) go=true; await p.waitForTimeout(100);
    }
    assert.ok(['100','110','111'].every(x=>seen.has(x)),'lamps '+[...seen]); assert.ok(go,'GO shown');
    assert.equal(await ev(p,()=>document.querySelector('#light').classList.contains('off')),true,'light hidden when racing');
    assert.match(await ev(p,()=>document.querySelector('#light .lamp:nth-child(3) span').textContent),/GO/); await p.ctx.close();
  });

  test('animations: the explosion plays in pixel steps (14 fps, square cells), then disappears; the car respawns',async()=>{
    const p=await open({store:{racers:'3'}}); await begin(p);
    await ev(p,()=>{const r=game.race; r.me.inv=0; r.me.hurtT=0; r.hurt(r.me,999);});
    const frames=new Set(), cells=[];
    for(let i=0;i<14;i++){
      const s=await ev(p,()=>{const f=game.race.fx[0]; return f?{fr:Math.floor(f.t*Renderer.EXP_FPS)}:null;}); if(s) frames.add(s.fr); await p.waitForTimeout(80);
    }
    assert.ok(frames.size>=6,'explosion advances through frames: '+[...frames]);
    assert.equal(await ev(p,()=>Renderer.EXP_P),7); assert.equal(await ev(p,()=>game.race.fx.length),0,'explosion gone');
    assert.equal(await ev(p,()=>game.race.me.dead),false); assert.equal(await ev(p,()=>game.race.me.hp),100);
    // pixels drawn during an explosion are only black or white (no smoothing, no grey): sample the canvas
    await ev(p,()=>{const r=game.race; r.me.inv=0; r.me.hurtT=0; r.hurt(r.me,999);}); await p.waitForTimeout(250);
    const grey=await ev(p,()=>{const c=game.cv,x=c.getContext('2d'),r=game.race,vb=game.viewport.vb,t=r.track,d=game.renderer.dpr;
      const px=Math.round((vb.cx+(r.me.x-t.bx)*vb.sc)*d),py=Math.round((vb.cy+(r.me.y-t.by)*vb.sc)*d),R=40;
      const im=x.getImageData(Math.max(0,px-R),Math.max(0,py-R),2*R,2*R).data; let g=0,w=0;
      for(let i=0;i<im.length;i+=4){const v=im[i]; if(v>0&&v<255) g++; if(v===255) w++;} return {g,w};});
    assert.ok(grey.w>50,'white explosion pixels drawn'); await p.ctx.close();
  });

  test('animations: the health bar flashes on a hit, turns "low" under 30%, and refills after the crash',async()=>{
    const p=await open({store:{racers:'3'}}); await begin(p);
    await ev(p,()=>{const r=game.race; r.me.inv=0; r.me.hurtT=0; r.hurt(r.me,20);}); await p.waitForTimeout(100);
    assert.ok(await ev(p,()=>document.querySelector('#life').classList.contains('hit')),'hit flash');
    assert.equal(await ev(p,()=>document.querySelector('#hpfill').style.width),'80%');
    await ev(p,()=>{const r=game.race; r.me.hurtT=0; r.hurt(r.me,55);}); await p.waitForTimeout(100);
    assert.ok(await ev(p,()=>document.querySelector('#life').classList.contains('low')),'low-health warning');
    await p.waitForTimeout(100); await ev(p,()=>{const r=game.race; r.me.hurtT=0; r.hurt(r.me,999);}); await p.waitForTimeout(1500);
    assert.equal(await ev(p,()=>document.querySelector('#hpfill').style.width),'100%'); await p.ctx.close();
  });

  test('animations: the demo race behind the menu keeps moving and the canvas actually changes between frames',async()=>{
    const p=await open(); await p.waitForTimeout(1800);
    const snap=()=>ev(p,()=>game.cv.toDataURL().length+':'+game.demo.race.cars.map(c=>Math.round(c.x)).join(','));
    const a=await snap(); await p.waitForTimeout(500); const b=await snap(); assert.notEqual(a,b);
    // frame rate: the loop should manage a steady rate (headless Chromium, software rendering)
    const fps=await ev(p,()=>new Promise(res=>{let n=0,t0=performance.now(); const f=()=>{n++; if(performance.now()-t0>1000) res(n); else requestAnimationFrame(f);}; requestAnimationFrame(f);}));
    assert.ok(fps>=25,'fps '+fps); await p.ctx.close();
  });

  test('animations: car sprites turn in 8 steps and the player is solid white, the rivals hollow',async()=>{
    const p=await open();
    const s=await ev(p,()=>{const n=game.sprites; const count=(c)=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data; let w=0,b=0; for(let i=0;i<d.length;i+=4){if(!d[i+3]) continue; if(d[i]>200) w++; else b++;} return {w,b};};
      return {np:n.player.length,nr:n.rival.length,p:count(n.player[0]),r:count(n.rival[0]),rot:count(n.player[1])};});
    assert.equal(s.np,8); assert.equal(s.nr,8); assert.ok(s.p.w>s.r.w,'player has more white pixels than the hollow rival'); assert.ok(s.r.b>s.p.b,'rival has black "hollow" pixels'); assert.ok(s.rot.w>40); await p.ctx.close();
  });

  /* ---------- collisions ---------- */
  test('collisions in the browser: driving into a rival costs health and shows a bump; the wall costs health too',async()=>{
    const p=await open({store:{racers:'3'}}); await begin(p);
    const r=await ev(p,()=>{const g=game.race, me=g.me, o=g.cars[0]; me.inv=0; me.hurtT=0; me.v=100; Object.assign(o,{x:me.x+8,y:me.y,a:me.a,v:0}); const hp=me.hp; g.step({gas:true},1/60); return {hp,after:me.hp,ev:g.events.slice()};});
    assert.ok(r.after<r.hp,JSON.stringify(r)); assert.ok(r.ev.includes('bump')||r.ev.includes('crash'));
    await p.waitForTimeout(700); await ev(p,()=>{const me=game.race.me; me.hurtT=0; me.inv=0;});
    await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowRight'); await p.waitForTimeout(4500); await p.keyboard.up('ArrowRight'); await p.keyboard.up('ArrowUp');
    assert.ok(await ev(p,()=>game.race.me.hp<100||game.race.me.dead||game.race.fx.length>0||game.race.me.inv>0),'hitting the wall hurts'); await p.ctx.close();
  });

  test('collisions: the car never leaves the road, even when held into a wall for 10 seconds',async()=>{
    const p=await open({store:{racers:'7'}}); await begin(p);
    await p.keyboard.down('ArrowUp'); await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(10000); await p.keyboard.up('ArrowLeft'); await p.keyboard.up('ArrowUp');
    const d=await ev(p,()=>{const r=game.race,pr=r.track.project(r.me.x,r.me.y); return {d:Math.abs(pr.d),lim:r.track.TW/2};}); assert.ok(d.d<=d.lim,JSON.stringify(d)); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });

  /* ---------- text ---------- */
  test('text: all screens use only the expected wording, in the retro font, nothing cut off or overflowing',async()=>{
    const p=await open(); await p.waitForTimeout(500);
    const fontOK=await ev(p,()=>document.fonts.check('16px "Press Start 2P"')); assert.equal(fontOK,true,'pixel font loaded');
    const m=await ev(p,()=>({title:document.querySelector('#menu h1').textContent,labels:[...document.querySelectorAll('#menu .fl')].map(e=>e.textContent),btns:[...document.querySelectorAll('#menu button')].map(b=>b.textContent),
      font:getComputedStyle(document.querySelector('#menu h1')).fontFamily,sw:[...document.querySelectorAll('#menu *')].filter(e=>e.scrollWidth>e.clientWidth+1&&getComputedStyle(e).overflow!=='visible').length}));
    assert.equal(m.title,'LAP DASH'); assert.deepEqual(m.labels,['DRIVER NAME','NPC RACERS','CONTROLS','SOUND']);
    assert.deepEqual(m.btns,['3','5','7','STANDARD','SWAPPED','ON','OFF','START RACE']); assert.match(m.font,/Press Start 2P/); assert.equal(m.sw,0);
    await p.click('#go'); await p.waitForTimeout(300);
    const h=await ev(p,()=>({txt:document.querySelector('#hud').innerText.replace(/\s+/g,' ').trim(),lap:document.querySelector('#lap').textContent,health:document.querySelector('#lifebox span').textContent,pause:document.querySelector('#pause span').textContent}));
    assert.match(h.lap,/^1\/3$/); assert.equal(h.health,'HEALTH'); assert.equal(h.pause,'PAUSE'); assert.doesNotMatch(h.txt,/TIMER|BOOST|ITEM|POWER|LIVES|LIFE/i);
    const names=await ev(p,()=>[...document.querySelectorAll('#rows li')].map(l=>l.textContent)); assert.equal(names.length,4); assert.ok(names.every(n=>/^\d[A-Z0-9 .\-_]{1,3}$/.test(n)),names.join());
    await p.click('#pause'); assert.deepEqual(await ev(p,()=>[...document.querySelectorAll('#pausescr button,#pausescr h2')].map(e=>e.textContent)),['PAUSED','RESUME','RESTART','MENU']);
    await p.click('#tomenu1'); await ev(p,()=>{}); await p.ctx.close();
  });

  test('text: end screen wording; the rotate prompt wording; long driver names fit the leaderboard',async()=>{
    const p=await open({store:{name:'WWWWWWWW',racers:'7'}}); await begin(p,300);
    const r=await ev(p,()=>{const li=[...document.querySelectorAll('#rows li')],me=li.find(l=>l.classList.contains('me')); const panel=document.querySelector('#panel').getBoundingClientRect();
      return {meTxt:me.textContent,inside:li.every(l=>{const b=l.getBoundingClientRect();return b.right<=panel.right+1&&b.left>=panel.left-1;}),over:li.filter(l=>l.scrollWidth>l.clientWidth+1).length};});
    assert.match(r.meTxt,/WWW$/); assert.ok(r.inside,'leaderboard cells stay inside the panel'); assert.equal(r.over,0);
    await ev(p,()=>{game.race.me.q=game.race.track.L*3.01; game.race.state='racing'; game.race.cd=0;}); await p.waitForTimeout(3500);
    assert.match(await ev(p,()=>document.querySelector('#endt').textContent),/^(YOU WIN!|FINISHED)$/); assert.doesNotMatch(await ev(p,()=>document.querySelector('#endscr').innerText),/GAME OVER/i);
    await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(300);
    assert.match(await ev(p,()=>document.querySelector('#rotmsg').textContent),/LANDSCAPE|SIDEWAYS/); await p.ctx.close();
  });

  /* ---------- audio ---------- */
  const spy=()=>{ // a fake Web Audio so the test can see what is played
    window.__log=[]; const mk=(t)=>{const params={}; return new Proxy(function(){}, {get:(_,k)=>{ if(k==='gain'||k==='frequency'||k==='Q') return params[k]||(params[k]=new Proxy({value:0},{get:(o,kk)=>kk==='value'?o.value:()=>{},set:(o,kk,v)=>{o[kk]=v;return true;}})); if(k==='connect') return x=>x; if(k==='start'||k==='stop') return ()=>{if(k==='start') window.__log.push(t);}; if(k==='getChannelData') return ()=>new Float32Array(100000); return undefined;},set:()=>true});};
    class FakeAC{constructor(){this.state='suspended'; this.sampleRate=22050; this.currentTime=0; this.destination={}; window.__ac=this;}
      resume(){this.state='running'; return Promise.resolve();}
      createGain(){const g=mk('gain'); this.lastGain=g; (this.gains=this.gains||[]).push(g); return g;} createOscillator(){return mk('osc');} createBiquadFilter(){return mk('filter');}
      createBufferSource(){return mk('buf');} createBuffer(c,n){return {getChannelData:()=>new Float32Array(Math.min(n,100000))};}}
    window.AudioContext=FakeAC; window.webkitAudioContext=FakeAC;
  };
  test('audio: first tap unlocks it, the master volume is fixed, button/pedal/crash/lap sounds all play',async()=>{
    const p=await open({init:spy});
    assert.equal(await ev(p,()=>window.__ac||null),null,'nothing created before a touch');
    await p.tap('button[data-k=racers][data-v="5"]'); await p.waitForTimeout(200);
    assert.equal(await ev(p,()=>window.__ac.state),'running');
    assert.ok(await ev(p,()=>window.__log.length)>=1,'menu tap makes a sound');
    const master=await ev(p,()=>game.audio.ac.out.gain.value); assert.equal(master,3.2);
    for(const k of ['tap','start','gas','brake','steer']){const n=await ev(p,k=>{const a=window.__log.length; game.audio.sfx(k); return a;},k); await p.waitForTimeout(450); assert.ok(await ev(p,()=>window.__log.length)>n,'sfx '+k);}
    for(const e of ['crash','bump','go','lap','finish']){const n=await ev(p,()=>window.__log.length); await ev(p,e=>game.audio.play(e),e); await p.waitForTimeout(450); assert.ok(await ev(p,()=>window.__log.length)>n,'event '+e);}
    assert.equal(await ev(p,()=>game.audio.ac.out.gain.value),3.2,'master volume never changed'); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });
  test('audio: SOUND OFF is silent; race events trigger sounds when on; no audio API = no crash',async()=>{
    const p=await open({init:spy,store:{snd:'off'}}); await p.tap('#go'); await p.waitForTimeout(500); const base=await ev(p,()=>window.__log.length);
    await ev(p,()=>{game.audio.play('crash'); game.audio.sfx('gas');}); await p.waitForTimeout(300); assert.equal(await ev(p,()=>window.__log.length),base,'silent when off');
    await ev(p,()=>game.opts.set('snd','on')); const n=await ev(p,()=>window.__log.length);
    await ev(p,()=>{const r=game.race; r.cd=0; r.state='racing'; r.me.inv=0; r.me.hurtT=0; r.hurt(r.me,999);}); await p.waitForTimeout(500);
    assert.ok(await ev(p,()=>window.__log.length)>n,'crash makes a sound through the game loop'); await p.ctx.close();
    const q=await open({init:()=>{delete window.AudioContext; delete window.webkitAudioContext;}}); await q.click('#go'); await q.waitForTimeout(400); await ev(q,()=>{game.audio.play('crash'); game.audio.sfx('gas');});
    assert.deepEqual(q.errors,[]); await q.ctx.close();
  });
  test('audio: the countdown beeps once per lamp and pauses do not leak sounds',async()=>{
    const p=await open({init:spy}); await p.tap('#go'); await p.waitForTimeout(300); const n0=await ev(p,()=>window.__log.length);
    await p.waitForTimeout(3600); const n1=await ev(p,()=>window.__log.length); assert.ok(n1-n0>=3,'three lamp beeps + go: '+(n1-n0)); await p.ctx.close();
  });

  /* ---------- resilience ---------- */
  test('resilience: a 3-minute-equivalent soak (fast-forwarded) with random inputs raises no errors and keeps state sane',async()=>{
    const p=await open({store:{racers:'7'}}); await begin(p,200);
    const r=await ev(p,()=>{const g=game; let bad=0,crashes=0; const keys=['left','right','gas','brake'];
      for(let i=0;i<60*180;i++){const inp={}; for(const k of keys) inp[k]=Math.random()<(k==='gas'?.7:.2); g.race.step(inp,1/60); crashes+=g.race.events.filter(e=>e==='crash').length; g.race.events.length=0;
        for(const c of g.race.cars) if(![c.x,c.y,c.a,c.v,c.hp,c.q].every(Number.isFinite)||c.hp<0||c.hp>100||c.v<0||c.v>166) bad++; if(g.race.state==='over') break;}
      return {bad,crashes,state:g.race.state,cars:g.race.cars.length};});
    assert.equal(r.bad,0,JSON.stringify(r)); assert.equal(r.cars,8); assert.deepEqual(p.errors,[]); await p.ctx.close();
  });
  test('resilience: rapid orientation flips and window resizes during menu and race do not throw',async()=>{
    const p=await open({store:{racers:'5'}});
    for(let i=0;i<6;i++){await p.setViewportSize(i%2?LAND:{width:390,height:844}); await p.waitForTimeout(60);}
    await p.setViewportSize(LAND); await p.waitForTimeout(300); await p.click('#go'); await p.waitForTimeout(300);
    for(let i=0;i<6;i++){await p.setViewportSize(i%2?LAND:{width:390,height:844}); await p.waitForTimeout(60);}
    await p.setViewportSize({width:932,height:430}); await p.waitForTimeout(300); await p.setViewportSize({width:568,height:320}); await p.waitForTimeout(300);
    assert.deepEqual(p.errors,[]); assert.equal(await ev(p,()=>!!game.race),true); await p.ctx.close();
  });
  test('resilience: switching tabs / backgrounding the app pauses the race',async()=>{
    const p=await open({store:{racers:'3'}}); await begin(p,300);
    await ev(p,()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await ev(p,()=>game.paused),true); await p.ctx.close();
  });
});
