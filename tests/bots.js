// Scripted drivers used by the tests and the balance simulation.
const E=require('../src/engine.js');
const {T,pointAt,angDiff,minRadAhead}=E;
const SKILL={
  good:  {see:140,noise:0, corner:1.75,dead:.04},
  mid:   {see:120,noise:10,corner:1.65,dead:.06,lift:true,liftAt:.45},
  casual:{see:100,noise:22,corner:1.55,dead:.09,lift:true,liftAt:.3},
};
// returns (race, dt) => {left,right,gas,brake}: steers along the road, brakes for corners, dodges cars ahead
function makeBot(skill){
  let noiseT=0,noise=0;
  return (r,dt)=>{
    const c=r.me; let tgtD=0,brake=false;
    for(const o of r.cars){
      if(o===c||o.dead) continue;
      let ds=o.s-c.s; if(ds<-T.L/2) ds+=T.L; else if(ds>T.L/2) ds-=T.L;
      const dd=o.d-c.d;
      if(ds>-44&&ds<skill.see&&Math.abs(dd)<44){
        tgtD=Math.max(-46,Math.min(46,c.d+(dd>0?-1:1)*48));
        if(ds<60&&Math.abs(dd)<30) brake=c.v>o.v+5;
      }
    }
    noiseT-=dt; if(noiseT<=0){noise=(Math.random()*2-1)*skill.noise; noiseT=.4+Math.random()*.6;}
    const rr=minRadAhead(c.s,45+c.v*.8); if(c.v>(rr<1e8?Math.max(55,rr*skill.corner):999)) brake=true;
    const pt=pointAt(c.s+40+c.v*.28,tgtD+noise);
    const df=angDiff(c.a,Math.atan2(pt.y-c.y,pt.x-c.x));
    return {left:df<-skill.dead,right:df>skill.dead,gas:!brake&&!(skill.lift&&Math.abs(df)>(skill.liftAt||.3)),brake:false};
  };
}
module.exports={SKILL,makeBot};
