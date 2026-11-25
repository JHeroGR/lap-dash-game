#!/usr/bin/env node
// Tiny static server for local play:  npm start  ->  http://localhost:8080
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'), port=+process.env.PORT||8080;
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ttf':'font/ttf','.png':'image/png'};
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/')) p+='index.html';
  const f=path.join(root,path.normalize(p));
  if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);return res.end('not found');}
  res.writeHead(200,{'Content-Type':types[path.extname(f)]||'application/octet-stream'}); fs.createReadStream(f).pipe(res);
}).listen(port,()=>console.log(`Lap Dash on http://localhost:${port}  (open it on a phone in landscape)`));
