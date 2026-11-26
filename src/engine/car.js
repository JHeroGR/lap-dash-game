/** Physics constants shared by the cars. */
const CarSpec={VMAX:165, ACC:110, BRK:260, DRAG:45, TURN:2.0, R:12, OFF:12, HP_MAX:100,
  STOP_V:45,         // a player slower than this counts as stopped: the NPCs do not dodge or brake for them
  LOOK0:40, LOOK1:.28 // how far ahead the AI aims
};

/** A car on a track. Position (x,y,a) is in world space; (s,d) is its place on the road; q is the distance raced (all laps). */
class Car{
  constructor(track,slot,{me=false,name='CAR',sf=1}={}){
    const g=track.gridSlot(slot), pt=track.pointAt(g.s,g.d);
    Object.assign(this,{
      me,slot,name,sf,track,
      x:pt.x,y:pt.y,a:pt.a,v:0,s:track.wrap(g.s),d:g.d,q:g.s-track.FIN,
      fin:false,finIdx:-1,dead:false,deadT:0,inv:0,hp:CarSpec.HP_MAX,hurtT:0,auto:false,lapN:0,lapMin:1,
      lane:g.d,curD:g.d,laneT:2+Math.random()*3,errT:0,errD:0
    });
  }
  /** The four circles that make up a car's body, used for collisions. */
  static collides(a,b){
    const ca=Math.cos(a.a),sa=Math.sin(a.a),cb=Math.cos(b.a),sb=Math.sin(b.a), lim=(2*CarSpec.R)*(2*CarSpec.R), o=CarSpec.OFF;
    for(const i of [-o,o]) for(const j of [-o,o]){
      const dx=a.x+ca*i-(b.x+cb*j), dy=a.y+sa*i-(b.y+sb*j);
      if(dx*dx+dy*dy<lim) return true;
    }
    return false;
  }
  get dist(){return this.q;}

  /** Advance this car one step. */
  step(race,inp,dt){ if(this.me&&!this.auto) this.stepManual(inp,dt); else this.stepAI(race,dt); }

  stepManual(inp,dt){
    const k=CarSpec;
    if(this.dead){this.deadT-=dt; if(this.deadT<=0) this.respawn(); return;}
    const steer=(inp.right?1:0)-(inp.left?1:0);
    if(inp.gas) this.v+=k.ACC*dt; else this.v-=k.DRAG*dt;
    if(inp.brake) this.v-=k.BRK*dt;
    this.v-=Math.abs(steer)*this.v*.75*dt;
    this.v=clamp(this.v,0,k.VMAX);
    this.a+=steer*k.TURN*Math.min(1,this.v/45)*(1-.3*this.v/k.VMAX)*dt;
    this.x+=Math.cos(this.a)*this.v*dt; this.y+=Math.sin(this.a)*this.v*dt;
  }

  stepAI(race,dt){
    const k=CarSpec, tr=race.track, df=race.df;
    let tgt=this.lane, vcap=k.VMAX*this.sf;
    this.laneT-=dt; if(this.laneT<=0){this.lane=(Math.random()*2-1)*38; this.laneT=3+Math.random()*5;}
    this.errT-=dt;
    if(this.errT<=0&&Math.random()<df.err*dt){this.errT=.7; this.errD=(Math.random()<.5?-1:1)*44;}
    if(this.errT>0){vcap*=.62; tgt=this.errD;}
    const rr=tr.minRadAhead(this.s,45+this.v*.8);       // brake for tight corners coming up
    if(rr<1e8) vcap=Math.min(vcap,Math.max(55,rr*1.75));
    for(const o of race.cars){
      if(o===this||o.dead) continue;
      if(o.me&&o.v<k.STOP_V) continue;   // a stopped player is not avoided: the NPCs keep going and run into them
      let ds=o.s-this.s; if(ds<-tr.L/2)ds+=tr.L; else if(ds>tr.L/2)ds-=tr.L;
      if(ds>-56&&ds<=0&&Math.abs(o.d-this.d)<40){   // someone alongside: hold the line, no lane swerve
        this.laneT=Math.max(this.laneT,.4); tgt=this.curD; if(this.errT>0) this.errT=0;
      }
      if(ds>0&&ds<120*df.aware){
        const dd=o.d-this.d;
        if(Math.abs(dd)<38){
          const nd=clamp(this.d+(dd>0?-1:1)*44,-46,46);
          tgt=nd;
          if(Math.abs(nd-o.d)<36||ds<56) vcap=Math.min(vcap,o.v*.96);
        }
      }
    }
    this.curD+=(tgt-this.curD)*Math.min(1,3*dt);
    const pt=tr.pointAt(this.s+k.LOOK0+this.v*k.LOOK1,this.curD);
    const diff=angDiff(this.a,Math.atan2(pt.y-this.y,pt.x-this.x));
    this.a+=clamp(diff*4,-3,3)*dt;
    const vt=vcap*(1-Math.min(.12,Math.abs(diff)*.4));
    this.v+=clamp(vt-this.v,-k.BRK*dt,k.ACC*.85*dt);
    this.x+=Math.cos(this.a)*this.v*dt; this.y+=Math.sin(this.a)*this.v*dt;
  }

  /** Keep the car on the road (walls slow it and, for the player, cost health) and update its (s,d,q). */
  followRoad(race,dt){
    if(this.dead) return;
    const tr=race.track; let pr=tr.project(this.x,this.y); const lim=tr.TW/2-15;
    if(Math.abs(pr.d)>lim){
      if(this.me&&!this.auto&&this.v>25) race.hurt(this,2+this.v*.06);   // scraping or hitting the wall costs health
      const pt=tr.pointAt(pr.s,Math.sign(pr.d)*lim);
      this.x=pt.x; this.y=pt.y; this.v*=Math.pow(.1,dt);
      this.a+=angDiff(this.a,pt.a)*Math.min(1,5*dt);
      pr=tr.project(this.x,this.y);
    }
    let ds=pr.s-this.s; if(ds<-tr.L/2)ds+=tr.L; else if(ds>tr.L/2)ds-=tr.L;
    this.q+=ds; this.s=pr.s; this.d=pr.d;
  }

  /** Back on the road in the very same spot, facing the same way, with full health and a short spell of safety. */
  respawn(){this.hp=CarSpec.HP_MAX; this.v=0; this.dead=false; this.inv=2.2; this.hurtT=0;}
}

/** A pixel-art explosion: chunky cells plus flying debris. Purely visual; the renderer steps it at 14 frames a second. */
class Explosion{
  static DURATION=1.1;
  constructor(x,y){
    this.x=x; this.y=y; this.t=0; this.deb=[];
    for(let i=0;i<16;i++) this.deb.push({a:Math.round(Math.random()*8)*PI/4+(i%2?PI/8:0),v:50+Math.random()*80,big:Math.random()<.5});
    this.seed=Math.floor(Math.random()*1e6);
  }
  update(dt){this.t+=dt;}
  get done(){return this.t>=Explosion.DURATION;}
}
