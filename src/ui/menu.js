/** The start menu: driver name, NPC racers, controls side, sound, START RACE. */
class Menu{
  constructor(root,opts,{onChange,onStart}){
    this.root=root; this.opts=opts; this.onChange=onChange; this.onStart=onStart;
    this.nameEl=root.querySelector('#name'); this.goBtn=root.querySelector('#go');
    const grid=root.querySelector('#grid');
    for(const f of Options.FIELDS){
      const wrap=document.createElement('div'); wrap.className='field';
      const lab=document.createElement('span'); lab.className='fl'; lab.textContent=f.label; lab.id='l-'+f.key;
      const seg=document.createElement('div'); seg.className='seg'; seg.setAttribute('role','group'); seg.setAttribute('aria-labelledby',lab.id);
      for(const [v,t] of f.vals){
        const b=document.createElement('button'); b.className='opt'; b.type='button'; b.textContent=t; b.dataset.k=f.key; b.dataset.v=v;
        b.onclick=()=>{opts.set(f.key,v); this.sync(); this.onChange(f.key,v);};
        seg.append(b);
      }
      wrap.append(lab,seg); grid.append(wrap);
    }
    this.nameEl.value=opts.name;
    this.nameEl.addEventListener('input',e=>{opts.name=Options.cleanName(e.target.value);});
    this.nameEl.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault(); onStart();}});
    this.goBtn.onclick=()=>onStart();
    this.sync();
  }
  get hidden(){return this.root.hidden;}
  show(v){this.root.hidden=!v; if(v) this.sync();}
  sync(){for(const b of this.root.querySelectorAll('.seg .opt')) b.setAttribute('aria-pressed',String(this.opts[b.dataset.k]===b.dataset.v));}
  /** Read the typed name, clean it, show and save it. */
  commitName(){const n=Options.cleanName(this.nameEl.value); this.nameEl.value=n; this.opts.name=n; this.opts.save(); return n;}
  /** The menu's title picture: three cars between road dashes. */
  drawLogo(canvas,sprites){
    const c=canvas.getContext('2d'); c.fillStyle='#000'; c.fillRect(0,0,280,110);
    c.fillStyle='#fff'; for(let x=0;x<280;x+=28) c.fillRect(x,92,14,4); for(let x=0;x<280;x+=28) c.fillRect(x+14,14,14,4);
    sprites.draw(c,140,54,0,true,3.6); sprites.draw(c,50,54,-.39,false,3.6); sprites.draw(c,230,56,.39,false,3.6);
  }
}
