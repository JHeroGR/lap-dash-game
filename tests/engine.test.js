// Engine tests (no browser needed):  node --test tests/
const test=require('node:test'), assert=require('node:assert/strict');
const E=require('../src/engine.js');
const {T,TRACKS,buildTrack,pointAt,project,makeRace,stepRace,gridSlot,HP_MAX}=E;
const {SKILL,makeBot}=require('./bots.js');
const DT=1/60, IDS=[3,5,7];

test('three tracks exist, one per NPC-racer count, and the race is always 3 laps',()=>{
  assert.deepEqual(Object.keys(TRACKS).map(Number),IDS);
  assert.equal(E.LAPS,3);
  for(const id of IDS) assert.equal(makeRace({name:'ME',racers:id}).laps,3);
});

test('each race has racers+1 cars and the player starts at the back of the grid',()=>{
  for(const id of IDS){
    buildTrack(id,1.2); const r=makeRace({name:'ME',racers:id});
    assert.equal(r.cars.length,id+1);
    const rank=r.cars.findIndex(c=>c.me); assert.equal(rank,id,'player is last');
  }
});

for(const id of IDS) for(const kx of [1,1.3,1.9]){
  test(`track ${id} @kx${kx}: position <-> road coordinates round-trip`,()=>{
    buildTrack(id,kx); let worst=0;
    for(let i=0;i<3000;i++){
      const s=Math.random()*T.L,d=(Math.random()*2-1)*55,p=pointAt(s,d),q=project(p.x,p.y);
      let ds=Math.abs(q.s-s); ds=Math.min(ds,T.L-ds); worst=Math.max(worst,ds,Math.abs(q.d-d));
    }
    assert.ok(worst<.01,'worst error '+worst);
  });
  test(`track ${id} @kx${kx}: distant parts of the road never overlap`,()=>{
    buildTrack(id,kx); const step=8,N=Math.floor(T.L/step); let min=1e9;
    for(let i=0;i<N;i++)for(let j=i+1;j<N;j++){
      let ds=(j-i)*step; ds=Math.min(ds,T.L-ds); if(ds<220) continue;
      const a=pointAt(i*step,0),b=pointAt(j*step,0); min=Math.min(min,Math.hypot(a.x-b.x,a.y-b.y));
    }
    assert.ok(min>T.TW+T.EDGE,`roads only ${min.toFixed(1)} apart`);
  });
}

test('track difficulty grows with the NPC count (longer, more corners)',()=>{
  const L=IDS.map(id=>{buildTrack(id,1.2);return T.L;});
  assert.ok(L[0]<L[1]&&L[1]<L[2],'lengths '+L.map(Math.round));
  assert.ok(TRACKS[3].pts.length<TRACKS[5].pts.length&&TRACKS[5].pts.length<TRACKS[7].pts.length);
});

for(const id of IDS) test(`computer drivers finish 3 laps on track ${id} without scraping the walls`,()=>{
  buildTrack(id,1.3); const r=makeRace({name:'ME',racers:id}); r.me.auto=true; r.me.sf=.85;
  let t=0,wall=0,frames=0;
  while(t<500&&r.cars.some(c=>!c.fin)){
    stepRace(r,{},DT); t+=DT;
    for(const c of r.cars){frames++; if(Math.abs(c.d)>T.TW/2-15.5) wall++;}
  }
  assert.ok(r.cars.every(c=>c.fin),'everyone finished');
  assert.ok(wall/frames<.03,'wall contact '+(100*wall/frames).toFixed(1)+'%');
});

for(const id of IDS) test(`track ${id}: a parked player is hit, loses health, blows up and restarts in the same spot`,()=>{
  buildTrack(id,1.3); const r=makeRace({name:'ME',racers:id}); const me=r.me;
  let crashed=false,at=null,t=0,lowest=HP_MAX;
  while(t<90&&!crashed){stepRace(r,{},DT); t+=DT; lowest=Math.min(lowest,me.hp); if(me.dead){crashed=true; at={x:me.x,y:me.y,a:me.a};}}
  assert.ok(crashed,'NPCs run into a stopped player'); assert.ok(lowest<HP_MAX);
  for(let i=0;i<120;i++) stepRace(r,{},DT);
  assert.equal(me.dead,false,'respawned');
  assert.ok(Math.hypot(me.x-at.x,me.y-at.y)<8,'same place'); assert.ok(me.hp>HP_MAX*.9,'full health');
});

test('wall bumps drain health in steps and can destroy the car; there is no game over',()=>{
  buildTrack(5,1.3); const r=makeRace({name:'ME',racers:5});
  for(let i=0;i<300;i++) stepRace(r,{gas:true},DT);          // after the lights: drive straight on
  let bumps=0,crashes=0;
  for(let i=0;i<60*70&&crashes<2;i++){
    stepRace(r,{gas:true,right:i>360},DT);
    bumps+=r.events.filter(e=>e==='bump').length; crashes+=r.events.filter(e=>e==='crash').length; r.events.length=0;
  }
  assert.ok(bumps>3,'bumps '+bumps); assert.ok(crashes>=2,'crashes '+crashes);
  assert.notEqual(r.state,'over','race goes on after crashes');
});

test('a bump has a cooldown so contact does not drain health every frame',()=>{
  buildTrack(3,1.2); const r=makeRace({name:'ME',racers:3}); const me=r.me; me.inv=0; me.hurtT=0;
  E.hurt(r,me,10); E.hurt(r,me,10); E.hurt(r,me,10);
  assert.equal(me.hp,HP_MAX-10);
});

test('a bot player can win and finish; results are consistent',()=>{
  buildTrack(3,1.3); const bot=makeBot(SKILL.good); let finished=0;
  for(let k=0;k<4;k++){
    const r=makeRace({name:'ME',racers:3}); let t=0;
    while(t<400&&r.state!=='over'){stepRace(r,bot(r,DT),DT); t+=DT; r.events.length=0;}
    if(r.state==='over'){finished++; assert.ok(r.rank>=1&&r.rank<=4);}
  }
  assert.ok(finished>=3);
});
