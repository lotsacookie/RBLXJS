const R = require('/home/claude/rbx-runtime.js');
const logs = [];
const game = new R.Game({ out: (k, t) => logs.push(k + ': ' + t), onError: (m) => logs.push('ERR ' + m) });
game.loadBaseplate();
game.runSource(`
local pad = Instance.new("Part") pad.Name="Pad" pad.Anchored=true pad.Size=Vector3.new(6,1,6) pad.Position=Vector3.new(0,0.5,30) pad.Parent=workspace
pad.Touched:Connect(function(o) print("pad touched by", o.Name) end)
local fall = Instance.new("Part") fall.Name="Fall" fall.Position=Vector3.new(0,6,30) fall.Parent=workspace
fall.Touched:Connect(function(o) print("fall touched", o.Name) end)
`);
game.start();
for (let i = 0; i < 120; i++) game.update(1 / 60);
console.log(logs.join('\n'));
console.log([...game.phys.touch.keys()]);
