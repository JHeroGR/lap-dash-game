// One-off check: the class-based engine must behave exactly like the old procedural one (same seed -> same race).
const old=require(process.argv[2]), load=require('./load');
const mulberry=a=>()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
const realRandom=Math.random;
let worst=0, steps=0;
for(const [n,kx] of [[3,1],[5,1.4],[7,1.9]]) for(const seed of [1,2,3]){
  Math.random=mulberry(seed);
  old.buildTrack(n,kx); const A=old.makeRace({racers:n,name:'ME'});
  Math.random=mulberry(seed);
  const E=load(); const B=new E.Race(new E.Track(n,kx),{racers:n,name:'ME'});
  Math.random=mulberry(seed+100);
  const inp=()=>({gas:Math.random()<.9,brake:Math.random()<.05,left:Math.random()<.2,right:Math.random()<.25});
  for(let i=0;i<60*70;i++){
    const u=inp(); const u2={...u};
    // both engines draw from Math.random: keep the streams in lock-step by drawing in the same order
    const st=Math.random; const seq=mulberry(seed*7+i); Math.random=seq; old.stepRace(A,u,1/60);
    Math.random=mulberry(seed*7+i); B.step(u2,1/60); Math.random=st; steps++;
    for(let k=0;k<A.cars.length;k++){
      const a=A.cars[k],b=B.cars[k];
      for(const f of ['x','y','a','v','q','hp']) worst=Math.max(worst,Math.abs(a[f]-b[f]));
    }
    if(A.state!==B.state||A.rank!==B.rank){console.log('MISMATCH',n,seed,i,A.state,B.state,A.rank,B.rank);process.exit(1);}
  }
}
Math.random=realRandom;
console.log('steps',steps,'max diff',worst);
process.exit(worst<1e-9?0:1);
