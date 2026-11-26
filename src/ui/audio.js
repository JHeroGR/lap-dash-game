/** All sound: square-wave beeps, engine/pedal blips and a 1-bit arcade explosion. One fixed master volume. */
class AudioManager{
  static LOUD=3.2;   // one fixed master volume for every sound; nothing ramps or changes it
  constructor(opts){this.opts=opts; this.ac=null;}
  get enabled(){return this.opts.snd==='on';}
  /** The AudioContext, created on first use and resumed if the phone suspended it. */
  context(){
    try{
      if(!this.ac){
        const AC=window.AudioContext||window.webkitAudioContext; if(!AC) return null;
        this.ac=new AC(); const g=this.ac.createGain(); g.gain.value=AudioManager.LOUD; g.connect(this.ac.destination); this.ac.out=g;
      }
      if(this.ac.state==='suspended') this.ac.resume();
    }catch(e){}
    return this.ac;
  }
  /** Phones keep audio locked until a touch: play a silent sound inside the first gesture. Wired up once. */
  installUnlock(){
    const EV=['touchend','pointerup','keydown','click'];
    const un=()=>{
      const a=this.context(); if(!a) return;
      try{const b=a.createBuffer(1,1,22050), s=a.createBufferSource(); s.buffer=b; s.connect(a.out); s.start(0);}catch(e){}
      for(const ev of EV) removeEventListener(ev,un,true);
    };
    for(const ev of EV) addEventListener(ev,un,true);
  }
  // Wait for the context to be running before scheduling any sound, so the first tap is heard too.
  _run(fn){
    if(!this.enabled) return; const a=this.context(); if(!a) return;
    if(a.state==='running') fn(a); else a.resume().then(()=>fn(a)).catch(()=>{});
  }
  beep(f,d,type,vol){
    this._run(a=>{try{
      const o=a.createOscillator(), g=a.createGain(), t=a.currentTime; vol=vol||.05;
      o.type=type||'square'; o.frequency.value=f; o.connect(g); g.connect(a.out);
      g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.0001,t+d); o.start(t); o.stop(t+d+.02);
    }catch(e){}});
  }
  rev(f0,f1,d,vol,lp){
    this._run(a=>{try{
      const t=a.currentTime, o=a.createOscillator(), f=a.createBiquadFilter(), g=a.createGain();
      o.type='sawtooth'; o.frequency.setValueAtTime(f0,t); o.frequency.exponentialRampToValueAtTime(f1,t+d);
      f.type='lowpass'; f.frequency.value=lp||900;
      g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(vol,t+Math.min(.02,d/3)); g.gain.exponentialRampToValueAtTime(.0001,t+d);
      o.connect(f); f.connect(g); g.connect(a.out); o.start(t); o.stop(t+d+.03);
    }catch(e){}});
  }
  squeal(d,vol){
    this._run(a=>{try{
      const n=Math.floor(a.sampleRate*d), buf=a.createBuffer(1,n,a.sampleRate), ch=buf.getChannelData(0);
      for(let i=0;i<n;i++) ch[i]=(Math.random()*2-1)*(1-i/n);
      const s=a.createBufferSource(), f=a.createBiquadFilter(), g=a.createGain(), t=a.currentTime;
      f.type='bandpass'; f.Q.value=6; f.frequency.setValueAtTime(2200,t); f.frequency.exponentialRampToValueAtTime(1100,t+d);
      g.gain.value=vol; s.buffer=buf; s.connect(f); f.connect(g); g.connect(a.out); s.start(t);
    }catch(e){}});
  }
  /** Button sounds: 'gas' | 'brake' | 'steer' | 'start' | anything else = menu tap. */
  sfx(k){
    if(k==='gas') this.rev(85,190,.16,.07,1100);
    else if(k==='brake'){this.squeal(.11,.09); this.rev(120,70,.09,.04,500);}
    else if(k==='steer') this.beep(520,.025,'square',.025);
    else if(k==='start'){this.rev(70,300,.38,.09,1400); setTimeout(()=>this.rev(150,330,.2,.06,1400),260);}
    else this.rev(110,230,.09,.06,1000);
  }
  boom(){
    this._run(a=>{try{
      // crunchy 1-bit noise: the noise rate falls over time and the volume drops in coarse steps, like an old arcade chip
      const n=Math.floor(a.sampleRate*.8), buf=a.createBuffer(1,n,a.sampleRate), ch=buf.getChannelData(0);
      let val=1;
      for(let i=0;i<n;i++){
        const t=i/n, hold=Math.max(1,Math.floor(3+t*t*90));
        if(i%hold===0) val=Math.random()<.5?-1:1;
        ch[i]=val*Math.round(Math.pow(1-t,1.5)*7)/7;
      }
      const s=a.createBufferSource(), g=a.createGain(); g.gain.value=.15; s.buffer=buf; s.connect(g); g.connect(a.out); s.start();
      const o=a.createOscillator(), og=a.createGain(), t0=a.currentTime;
      o.type='square'; o.frequency.setValueAtTime(170,t0); o.frequency.exponentialRampToValueAtTime(28,t0+.42);
      og.gain.setValueAtTime(.09,t0); og.gain.exponentialRampToValueAtTime(.0001,t0+.48);
      o.connect(og); og.connect(a.out); o.start(t0); o.stop(t0+.5);
    }catch(e){}});
  }
  /** Turn a race event ('crash','bump','go','lap','finish') into its sound. */
  play(e){
    if(e==='crash') this.boom();
    else if(e==='bump') this.beep(120,.09,'square',.12);
    else if(e==='go') this.beep(880,.4);
    else if(e==='lap'){this.beep(660,.12); setTimeout(()=>this.beep(990,.15),130);}
    else if(e==='finish'){this.beep(660,.15); setTimeout(()=>this.beep(880,.15),160); setTimeout(()=>this.beep(1180,.3),320);}
  }
}
