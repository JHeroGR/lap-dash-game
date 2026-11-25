// Browser tests (Playwright + Chromium):  node --test tests/e2e.test.js
// Runs the same checks against the multi-file dev build (index.html) and the bundled single file (dist/lap-dash.html).
const test=require('node:test'), assert=require('node:assert/strict');
const path=require('path'), fs=require('fs');
let chromium; try{({chromium}=require('playwright'));}catch(e){}
const TARGETS={dev:path.join(__dirname,'..','index.html'),dist:path.join(__dirname,'..','dist','lap-dash.html')};
const LAND={width:844,height:390}, PORT={width:390,height:844};

if(!chromium){ test('playwright is installed',{skip:'playwright not available'},()=>{}); return; }
if(!fs.existsSync(TARGETS.dist)) require('child_process').execFileSync('node',[path.join(__dirname,'..','scripts','build.js')]);

for(const [name,file] of Object.entries(TARGETS)){
  test.describe(`browser: ${name}`,()=>{
    let browser;
    test.before(async()=>{browser=await chromium.launch();});
    test.after(async()=>{await browser.close();});

    async function open(viewport=LAND,{store}={}){
      const ctx=await browser.newContext({viewport,deviceScaleFactor:1,hasTouch:true});
      const p=await ctx.newPage(); p.errors=[];
      await p.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
      p.on('pageerror',e=>p.errors.push(e.message));
      p.on('console',m=>{if(m.type()==='error'&&!/ERR_FAILED|net::|Failed to load resource/.test(m.text())) p.errors.push(m.text());});
      if(store) await p.addInitScript(s=>localStorage.setItem('lapdash.v1',JSON.stringify(s)),store);
      await p.goto('file://'+file); await p.waitForTimeout(300);
      p.close2=()=>ctx.close(); return p;
    }
    const ev=(p,f,a)=>p.evaluate(f,a);
    const startRace=async(p,racers='3')=>{await p.click(`button[data-k=racers][data-v="${racers}"]`); await p.click('#go'); await p.waitForTimeout(250);};

    test('menu: landscape, three NPC-racer choices only, no clutter, demo race behind it',async()=>{
      const p=await open();
      const t=await ev(p,()=>({title:document.querySelector('#menu h1').textContent,text:document.querySelector('#menu').innerText,
        racers:[...document.querySelectorAll('button[data-k=racers]')].map(b=>b.dataset.v),
        scroll:[menu.scrollHeight,menu.clientHeight],rotHidden:document.querySelector('#rotate').hidden,demo:!!demo}));
      assert.equal(t.title.trim(),'LAP DASH'); assert.doesNotMatch(t.text,/TOP.?DOWN/i);
      assert.deepEqual(t.racers,['3','5','7']); assert.doesNotMatch(t.text,/VIEW|LAPS|DIFFICULT|HORIZ|VERT/i);
      assert.ok(t.scroll[0]<=t.scroll[1]+1,'menu fits without scrolling'); assert.ok(t.rotHidden); assert.ok(t.demo);
      await p.waitForTimeout(1600);                                   // past the demo's countdown
      const a=await ev(p,()=>demo.t); await p.waitForTimeout(800); assert.ok(await ev(p,()=>demo.t)>a,'demo race is running');
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    test('portrait asks for a landscape phone; turning it shows the menu',async()=>{
      const p=await open(PORT);
      assert.equal(await ev(p,()=>document.querySelector('#rotate').hidden),false);
      assert.match(await ev(p,()=>document.querySelector('#rotmsg').textContent),/SIDEWAYS|LANDSCAPE/);
      await p.setViewportSize(LAND); await p.waitForTimeout(600);
      assert.equal(await ev(p,()=>document.querySelector('#rotate').hidden),true);
      assert.equal(await ev(p,()=>menu.hidden),false);
      await p.setViewportSize(PORT); await p.waitForTimeout(300);
      assert.equal(await ev(p,()=>document.querySelector('#rotate').hidden),false);
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    test('changing the NPC count keeps the demo race running instead of restarting it',async()=>{
      const p=await open(); await p.waitForTimeout(3500);
      const before=await ev(p,()=>({t:demo.t,track:T.L,lap:demo.me.q/T.L}));
      await p.click('button[data-k=racers][data-v="7"]');
      const after=await ev(p,()=>({t:demo.t,track:T.L,n:demo.cars.length,lap:demo.me.q/T.L}));
      assert.ok(after.t>=before.t,'clock not reset'); assert.equal(after.n,8); assert.notEqual(after.track,before.track,'track swapped');
      assert.ok(Math.abs(after.lap-before.lap)<.06,'cars keep their place in the lap');
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    test('race: countdown, HUD, 3 laps, health bar and controls',async()=>{
      const p=await open(LAND,{store:{ver:3,name:'TESTER',racers:'5'}});
      await p.click('#go'); await p.waitForTimeout(300);
      const s=await ev(p,()=>({hud:!hud.hidden,menu:menu.hidden,state:race.state,cars:race.cars.length,laps:race.laps,lap:document.querySelector('#lap').textContent,hp:hpFill.style.width}));
      assert.equal(s.hud,true); assert.equal(s.menu,true); assert.equal(s.cars,6); assert.equal(s.laps,3);
      assert.match(s.lap,/1\s*\/\s*3/); assert.equal(s.hp,'100%');
      await p.waitForTimeout(3600);                                   // stoplight countdown
      await p.keyboard.down('ArrowUp'); await p.waitForTimeout(1500);
      const v=await ev(p,()=>race.me.v); assert.ok(v>40,'GAS accelerates (v='+v+')');
      const a0=await ev(p,()=>race.me.a); await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight');
      assert.notEqual(await ev(p,()=>race.me.a),a0,'steering turns the car');
      await p.keyboard.up('ArrowUp');
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    test('bumps lower the health bar; at zero the car explodes and restarts in the same spot with full health',async()=>{
      const p=await open(LAND,{store:{ver:3,name:'TESTER',racers:'3'}});
      await p.click('#go'); await p.waitForTimeout(4300);
      await ev(p,()=>{race.me.inv=0;race.me.hurtT=0;hurt(race,race.me,40);}); await p.waitForTimeout(100);
      assert.equal(await ev(p,()=>hpFill.style.width),'60%');
      const pos=await ev(p,()=>{race.me.inv=0;race.me.hurtT=0;hurt(race,race.me,999);return {x:race.me.x,y:race.me.y,dead:race.me.dead,fx:race.fx.length};});
      assert.equal(pos.dead,true); assert.ok(pos.fx>0,'explosion');
      await p.waitForTimeout(1700);
      const after=await ev(p,()=>({dead:race.me.dead,x:race.me.x,y:race.me.y,hp:race.me.hp,state:race.state,end:!document.querySelector('#endscr').hidden}));
      assert.equal(after.dead,false); assert.equal(after.hp,100); assert.equal(after.end,false,'no game-over screen');
      assert.ok(Math.hypot(after.x-pos.x,after.y-pos.y)<12,'respawn in the same place');
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    test('turning the phone mid-race pauses with a notice; resume works',async()=>{
      const p=await open(LAND,{store:{ver:3,name:'TESTER',racers:'3'}});
      await p.click('#go'); await p.waitForTimeout(4600);           // past the stoplight countdown
      await p.setViewportSize(PORT); await p.waitForTimeout(400);
      const s=await ev(p,()=>({paused,rot:!document.querySelector('#rotate').hidden,msg:document.querySelector('#rotmsg').textContent}));
      assert.equal(s.paused,true); assert.equal(s.rot,true); assert.match(s.msg,/PAUSED/);
      const t0=await ev(p,()=>race.t); await p.waitForTimeout(600); assert.equal(await ev(p,()=>race.t),t0,'time frozen');
      await p.setViewportSize(LAND); await p.waitForTimeout(400);
      assert.equal(await ev(p,()=>document.querySelector('#rotate').hidden),true);
      await p.click('#resume'); await p.waitForTimeout(500);
      assert.equal(await ev(p,()=>paused),false); assert.ok(await ev(p,()=>race.t)>t0,'race continues');
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    test('pause screen: restart and menu buttons; finish screen: race again and menu',async()=>{
      const p=await open(LAND,{store:{ver:3,name:'TESTER',racers:'3'}});
      await p.click('#go'); await p.waitForTimeout(1200);
      await p.click('#pause'); assert.equal(await ev(p,()=>paused),true);
      await p.click('#restart1'); await p.waitForTimeout(300); assert.equal(await ev(p,()=>paused),false); assert.ok(await ev(p,()=>race.t)<1);
      await ev(p,()=>{race.state='over';refresh(race);}); await p.waitForTimeout(400);
      const e=await ev(p,()=>({end:!document.querySelector('#endscr').hidden,t:document.querySelector('#endt').textContent,s:document.querySelector('#ends').textContent}));
      assert.equal(e.end,true); assert.match(e.t,/WIN|FINISHED/); assert.match(e.s,/PLACE OF 4 RACERS/);
      await p.click('#again'); await p.waitForTimeout(300); assert.equal(await ev(p,()=>!hud.hidden),true);
      await p.click('#pause'); await p.click('#tomenu1'); await p.waitForTimeout(300);
      assert.equal(await ev(p,()=>!menu.hidden),true); assert.ok(await ev(p,()=>!!demo));
      assert.deepEqual(p.errors,[]); await p.close2();
    });

    for(const racers of ['3','5','7']) for(const vp of [{width:844,height:390},{width:667,height:375}]){
      test(`layout: ${racers} racers at ${vp.width}x${vp.height}: HUD does not overlap, track is on screen`,async()=>{
        const p=await open(vp,{store:{ver:3,name:'TESTER',racers}});
        await p.click('#go'); await p.waitForTimeout(800);
        const r=await ev(p,()=>{
          const q=s=>{const r=document.querySelector(s).getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom}};
          const ids=['#lapbox','#lifebox','#panel'],rc=ids.map(q),W=innerWidth,H=innerHeight;
          const ov=(a,b)=>a.l<b.r-.5&&b.l<a.r-.5&&a.t<b.b-.5&&b.t<a.b-.5; let over=0;
          for(let i=0;i<rc.length;i++)for(let j=i+1;j<rc.length;j++) if(ov(rc[i],rc[j])) over++;
          const out=rc.some(a=>a.l<-.5||a.t<-.5||a.r>W+.5||a.b>H+.5);
          let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9; const pad=T.TW/2+T.EDGE/2;
          for(let u=0;u<T.L;u+=4)for(const d of [-pad,pad]){const p=pointAt(u,d),x=VB.cx+(p.x-T.bx)*VB.sc,y=VB.cy+(p.y-T.by)*VB.sc;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
          return {over,out,inside:x0>=-1&&y0>=-1&&x1<=W+1&&y1<=H+1,belowBar:y0>=Math.max(...rc.map(a=>a.b))-2};
        });
        assert.equal(r.over,0); assert.equal(r.out,false); assert.equal(r.inside,true); assert.equal(r.belowBar,true);
        assert.deepEqual(p.errors,[]); await p.close2();
      });
    }

    test('sound: audio unlocks on the first tap and button sounds run without errors',async()=>{
      const p=await open();
      await p.evaluate(()=>{window.__osc=0;const o=AudioContext.prototype.createOscillator;AudioContext.prototype.createOscillator=function(){window.__osc++;return o.call(this)};});
      await p.tap('button[data-k=racers][data-v="5"]'); await p.waitForTimeout(400);
      assert.equal(await ev(p,()=>AC&&AC.state),'running'); assert.ok(await ev(p,()=>window.__osc)>=1);
      await ev(p,()=>{for(const k of ['tap','start','gas','brake','steer']) sfx(k); boom();});
      assert.deepEqual(p.errors,[]); await p.close2();
    });
  });
}
