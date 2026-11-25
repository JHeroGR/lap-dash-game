#!/usr/bin/env node
// Regenerates docs/screenshots/*.png from the dev build (uses the bundled Press Start 2P font).  npm run screenshots
const {chromium}=require('playwright'); const path=require('path'),fs=require('fs');
const file='file://'+path.join(__dirname,'..','index.html'), out=path.join(__dirname,'..','docs','screenshots')+'/';
fs.mkdirSync(out,{recursive:true});
(async()=>{
  const b=await chromium.launch();
  async function open(w,h,racers){
    const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:2,hasTouch:true}); const p=await c.newPage();
    await p.addInitScript(r=>{try{localStorage.setItem('lapdash.v1',JSON.stringify({ver:3,name:'PLAYER',racers:r}))}catch(e){}},racers);
    p.on('pageerror',e=>{console.error('PAGE ERROR',e.message);process.exitCode=1;});
    await p.goto(file); await p.evaluate(()=>document.fonts.load('16px "Press Start 2P"')); await p.waitForTimeout(500); return p;
  }
  let p=await open(390,844,'3'); await p.screenshot({path:out+'01-turn-your-phone.png'});
  await p.setViewportSize({width:844,height:390}); await p.waitForTimeout(4500); await p.screenshot({path:out+'02-menu.png'});
  await p.click('button[data-k=racers][data-v="7"]'); await p.waitForTimeout(2500); await p.screenshot({path:out+'03-menu-7-racers.png'});
  await p.context().close();
  for(const [r,n] of [['3','easy'],['5','moderate'],['7','hard']]){
    p=await open(844,390,r); await p.click('#go');
    await p.waitForTimeout(2300); if(r==='3') await p.screenshot({path:out+'04-stoplight-countdown.png'});
    await p.waitForTimeout(1500); if(r==='3') await p.screenshot({path:out+'05-stoplight-go.png'});
    await p.waitForTimeout(4500); await p.screenshot({path:out+`06-race-${r}-racers-${n}.png`});
    if(r==='7'){
      await p.evaluate(()=>{race.me.inv=0;race.me.hurtT=0;hurt(race,race.me,40);}); await p.waitForTimeout(300); await p.screenshot({path:out+'07-health-bar.png'});
      await p.evaluate(()=>{race.me.inv=0;race.me.hurtT=0;hurt(race,race.me,999);}); await p.waitForTimeout(220); await p.screenshot({path:out+'08-explosion.png'});
      await p.waitForTimeout(1800); await p.click('#pause'); await p.waitForTimeout(300); await p.screenshot({path:out+'09-paused.png'});
      await p.click('#resume'); await p.waitForTimeout(200);
      await p.evaluate(()=>{race.state='over';refresh(race);}); await p.waitForTimeout(500); await p.screenshot({path:out+'10-finish.png'});
    }
    await p.context().close();
  }
  p=await open(844,390,'5'); await p.click('#go'); await p.waitForTimeout(5200);
  await p.setViewportSize({width:390,height:844}); await p.waitForTimeout(500); await p.screenshot({path:out+'11-paused-turn-phone.png'});
  await b.close(); console.log('screenshots written to docs/screenshots/');
})();
