/** Pixel-art car sprites: 15x9 pixels, nose pointing right, baked at 8 headings so turning steps like an old arcade game. */
class SpriteSheet{
  static ART=[
    '..###....###...',
    '#####....###..#',
    '#########.....#',
    '#####oo########',
    '######o########',
    '#####oo########',
    '#########.....#',
    '#####....###..#',
    '..###....###...'
  ];
  static W=15; static H=9; static SIZE=21; static ANGLES=8; static PX=3.5;
  static hollow(src){
    const {W,H}=SpriteSheet, at=(r,c)=>r>=0&&r<H&&c>=0&&c<W&&src[r][c]!=='.';
    return src.map((row,r)=>[...row].map((ch,c)=>(ch==='#'&&at(r-1,c)&&at(r+1,c)&&at(r,c-1)&&at(r,c+1))?'o':ch).join(''));
  }
  static bake(src){
    const {W,H,SIZE:SS,ANGLES}=SpriteSheet, out=[];
    for(let k=0;k<ANGLES;k++){
      const th=k*TAU/ANGLES, co=Math.cos(th), si=Math.sin(th);
      const cvs=document.createElement('canvas'); cvs.width=cvs.height=SS;
      const c=cvs.getContext('2d'), img=c.createImageData(SS,SS);
      for(let y=0;y<SS;y++) for(let x=0;x<SS;x++){
        const dx=x+.5-SS/2, dy=y+.5-SS/2;
        const sx=Math.floor(dx*co+dy*si+W/2), sy=Math.floor(-dx*si+dy*co+H/2);
        if(sx<0||sy<0||sx>=W||sy>=H) continue;
        const ch=src[sy][sx]; if(ch==='.') continue;
        const i=(y*SS+x)*4, v=ch==='#'?255:0;
        img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255;
      }
      c.putImageData(img,0,0); out.push(cvs);
    }
    return out;
  }
  constructor(){this.player=SpriteSheet.bake(SpriteSheet.ART); this.rival=SpriteSheet.bake(SpriteSheet.hollow(SpriteSheet.ART));}
  /** Draw a car centred on (x,y) heading `a`; `solid` = the player's white car, otherwise an outlined rival. U = pixel size. */
  draw(c,x,y,a,solid,U){
    const {SIZE,ANGLES,PX}=SpriteSheet; U=U||PX;
    const k=((Math.round(a/(TAU/ANGLES))%ANGLES)+ANGLES)%ANGLES, sz=SIZE*U;
    c.imageSmoothingEnabled=false;
    c.drawImage((solid?this.player:this.rival)[k],x-sz/2,y-sz/2,sz,sz);
  }
}
