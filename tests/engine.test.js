// Engine tests (no browser needed):  node --test tests/
const test=require('node:test'), assert=require('node:assert/strict');
const E=require('./load')();
const {Track,Car,CarSpec,Explosion,Race,DIFFS,clamp,angDiff}=E;
const {SKILL,makeBot}=require('./bots.js');
const DT=1/60, IDS=[3,5,7], HP=CarSpec.HP_MAX;
const mk=(id,kx=1.3,o={})=>new Race(new Track(id,kx),{name:'ME',racers:id,...o});

test('math helpers: clamp and shortest angle difference',()=>{
  assert.equal(clamp(5,0,3),3); assert.equal(clamp(-1,0,3),0); assert.equal(clamp(2,0,3),2);
  assert.ok(Math.abs(angDiff(.1,2*Math.PI-.1)+.2)<1e-9); assert.ok(Math.abs(angDiff(0,Math.PI/2)-Math.PI/2)<1e-9);
});

test('three tracks exist, one per NPC-racer count, and the race is always 3 laps',()=>{
  assert.deepEqual(Object.keys(Track.DEFS).map(Number),IDS); assert.deepEqual([...Track.IDS],IDS);
  assert.equal(Race.LAPS,3);
  for(const id of IDS) assert.equal(mk(id).laps,3);
  assert.throws(()=>new Track(4),/unknown track/);
});

test('each race has racers+1 cars and the player starts at the back of the grid',()=>{
  for(const id of IDS){
    const r=mk(id,1.2); assert.equal(r.cars.length,id+1);
    assert.equal(r.cars.findIndex(c=>c.me),id,'player is last'); assert.equal(r.me,r.cars[id]); assert.equal(r.rank,id+1);
    assert.ok(r.cars.every(c=>c instanceof Car));
  }
});

for(const id of IDS) for(const kx of [1,1.3,1.9]){
  test(`track ${id} @kx${kx}: position <-> road coordinates round-trip`,()=>{
    const T=new Track(id,kx); let worst=0;
    for(let i=0;i<3000;i++){
      const s=Math.random()*T.L,d=(Math.random()*2-1)*55,p=T.pointAt(s,d),q=T.project(p.x,p.y);
      let ds=Math.abs(q.s-s); ds=Math.min(ds,T.L-ds); worst=Math.max(worst,ds,Math.abs(q.d-d));
    }
    assert.ok(worst<.01,'worst error '+worst);
  });
  test(`track ${id} @kx${kx}: distant parts of the road never overlap`,()=>{
    const T=new Track(id,kx), step=8,N=Math.floor(T.L/step); let min=1e9;
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      let ds=(j-i)*step; ds=Math.min(ds,T.L-ds); if(ds<220) continue;
      const a=T.pointAt(i*step,0),b=T.pointAt(j*step,0); min=Math.min(min,Math.hypot(a.x-b.x,a.y-b.y));
    }
    assert.ok(min>T.TW+T.EDGE,`roads only ${min.toFixed(1)} apart`);
  });
}

test('track difficulty grows with the NPC count (longer, more corners)',()=>{
  const L=IDS.map(id=>new Track(id,1.2).L);
  assert.ok(L[0]<L[1]&&L[1]<L[2],'lengths '+L.map(Math.round));
  assert.ok(Track.DEFS[3].pts.length<Track.DEFS[5].pts.length&&Track.DEFS[5].pts.length<Track.DEFS[7].pts.length);
  assert.deepEqual({...Track.AI_OF},{3:'easy',5:'normal',7:'hard'});
});

test('Track.fitted stretches the track sideways, between 1x and 1.9x',()=>{
  for(const id of IDS){
    assert.equal(Track.fitted(id,.5).kx,1); assert.equal(Track.fitted(id,9).kx,1.9);
    const t=Track.fitted(id,2.2); assert.ok(t.kx>1&&t.kx<=1.9); assert.ok(t.bw>new Track(id,1).bw);
  }
});

test('Track.wrap, segAt and gridSlot behave',()=>{
  const T=new Track(3,1); assert.ok(Math.abs(T.wrap(-5)-(T.L-5))<1e-9); assert.ok(Math.abs(T.wrap(T.L+7)-7)<1e-9);
  const [seg,off]=T.segAt(10); assert.ok(seg&&off>=0);
  const a=T.gridSlot(0), b=T.gridSlot(1), c=T.gridSlot(2);
  assert.ok(a.s>b.s&&b.s>c.s-1,'slots go back down the road'); assert.equal(a.d,-26); assert.equal(b.d,26);
  assert.ok(a.s<T.FIN,'grid is behind the finish line');
});

test('opponent strength grows with the track: faster+braver on easy, tighter on hard',()=>{
  assert.ok(DIFFS.easy.lo>DIFFS.normal.lo&&DIFFS.normal.lo>DIFFS.hard.lo);
  assert.ok(DIFFS.easy.err>DIFFS.normal.err&&DIFFS.normal.err>DIFFS.hard.err);
});

test('countdown holds the cars for 3.6 s, then the race starts and "go" is announced',()=>{
  const r=mk(3); let t=0;
  while(r.state==='countdown'&&t<10){r.step({gas:true},DT); t+=DT; if(r.state==='countdown') assert.ok(r.cars.every(c=>c.v===0));}
  assert.ok(t>3.5&&t<3.8,'countdown '+t); assert.ok(r.events.includes('go')); assert.ok(r.goT>0);
});

for(const id of IDS) test(`computer drivers finish 3 laps on track ${id} without scraping the walls`,()=>{
  const r=mk(id); r.me.auto=true; r.me.sf=.85; const T=r.track;
  let t=0,wall=0,frames=0;
  while(t<500&&r.cars.some(c=>!c.fin)){
    r.step({},DT); t+=DT;
    for(const c of r.cars){frames++; if(Math.abs(c.d)>T.TW/2-15.5) wall++;}
  }
  assert.ok(r.cars.every(c=>c.fin),'everyone finished');
  assert.ok(wall/frames<.03,'wall contact '+(100*wall/frames).toFixed(1)+'%');
  assert.equal(r.finOrder.length,r.cars.length);
});

for(const id of IDS) test(`track ${id}: a parked player is hit, loses health, blows up and restarts in the same spot`,()=>{
  const r=mk(id); const me=r.me;
  let crashed=false,at=null,t=0,lowest=HP;
  while(t<90&&!crashed){r.step({},DT); t+=DT; lowest=Math.min(lowest,me.hp); if(me.dead){crashed=true; at={x:me.x,y:me.y,a:me.a};}}
  assert.ok(crashed,'NPCs run into a stopped player'); assert.ok(lowest<HP);
  for(let i=0;i<120;i++) r.step({},DT);
  assert.equal(me.dead,false,'respawned');
  assert.ok(Math.hypot(me.x-at.x,me.y-at.y)<8,'same place'); assert.ok(me.hp>HP*.9,'full health');
});

test('wall bumps drain health in steps and can destroy the car; there is no game over',()=>{
  const r=mk(5);
  for(let i=0;i<300;i++) r.step({gas:true},DT);
  let bumps=0,crashes=0;
  for(let i=0;i<60*70&&crashes<2;i++){
    r.step({gas:true,right:i>360},DT);
    bumps+=r.events.filter(e=>e==='bump').length; crashes+=r.events.filter(e=>e==='crash').length; r.events.length=0;
  }
  assert.ok(bumps>3,'bumps '+bumps); assert.ok(crashes>=2,'crashes '+crashes);
  assert.notEqual(r.state,'over','race goes on after crashes');
});

test('a bump has a cooldown so contact does not drain health every frame',()=>{
  const r=mk(3); const me=r.me; me.inv=0; me.hurtT=0;
  r.hurt(me,10); r.hurt(me,10); r.hurt(me,10);
  assert.equal(me.hp,HP-10);
});

test('a crashed car is safe from further hits while exploding, and respawns with a spell of safety',()=>{
  const r=mk(3); const me=r.me; me.inv=0; me.hurtT=0; r.hurt(me,999);
  assert.equal(me.dead,true); assert.equal(me.hp,0); assert.equal(r.fx.length,1); assert.ok(r.events.includes('crash'));
  r.hurt(me,50); assert.equal(me.hp,0,'no further damage while dead'); assert.equal(r.fx.length,1,'one explosion only');
  me.respawn(); assert.equal(me.hp,HP); assert.ok(me.inv>2); r.hurt(me,50); assert.equal(me.hp,HP,'invulnerable after respawn');
});

test('there are no power-ups, boosts or items: cars only have the fixed set of fields, and speed never exceeds the top speed',()=>{
  const r=mk(7); const keys=Object.keys(r.me).sort();
  assert.ok(!keys.some(k=>/boost|power|item|nitro|shield|turbo|pickup|bonus/i.test(k)),'fields: '+keys);
  assert.ok(!Object.keys(r).some(k=>/boost|power|item|pickup|bonus/i.test(k)));
  const gas={gas:true}; let vmax=0;
  for(let i=0;i<60*60;i++){r.step(gas,DT); for(const c of r.cars) vmax=Math.max(vmax,c.v);}
  assert.ok(vmax<=CarSpec.VMAX+1e-9,'vmax '+vmax);
});

test('car-to-car collision uses 4 body circles: overlapping cars collide, far ones do not',()=>{
  const T=new Track(3,1), a=new Car(T,0), b=new Car(T,1);
  assert.equal(Car.collides(a,a),true);
  Object.assign(b,{x:a.x+5,y:a.y,a:a.a}); assert.equal(Car.collides(a,b),true);
  Object.assign(b,{x:a.x+80,y:a.y}); assert.equal(Car.collides(a,b),false);
  Object.assign(b,{x:a.x+2*CarSpec.R+2*CarSpec.OFF+4,y:a.y,a:0}); a.a=0; assert.equal(Car.collides(a,b),false,'just clear');
});

test('driving into another car hurts the player and slows them',()=>{
  const r=mk(3); r.state='racing'; const me=r.me, o=r.cars[0];
  me.inv=0; me.hurtT=0; me.v=120; Object.assign(o,{x:me.x+10,y:me.y,a:me.a,v:0,dead:false});
  const hp=me.hp; r.step({gas:true},DT); assert.ok(me.hp<hp,'health fell'); assert.ok(me.v<120*.75);
});

test('player stopped (< STOP_V): NPCs do not dodge; a moving player in the way is avoided',()=>{
  const run=v=>{
    const r=mk(3); r.state='racing'; const me=r.me, ai=r.cars[0], T=r.track;
    ai.lane=ai.d; ai.laneT=99; ai.errT=0; ai.v=60; ai.curD=ai.d;
    const pt=T.pointAt(ai.s+60,ai.d); Object.assign(me,{x:pt.x,y:pt.y,a:pt.a,s:ai.s+60,d:ai.d,v});
    for(const c of r.cars) if(c!==ai&&c!==me) c.dead=true;
    for(let i=0;i<20;i++) ai.stepAI(r,DT); return Math.abs(ai.curD-ai.d);
  };
  assert.ok(run(0)<5,'ignores the parked player: '+run(0)); assert.ok(run(100)>10,'dodges a moving one: '+run(100));
});

test('lap counting: "lap" event on each completed lap but not on the last; finish ends the race',()=>{
  const r=mk(3); r.me.auto=true; r.me.sf=.9; const ev=[]; let t=0;
  while(t<500&&r.state!=='over'){r.step({},DT); t+=DT; ev.push(...r.events.splice(0));}
  assert.equal(ev.filter(e=>e==='lap').length,2,'laps 1 and 2 announced'); assert.equal(ev.filter(e=>e==='finish').length,1);
  assert.equal(r.result,'finished'); assert.ok(r.me.fin); assert.ok(r.rank>=1&&r.rank<=4);
});

test('explosions last 1.1 s and are removed from the race',()=>{
  const e=new Explosion(5,6); assert.equal(e.done,false); assert.equal(e.deb.length,16); e.update(1.2); assert.equal(e.done,true);
  const r=mk(3); r.state='racing'; r.cd=0; r.me.inv=0; r.me.hurtT=0; r.hurt(r.me,999); assert.equal(r.fx.length,1);
  for(let i=0;i<80;i++) r.step({},DT); assert.equal(r.fx.length,0);
});

test('a bot player can win and finish; results are consistent',()=>{
  const bot=makeBot(SKILL.good); let finished=0;
  for(let k=0;k<4;k++){
    const r=mk(3); let t=0;
    while(t<400&&r.state!=='over'){r.step(bot(r,DT),DT); t+=DT; r.events.length=0;}
    if(r.state==='over'){finished++; assert.ok(r.rank>=1&&r.rank<=4);}
  }
  assert.ok(finished>=3);
});

test('a player with a decent driver wins sometimes but not always (moderate chance) on every track',()=>{
  const bot=makeBot(SKILL.mid);
  for(const id of IDS){
    let win=0,N=12;
    for(let k=0;k<N;k++){const r=mk(id); let t=0; while(t<400&&r.state!=='over'){r.step(bot(r,DT),DT); t+=DT; r.events.length=0;} if(r.state==='over'&&r.rank===1) win++;}
    assert.ok(win>=1&&win<=N-1,`track ${id}: ${win}/${N} wins`);
  }
});
