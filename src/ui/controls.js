/**
 * The four on-screen buttons (< > BRK GAS) plus the keyboard.
 * Touch works like a real pedal pad: every finger is tracked on its own, and sliding a finger from one button
 * to the next hands the press over (the first lets go, the next is pressed). Lifting the finger or sliding off the pad releases.
 */
class Controls{
  static KEYS={ArrowLeft:'left',a:'left',A:'left',ArrowRight:'right',d:'right',D:'right',ArrowUp:'gas',w:'gas',W:'gas',ArrowDown:'brake',s:'brake',S:'brake'};
  static NAMES=['left','right','brake','gas'];
  constructor(clusterL,clusterR,{onPress}={}){
    this.clusters=[clusterL,clusterR]; this.onPress=onPress||(()=>{});
    this.touch={left:false,right:false,gas:false,brake:false}; this.kb={...this.touch}; this.state={...this.touch};
    this.ptrs=new Map();   // pointerId -> {cluster, key}
    this.btns={}; this.hand='std';
    for(const [k,label] of [['left','<'],['right','>'],['brake','BRK'],['gas','GAS']]){
      const b=document.createElement('button'); b.className='tb'; b.type='button'; b.textContent=label; b.setAttribute('aria-label',k);
      b.addEventListener('contextmenu',e=>e.preventDefault()); this.btns[k]=b;
    }
    for(const cl of this.clusters){
      cl.addEventListener('pointerdown',e=>this._down(e,cl));
      cl.addEventListener('pointermove',e=>this._move(e,cl));
      for(const t of ['pointerup','pointercancel','lostpointercapture']) cl.addEventListener(t,e=>this._up(e));
      cl.addEventListener('contextmenu',e=>e.preventDefault());
    }
    this.layout('std');
  }
  /** Put steering on the left and pedals on the right (STANDARD) or the other way round (SWAPPED). */
  layout(hand){
    this.hand=hand; const b=this.btns, steer=[b.left,b.right], ped=[b.brake,b.gas];
    this.clusters[0].replaceChildren(...(hand==='swap'?ped:steer));
    this.clusters[1].replaceChildren(...(hand==='swap'?steer:ped));
  }
  _keyAt(cl,x,y){
    const R=cl.getBoundingClientRect(), m=24;
    if(x<R.left-m||x>R.right+m||y<R.top-m||y>R.bottom+m) return null;
    let best=null,bd=1e9;
    for(const b of cl.children){
      const r=b.getBoundingClientRect(), dx=Math.max(r.left-x,0,x-r.right), dy=Math.max(r.top-y,0,y-r.bottom), d=dx*dx+dy*dy;
      if(d<bd){bd=d; best=b.getAttribute('aria-label');}
    }
    return best;
  }
  _down(e,cl){
    e.preventDefault(); try{cl.setPointerCapture(e.pointerId);}catch(_){}
    this._set(e.pointerId,cl,this._keyAt(cl,e.clientX,e.clientY));
  }
  _move(e,cl){ if(this.ptrs.has(e.pointerId)) this._set(e.pointerId,cl,this._keyAt(cl,e.clientX,e.clientY)); }
  _up(e){ if(this.ptrs.delete(e.pointerId)) this._refresh(); }
  _set(id,cl,key){
    const prev=this.ptrs.get(id); if(prev&&prev.key===key) return;
    this.ptrs.set(id,{cl,key}); this._refresh();
    if(key) this.onPress(key);
  }
  _refresh(){
    for(const k of Controls.NAMES) this.touch[k]=false;
    for(const {key} of this.ptrs.values()) if(key) this.touch[key]=true;
    this._paint();
  }
  _paint(){for(const k of Controls.NAMES) this.btns[k].classList.toggle('on',this.touch[k]||this.kb[k]);}
  keyDown(key){const k=Controls.KEYS[key]; if(k){this.kb[k]=true; this._paint(); return true;} return false;}
  keyUp(key){const k=Controls.KEYS[key]; if(k){this.kb[k]=false; this._paint();}}
  /** The combined input for this frame. */
  read(){for(const k of Controls.NAMES) this.state[k]=this.touch[k]||this.kb[k]; return this.state;}
  /** Let go of everything (pause, menu, rotate). */
  clear(){this.ptrs.clear(); for(const k of Controls.NAMES){this.touch[k]=false; this.kb[k]=false;} this._paint();}
}
