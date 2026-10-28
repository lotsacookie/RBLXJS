require('../rbx-physics.js');
const P = globalThis.RBXPhysics;
const w = new P.World();
function mk(type,pos,sz){const b=w.createBody({type,position:pos});b.addShape({type:'box',size:sz});w.addBody(b);return b;}
mk('static',[0,-10,0],[512,20,512]);
const a=mk('dynamic',[0,2,0],[4,4,4]);
const b=mk('dynamic',[0,6.1,0],[4,4,4]);
for(let i=0;i<120;i++){w.step(1/60); if(i%10==0)console.log(i,a.origin[1].toFixed(3),b.origin[1].toFixed(3),b.vel[1].toFixed(2),w.stats.contacts);}
const m=P.collide(a.shapes[0],b.shapes[0]); console.log(m&&JSON.stringify(m));
