/** The player's settings (name + three choices), saved on the device. */
class Options{
  static KEY='lapdash.v1';
  static FIELDS=[
    {key:'racers',label:'NPC RACERS',vals:[['3','3'],['5','5'],['7','7']]},
    {key:'hand',label:'CONTROLS',vals:[['std','STANDARD'],['swap','SWAPPED']]},
    {key:'snd',label:'SOUND',vals:[['on','ON'],['off','OFF']]}
  ];
  static DEFAULTS={name:'PLAYER',racers:'3',hand:'std',snd:'on'};
  /** Upper-case, letters/digits/space . - _ only, at most 8 characters, never empty. */
  static cleanName(v){return (String(v||'').toUpperCase().replace(/[^A-Z0-9 .\-_]/g,'').trim().slice(0,8))||'PLAYER';}
  /** 1 -> 1ST, 2 -> 2ND, 3 -> 3RD, 4 -> 4TH, 11 -> 11TH ... */
  static ord(n){return n+['TH','ST','ND','RD'][(n%100>=11&&n%100<=13)?0:(n%10<4?n%10:0)];}

  constructor(storage){
    this.storage=storage; Object.assign(this,Options.DEFAULTS);
    try{
      const s=JSON.parse(storage.getItem(Options.KEY)||'{}');
      if(typeof s.name==='string') this.name=Options.cleanName(s.name);
      for(const f of Options.FIELDS) if(typeof s[f.key]==='string'&&f.vals.some(v=>v[0]===s[f.key])) this[f.key]=s[f.key];
    }catch(e){}
  }
  set(k,v){this[k]=v; this.save();}
  save(){
    try{this.storage.setItem(Options.KEY,JSON.stringify({ver:3,name:this.name,racers:this.racers,hand:this.hand,snd:this.snd}));}catch(e){}
  }
  get racerCount(){return +this.racers;}
}
