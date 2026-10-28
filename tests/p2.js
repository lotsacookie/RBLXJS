const fs=require('fs');require('../rbx-parser.js');const P=globalThis.RBXParser;
const b='/home/claude/lotsacookie/rblx16/';
const bp=P.parse(fs.readFileSync(b+'RobloxStudio/content/FirstPlaceBasePlate.rbxl'));
P.walk(bp.roots,n=>{if(n.className==='Part'){const k=Object.keys(n.props).filter(x=>/size|shape|form|Size/i.test(x));console.log(k.map(x=>x+'='+JSON.stringify(n.props[x])).join(' '));}});
const ch=P.parse(fs.readFileSync(b+'content/fonts/character3.rbxm'));
P.walk(ch.roots,n=>{const p=n.props;console.log(n.className,p.Name,JSON.stringify(p.size||p.Size||''),JSON.stringify(p.Texture||''),JSON.stringify(p.MeshType||''),JSON.stringify(p.Scale||''),JSON.stringify(p.Face||''),JSON.stringify(p.BrickColor||''));});
const fp=P.parse(fs.readFileSync(b+'RobloxStudio/content/FirstPlace.rbxl'));
let c=0;P.walk(fp.roots,n=>{if(n.className==='ManualWeld'&&c++<2)console.log(JSON.stringify(n.props).slice(0,500));if(n.className==='Script'&&c<6){c+=1;console.log(String(n.props.Source).slice(0,200));}});
