/** Lap Dash: wires the objects together and runs the frame loop. Exposed as `window.game`. */
class Game{
  constructor(doc=document){
    const $=s=>doc.querySelector(s);
    this.app=$('#app'); this.cv=$('#cv');
    this.opts=new Options(Game.storage());
    this.audio=new AudioManager(this.opts);
    this.sprites=new SpriteSheet();
    this.renderer=new Renderer(this.cv,this.sprites);
    this.hud=new Hud($('#hud'),this.audio);
    this.viewport=new Viewport(this.app,{hud:this.hud.root,top:this.hud.top,light:this.hud.light});
    this.demo=new Demo(this.viewport);
    this.pausescr=$('#pausescr'); this.endscr=$('#endscr'); this.rotEl=$('#rotate');
    this.race=null; this.paused=false; this.endShown=false; this.last=0;
    this.controls=new Controls($('#ctrlL'),$('#ctrlR'),{onPress:k=>this.audio.sfx(k==='gas'?'gas':k==='brake'?'brake':'steer')});
    this.controls.layout(this.opts.hand);
    this.menu=new Menu($('#menu'),this.opts,{
      onChange:(k,v)=>{ if(k==='hand') this.controls.layout(v); this.layout(); if(k==='racers') this.demo.switchTo(this.opts.racerCount); },
      onStart:()=>this.startRace()
    });
    this.menu.drawLogo($('#logo'),this.sprites);
    $('#again').onclick=$('#restart1').onclick=()=>this.startRace();
    $('#resume').onclick=$('#pause').onclick=()=>this.togglePause();
    $('#tomenu1').onclick=$('#tomenu2').onclick=()=>this.showMenu();
    this.bindEvents(doc);
    this.layout(); this.demo.start(this.opts.racerCount);
    requestAnimationFrame(t=>this.frame(t));
  }
  /** localStorage, or a do-nothing stand-in when the browser blocks it (private mode, cleared site data). */
  static storage(){
    try{const s=window.localStorage; s.getItem('lapdash.v1'); return s;}catch(e){return {getItem:()=>null,setItem:()=>{}};}
  }
  get track(){return (this.race||this.demo.race||{}).track;}
  get inRace(){return !!this.race&&!this.hud.hidden;}

  bindEvents(doc){
    this.audio.installUnlock();
    // menu / screen buttons click: a quick rev (or the start sound for the "go" buttons)
    doc.addEventListener('click',e=>{
      const b=e.target.closest&&e.target.closest('button'); if(!b||b.classList.contains('tb')) return;
      this.audio.sfx(['go','again','restart1','resume'].includes(b.id)?'start':'tap');
    });
    addEventListener('keydown',e=>{
      if(this.inRace&&!this.paused&&this.controls.keyDown(e.key)){e.preventDefault(); return;}
      if((e.key==='p'||e.key==='P'||e.key==='Escape')&&this.inRace&&this.race.state!=='over') this.togglePause();
    });
    addEventListener('keyup',e=>this.controls.keyUp(e.key));
    doc.addEventListener('visibilitychange',()=>{if(doc.hidden&&this.inRace&&!this.paused&&this.race.state!=='over') this.togglePause();});
    new ResizeObserver(()=>this.layout()).observe(this.app);
    addEventListener('resize',()=>this.layout());
    addEventListener('orientationchange',()=>setTimeout(()=>this.layout(),150));
  }

  layout(){
    const vp=this.viewport, w=vp.width, h=vp.height; if(!w||!h) return;
    this.renderer.resize(w,h);
    this.app.dataset.view='h'; this.app.classList.toggle('portrait',h>w);
    if(this.track) vp.compute(this.track);
    if(!this.menu.hidden&&this.demo.race&&this.demo.sig!==w+'x'+h) this.demo.start(this.opts.racerCount);
    this.updateRotate();
  }
  /** Everything is landscape: an upright phone gets a "turn your phone" screen, and a race in progress pauses until it is sideways again. */
  updateRotate(){
    const inRace=this.inRace&&this.race.state!=='over';
    if(this.viewport.isLandscape){this.rotEl.hidden=true; return;}
    if(inRace&&!this.paused){this.paused=true; this.pausescr.hidden=false; this.controls.clear();}
    this.rotEl.querySelector('#rotmsg').textContent=inRace?'THE RACE IS PAUSED. HOLD YOUR PHONE SIDEWAYS (LANDSCAPE) TO CARRY ON.':'HOLD YOUR PHONE SIDEWAYS (LANDSCAPE) TO PLAY.';
    this.rotEl.hidden=false;
  }

  showMenu(){
    this.race=null; this.paused=false; this.controls.clear();
    this.hud.show(false); this.pausescr.hidden=true; this.endscr.hidden=true; this.menu.show(true);
    this.demo.start(this.opts.racerCount);
  }
  startRace(){
    this.menu.commitName(); this.audio.context();
    this.menu.show(false); this.endscr.hidden=true; this.pausescr.hidden=true; this.hud.show(true);
    this.layout();
    const t=this.viewport.fit(this.opts.racerCount);
    this.race=new Race(t,{name:this.opts.name,racers:this.opts.racerCount});
    this.endShown=false; this.paused=false; this.hud.reset(); this.controls.clear(); this.controls.layout(this.opts.hand);
    this.hud.update(this.race); this.layout();
  }
  togglePause(){
    if(!this.inRace) return;
    this.paused=!this.paused; this.pausescr.hidden=!this.paused; this.controls.clear();
  }
  showEnd(){
    this.endShown=true; const r=this.race, n=r.rank;
    this.endscr.querySelector('#endt').textContent=n===1?'YOU WIN!':'FINISHED';
    this.endscr.querySelector('#ends').textContent='YOU TOOK '+Options.ord(n)+' PLACE OF '+r.cars.length+' RACERS.';
    this.endscr.hidden=false;
  }

  /** Advance the game by dt seconds (no drawing). Used by the frame loop and by tests. */
  update(dt){
    if(this.inRace&&!this.paused){
      this.race.step(this.controls.read(),dt);
      for(const e of this.race.events.splice(0)) this.audio.play(e);
      this.hud.update(this.race);
      if(this.race.state==='over'&&!this.endShown) this.showEnd();
    }else if(!this.menu.hidden) this.demo.step(dt,this.opts.racerCount);
  }
  draw(){
    const R=this.inRace?this.race:(!this.menu.hidden?this.demo.race:null);
    this.renderer.render(this.viewport.width,this.viewport.height,R,this.viewport.vb);
  }
  frame(t){
    requestAnimationFrame(t2=>this.frame(t2));
    const dt=Math.min(.033,(t-this.last)/1000||0); this.last=t;
    this.update(dt); this.draw();
  }
}
window.game=new Game();
