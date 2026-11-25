// Balance simulation:  node tests/balance.js [races-per-cell=40]
// Scripted drivers of three skill levels race each track; prints how often each one wins / reaches the podium.
const E=require('../src/engine.js'); const {SKILL,makeBot}=require('./bots.js');
const N=+process.argv[2]||40, DT=1/60, KX=1.3, ID={3:'easy',5:'normal',7:'hard'};
console.log(`${N} races per cell (kx ${KX})\n`);
console.log('track             driver   win%  podium%  avg place  crashes/race');
for(const racers of [3,5,7]) for(const lvl of ['good','mid','casual']){
  E.buildTrack(racers,KX); const bot=makeBot(SKILL[lvl]); let win=0,pod=0,fin=0,sum=0,crashes=0;
  for(let k=0;k<N;k++){
    const r=E.makeRace({name:'ME',racers}); let t=0;
    while(t<400&&r.state!=='over'){E.stepRace(r,bot(r,DT),DT); t+=DT; crashes+=r.events.filter(e=>e==='crash').length; r.events.length=0;}
    if(r.state==='over'){fin++; sum+=r.rank; if(r.rank===1)win++; if(r.rank<=3)pod++;}
  }
  console.log(`${(racers+' racers ('+ID[racers]+')').padEnd(18)}${lvl.padEnd(8)} ${String(Math.round(100*win/N)).padStart(4)}  ${String(Math.round(100*pod/N)).padStart(7)}  ${(sum/Math.max(1,fin)).toFixed(1).padStart(5)}/${racers+1}    ${(crashes/N).toFixed(1)}`);
}
