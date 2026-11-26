/** Works out where the track goes on screen: the free area under the top bar, clear of the stoplight. Landscape only. */
class Viewport{
  constructor(app,{hud,top,light}){this.app=app; this.hud=hud; this.top=top; this.light=light; this.vb={cx:0,cy:0,sc:1};}
  get width(){return this.app.clientWidth;}
  get height(){return this.app.clientHeight;}
  get isLandscape(){return this.width>=this.height;}
  box(){
    const w=this.width, h=this.height, hudOn=!this.hud.hidden, appTop=this.app.getBoundingClientRect().top;
    const top=hudOn?this.top.getBoundingClientRect().bottom-appTop+4:10, bot=hudOn?0:10;
    const left=hudOn?this.light.offsetWidth+26:0;
    return {w,h,top,bot,left,aw:w-left,ah:h-top-bot};
  }
  /** Build the chosen track for this screen: stretched sideways when the screen is wider than the track. */
  fit(id){const A=this.box(); return Track.fitted(id,A.aw/A.ah);}
  compute(track){
    const A=this.box(); if(!A.w||!A.h) return this.vb;
    this.vb={cx:A.left+A.aw/2,cy:A.top+A.ah/2,sc:Math.min(A.aw/track.bw,A.ah/track.bh)}; return this.vb;
  }
}
