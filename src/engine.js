/* Lap Dash engine: geometry, tracks, cars, AI and race rules. No DOM access, so it also runs under Node for tests. */
const PI=Math.PI, TAU=PI*2;
const LAPS=3;                      // every race is 3 laps
const T={TW:136,EDGE:5,FIN:330,L:1,segs:[],bx:0,by:0,bw:1,bh:1,id:3,kx:1};
const wrapS=s=>((s%T.L)+T.L)%T.L;
const angDiff=(a,b)=>{let d=(b-a)%TAU; if(d>PI)d-=TAU; if(d<-PI)d+=TAU; return d;};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

/* ---- tracks ----
   Each track is a closed list of waypoints (clockwise on screen, first leg is the start straight, heading east)
   with a corner radius per waypoint. Corners are rounded into arcs, so the road is straights and arcs.
   The key is the number of NPC racers: 3 = easy, 5 = moderate, 7 = hard. */
const TRACKS={
  3:{name:'EASY',     // plain rounded rectangle, wide gentle corners
     pts:[[-310,-130],[310,-130],[310,130],[-310,130]], rad:[90,90,90,90]},
  5:{name:'MODERATE', // rounded rectangle with an S-bend on the bottom straight
     pts:[[-310,-130],[310,-130],[310,130],[130,130],[70,60],[-30,60],[-90,130],[-310,130]], rad:[80,80,80,70,70,70,70,80]},
  7:{name:'HARD',     // rounded rectangle with two deep, tight U-shaped bays cut into the bottom
     pts:[[-410,-150],[410,-150],[410,150],[255,150],[255,20],[75,20],[75,150],[-75,150],[-75,20],[-255,20],[-255,150],[-410,150]], rad:[80,80,80,60,60,60,60,60,60,60,60,75]}
};
const AI_OF={3:'easy',5:'normal',7:'hard'};
// kx stretches the circuit sideways (>=1) so it can fill a wide screen; corner radii stay the same.
function buildTrack(id,kx){
  const def=TRACKS[id], n=def.pts.length;
  const P=def.pts.map(p=>({x:p[0]*kx,y:p[1]}));
  const dir=[], ln=[];
  for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy); dir.push({x:dx/l,y:dy/l}); ln.push(l);}
  const F=[];
  for(let i=0;i<n;i++){
    const din=dir[(i+n-1)%n], dout=dir[i];
    const th=Math.atan2(din.x*dout.y-din.y*dout.x, din.x*dout.x+din.y*dout.y);
    if(Math.abs(th)<1e-4){F.push({t:0}); continue;}
    let r=def.rad[i], t=r*Math.tan(Math.abs(th)/2);
    const cap=.49*Math.min(ln[(i+n-1)%n],ln[i]);
    if(t>cap){t=cap; r=t/Math.tan(Math.abs(th)/2);}
    const A={x:P[i].x-din.x*t,y:P[i].y-din.y*t}, B={x:P[i].x+dout.x*t,y:P[i].y+dout.y*t}, sg=Math.sign(th);
    const C={x:A.x-sg*din.y*r,y:A.y+sg*din.x*r};
    F.push({t,r,th,sg,A,B,C,a0:Math.atan2(A.y-C.y,A.x-C.x)});
  }
  const segs=[]; let s=0;
  for(let i=0;i<n;i++){
    const f=F[i], j=(i+1)%n, g=F[j];
    const x0=f.t?f.B.x:P[i].x, y0=f.t?f.B.y:P[i].y, x1=g.t?g.A.x:P[j].x, y1=g.t?g.A.y:P[j].y;
    const l=Math.hypot(x1-x0,y1-y0), a=Math.atan2(dir[i].y,dir[i].x);
    segs.push({k:'L',s0:s,len:l,x0,y0,a,co:Math.cos(a),si:Math.sin(a)}); s+=l;
    if(g.t){const al=g.r*Math.abs(g.th); segs.push({k:'A',s0:s,len:al,cx:g.C.x,cy:g.C.y,r:g.r,a0:g.a0,sg:g.sg,ang:Math.abs(g.th)}); s+=al;}
  }
  T.segs=segs; T.L=s; T.id=id; T.kx=kx;
  // bounding box of the whole road, with a margin
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  for(let u=0;u<s;u+=4){const p=pointAt(u,0); x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); y0=Math.min(y0,p.y); y1=Math.max(y1,p.y);}
  const pad=T.TW/2+T.EDGE/2+8;
  T.bx=(x0+x1)/2; T.by=(y0+y1)/2; T.bw=x1-x0+2*pad; T.bh=y1-y0+2*pad;
}
function segAt(s){
  s=wrapS(s);
  for(let i=T.segs.length-1;i>=0;i--) if(s>=T.segs[i].s0) return [T.segs[i],s-T.segs[i].s0];
  return [T.segs[0],0];
}
// position on the road: s along the centreline, d sideways (positive = right-hand side of the direction of travel)
function pointAt(s,d){
  const [g,u]=segAt(s); let x,y,a;
  if(g.k==='L'){x=g.x0+g.co*u; y=g.y0+g.si*u; a=g.a;}
  else{const f=g.a0+g.sg*u/g.r; x=g.cx+g.r*Math.cos(f); y=g.cy+g.r*Math.sin(f); a=f+g.sg*PI/2;}
  return {x:x-Math.sin(a)*d,y:y+Math.cos(a)*d,a};
}
function project(x,y){
  let best=1e18,bs=0,bd=0;
  for(const g of T.segs){
    let u,px,py,a;
    if(g.k==='L'){u=clamp((x-g.x0)*g.co+(y-g.y0)*g.si,0,g.len); px=g.x0+g.co*u; py=g.y0+g.si*u; a=g.a;}
    else{
      const f=Math.atan2(y-g.cy,x-g.cx); let rel=g.sg*(f-g.a0); rel=((rel%TAU)+TAU)%TAU;
      if(rel<=g.ang) u=rel*g.r; else u=(rel<(g.ang+TAU)/2)?g.len:0;
      const ff=g.a0+g.sg*u/g.r; px=g.cx+g.r*Math.cos(ff); py=g.cy+g.r*Math.sin(ff); a=ff+g.sg*PI/2;
    }
    const dx=x-px, dy=y-py, dd=dx*dx+dy*dy;
    if(dd<best){best=dd; bs=g.s0+u; bd=-dx*Math.sin(a)+dy*Math.cos(a);}
  }
  return {s:wrapS(bs),d:bd};
}
// smallest corner radius met in the next D units of road (used by the AI to brake for corners)
function minRadAhead(s,D){
  let m=1e9;
  for(const g of T.segs){
    if(g.k!=='A'||g.r>=m) continue;
    for(let k=0;k<2;k++){const a0=g.s0+k*T.L; if(a0+g.len>s&&a0<s+D){m=g.r; break;}}
  }
  return m;
}
function gridSlot(i){const row=i>>1,col=i&1; return {s:T.FIN-52-row*68-(col?34:0), d:col?26:-26};}

const VMAX=165, ACC=110, BRK=260, DRAG=45, TURN=2.0, CAR_R=12, CAR_OFF=12;
const HP_MAX=100;                 // health: every bump takes some off; at zero the car blows up and restarts where it was
const STOP_V=45;                  // a player slower than this counts as stopped: the NPCs do not dodge or brake for them
const NAMES=['ACE','ZAP','REX','JET','MAX','RAY','VIC'];
const DIFFS={
  easy:  {lo:.66,hi:.78,err:.30,aware:.75},
  normal:{lo:.48,hi:.60,err:.10,aware:1},
  hard:  {lo:.44,hi:.56,err:.02,aware:1.15}
};

// o = {name, racers}: the player starts at the back of a grid of racers+1 cars
function makeRace(o){
  const n=o.racers, df=DIFFS[AI_OF[n]]||DIFFS.normal, total=n+1, cars=[]; let ai=0;
  for(let i=0;i<total;i++){
    const p=gridSlot(i), pt=pointAt(p.s,p.d), me=(i===total-1);
    const c={me,slot:i,name:me?o.name:NAMES[ai],x:pt.x,y:pt.y,a:pt.a,v:0,s:wrapS(p.s),d:p.d,q:p.s-T.FIN,
      fin:false,finIdx:-1,dead:false,deadT:0,inv:0,hp:HP_MAX,hurtT:0,auto:false,lapN:0,lapMin:1,
      lane:p.d,curD:p.d,laneT:2+Math.random()*3,errT:0,errD:0,sf:1};
    if(!me){ai++; c.sf=df.lo+Math.random()*(df.hi-df.lo);}
    cars.push(c);
  }
  const r={cars,me:cars[total-1],laps:LAPS,df,racers:n,state:'countdown',cd:3.6,goT:0,t:0,fx:[],finOrder:[],endT:0,result:null,events:[],order:[],rank:total};
  refresh(r); return r;
}
function ranks(r){return r.cars.slice().sort((a,b)=>(b.fin?1e6-b.finIdx:b.q)-(a.fin?1e6-a.finIdx:a.q));}
function refresh(r){r.order=ranks(r); r.rank=r.order.indexOf(r.me)+1;}
function hit(a,b){
  const ca=Math.cos(a.a),sa=Math.sin(a.a),cb=Math.cos(b.a),sb=Math.sin(b.a), lim=(2*CAR_R)*(2*CAR_R);
  for(const i of [-CAR_OFF,CAR_OFF]) for(const j of [-CAR_OFF,CAR_OFF]){
    const dx=a.x+ca*i-(b.x+cb*j), dy=a.y+sa*i-(b.y+sb*j);
    if(dx*dx+dy*dy<lim) return true;
  }
  return false;
}
function overlap(r,me){for(const o of r.cars) if(o!==me&&hit(me,o)) return true; return false;}
function makeFx(x,y){
  const deb=[];
  for(let i=0;i<16;i++) deb.push({a:Math.round(Math.random()*8)*PI/4+(i%2?PI/8:0),v:50+Math.random()*80,big:Math.random()<.5});
  return {x,y,t:0,seed:Math.floor(Math.random()*1e6),deb};
}
function crash(r,c){
  c.dead=true; c.deadT=1.1; c.hp=0; c.v=0;
  r.fx.push(makeFx(c.x,c.y)); r.events.push('crash');
}
// health lost on a bump; the car blows up when it runs out
function hurt(r,c,amt){
  if(c.dead||c.inv>0||c.hurtT>0) return;
  c.hurtT=.5; c.hp=Math.max(0,c.hp-amt);
  if(c.hp<=0) crash(r,c); else r.events.push('bump');
}
function respawn(c){
  // back on the road in the very same spot, facing the same way, with full health and a short spell of safety
  c.hp=HP_MAX; c.v=0; c.dead=false; c.inv=2.2; c.hurtT=0;
}
function stepPlayer(r,c,inp,dt){
  if(c.dead){
    c.deadT-=dt;
    if(c.deadT<=0) respawn(c);
    return;
  }
  const steer=(inp.right?1:0)-(inp.left?1:0);
  if(inp.gas) c.v+=ACC*dt; else c.v-=DRAG*dt;
  if(inp.brake) c.v-=BRK*dt;
  c.v-=Math.abs(steer)*c.v*.75*dt;
  c.v=clamp(c.v,0,VMAX);
  c.a+=steer*TURN*Math.min(1,c.v/45)*(1-.3*c.v/VMAX)*dt;
  c.x+=Math.cos(c.a)*c.v*dt; c.y+=Math.sin(c.a)*c.v*dt;
}
const LOOK0=40, LOOK1=.28;          // how far ahead the AI aims
function stepAI(r,c,dt){
  const df=r.df;
  let tgt=c.lane, vcap=VMAX*c.sf;
  c.laneT-=dt; if(c.laneT<=0){c.lane=(Math.random()*2-1)*38; c.laneT=3+Math.random()*5;}
  c.errT-=dt;
  if(c.errT<=0&&Math.random()<df.err*dt){c.errT=.7; c.errD=(Math.random()<.5?-1:1)*44;}
  if(c.errT>0){vcap*=.62; tgt=c.errD;}
  const rr=minRadAhead(c.s,45+c.v*.8);       // brake for tight corners coming up
  if(rr<1e8) vcap=Math.min(vcap,Math.max(55,rr*1.75));
  for(const o of r.cars){
    if(o===c||o.dead) continue;
    if(o.me&&o.v<STOP_V) continue;   // a stopped player is not avoided: the NPCs keep going and run into them
    let ds=o.s-c.s; if(ds<-T.L/2)ds+=T.L; else if(ds>T.L/2)ds-=T.L;
    if(ds>-56&&ds<=0&&Math.abs(o.d-c.d)<40){   // someone alongside: hold the line, no lane swerve
      c.laneT=Math.max(c.laneT,.4); tgt=c.curD; if(c.errT>0) c.errT=0;
    }
    if(ds>0&&ds<120*df.aware){
      const dd=o.d-c.d;
      if(Math.abs(dd)<38){
        const nd=clamp(c.d+(dd>0?-1:1)*44,-46,46);
        tgt=nd;
        if(Math.abs(nd-o.d)<36||ds<56) vcap=Math.min(vcap,o.v*.96);
      }
    }
  }
  c.curD+=(tgt-c.curD)*Math.min(1,3*dt);
  const pt=pointAt(c.s+LOOK0+c.v*LOOK1,c.curD);
  const diff=angDiff(c.a,Math.atan2(pt.y-c.y,pt.x-c.x));
  c.a+=clamp(diff*4,-3,3)*dt;
  const vt=vcap*(1-Math.min(.12,Math.abs(diff)*.4));
  c.v+=clamp(vt-c.v,-BRK*dt,ACC*.85*dt);
  c.x+=Math.cos(c.a)*c.v*dt; c.y+=Math.sin(c.a)*c.v*dt;
}
function track(r,c,dt){
  if(c.dead) return;
  let pr=project(c.x,c.y); const lim=T.TW/2-15;
  if(Math.abs(pr.d)>lim){
    if(c.me&&!c.auto&&c.v>25) hurt(r,c,2+c.v*.06);   // scraping or hitting the wall costs health
    const pt=pointAt(pr.s,Math.sign(pr.d)*lim);
    c.x=pt.x; c.y=pt.y; c.v*=Math.pow(.1,dt);
    c.a+=angDiff(c.a,pt.a)*Math.min(1,5*dt);
    pr=project(c.x,c.y);
  }
  let ds=pr.s-c.s; if(ds<-T.L/2)ds+=T.L; else if(ds>T.L/2)ds-=T.L;
  c.q+=ds; c.s=pr.s; c.d=pr.d;
}
function stepRace(r,inp,dt){
  if(r.state==='countdown'){
    r.cd-=dt; if(r.cd>0) return;
    r.state='racing'; r.goT=.9; r.events.push('go');
  }
  r.t+=dt; r.goT=Math.max(0,r.goT-dt);
  for(const c of r.cars){
    if(c.me&&!c.auto) stepPlayer(r,c,inp,dt); else stepAI(r,c,dt);
    track(r,c,dt);
  }
  const me=r.me; me.hurtT=Math.max(0,me.hurtT-dt);
  if(me.inv>0){
    me.inv-=dt; if(me.inv<=0&&overlap(r,me)) me.inv=.12;   // stay safe until the spot is clear
  }else if(!me.dead&&!me.auto&&r.state==='racing'){
    for(const o of r.cars) if(o!==me&&hit(me,o)){
      const rvx=Math.cos(me.a)*me.v-Math.cos(o.a)*o.v, rvy=Math.sin(me.a)*me.v-Math.sin(o.a)*o.v;
      hurt(r,me,6+Math.hypot(rvx,rvy)*.10); me.v*=.7; break;
    }
  }
  const ln=Math.max(0,Math.floor(me.q/T.L));
  if(ln>me.lapN){me.lapN=ln; if(ln<r.laps) r.events.push('lap');}
  for(const c of r.cars){
    if(!c.fin&&c.q>=r.laps*T.L){
      c.fin=true; c.finIdx=r.finOrder.length; r.finOrder.push(c);
      if(c.me){c.auto=true; c.sf=.72; c.lane=0; c.laneT=99; c.curD=c.d; r.state='ending'; r.result='finished'; r.endT=1.4; r.events.push('finish');}
    }
  }
  for(const f of r.fx) f.t+=dt;
  r.fx=r.fx.filter(f=>f.t<1.1);
  refresh(r);
  if(r.state==='ending'){r.endT-=dt; if(r.endT<=0) r.state='over';}
}
buildTrack(3,1);

// Node (tests): expose the engine. In the browser these names are plain globals shared with game.js.
if(typeof module==='object'&&module.exports) module.exports={PI,LAPS,T,wrapS,angDiff,clamp,TRACKS,AI_OF,buildTrack,segAt,pointAt,project,minRadAhead,gridSlot,VMAX,HP_MAX,STOP_V,DIFFS,makeRace,ranks,refresh,hit,overlap,crash,hurt,respawn,stepRace};
