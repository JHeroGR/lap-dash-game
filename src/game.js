/* Lap Dash game shell: menu, HUD, controls, rendering, audio. Uses everything defined in engine.js. */
/* ---------- UI ---------- */
const $=s=>document.querySelector(s);
const el=(tag,cls,txt)=>{const e=document.createElement(tag); if(cls)e.className=cls; if(txt!=null)e.textContent=txt; return e;};
const app=$('#app'), cv=$('#cv'), ctx=cv.getContext('2d');
const menu=$('#menu'), hud=$('#hud'), pausescr=$('#pausescr'), endscr=$('#endscr');
const rows=$('#rows'), lifeEl=$('#life'), hpFill=$('#hpfill'), lightEl=$('#light'), lamps=[...lightEl.children];
const TOPH_L=64;                 // height reserved for the top bar in landscape

const FIELDS=[
  {key:'racers',label:'NPC RACERS',vals:[['3','3'],['5','5'],['7','7']]},
  {key:'hand',label:'CONTROLS',vals:[['std','STANDARD'],['swap','SWAPPED']]},
  {key:'snd',label:'SOUND',vals:[['on','ON'],['off','OFF']]}
];
const DEF={name:'PLAYER',racers:'3',hand:'std',snd:'on'};
const opts=Object.assign({},DEF);
try{
  const s=JSON.parse(localStorage.getItem('lapdash.v1')||'{}');
  if(typeof s.name==='string') opts.name=s.name;
  for(const f of FIELDS){
    if(typeof s[f.key]==='string'&&f.vals.some(v=>v[0]===s[f.key])) opts[f.key]=s[f.key];
  }
}catch(e){}
const save=()=>{try{localStorage.setItem('lapdash.v1',JSON.stringify(Object.assign({ver:3},opts)));}catch(e){}};
const cleanName=v=>(String(v||'').toUpperCase().replace(/[^A-Z0-9 .\-_]/g,'').trim().slice(0,8))||'PLAYER';
const ord=n=>n+['TH','ST','ND','RD'][(n%100>=11&&n%100<=13)?0:(n%10<4?n%10:0)];

/* audio: square-wave beeps and a 1-bit arcade explosion */
let AC=null;
const LOUD=3.2;   // one fixed master volume for every sound; nothing ramps or changes it
function ac(){
  try{
    if(!AC){
      AC=new (window.AudioContext||window.webkitAudioContext)();
      const g=AC.createGain(); g.gain.value=LOUD; g.connect(AC.destination); AC.out=g;
    }
    if(AC.state==='suspended')AC.resume();
  }catch(e){}
  return AC;
}
// Phones keep audio locked until a touch. Wait for the context to be running before scheduling any sound, so the first tap is heard too.
function aud(fn){
  if(opts.snd!=='on') return; const a=ac(); if(!a) return;
  if(a.state==='running') fn(a); else a.resume().then(()=>fn(a)).catch(()=>{});
}
function beep(f,d,type,vol){
  aud(a=>{
  try{
    const o=a.createOscillator(), g=a.createGain(), t=a.currentTime; vol=vol||.05;
    o.type=type||'square'; o.frequency.value=f; o.connect(g); g.connect(a.out);
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); o.start(t); o.stop(t+d+.02);
  }catch(e){}
  });
}
// light racing sounds: engine blips for buttons, pedal sounds for GAS and BRK
function rev(f0,f1,d,vol,lp){
  aud(a=>{
  try{
    const t=a.currentTime, o=a.createOscillator(), f=a.createBiquadFilter(), g=a.createGain();
    o.type='sawtooth'; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(f1,t+d);
    f.type='lowpass'; f.frequency.value=lp||900;
    g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+Math.min(.02,d/3)); g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(f); f.connect(g); g.connect(a.out); o.start(t); o.stop(t+d+.03);
  }catch(e){}
  });
}
function squeal(d,vol){
  aud(a=>{
  try{
    const n=Math.floor(a.sampleRate*d), buf=a.createBuffer(1,n,a.sampleRate), ch=buf.getChannelData(0);
    for(let i=0;i<n;i++) ch[i]=(Math.random()*2-1)*(1-i/n);
    const s=a.createBufferSource(), f=a.createBiquadFilter(), g=a.createGain(), t=a.currentTime;
    f.type='bandpass'; f.Q.value=6; f.frequency.setValueAtTime(2200,t); f.frequency.exponentialRampToValueAtTime(1100,t+d);
    g.gain.value=vol; s.buffer=buf; s.connect(f); f.connect(g); g.connect(a.out); s.start(t);
  }catch(e){}
  });
}
function sfx(k){
  if(k==='gas') rev(85,190,.16,.07,1100);
  else if(k==='brake'){squeal(.11,.09); rev(120,70,.09,.04,500);}
  else if(k==='steer') beep(520,.025,'square',.025);
  else if(k==='start'){rev(70,300,.38,.09,1400); setTimeout(()=>rev(150,330,.2,.06,1400),260);}
  else rev(110,230,.09,.06,1000);                       // menu tap: a quick rev blip
}
function boom(){
  aud(a=>{
  try{
    // crunchy 1-bit noise: the noise rate falls over time and the volume drops in coarse steps, like an old arcade chip
    const n=Math.floor(a.sampleRate*.8), buf=a.createBuffer(1,n,a.sampleRate), ch=buf.getChannelData(0);
    let val=1;
    for(let i=0;i<n;i++){
      const t=i/n, hold=Math.max(1,Math.floor(3+t*t*90));
      if(i%hold===0) val=Math.random()<.5?-1:1;
      ch[i]=val*Math.round(Math.pow(1-t,1.5)*7)/7;
    }
    const s=a.createBufferSource(), g=a.createGain(); g.gain.value=.15; s.buffer=buf; s.connect(g); g.connect(a.out); s.start();
    // square-wave thump that drops in pitch
    const o=a.createOscillator(), og=a.createGain(), t0=a.currentTime;
    o.type='square'; o.frequency.setValueAtTime(170,t0); o.frequency.exponentialRampToValueAtTime(28,t0+.42);
    og.gain.setValueAtTime(.09,t0); og.gain.exponentialRampToValueAtTime(.0001,t0+.48);
    o.connect(og); og.connect(a.out); o.start(t0); o.stop(t0+.5);
  }catch(e){}
  });
}

/* ---------- menu ---------- */
function syncMenu(){
  for(const b of document.querySelectorAll('.seg .opt')) b.setAttribute('aria-pressed',String(opts[b.dataset.k]===b.dataset.v));
}
function buildMenu(){
  const grid=$('#grid');
  for(const f of FIELDS){
    const wrap=el('div','field'), lab=el('span','fl',f.label), seg=el('div','seg');
    lab.id='l-'+f.key; seg.setAttribute('role','group'); seg.setAttribute('aria-labelledby',lab.id);
    for(const [v,t] of f.vals){
      const b=el('button','opt',t); b.type='button'; b.dataset.k=f.key; b.dataset.v=v;
      b.onclick=()=>{opts[f.key]=v; save(); layout(); buildControls(); syncMenu(); if(f.key==='racers') switchDemo();};
      seg.append(b);
    }
    wrap.append(lab,seg);
    grid.append(wrap);
  }
  $('#name').value=opts.name;
}

/* unlock audio on the very first touch (iPhone needs a silent sound played inside the gesture) */
function unlockAudio(){
  const a=ac(); if(!a) return;
  try{const b=a.createBuffer(1,1,22050), src=a.createBufferSource(); src.buffer=b; src.connect(a.out); src.start(0);}catch(e){}
  for(const ev of ['touchend','pointerup','keydown','click']) removeEventListener(ev,unlockAudio,true);
}
for(const ev of ['touchend','pointerup','keydown','click']) addEventListener(ev,unlockAudio,true);

/* button sounds: pedals on press, everything else on click */
document.addEventListener('pointerdown',e=>{
  const b=e.target.closest&&e.target.closest('button.tb'); if(!b) return;
  const k=b.getAttribute('aria-label'); sfx(k==='gas'?'gas':k==='brake'?'brake':'steer');
});
document.addEventListener('click',e=>{
  const b=e.target.closest&&e.target.closest('button'); if(!b||b.classList.contains('tb')) return;
  sfx(['go','again','restart1','resume'].includes(b.id)?'start':'tap');
});

/* ---------- controls ---------- */
const inp={left:false,right:false,gas:false,brake:false};
const tc={left:false,right:false,gas:false,brake:false}, kb={left:false,right:false,gas:false,brake:false};
const btns={};
function makeBtn(k,label){
  const b=el('button','tb',label); b.type='button'; b.setAttribute('aria-label',k);
  const on=e=>{e.preventDefault(); tc[k]=true; b.classList.add('on'); try{b.setPointerCapture(e.pointerId);}catch(_){}};
  const off=()=>{tc[k]=false; b.classList.remove('on');};
  b.addEventListener('pointerdown',on);
  b.addEventListener('pointerup',off); b.addEventListener('pointercancel',off); b.addEventListener('lostpointercapture',off);
  b.addEventListener('contextmenu',e=>e.preventDefault());
  btns[k]=b; return b;
}
makeBtn('left','<'); makeBtn('right','>'); makeBtn('brake','BRK'); makeBtn('gas','GAS');
function buildControls(){
  const steer=[btns.left,btns.right], ped=[btns.brake,btns.gas];
  $('#ctrlL').replaceChildren(...(opts.hand==='swap'?ped:steer));
  $('#ctrlR').replaceChildren(...(opts.hand==='swap'?steer:ped));
}
function clearInputs(){for(const k in tc){tc[k]=false; kb[k]=false; btns[k].classList.remove('on');}}
const KEYS={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'gas',w:'gas',W:'gas',ArrowDown:'brake',s:'brake',S:'brake'};
addEventListener('keydown',e=>{
  const k=KEYS[e.key];
  if(k&&!hud.hidden&&!paused){kb[k]=true; e.preventDefault();}
  else if((e.key==='p'||e.key==='P'||e.key==='Escape')&&!hud.hidden&&race&&race.state!=='over') togglePause();
});
addEventListener('keyup',e=>{const k=KEYS[e.key]; if(k) kb[k]=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&race&&!hud.hidden&&!paused&&race.state!=='over') togglePause();});

/* ---------- track path (for drawing) ---------- */
let TRACK_PATH=null;
function setTrack(id,kx){
  buildTrack(id,kx);
  const p=new Path2D(), g0=T.segs[0];
  p.moveTo(g0.x0,g0.y0);
  for(const g of T.segs){
    if(g.k==='L') p.lineTo(g.x0+g.co*g.len,g.y0+g.si*g.len);
    else p.arc(g.cx,g.cy,g.r,g.a0,g.a0+g.sg*g.ang,g.sg<0);
  }
  p.closePath(); TRACK_PATH=p;
}
setTrack(3,1);

/* ---------- layout / orientation ---------- */
let view='h', dpr=1, race=null, paused=false, endShown=false;
let VB={cx:0,cy:0,sc:1};
// Free area for the track: under the top bar and above the controls. An upright track on a portrait screen also
// keeps clear of the stoplight on the left; every other case is centred side to side.
function availBox(){
  const w=app.clientWidth, h=app.clientHeight, portrait=h>w, hudOn=!hud.hidden;
  const appTop=app.getBoundingClientRect().top;
  const top=hudOn?$('#top').getBoundingClientRect().bottom-appTop+4:10;
  const bot=hudOn?0:10;
  const left=(hudOn&&!(portrait&&view==='h'))?lightEl.offsetWidth+26:0;   // keep clear of the stoplight (it sits above the track in an upright-phone horizontal view)
  return {w,h,portrait,top,bot,left,aw:w-left,ah:h-top-bot};
}
function computeVB(){
  const A=availBox(); if(!A.w||!A.h) return;
  const vw=view==='v'?T.bh:T.bw, vh=view==='v'?T.bw:T.bh;
  VB={cx:A.left+A.aw/2,cy:A.top+A.ah/2,sc:Math.min(A.aw/vw,A.ah/vh)};
}
function layout(){
  const w=app.clientWidth, h=app.clientHeight; if(!w||!h) return;
  dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.round(w*dpr); cv.height=Math.round(h*dpr);
  view='h';                                   // the race is always shown sideways
  app.dataset.view=view; app.classList.toggle('portrait',h>w);
  computeVB();
  if(!menu.hidden&&demo&&demoSig!==w+'x'+h) startDemo();
  updateRotate();
}
// Everything is landscape: an upright phone gets a "turn your phone" screen (menu included), and a race in progress is paused until it is sideways again.
const rotEl=$('#rotate');
const isLand=()=>app.clientWidth>=app.clientHeight;
function updateRotate(){
  const land=isLand(), inRace=race&&!hud.hidden&&race.state!=='over';
  if(land){rotEl.hidden=true; return;}
  if(inRace&&!paused){paused=true; pausescr.hidden=false; clearInputs();}
  $('#rotmsg').textContent=inRace?'THE RACE IS PAUSED. HOLD YOUR PHONE SIDEWAYS (LANDSCAPE) TO CARRY ON.':'HOLD YOUR PHONE SIDEWAYS (LANDSCAPE) TO PLAY.';
  rotEl.hidden=false;
}
// Build the chosen track for this screen: stretched sideways (along the long side of the free area) when the screen is wider than the track.
function fitTrack(){
  const id=+opts.racers, A=availBox();
  setTrack(id,1);
  const pad=T.TW/2+T.EDGE/2+8, w0=T.bw-2*pad, want=view==='v'?A.ah/A.aw:A.aw/A.ah;
  setTrack(id,clamp((want*T.bh-2*pad)/w0,1,1.9));   // stretch sideways so the track fills the free area
}
new ResizeObserver(layout).observe(app);
addEventListener('resize',layout);
addEventListener('orientationchange',()=>setTimeout(layout,150));

/* ---------- pixel-art car sprites ---------- */
// 15x9 pixels, nose pointing right. # white, o black, . empty. Baked at 8 headings so turning steps like an old arcade game.
const SPR=[
  '..###....###...',
  '#####....###..#',
  '#########.....#',
  '#####oo########',
  '######o########',
  '#####oo########',
  '#########.....#',
  '#####....###..#',
  '..###....###...'
];
const SW=15, SH=9, SS=21, NANG=8, PXU=3.5;
function hollow(src){
  const at=(r,c)=>r>=0&&r<SH&&c>=0&&c<SW&&src[r][c]!=='.';
  return src.map((row,r)=>[...row].map((ch,c)=>(ch==='#'&&at(r-1,c)&&at(r+1,c)&&at(r,c-1)&&at(r,c+1))?'o':ch).join(''));
}
function bakeSprites(src){
  const out=[];
  for(let k=0;k<NANG;k++){
    const th=k*TAU/NANG, co=Math.cos(th), si=Math.sin(th);
    const cvs=document.createElement('canvas'); cvs.width=cvs.height=SS;
    const c=cvs.getContext('2d'), img=c.createImageData(SS,SS);
    for(let y=0;y<SS;y++) for(let x=0;x<SS;x++){
      const dx=x+.5-SS/2, dy=y+.5-SS/2;
      const sx=Math.floor(dx*co+dy*si+SW/2), sy=Math.floor(-dx*si+dy*co+SH/2);
      if(sx<0||sy<0||sx>=SW||sy>=SH) continue;
      const ch=src[sy][sx]; if(ch==='.') continue;
      const i=(y*SS+x)*4, v=ch==='#'?255:0;
      img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255;
    }
    c.putImageData(img,0,0); out.push(cvs);
  }
  return out;
}
const SPR_P=bakeSprites(SPR), SPR_A=bakeSprites(hollow(SPR));
function drawCar(c,x,y,a,solid,U){
  U=U||PXU;
  const k=((Math.round(a/(TAU/NANG))%NANG)+NANG)%NANG, sz=SS*U;
  c.imageSmoothingEnabled=false;
  c.drawImage((solid?SPR_P:SPR_A)[k],x-sz/2,y-sz/2,sz,sz);
}

/* ---------- drawing ---------- */
function drawTrack(){
  const P=TRACK_PATH, W=T.TW;
  ctx.lineJoin='round'; ctx.lineCap='butt'; ctx.setLineDash([]);
  // road edge lines: a wide white stroke with a narrower black stroke on top leaves a 5px line on each side
  ctx.strokeStyle='#fff'; ctx.lineWidth=W+T.EDGE; ctx.stroke(P);
  ctx.strokeStyle='#000'; ctx.lineWidth=W-T.EDGE; ctx.stroke(P);
  // dashed rails just inside the edge lines
  ctx.strokeStyle='#fff'; ctx.setLineDash([12,12]); ctx.lineWidth=W-T.EDGE; ctx.stroke(P);
  ctx.setLineDash([]); ctx.strokeStyle='#000'; ctx.lineWidth=W-T.EDGE-16; ctx.stroke(P);
  // centre line
  ctx.strokeStyle='#777'; ctx.lineWidth=2.5; ctx.setLineDash([16,22]); ctx.stroke(P); ctx.setLineDash([]);
  // start grid boxes
  ctx.strokeStyle='#555'; ctx.lineWidth=1.5;
  const total=race?race.cars.length:T.id+1;
  for(let k=0;k<total;k++){const g=gridSlot(k), p=pointAt(g.s,g.d); ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.a); ctx.strokeRect(-34,-20,68,40); ctx.restore();}
  // checkered finish line
  const f=pointAt(T.FIN,0), q=W/12;
  ctx.save(); ctx.translate(f.x,f.y); ctx.rotate(f.a); ctx.fillStyle='#fff';
  for(let row=0;row<12;row++) for(let col=0;col<2;col++) if((row+col)%2===0) ctx.fillRect(-q+col*q,-W/2+row*q,q,q);
  ctx.restore();
}
// Pixel explosion: chunky square cells on a fixed grid, stepped at 14 frames a second.
const EXP_P=7;
function drawFx(f){
  const fr=Math.floor(f.t*14); if(fr>=15) return;
  const P=EXP_P;
  const hs=(a,b,c)=>{let h=Math.imul(a+101,73856093)^Math.imul(b+101,19349663)^Math.imul(c+7,83492791)^f.seed; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)%100;};
  ctx.save(); ctx.translate(f.x,f.y); ctx.fillStyle='#fff';
  const cell=(gx,gy,s)=>ctx.fillRect(gx*P-s/2,gy*P-s/2,s,s);
  if(fr<3){                                   // solid blast
    const rad=[2.2,3.4,4.4][fr];
    for(let gy=-5;gy<=5;gy++) for(let gx=-5;gx<=5;gx++) if(gx*gx+gy*gy<=rad*rad) cell(gx,gy,P);
  }else if(fr<11){                            // broken ring, expanding and thinning out
    const rad=3.6+(fr-3)*.9, keep=100-(fr-3)*9;
    for(let gy=-11;gy<=11;gy++) for(let gx=-11;gx<=11;gx++){
      const dd=Math.hypot(gx,gy);
      if(Math.abs(dd-rad)<=1.1&&hs(gx,gy,fr)<keep) cell(gx,gy,P);
      else if(fr<6&&dd<=2.1&&hs(gx,gy,fr+50)<70) cell(gx,gy,P);
    }
  }
  f.deb.forEach((d,i)=>{                      // flying square debris
    if(fr>=13||(fr>=9&&hs(i,0,fr)>=55)) return;
    const gx=Math.round(Math.cos(d.a)*d.v*f.t/P), gy=Math.round(Math.sin(d.a)*d.v*f.t/P);
    cell(gx,gy,(d.big&&fr<8)?P:P*.55);
  });
  ctx.restore();
}
function render(){
  const w=app.clientWidth, h=app.clientHeight;
  ctx.setTransform(dpr,0,0,dpr,0,0); ctx.fillStyle='#000'; ctx.fillRect(0,0,w,h);
  const R=(race&&!hud.hidden)?race:((!menu.hidden&&demo)?demo:null); if(!R) return;
  ctx.translate(VB.cx,VB.cy); if(view==='v') ctx.rotate(PI/2); ctx.scale(VB.sc,VB.sc); ctx.translate(-T.bx,-T.by);
  drawTrack();
  const me=R.me;
  for(const c of R.cars) if(!c.me) drawCar(ctx,c.x,c.y,c.a,false);
  if(!me.dead&&!(me.inv>0&&Math.floor(R.t*10)%2===0)) drawCar(ctx,me.x,me.y,me.a,true);
  for(const f of R.fx) drawFx(f);
}

/* ---------- HUD ---------- */
let boardKey='', lastLap='', lastLife=-1, lastSig='', lastRank=0;
function updateHUD(){
  const r=race, me=r.me;
  const lap=clamp(Math.max(Math.floor(me.q/T.L)+1,me.lapMin),1,r.laps), txt=lap+'/'+r.laps;
  if(txt!==lastLap){lastLap=txt; $('#lap').textContent=txt;}
  const hp=Math.ceil(me.hp);
  if(hp!==lastLife){
    if(lastLife>hp&&hp>0){lifeEl.classList.remove('hit'); void lifeEl.offsetWidth; lifeEl.classList.add('hit');}
    lastLife=hp; hpFill.style.width=hp+'%'; lifeEl.classList.toggle('low',hp<=30);
  }
  if(r.rank!==lastRank){lastRank=r.rank; $('#posn').textContent=r.rank;}
  const key=r.order.map(c=>c.name+(c.me?'*':'')).join('|');
  if(key!==boardKey){
    boardKey=key;
    rows.replaceChildren(...r.order.map((c,i)=>{const li=el('li',c.me?'me':''); li.title=c.name; li.append(el('b','',String(i+1)),el('span','',c.name.slice(0,3))); return li;}));
  }
  // stoplight: lamps come on one by one, then the third lamp flashes GO
  let lit=0, go=false;
  if(r.state==='countdown') lit=clamp(4-Math.ceil(r.cd),0,3); else if(r.goT>0) go=true;
  const vis=r.state==='countdown'||go, sig=(vis?'v':'h')+(go?'g':lit);
  if(sig!==lastSig){
    lastSig=sig; lightEl.classList.toggle('off',!vis);
    lamps.forEach((l,i)=>l.classList.toggle('on',!go&&lit>i));
    lamps[2].classList.toggle('go',go);
    if(lit>0&&!go) beep(440,.15);
  }
}
function drainEvents(){
  for(const e of race.events.splice(0)){
    if(e==='crash') boom(); else if(e==='bump') beep(120,.09,'square',.12); else if(e==='go') beep(880,.4); else if(e==='lap') {beep(660,.12); setTimeout(()=>beep(990,.15),130);}
    else if(e==='finish'){beep(660,.15); setTimeout(()=>beep(880,.15),160); setTimeout(()=>beep(1180,.3),320);}
  }
}

/* ---------- flow ---------- */
// A computer-only race plays behind the menu.
let demo=null, demoSig='';
function startDemo(){
  fitTrack(); demo=makeRace({name:'YOU',racers:+opts.racers}); demo.me.auto=true; demo.me.sf=.85; demo.me.hurtT=1e9; demo.cd=1.2;
  demoSig=app.clientWidth+'x'+app.clientHeight; computeVB();
}
// Picking a different racer count swaps the track under the demo race without restarting it: every car keeps its place
// (same share of the lap, same lane, same speed) on the new road, and any extra cars join at the back of the pack.
function switchDemo(){
  const old=demo;
  if(!old||old.state!=='racing'||old.cars.some(c=>c.fin||c.dead)){startDemo(); return;}
  const oldL=T.L, oldAI=old.cars.filter(c=>!c.me);
  const rel=new Map(old.cars.map(c=>[c,angDiff(pointAt(c.s,0).a,c.a)]));
  fitTrack(); const k=T.L/oldL;
  const r2=makeRace({name:'YOU',racers:+opts.racers});
  r2.me.auto=true; r2.me.sf=.85; r2.me.hurtT=1e9; r2.state='racing'; r2.cd=0; r2.t=old.t;
  let ai=0, rearQ=1e9, vSum=0, vN=0;
  for(const c of r2.cars){
    const src=c.me?old.me:oldAI[ai++]; if(!src) continue;
    c.q=src.q*k; c.s=wrapS(T.FIN+c.q); c.d=src.d; c.v=src.v; c.lane=src.lane; c.curD=src.curD; c.lapMin=src.lapMin; c.lapN=src.lapN;
    const pt=pointAt(c.s,c.d); c.x=pt.x; c.y=pt.y; c.a=pt.a+rel.get(src); c.placed=true;
    rearQ=Math.min(rearQ,c.q); vSum+=c.v; vN++;
  }
  let j=0;
  for(const c of r2.cars) if(!c.placed){
    j++; c.q=rearQ-70*j; c.s=wrapS(T.FIN+c.q); c.d=j%2?-26:26; c.lane=c.curD=c.d; c.v=vSum/Math.max(1,vN);
    const pt=pointAt(c.s,c.d); c.x=pt.x; c.y=pt.y; c.a=pt.a; c.lapMin=Math.max(1,Math.floor(c.q/T.L)+1); c.inv=1;
  }
  refresh(r2); demo=r2; demoSig=app.clientWidth+'x'+app.clientHeight; computeVB();
}
function showMenu(){
  race=null; paused=false; clearInputs();
  hud.hidden=true; pausescr.hidden=true; endscr.hidden=true; menu.hidden=false;
  syncMenu(); startDemo();
}
function startRace(){
  opts.name=cleanName($('#name').value); $('#name').value=opts.name; save(); ac();
  menu.hidden=true; endscr.hidden=true; pausescr.hidden=true; hud.hidden=false;
  layout(); fitTrack();
  race=makeRace({name:opts.name,racers:+opts.racers});
  endShown=false; paused=false; boardKey=''; lastLap=''; lastLife=-1; lastSig=''; lastRank=0;
  $('#posof').textContent='/'+race.cars.length;
  clearInputs(); buildControls();
  updateHUD(); layout();
}
function togglePause(){
  if(!race||hud.hidden) return;
  paused=!paused; pausescr.hidden=!paused; clearInputs();
}
function showEnd(){
  endShown=true; const r=race;
  const n=r.rank; $('#endt').textContent=n===1?'YOU WIN!':'FINISHED';
  $('#ends').textContent='YOU TOOK '+ord(n)+' PLACE OF '+r.cars.length+' RACERS.';
  endscr.hidden=false;
}
$('#go').onclick=startRace;
$('#again').onclick=startRace;
$('#restart1').onclick=startRace;
$('#resume').onclick=togglePause;
$('#pause').onclick=togglePause;
$('#tomenu1').onclick=showMenu;
$('#tomenu2').onclick=showMenu;
$('#name').addEventListener('input',e=>{opts.name=cleanName(e.target.value);});
$('#name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault(); startRace();}});

let last=0;
function frame(t){
  requestAnimationFrame(frame);
  const dt=Math.min(.033,(t-last)/1000||0); last=t;
  if(race&&!hud.hidden&&!paused){
    for(const k in inp) inp[k]=tc[k]||kb[k];
    stepRace(race,inp,dt); drainEvents(); updateHUD();
    if(race.state==='over'&&!endShown) showEnd();
  }
  else if(!menu.hidden&&demo){stepRace(demo,{},dt); demo.events.length=0; if(demo.state==='over') startDemo();}
  render();
}

function drawLogo(){
  const c=$('#logo').getContext('2d'); c.fillStyle='#000'; c.fillRect(0,0,280,110);
  c.fillStyle='#fff'; for(let x=0;x<280;x+=28) c.fillRect(x,92,14,4); for(let x=0;x<280;x+=28) c.fillRect(x+14,14,14,4);
  drawCar(c,140,54,0,true,3.6); drawCar(c,50,54,-.39,false,3.6); drawCar(c,230,56,.39,false,3.6);
}

buildMenu(); buildControls(); layout(); syncMenu(); drawLogo(); startDemo();
requestAnimationFrame(frame);
