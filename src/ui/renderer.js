/** Draws a race (or the demo) on the canvas: black ground, road, start boxes, finish line, cars and explosions. */
class Renderer{
  static EXP_P=7;          // size of one explosion cell
  static EXP_FPS=14;       // explosions step at 14 frames a second
  constructor(canvas,sprites){this.cv=canvas; this.ctx=canvas.getContext('2d'); this.sprites=sprites; this.dpr=1; this.paths=new WeakMap();}
  resize(w,h){this.dpr=Math.min(2,window.devicePixelRatio||1); this.cv.width=Math.round(w*this.dpr); this.cv.height=Math.round(h*this.dpr);}
  pathOf(t){
    let p=this.paths.get(t); if(p) return p;
    p=new Path2D(); const g0=t.segs[0]; p.moveTo(g0.x0,g0.y0);
    for(const g of t.segs){
      if(g.k==='L') p.lineTo(g.x0+g.co*g.len,g.y0+g.si*g.len);
      else p.arc(g.cx,g.cy,g.r,g.a0,g.a0+g.sg*g.ang,g.sg<0);
    }
    p.closePath(); this.paths.set(t,p); return p;
  }
  drawTrack(t,total){
    const c=this.ctx, P=this.pathOf(t), W=t.TW;
    c.lineJoin='round'; c.lineCap='butt'; c.setLineDash([]);
    c.strokeStyle='#fff'; c.lineWidth=W+t.EDGE; c.stroke(P);                 // road edge lines: wide white, narrower black on top
    c.strokeStyle='#000'; c.lineWidth=W-t.EDGE; c.stroke(P);
    c.strokeStyle='#fff'; c.setLineDash([12,12]); c.lineWidth=W-t.EDGE; c.stroke(P);   // dashed rails just inside the edges
    c.setLineDash([]); c.strokeStyle='#000'; c.lineWidth=W-t.EDGE-16; c.stroke(P);
    c.strokeStyle='#777'; c.lineWidth=2.5; c.setLineDash([16,22]); c.stroke(P); c.setLineDash([]);   // centre line
    c.strokeStyle='#555'; c.lineWidth=1.5;                                    // start grid boxes
    for(let k=0;k<total;k++){const g=t.gridSlot(k), p=t.pointAt(g.s,g.d); c.save(); c.translate(p.x,p.y); c.rotate(p.a); c.strokeRect(-34,-20,68,40); c.restore();}
    const f=t.pointAt(t.FIN,0), q=W/12;                                       // checkered finish line
    c.save(); c.translate(f.x,f.y); c.rotate(f.a); c.fillStyle='#fff';
    for(let row=0;row<12;row++) for(let col=0;col<2;col++) if((row+col)%2===0) c.fillRect(-q+col*q,-W/2+row*q,q,q);
    c.restore();
  }
  /** Pixel explosion: chunky square cells on a fixed grid. */
  drawExplosion(f){
    const c=this.ctx, fr=Math.floor(f.t*Renderer.EXP_FPS); if(fr>=15) return;
    const P=Renderer.EXP_P;
    const hs=(a,b,k)=>{let h=Math.imul(a+101,73856093)^Math.imul(b+101,19349663)^Math.imul(k+7,83492791)^f.seed; h=Math.imul(h^(h>>>13),1274126177); return ((h^(h>>>16))>>>0)%100;};
    c.save(); c.translate(f.x,f.y); c.fillStyle='#fff';
    const cell=(gx,gy,s)=>c.fillRect(gx*P-s/2,gy*P-s/2,s,s);
    if(fr<3){
      const rad=[2.2,3.4,4.4][fr];
      for(let gy=-5;gy<=5;gy++) for(let gx=-5;gx<=5;gx++) if(gx*gx+gy*gy<=rad*rad) cell(gx,gy,P);
    }else if(fr<11){
      const rad=3.6+(fr-3)*.9, keep=100-(fr-3)*9;
      for(let gy=-11;gy<=11;gy++) for(let gx=-11;gx<=11;gx++){
        const dd=Math.hypot(gx,gy);
        if(Math.abs(dd-rad)<=1.1&&hs(gx,gy,fr)<keep) cell(gx,gy,P);
        else if(fr<6&&dd<=2.1&&hs(gx,gy,fr+50)<70) cell(gx,gy,P);
      }
    }
    f.deb.forEach((d,i)=>{
      if(fr>=13||(fr>=9&&hs(i,0,fr)>=55)) return;
      const gx=Math.round(Math.cos(d.a)*d.v*f.t/P), gy=Math.round(Math.sin(d.a)*d.v*f.t/P);
      cell(gx,gy,(d.big&&fr<8)?P:P*.55);
    });
    c.restore();
  }
  /** One frame. `race` may be null (black screen). vb = {cx,cy,sc}: where the track's centre goes and how big it is. */
  render(w,h,race,vb){
    const c=this.ctx; c.setTransform(this.dpr,0,0,this.dpr,0,0); c.fillStyle='#000'; c.fillRect(0,0,w,h);
    if(!race) return;
    const t=race.track; c.translate(vb.cx,vb.cy); c.scale(vb.sc,vb.sc); c.translate(-t.bx,-t.by);
    this.drawTrack(t,race.cars.length);
    const me=race.me;
    for(const k of race.cars) if(!k.me) this.sprites.draw(c,k.x,k.y,k.a,false);
    if(!me.dead&&!(me.inv>0&&Math.floor(race.t*10)%2===0)) this.sprites.draw(c,me.x,me.y,me.a,true);
    for(const f of race.fx) this.drawExplosion(f);
  }
}
