/** Opponent strength per track: speed range (share of top speed), mistake rate and how far ahead they look. */
const DIFFS={
  easy:  {lo:.66,hi:.78,err:.30,aware:.75},
  normal:{lo:.48,hi:.60,err:.10,aware:1},
  hard:  {lo:.44,hi:.56,err:.02,aware:1.15}
};
const NAMES=['ACE','ZAP','REX','JET','MAX','RAY','VIC'];

/**
 * One race: a track, the cars (racers NPCs + the player in the last grid slot), the rules and the clock.
 * state: 'countdown' -> 'racing' -> 'ending' (player finished) -> 'over'.
 * `events` collects what happened this step ('go','lap','bump','crash','finish') for the UI to turn into sound.
 */
class Race{
  static LAPS=3;
  constructor(track,{name='PLAYER',racers=3}={}){
    this.track=track; this.laps=Race.LAPS; this.racers=racers;
    this.df=DIFFS[Track.AI_OF[racers]]||DIFFS.normal;
    const total=racers+1; this.cars=[]; let ai=0;
    for(let i=0;i<total;i++){
      const me=(i===total-1);
      const car=new Car(track,i,{me,name:me?name:NAMES[ai],sf:1});
      if(!me){ai++; car.sf=this.df.lo+Math.random()*(this.df.hi-this.df.lo);}
      this.cars.push(car);
    }
    this.me=this.cars[total-1];
    Object.assign(this,{state:'countdown',cd:3.6,goT:0,t:0,fx:[],finOrder:[],endT:0,result:null,events:[],order:[],rank:total});
    this.refresh();
  }
  /** Leader first. */
  ranks(){return this.cars.slice().sort((a,b)=>(b.fin?1e6-b.finIdx:b.q)-(a.fin?1e6-a.finIdx:a.q));}
  refresh(){this.order=this.ranks(); this.rank=this.order.indexOf(this.me)+1;}
  overlapping(car){for(const o of this.cars) if(o!==car&&Car.collides(car,o)) return true; return false;}

  crash(car){
    car.dead=true; car.deadT=1.1; car.hp=0; car.v=0;
    this.fx.push(new Explosion(car.x,car.y)); this.events.push('crash');
  }
  /** Health lost on a bump; the car blows up when it runs out. A short cooldown stops contact draining health every frame. */
  hurt(car,amt){
    if(car.dead||car.inv>0||car.hurtT>0) return;
    car.hurtT=.5; car.hp=Math.max(0,car.hp-amt);
    if(car.hp<=0) this.crash(car); else this.events.push('bump');
  }

  step(inp,dt){
    if(this.state==='countdown'){
      this.cd-=dt; if(this.cd>0) return;
      this.state='racing'; this.goT=.9; this.events.push('go');
    }
    this.t+=dt; this.goT=Math.max(0,this.goT-dt);
    for(const c of this.cars){c.step(this,inp,dt); c.followRoad(this,dt);}
    const me=this.me; me.hurtT=Math.max(0,me.hurtT-dt);
    if(me.inv>0){
      me.inv-=dt; if(me.inv<=0&&this.overlapping(me)) me.inv=.12;   // stay safe until the spot is clear
    }else if(!me.dead&&!me.auto&&this.state==='racing'){
      for(const o of this.cars) if(o!==me&&Car.collides(me,o)){
        const rvx=Math.cos(me.a)*me.v-Math.cos(o.a)*o.v, rvy=Math.sin(me.a)*me.v-Math.sin(o.a)*o.v;
        this.hurt(me,6+Math.hypot(rvx,rvy)*.10); me.v*=.7; break;
      }
    }
    const L=this.track.L, ln=Math.max(0,Math.floor(me.q/L));
    if(ln>me.lapN){me.lapN=ln; if(ln<this.laps) this.events.push('lap');}
    for(const c of this.cars){
      if(!c.fin&&c.q>=this.laps*L){
        c.fin=true; c.finIdx=this.finOrder.length; this.finOrder.push(c);
        if(c.me){c.auto=true; c.sf=.72; c.lane=0; c.laneT=99; c.curD=c.d; this.state='ending'; this.result='finished'; this.endT=1.4; this.events.push('finish');}
      }
    }
    for(const f of this.fx) f.update(dt);
    this.fx=this.fx.filter(f=>!f.done);
    this.refresh();
    if(this.state==='ending'){this.endT-=dt; if(this.endT<=0) this.state='over';}
  }
}

if(typeof module==='object'&&module.exports) module.exports={PI,TAU,clamp,angDiff,Track,Car,CarSpec,Explosion,Race,DIFFS,NAMES};
