/* Small math helpers shared by the engine and the UI. */
const PI=Math.PI, TAU=PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/** Smallest signed difference between two angles (radians). */
const angDiff=(a,b)=>{let d=(b-a)%TAU; if(d>PI)d-=TAU; if(d<-PI)d+=TAU; return d;};
