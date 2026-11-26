// Loads the classic-script engine files into one vm context (same as the browser does) and returns its exports.
const fs=require('fs'),path=require('path'),vm=require('vm');
const FILES=['math','track','car','race'];
module.exports=function load(){
  const ctx=vm.createContext({Math,console,module:undefined});
  const code=FILES.map(f=>fs.readFileSync(path.join(__dirname,'..','src','engine',f+'.js'),'utf8')).join('\n;\n')+
    '\n;this.__x={PI,TAU,clamp,angDiff,Track,Car,CarSpec,Explosion,Race,DIFFS,NAMES};';
  vm.runInContext(code,ctx);
  return ctx.__x;
};
