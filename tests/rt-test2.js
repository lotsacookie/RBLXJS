const R = require('/home/claude/rbx-runtime.js');
const logs = [];
const game = new R.Game({ out: (k, t) => logs.push(k + ': ' + t), onError: (m) => logs.push('ERR ' + m) });
game.loadBaseplate();
game.runSource(`
local sp = Instance.new("Tool") sp.Name = "Sword" sp.Parent = game.StarterPack
local h = Instance.new("Part") h.Name="Handle" h.Size=Vector3.new(1,1,4) h.Parent = sp
local hat = Instance.new("Script") hat.Parent = sp
hat.Source = "print('tool script ran', script.Parent.Name)"
local a = Instance.new("Part") a.Name="A" a.Size=Vector3.new(4,1,4) a.Position=Vector3.new(20,30,0) a.Parent=workspace
local b = Instance.new("Part") b.Name="B" b.Size=Vector3.new(2,2,2) b.Position=Vector3.new(20,32,0) b.Parent=workspace
local w = Instance.new("Weld") w.Part0=a w.Part1=b w.C0=CFrame.new(0,2,0) w.C1=CFrame.new() w.Parent=a
local ball = Instance.new("Part") ball.Name="Ball" ball.Shape=Enum.PartType.Ball ball.Size=Vector3.new(4,4,4) ball.Position=Vector3.new(-20,40,0) ball.Parent=workspace
local pad = Instance.new("Part") pad.Name="Pad" pad.Anchored=true pad.Size=Vector3.new(6,1,6) pad.Position=Vector3.new(0,0.5,30) pad.Parent=workspace
pad.Touched:Connect(function(o) print("pad touched by", o.Name) end)
local fall = Instance.new("Part") fall.Name="Fall" fall.Position=Vector3.new(0,6,30) fall.Parent=workspace
spawn(function() wait(2) print("A y", a.Position.Y, "B y", b.Position.Y, "ball y", ball.Position.Y) end)
local tw = game:GetService("TweenService"):Create(pad, TweenInfo.new(1), {Position=Vector3.new(0,0.5,60)})
tw:Play()
tw.Completed:Connect(function() print("tween done", pad.Position.Z) end)
`);
game.start();
for (let i = 0; i < 360; i++) game.update(1 / 60);
console.log(logs.join('\n'));
console.log('hotbar', game.hotbarTools().map(t => t.props.Name));
const h = game.hotbarTools()[0];
console.log('equip', game.equipTool(h));
for (let i = 0; i < 10; i++) game.update(1 / 60);
console.log('held handle parent', h.props.Name, h.parent.props.Name);
game.unequipTool();
console.log(game.treeText(game.workspace).slice(0, 30).join('\n'));
