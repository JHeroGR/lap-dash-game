/** The on-screen display during a race: pause + lap, health bar, position and leaderboard, stoplight. */
class Hud{
  constructor(root,audio){
    const $=s=>root.querySelector(s);
    this.root=root; this.audio=audio; this.top=$('#top'); this.light=$('#light'); this.lamps=[...this.light.children];
    this.lapEl=$('#lap'); this.lifeEl=$('#life'); this.fill=$('#hpfill'); this.posn=$('#posn'); this.posof=$('#posof'); this.rows=$('#rows'); this.pauseBtn=$('#pause');
    this.reset();
  }
  get hidden(){return this.root.hidden;}
  show(v){this.root.hidden=!v;}
  reset(){this.boardKey=''; this.lastLap=''; this.lastLife=-1; this.lastSig=''; this.lastRank=0;}
  static row(c,i){
    const li=document.createElement('li'); if(c.me) li.className='me'; li.title=c.name;
    const b=document.createElement('b'); b.textContent=String(i+1); const s=document.createElement('span'); s.textContent=c.name.slice(0,3);
    li.append(b,s); return li;
  }
  update(r){
    const me=r.me, L=r.track.L;
    const lap=clamp(Math.max(Math.floor(me.q/L)+1,me.lapMin),1,r.laps), txt=lap+'/'+r.laps;
    if(txt!==this.lastLap){this.lastLap=txt; this.lapEl.textContent=txt;}
    const hp=Math.ceil(me.hp);
    if(hp!==this.lastLife){
      if(this.lastLife>hp&&hp>0){this.lifeEl.classList.remove('hit'); void this.lifeEl.offsetWidth; this.lifeEl.classList.add('hit');}
      this.lastLife=hp; this.fill.style.width=hp+'%'; this.lifeEl.classList.toggle('low',hp<=30);
    }
    this.posof.textContent='/'+r.cars.length;
    if(r.rank!==this.lastRank){this.lastRank=r.rank; this.posn.textContent=r.rank;}
    const key=r.order.map(c=>c.name+(c.me?'*':'')).join('|');
    if(key!==this.boardKey){this.boardKey=key; this.rows.replaceChildren(...r.order.map(Hud.row));}
    // stoplight: lamps come on one by one, then the third lamp flashes GO
    let lit=0, go=false;
    if(r.state==='countdown') lit=clamp(4-Math.ceil(r.cd),0,3); else if(r.goT>0) go=true;
    const vis=r.state==='countdown'||go, sig=(vis?'v':'h')+(go?'g':lit);
    if(sig!==this.lastSig){
      this.lastSig=sig; this.light.classList.toggle('off',!vis);
      this.lamps.forEach((l,i)=>l.classList.toggle('on',!go&&lit>i));
      this.lamps[2].classList.toggle('go',go);
      if(lit>0&&!go) this.audio.beep(440,.15);
    }
  }
}
