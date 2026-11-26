/**
 * A closed race track.
 * Each track is a list of waypoints (clockwise on screen, first leg = start straight heading east) with a corner radius
 * per waypoint. Corners are rounded into arcs, so the road is a list of straight (L) and arc (A) segments.
 * Positions on the road are (s, d): s = distance along the centreline, d = sideways offset (positive = right of travel).
 * The number of NPC racers picks the track: 3 = easy, 5 = moderate, 7 = hard.
 */
class Track{
  static TW=136;       // road width
  static EDGE=5;       // edge line thickness
  static FIN=330;      // finish line position along the road
  static DEFS={
    3:{name:'EASY',     // plain rounded rectangle, wide gentle corners
       pts:[[-310,-130],[310,-130],[310,130],[-310,130]], rad:[90,90,90,90]},
    5:{name:'MODERATE', // rounded rectangle with an S-bend on the bottom straight
       pts:[[-310,-130],[310,-130],[310,130],[130,130],[70,60],[-30,60],[-90,130],[-310,130]], rad:[80,80,80,70,70,70,70,80]},
    7:{name:'HARD',     // rounded rectangle with two deep, tight U-shaped bays cut into the bottom
       pts:[[-410,-150],[410,-150],[410,150],[255,150],[255,20],[75,20],[75,150],[-75,150],[-75,20],[-255,20],[-255,150],[-410,150]],
       rad:[80,80,80,60,60,60,60,60,60,60,60,75]}
  };
  static AI_OF={3:'easy',5:'normal',7:'hard'};
  static IDS=[3,5,7];

  /** kx stretches the circuit sideways (>=1) so it can fill a wide screen; corner radii stay the same. */
  constructor(id,kx=1){
    const def=Track.DEFS[id]; if(!def) throw new Error('unknown track '+id);
    this.id=id; this.kx=kx; this.name=def.name; this.TW=Track.TW; this.EDGE=Track.EDGE; this.FIN=Track.FIN;
    const n=def.pts.length, P=def.pts.map(p=>({x:p[0]*kx,y:p[1]}));
    const dir=[], ln=[];
    for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n],dx=b.x-a.x,dy=b.y-a.y,l=Math.hypot(dx,dy); dir.push({x:dx/l,y:dy/l}); ln.push(l);}
    const F=[];
    for(let i=0;i<n;i++){
      const din=dir[(i+n-1)%n], dout=dir[i];
      const th=Math.atan2(din.x*dout.y-din.y*dout.x, din.x*dout.x+din.y*dout.y);
      if(Math.abs(th)<1e-4){F.push({t:0}); continue;}
      let r=def.rad[i], t=r*Math.tan(Math.abs(th)/2);
      const cap=.49*Math.min(ln[(i+n-1)%n],ln[i]);
      if(t>cap){t=cap; r=t/Math.tan(Math.abs(th)/2);}
      const A={x:P[i].x-din.x*t,y:P[i].y-din.y*t}, B={x:P[i].x+dout.x*t,y:P[i].y+dout.y*t}, sg=Math.sign(th);
      const C={x:A.x-sg*din.y*r,y:A.y+sg*din.x*r};
      F.push({t,r,th,sg,A,B,C,a0:Math.atan2(A.y-C.y,A.x-C.x)});
    }
    const segs=[]; let s=0;
    for(let i=0;i<n;i++){
      const f=F[i], j=(i+1)%n, g=F[j];
      const x0=f.t?f.B.x:P[i].x, y0=f.t?f.B.y:P[i].y, x1=g.t?g.A.x:P[j].x, y1=g.t?g.A.y:P[j].y;
      const l=Math.hypot(x1-x0,y1-y0), a=Math.atan2(dir[i].y,dir[i].x);
      segs.push({k:'L',s0:s,len:l,x0,y0,a,co:Math.cos(a),si:Math.sin(a)}); s+=l;
      if(g.t){const al=g.r*Math.abs(g.th); segs.push({k:'A',s0:s,len:al,cx:g.C.x,cy:g.C.y,r:g.r,a0:g.a0,sg:g.sg,ang:Math.abs(g.th)}); s+=al;}
    }
    this.segs=segs; this.L=s;
    // bounding box of the whole road, with a margin
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    for(let u=0;u<s;u+=4){const p=this.pointAt(u,0); x0=Math.min(x0,p.x); x1=Math.max(x1,p.x); y0=Math.min(y0,p.y); y1=Math.max(y1,p.y);}
    const pad=this.TW/2+this.EDGE/2+8;
    this.pad=pad; this.bx=(x0+x1)/2; this.by=(y0+y1)/2; this.bw=x1-x0+2*pad; this.bh=y1-y0+2*pad;
  }

  /** A track stretched sideways so its bounding box matches an aspect ratio `want` (width/height), capped at 1.9x. */
  static fitted(id,want){
    const t1=new Track(id,1), w0=t1.bw-2*t1.pad;
    return new Track(id,clamp((want*t1.bh-2*t1.pad)/w0,1,1.9));
  }

  wrap(s){return ((s%this.L)+this.L)%this.L;}
  segAt(s){
    s=this.wrap(s);
    for(let i=this.segs.length-1;i>=0;i--) if(s>=this.segs[i].s0) return [this.segs[i],s-this.segs[i].s0];
    return [this.segs[0],0];
  }
  /** World position and heading at road coordinates (s, d). */
  pointAt(s,d){
    const [g,u]=this.segAt(s); let x,y,a;
    if(g.k==='L'){x=g.x0+g.co*u; y=g.y0+g.si*u; a=g.a;}
    else{const f=g.a0+g.sg*u/g.r; x=g.cx+g.r*Math.cos(f); y=g.cy+g.r*Math.sin(f); a=f+g.sg*PI/2;}
    return {x:x-Math.sin(a)*d,y:y+Math.cos(a)*d,a};
  }
  /** Nearest road coordinates (s, d) of a world position. */
  project(x,y){
    let best=1e18,bs=0,bd=0;
    for(const g of this.segs){
      let u,px,py,a;
      if(g.k==='L'){u=clamp((x-g.x0)*g.co+(y-g.y0)*g.si,0,g.len); px=g.x0+g.co*u; py=g.y0+g.si*u; a=g.a;}
      else{
        const f=Math.atan2(y-g.cy,x-g.cx); let rel=g.sg*(f-g.a0); rel=((rel%TAU)+TAU)%TAU;
        if(rel<=g.ang) u=rel*g.r; else u=(rel<(g.ang+TAU)/2)?g.len:0;
        const ff=g.a0+g.sg*u/g.r; px=g.cx+g.r*Math.cos(ff); py=g.cy+g.r*Math.sin(ff); a=ff+g.sg*PI/2;
      }
      const dx=x-px, dy=y-py, dd=dx*dx+dy*dy;
      if(dd<best){best=dd; bs=g.s0+u; bd=-dx*Math.sin(a)+dy*Math.cos(a);}
    }
    return {s:this.wrap(bs),d:bd};
  }
  /** Smallest corner radius in the next D units of road (the AI brakes for it). */
  minRadAhead(s,D){
    let m=1e9;
    for(const g of this.segs){
      if(g.k!=='A'||g.r>=m) continue;
      for(let k=0;k<2;k++){const a0=g.s0+k*this.L; if(a0+g.len>s&&a0<s+D){m=g.r; break;}}
    }
    return m;
  }
  /** Starting grid: two cars per row, row 0 at the front. */
  gridSlot(i){const row=i>>1,col=i&1; return {s:this.FIN-52-row*68-(col?34:0), d:col?26:-26};}
}
