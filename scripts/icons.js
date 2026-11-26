#!/usr/bin/env node
// Draws the app icons (black & white pixel car on a checkered stripe) with Chromium -> assets/icons/*.png
const {chromium}=require('playwright'),fs=require('fs'),path=require('path');
const out=path.join(__dirname,'..','assets','icons'); fs.mkdirSync(out,{recursive:true});
const ART=['..###....###...','#####....###..#','#########.....#','#####oo########','######o########','#####oo########','#########.....#','#####....###..#','..###....###...'];
const html=`<canvas id=c></canvas><script>
function icon(size,safe){ // safe = fraction of the icon that holds the art (maskable icons need a wide safe margin)
  const c=document.getElementById('c'); c.width=c.height=size; const x=c.getContext('2d');
  x.fillStyle='#000'; x.fillRect(0,0,size,size);
  const art=${JSON.stringify(ART)}, W=15,H=9, px=Math.floor(size*safe/W), w=px*W, h=px*H, ox=Math.round((size-w)/2), oy=Math.round((size-h)/2);
  x.fillStyle='#fff'; const q=Math.round(size/16);
  for(let i=0;i<16;i++){ if(i%2===0) x.fillRect(i*q,oy+h+px*2,q,q); else x.fillRect(i*q,oy+h+px*2+q,q,q); if(i%2===0) x.fillRect(i*q,oy-px*2-q,q,q); else x.fillRect(i*q,oy-px*2-2*q,q,q); }
  for(let r=0;r<H;r++) for(let k=0;k<W;k++){ const ch=art[r][k]; if(ch==='.') continue; x.fillStyle=ch==='#'?'#fff':'#000'; x.fillRect(ox+k*px,oy+r*px,px,px); }
  return c.toDataURL('image/png');
}</script>`;
(async()=>{
  const b=await chromium.launch(), p=await b.newPage(); await p.setContent(html);
  const jobs=[['icon-192.png',192,.72],['icon-512.png',512,.72],['icon-maskable-512.png',512,.5],['apple-touch-icon.png',180,.72],['favicon-32.png',32,.8]];
  for(const [name,size,safe] of jobs){
    const d=await p.evaluate(([s,f])=>icon(s,f),[size,safe]);
    fs.writeFileSync(path.join(out,name),Buffer.from(d.split(',')[1],'base64')); console.log('wrote',name);
  }
  await b.close();
})();
