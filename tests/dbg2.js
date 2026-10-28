require('../rbx-physics.js');
const P = globalThis.RBXPhysics;
const w = new P.World();
function mk(type,pos,sz){const b=w.createBody({type,position:pos});b.addShape({type:'box',size:sz});w.addBody(b);return b;}
mk('static',[0,-10,0],[512,20,512]);
const a=mk('dynamic',[0,2,0],[4,4,4]);
const b=mk('dynamic',[0,6.1,0],[4,4,4]);
for(let i=0;i<40;i++){w.step(1/60); const cs=[...w.contactsPrev.values()].map(m=>m.a.body.id+'-'+m.b.body.id+' n='+m.normal.map(v=>v.toFixed(2))+' pts='+m.points.map(p=>p.depth.toFixed(3)+'/'+p.jn.toFixed(1)).join(';')).join(' || ');console.log(i,a.origin[1].toFixed(3),b.origin[1].toFixed(3),a.vel[1].toFixed(2),b.vel[1].toFixed(2),cs);}
