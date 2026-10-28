const fs = require('fs');
require('../rbx-parser.js');
const P = globalThis.RBXParser;
const base = '/home/claude/lotsacookie/rblx16/';
const files = ['RobloxStudio/content/FirstPlace.rbxl','RobloxStudio/content/FirstPlaceBasePlate.rbxl','SimulationTestUtility/TestFiles/WedgeTest_01.rbxl','SimulationTestUtility/TestFiles/aWedgeTrough.rbxl','content/fonts/character3.rbxm','content/fonts/humanoidSoundNew.rbxm','content/fonts/characterCameraScript.rbxmx','content/fonts/humanoidAnimateLocalKeyframe2.rbxm'];
for (const f of files) {
  try {
    const res = P.parse(fs.readFileSync(base+f));
    const hist = {}; let n=0;
    P.walk(res.roots, nd => { hist[nd.className]=(hist[nd.className]||0)+1; n++; });
    console.log(f, res.format, 'roots', res.roots.map(r=>r.className).join(','), 'count', n, JSON.stringify(hist).slice(0,300), 'warn', res.stats.warnings.length, Object.keys(res.stats.skippedProps).length);
  } catch (e) { console.log(f, 'ERR', e.stack); }
}
const bp = P.parse(fs.readFileSync(base+'RobloxStudio/content/FirstPlaceBasePlate.rbxl'));
P.walk(bp.roots, nd => { if (/Part|Spawn|Terrain|Camera|Lighting/.test(nd.className)) console.log(nd.className, JSON.stringify(nd.props).slice(0,700)); });
