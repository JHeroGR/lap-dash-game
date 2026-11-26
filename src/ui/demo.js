/** The computer-only race that plays behind the menu. */
class Demo{
  constructor(viewport){this.vp=viewport; this.race=null; this.sig='';}
  static autopilot(r){r.me.auto=true; r.me.sf=.85; r.me.hurtT=1e9;}   // the demo "player" drives itself and cannot be hurt
  start(racers){
    const t=this.vp.fit(racers);
    this.race=new Race(t,{name:'YOU',racers}); Demo.autopilot(this.race); this.race.cd=1.2;
    this.sig=this.vp.width+'x'+this.vp.height; this.vp.compute(t);
  }
  /** Picking a different racer count swaps the track under the race without restarting it: every car keeps its place
   *  (same share of the lap, same lane, same speed) on the new road, and any extra cars join at the back of the pack. */
  switchTo(racers){
    const old=this.race;
    if(!old||old.state!=='racing'||old.cars.some(c=>c.fin||c.dead)){this.start(racers); return;}
    const ot=old.track, oldAI=old.cars.filter(c=>!c.me);
    const rel=new Map(old.cars.map(c=>[c,angDiff(ot.pointAt(c.s,0).a,c.a)]));
    const t=this.vp.fit(racers), k=t.L/ot.L, r2=new Race(t,{name:'YOU',racers});
    Demo.autopilot(r2); r2.state='racing'; r2.cd=0; r2.t=old.t;
    let ai=0, rearQ=1e9, vSum=0, vN=0;
    for(const c of r2.cars){
      const src=c.me?old.me:oldAI[ai++]; if(!src) continue;
      c.q=src.q*k; c.s=t.wrap(t.FIN+c.q); c.d=src.d; c.v=src.v; c.lane=src.lane; c.curD=src.curD; c.lapMin=src.lapMin; c.lapN=src.lapN;
      const pt=t.pointAt(c.s,c.d); c.x=pt.x; c.y=pt.y; c.a=pt.a+rel.get(src); c.placed=true;
      rearQ=Math.min(rearQ,c.q); vSum+=c.v; vN++;
    }
    let j=0;
    for(const c of r2.cars) if(!c.placed){
      j++; c.q=rearQ-70*j; c.s=t.wrap(t.FIN+c.q); c.d=j%2?-26:26; c.lane=c.curD=c.d; c.v=vSum/Math.max(1,vN);
      const pt=t.pointAt(c.s,c.d); c.x=pt.x; c.y=pt.y; c.a=pt.a; c.lapMin=Math.max(1,Math.floor(c.q/t.L)+1); c.inv=1;
    }
    r2.refresh(); this.race=r2; this.sig=this.vp.width+'x'+this.vp.height; this.vp.compute(t);
  }
  step(dt,racers){
    if(!this.race) return;
    this.race.step({},dt); this.race.events.length=0;
    if(this.race.state==='over') this.start(racers);
  }
}
