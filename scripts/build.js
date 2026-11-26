#!/usr/bin/env node
// Bundles index.html + src/** + the font into ONE self-contained page.
//   dist/lap-dash.html  single file (works from file://, easy to share)
//   www/                the deployable web root: index.html + manifest + service worker + icons (PWA; also what Capacitor wraps)
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'), p=f=>path.join(root,f), read=f=>fs.readFileSync(p(f),'utf8');
const pkg=JSON.parse(read('package.json'));
const html=read('index.html');
const font=fs.readFileSync(p('assets/fonts/PressStart2P-Regular.ttf')).toString('base64');
const css=read('src/styles.css').replace(/url\("\.\.\/assets\/fonts\/PressStart2P-Regular\.ttf"\)/,`url(data:font/ttf;base64,${font})`);
const body=html.slice(html.indexOf('<body>')+6,html.indexOf('<script src=')).trim();
const scripts=[...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m=>m[1]);   // the order in index.html is the load order
const js=scripts.map(f=>read(f)).join('\n');
const page=(head,tail)=>`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<title>Lap Dash</title>
${head}<style>
${css}
</style></head><body>
${body}
<script>
${js}
</script>
${tail}</body></html>
`;
const pwaHead=`<meta name="theme-color" content="#000000">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Lap Dash">
<meta name="description" content="A retro black-and-white, top-down racing game for phones.">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
`;
const swReg=`<script>
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
</script>
`;
fs.mkdirSync(p('dist'),{recursive:true});
fs.writeFileSync(p('dist/lap-dash.html'),page('',''));
fs.rmSync(p('www'),{recursive:true,force:true}); fs.mkdirSync(p('www/icons'),{recursive:true});
fs.writeFileSync(p('www/index.html'),page(pwaHead,swReg));
fs.copyFileSync(p('pwa/manifest.webmanifest'),p('www/manifest.webmanifest'));
fs.writeFileSync(p('www/sw.js'),read('pwa/sw.js').replace('__VERSION__',pkg.version));
for(const f of fs.readdirSync(p('assets/icons'))) fs.copyFileSync(p('assets/icons/'+f),p('www/icons/'+f));
fs.copyFileSync(p('pwa/_headers'),p('www/_headers'));
console.log('built dist/lap-dash.html and www/ ('+(fs.statSync(p('www/index.html')).size/1024).toFixed(0)+' KB page,',scripts.length,'scripts)');
