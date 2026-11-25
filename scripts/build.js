#!/usr/bin/env node
// Bundles index.html + src/* + the font into ONE self-contained file: dist/lap-dash.html
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'), read=f=>fs.readFileSync(path.join(root,f),'utf8');
const font=fs.readFileSync(path.join(root,'assets/fonts/PressStart2P-Regular.ttf')).toString('base64');
const css=read('src/styles.css').replace(/url\("\.\.\/assets\/fonts\/PressStart2P-Regular\.ttf"\)/,`url(data:font/ttf;base64,${font})`);
const html=read('index.html');
const body=html.slice(html.indexOf('<body>')+6,html.indexOf('<script src='));
const out=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Lap Dash</title>
<style>
${css}
</style></head><body>
${body.trim()}
<script>
${read('src/engine.js')}
${read('src/game.js')}
</script>
</body></html>
`;
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist/lap-dash.html'),out);
console.log('built dist/lap-dash.html',(out.length/1024).toFixed(0)+' KB');
