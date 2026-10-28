const V3 = (x, y, z) => new Vector3(x, y, z);
const E = (enumName, itemName) => ENUMS[enumName].items[itemName];
const VALUE_CLASSES = new Set(['IntValue', 'NumberValue', 'StringValue', 'BoolValue', 'ObjectValue', 'Color3Value', 'BrickColorValue', 'Vector3Value', 'CFrameValue', 'RayValue']);

function eulerDeg(cf) {
    const e = cfEuler(cf);
    return V3(e[0] * R2D, e[1] * R2D, e[2] * R2D);
}

function capName(k) {
    let n = k.replace(/_xml$/, '');
    if (n.length && n[0] >= 'a' && n[0] <= 'z') n = n[0].toUpperCase() + n.slice(1);
    return n;
}

function partSetCFrame(s, cf) {
    s.game.phys.setPartCFrame(s, cf);
}

function setPartBrickColor(s, bc) {
    s.props.BrickColor = bc;
    const e = bc.entry;
    s.props.Color = new Color3(e[1] / 255, e[2] / 255, e[3] / 255);
}

defClass('PVInstance', 'Instance', {});
defClass('BasePart', 'PVInstance', {
    events: ['Touched', 'TouchEnded'],
    defaults: {
        Anchored: false, CanCollide: true, CanTouch: true, CFrame: () => new CFrame(), Size: () => V3(4, 1, 2),
        BrickColor: () => new BrickColor(194), Color: () => new Color3(163 / 255, 162 / 255, 165 / 255),
        Transparency: 0, Reflectance: 0, Material: () => E('Material', 'Plastic'), Shape: () => E('PartType', 'Block'),
        Friction: 0.3, Elasticity: 0.5, Locked: false, Velocity: () => V3(0, 0, 0), RotVelocity: () => V3(0, 0, 0),
        TopSurface: () => E('SurfaceType', 'Studs'), BottomSurface: () => E('SurfaceType', 'Inlet'),
        LeftSurface: () => E('SurfaceType', 'Smooth'), RightSurface: () => E('SurfaceType', 'Smooth'),
        FrontSurface: () => E('SurfaceType', 'Smooth'), BackSurface: () => E('SurfaceType', 'Smooth'),
        CastShadow: true, FormFactor: () => E('FormFactor', 'Custom')
    },
    getters: {
        Position: (s) => V3(s.props.CFrame.m[0], s.props.CFrame.m[1], s.props.CFrame.m[2]),
        Orientation: (s) => eulerDeg(s.props.CFrame),
        Rotation: (s) => eulerDeg(s.props.CFrame),
        AssemblyLinearVelocity: (s) => s.props.Velocity,
        AssemblyAngularVelocity: (s) => s.props.RotVelocity,
        Mass: (s) => partMass(s),
        Massless: () => false
    },
    setters: {
        CFrame: (s, v) => partSetCFrame(s, v),
        Position: (s, v) => { const m = s.props.CFrame.m.slice(); m[0] = v.x; m[1] = v.y; m[2] = v.z; partSetCFrame(s, new CFrame(m)); },
        Orientation: (s, v) => {
            const p = s.props.CFrame;
            const r = cfMul(cfMul(cfAngles(0, v.y / R2D, 0), cfAngles(v.x / R2D, 0, 0)), cfAngles(0, 0, v.z / R2D));
            r.m[0] = p.m[0]; r.m[1] = p.m[1]; r.m[2] = p.m[2];
            partSetCFrame(s, r);
        },
        Rotation: (s, v) => CLASSES.BasePart.setters.Orientation(s, v),
        Size: (s, v) => { s.props.Size = v; s.game.phys.markDirty(s); },
        Color: (s, v) => { s.props.Color = v; s.props.BrickColor = nearestBrickColor(v); },
        BrickColor: (s, v) => setPartBrickColor(s, v),
        Velocity: (s, v) => {
            s.props.Velocity = v;
            const b = s.game.phys.asmBody(s);
            if (b && b.type === 'dynamic') b.setVelocity([v.x, v.y, v.z]);
        },
        AssemblyLinearVelocity: (s, v) => CLASSES.BasePart.setters.Velocity(s, v),
        RotVelocity: (s, v) => {
            s.props.RotVelocity = v;
            const b = s.game.phys.asmBody(s);
            if (b && b.type === 'dynamic') b.setAngularVelocity([v.x, v.y, v.z]);
        },
        Anchored: (s, v) => { s.props.Anchored = !!v; s.game.phys.markDirty(s); },
        CanCollide: (s, v) => { s.props.CanCollide = !!v; s.game.phys.markDirty(s); },
        Shape: (s, v) => { s.props.Shape = v; s.game.phys.markDirty(s); },
        Friction: (s, v) => { s.props.Friction = v; s.game.phys.markDirty(s); },
        Elasticity: (s, v) => { s.props.Elasticity = v; s.game.phys.markDirty(s); },
        Name: (s, v) => { s.props.Name = String(v); }
    },
    methods: {
        GetMass: (s) => partMass(s),
        getMass: (s) => partMass(s),
        GetTouchingParts: (s) => tbl(s.game.phys.touching(s)),
        GetConnectedParts: (s, rec) => {
            const out = new Set();
            const q = [s];
            while (q.length) {
                const p = q.pop();
                for (const j of (p.ext && p.ext.joints) || []) {
                    for (const o of [j.props.Part0, j.props.Part1]) if (o && o !== s && !out.has(o)) { out.add(o); if (rec) q.push(o); }
                }
            }
            return tbl(Array.from(out));
        },
        BreakJoints: (s) => breakJoints(s),
        breakJoints: (s) => breakJoints(s),
        MakeJoints: (s) => makeJoints(s),
        makeJoints: (s) => makeJoints(s),
        SetNetworkOwner: () => {},
        SetNetworkOwnershipAuto: () => {},
        GetNetworkOwner: () => undefined,
        CanCollideWith: (s, o) => s.props.CanCollide !== false && o.props.CanCollide !== false,
        IsGrounded: (s) => !!(s.ext && s.ext.assembly && s.ext.assembly.anchored),
        GetRootPart: (s) => (s.ext && s.ext.assembly ? s.ext.assembly.root : s),
        Resize: (s, face, delta) => {
            const f = enumNum(face);
            const sz = s.props.Size;
            const axes = [[0, 1], [1, 1], [2, 1], [0, -1], [1, -1], [2, -1]][f];
            if (!axes) return false;
            const ns = [sz.x, sz.y, sz.z];
            ns[axes[0]] += delta;
            if (ns[axes[0]] <= 0) return false;
            const dir = [0, 0, 0];
            dir[axes[0]] = axes[1] * delta / 2;
            s.set('Size', V3(ns[0], ns[1], ns[2]));
            const off = cfVec(s.props.CFrame, V3(dir[0], dir[1], dir[2]));
            const m = s.props.CFrame.m.slice();
            m[0] += off.x; m[1] += off.y; m[2] += off.z;
            partSetCFrame(s, new CFrame(m));
            return true;
        },
        ApplyImpulse: (s, v) => { const b = s.game.phys.asmBody(s); if (b && b.type === 'dynamic') b.applyImpulse([v.x, v.y, v.z]); },
        ApplyAngularImpulse: (s, v) => { const b = s.game.phys.asmBody(s); if (b && b.type === 'dynamic') b.angVel = [b.angVel[0] + v.x / b.mass, b.angVel[1] + v.y / b.mass, b.angVel[2] + v.z / b.mass]; },
        GetVelocityAtPosition: (s, p) => { const b = s.game.phys.asmBody(s); if (!b) return V3(0, 0, 0); const v = b.velocityAt([p.x, p.y, p.z]); return V3(v[0], v[1], v[2]); }
    }
});

function partMass(s) {
    const b = s.game.phys.asmBody(s);
    const z = s.props.Size;
    const m = z.x * z.y * z.z * 0.7;
    if (b && b.mass > 0 && s.ext.assembly.members.length === 1) return b.mass;
    return m;
}

function breakJoints(s) {
    const targets = [];
    const collect = (o) => { if (o.isA('BasePart')) { for (const j of Array.from((o.ext && o.ext.joints) || [])) targets.push(j); } };
    if (s.isA('BasePart')) collect(s);
    else s.walk(collect);
    for (const j of targets) {
        if (WELD_KINDS.has(j.className) || FIXED_KINDS.has(j.className) || MOTOR_KINDS.has(j.className) || j.className === 'Glue') j.destroy();
    }
}

function makeJoints(s) {
    const parts = [];
    if (s.isA('BasePart')) parts.push(s);
    else s.walk(d => { if (d.isA('BasePart')) parts.push(d); });
    return;
}

defClass('Part', 'BasePart', {});
defClass('WedgePart', 'BasePart', {});
defClass('CornerWedgePart', 'BasePart', {});
defClass('TrussPart', 'BasePart', { defaults: { Size: () => V3(2, 2, 2) } });
defClass('SpawnLocation', 'Part', {
    defaults: { Size: () => V3(6, 1, 6), Neutral: true, Duration: 4, Enabled: true, AllowTeamChangeOnTouch: false, TeamColor: () => new BrickColor(194), Anchored: true },
    events: []
});
defClass('Seat', 'Part', { defaults: { Disabled: false, Occupant: undefined } });
defClass('VehicleSeat', 'BasePart', { defaults: { Disabled: false, Throttle: 0, Steer: 0, MaxSpeed: 25, Torque: 10, TurnSpeed: 1, Occupant: undefined, HeadsUpDisplay: true } });
defClass('MeshPart', 'BasePart', { defaults: { MeshId: '', TextureID: '' } });
defClass('UnionOperation', 'BasePart', {});
defClass('Terrain', 'BasePart', {});

defClass('Model', 'PVInstance', {
    defaults: { PrimaryPart: undefined },
    methods: {
        GetPrimaryPartCFrame: (s) => (s.props.PrimaryPart ? s.props.PrimaryPart.props.CFrame : modelCFrame(s)),
        SetPrimaryPartCFrame: (s, cf) => {
            const pp = s.props.PrimaryPart;
            if (!pp) throw new L.LuaError('SetPrimaryPartCFrame failed because no PrimaryPart has been set');
            modelTransform(s, cfMul(cf, cfInverse(pp.props.CFrame)));
        },
        GetModelCFrame: (s) => modelCFrame(s),
        GetModelSize: (s) => modelBounds(s).size,
        GetBoundingBox: (s) => { const b = modelBounds(s); return [new CFrame([b.center.x, b.center.y, b.center.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]), b.size]; },
        MoveTo: (s, pos) => {
            const b = modelBounds(s);
            const d = V3(pos.x - b.center.x, pos.y - b.center.y, pos.z - b.center.z);
            modelTransform(s, new CFrame([d.x, d.y, d.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
        },
        TranslateBy: (s, d) => modelTransform(s, new CFrame([d.x, d.y, d.z, 1, 0, 0, 0, 1, 0, 0, 0, 1])),
        BreakJoints: (s) => breakJoints(s),
        breakJoints: (s) => breakJoints(s),
        MakeJoints: (s) => makeJoints(s),
        makeJoints: (s) => makeJoints(s),
        GetExtentsSize: (s) => modelBounds(s).size
    }
});

function modelParts(s) {
    const out = [];
    s.walk(d => { if (d.isA('BasePart')) out.push(d); });
    return out;
}
function modelBounds(s) {
    const parts = modelParts(s);
    if (parts.length === 0) return { center: V3(0, 0, 0), size: V3(0, 0, 0) };
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) {
        const m = p.props.CFrame.m, z = p.props.Size;
        const hx = (Math.abs(m[3]) * z.x + Math.abs(m[4]) * z.y + Math.abs(m[5]) * z.z) / 2;
        const hy = (Math.abs(m[6]) * z.x + Math.abs(m[7]) * z.y + Math.abs(m[8]) * z.z) / 2;
        const hz = (Math.abs(m[9]) * z.x + Math.abs(m[10]) * z.y + Math.abs(m[11]) * z.z) / 2;
        mn = [Math.min(mn[0], m[0] - hx), Math.min(mn[1], m[1] - hy), Math.min(mn[2], m[2] - hz)];
        mx = [Math.max(mx[0], m[0] + hx), Math.max(mx[1], m[1] + hy), Math.max(mx[2], m[2] + hz)];
    }
    return { center: V3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), size: V3(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) };
}
function modelCFrame(s) {
    const pp = s.props.PrimaryPart;
    if (pp) return pp.props.CFrame;
    const parts = modelParts(s);
    const b = modelBounds(s);
    const rot = parts.length ? parts[0].props.CFrame.m.slice(3) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return new CFrame([b.center.x, b.center.y, b.center.z, ...rot]);
}
function modelTransform(s, delta) {
    const parts = modelParts(s);
    const targets = parts.map(p => cfMul(delta, p.props.CFrame));
    parts.forEach((p, i) => p.game.phys.setPartCFrame(p, targets[i]));
}

defClass('Folder', 'Instance', {});
defClass('Configuration', 'Instance', {});
defClass('Camera', 'Instance', {
    defaults: { CFrame: () => new CFrame([0, 10, 20, 1, 0, 0, 0, 1, 0, 0, 0, 1]), Focus: () => new CFrame(), FieldOfView: 70, CameraType: () => E('CameraType', 'Custom'), CameraSubject: undefined, ViewportSize: () => new Vector2(1280, 720), NearPlaneZ: -0.5 },
    methods: {
        GetRenderCFrame: (s) => s.props.CFrame,
        WorldToScreenPoint: (s, p) => worldToScreen(s, p),
        WorldToViewportPoint: (s, p) => worldToScreen(s, p),
        ViewportPointToRay: (s, x, y) => screenRay(s, x, y),
        ScreenPointToRay: (s, x, y) => screenRay(s, x, y)
    }
});
function worldToScreen(cam, p) {
    const vs = cam.props.ViewportSize;
    const cf = cam.props.CFrame;
    const d = cfPoint(cfInverse(cf), p);
    const f = 1 / Math.tan(cam.props.FieldOfView * Math.PI / 360);
    const aspect = vs.x / vs.y;
    const depth = -d.z;
    const nx = (d.x * f / aspect) / (depth || 1e-6);
    const ny = (d.y * f) / (depth || 1e-6);
    return [V3((nx * 0.5 + 0.5) * vs.x, (0.5 - ny * 0.5) * vs.y, depth), depth > 0 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1];
}
function screenRay(cam, x, y) {
    const vs = cam.props.ViewportSize;
    const cf = cam.props.CFrame;
    const f = Math.tan(cam.props.FieldOfView * Math.PI / 360);
    const aspect = vs.x / vs.y;
    const nx = (x / vs.x) * 2 - 1;
    const ny = 1 - (y / vs.y) * 2;
    const dir = cfVec(cf, V3(nx * f * aspect, ny * f, -1));
    const l = dir.len() || 1;
    return new Ray(cf.luaIndex('Position'), V3(dir.x / l, dir.y / l, dir.z / l));
}

defClass('Humanoid', 'Instance', {
    events: ['Died', 'HealthChanged', 'Running', 'Jumping', 'Climbing', 'Seated', 'FreeFalling', 'GettingUp', 'StateChanged', 'Touched', 'MoveToFinished', 'Swimming', 'FallingDown', 'Strafing', 'PlatformStanding', 'Changed'],
    defaults: {
        Health: 100, MaxHealth: 100, WalkSpeed: 16, JumpPower: 50, HipHeight: 0, PlatformStand: false, Sit: false, Jump: false,
        AutoRotate: true, RigType: () => E('RigType', 'R6'), MoveDirection: () => V3(0, 0, 0), WalkToPoint: () => V3(0, 0, 0),
        WalkToPart: undefined, SeatPart: undefined, CameraOffset: () => V3(0, 0, 0), DisplayName: '', AutoJumpEnabled: true,
        DisplayDistanceType: () => E('HumanoidDisplayDistanceType', 'Viewer'), NameOcclusion: 0, RequiresNeck: true, BreakJointsOnDeath: true,
        Torso: undefined, LeftLeg: undefined, RightLeg: undefined, FloorMaterial: () => E('Material', 'Air'), MaxSlopeAngle: 89, AutoRotateInternal: true
    },
    getters: {
        Health: (s) => s.props.Health,
        Torso: (s) => s._parent ? s._parent.findChild('Torso') : undefined
    },
    setters: {
        Health: (s, v) => {
            v = Math.max(0, Math.min(s.props.MaxHealth, Number(v)));
            if (v !== v) return;
            const old = s.props.Health;
            s.props.Health = v;
            if (old !== v) s.fireSignal('HealthChanged', v);
            if (v <= 0 && !s.ext_dead) {
                s.ext_dead = true;
                s.fireSignal('Died');
                s.fireSignal('StateChanged', E('HumanoidStateType', 'Running'), E('HumanoidStateType', 'Dead'));
                s.game.humanoidDied(s);
            }
        },
        MaxHealth: (s, v) => { s.props.MaxHealth = v; if (s.props.Health > v) s.set('Health', v); },
        Jump: (s, v) => { s.props.Jump = !!v; },
        Sit: (s, v) => { s.props.Sit = !!v; if (!v) s.game.leaveSeat(s); }
    },
    methods: {
        TakeDamage: (s, d) => {
            const p = s._parent;
            if (p && p.children.some(c => c.className === 'ForceField')) return;
            if (s.props.Health > 0) s.set('Health', s.props.Health - d);
        },
        Move: (s, dir, rel) => { s.props.MoveDirection = dir; s.moveRequest = { dir, rel: rel === true }; },
        MoveTo: (s, pos, part) => { s.props.WalkToPoint = pos; s.props.WalkToPart = part; s.walkTo = { pos, part, t: s.game.state.scheduler.time }; },
        EquipTool: (s, tool) => s.game.equipTool(tool),
        UnequipTools: (s) => s.game.unequipTool(),
        GetState: (s) => E('HumanoidStateType', s.ext_dead ? 'Dead' : 'Running'),
        ChangeState: (s, st) => { if (enumNum(st) === 15) s.set('Health', 0); },
        SetStateEnabled: () => {},
        GetStateEnabled: () => true,
        LoadAnimation: (s, a) => new AnimationTrack(s.game, a),
        GetPlayingAnimationTracks: () => tbl([]),
        AddAccessory: (s, a) => { if (s._parent) a.set('Parent', s._parent); },
        RemoveAccessories: (s) => { if (s._parent) for (const c of s._parent.children.slice()) if (c.isA('Accoutrement')) c.destroy(); },
        GetAccessories: (s) => tbl(s._parent ? s._parent.children.filter(c => c.isA('Accoutrement')) : []),
        BuildRigFromAttachments: () => {},
        ApplyDescription: () => {}
    }
});

class AnimationTrack extends HostObject {
    constructor(game, anim) {
        super();
        this.game = game;
        this.anim = anim;
        this.playing = false;
        this.signals = {};
        this.IsPlaying = false;
        this.Looped = false;
        this.Priority = E('AnimationPriority', 'Core');
        this.Length = 1;
        this.Speed = 1;
        this.WeightCurrent = 1;
    }
    get luaType() { return 'AnimationTrack'; }
    sig(n) { return this.signals[n] || (this.signals[n] = new Signal(this.game, 'AnimationTrack.' + n)); }
    luaIndex(k) {
        switch (k) {
            case 'IsPlaying': return this.playing;
            case 'Looped': return this.Looped;
            case 'Priority': return this.Priority;
            case 'Length': return this.Length;
            case 'Speed': return this.Speed;
            case 'Animation': return this.anim;
            case 'Stopped': case 'KeyframeReached': case 'DidLoop': return this.sig(k);
            case 'Play': return (s) => { s.playing = true; };
            case 'Stop': return (s) => { s.playing = false; s.sig('Stopped').fire(); };
            case 'AdjustSpeed': return (s, v) => { s.Speed = v; };
            case 'AdjustWeight': return () => {};
            case 'GetTimeOfKeyframe': return () => 0;
        }
        return undefined;
    }
    luaNewIndex(k, v) { this[k] = v; }
}
AnimationTrack.luaName = 'AnimationTrack';

defClass('Animation', 'Instance', { defaults: { AnimationId: '' } });
defClass('Animator', 'Instance', { methods: { LoadAnimation: (s, a) => new AnimationTrack(s.game, a) } });

defClass('BackpackItem', 'Model', { defaults: { TextureId: '' } });
defClass('Tool', 'BackpackItem', {
    events: ['Equipped', 'Unequipped', 'Activated', 'Deactivated'],
    defaults: {
        CanBeDropped: true, RequiresHandle: true, Enabled: true, ToolTip: '', ManualActivationOnly: false,
        GripPos: () => V3(0, 0, 0), GripForward: () => V3(0, 0, -1), GripRight: () => V3(1, 0, 0), GripUp: () => V3(0, 1, 0)
    },
    getters: {
        Grip: (s) => gripOf(s),
        Handle: (s) => s.findChild('Handle')
    },
    setters: {
        Grip: (s, cf) => {
            s.props.GripPos = cf.luaIndex('Position');
            s.props.GripRight = cf.luaIndex('RightVector');
            s.props.GripUp = cf.luaIndex('UpVector');
            const lv = cf.luaIndex('LookVector');
            s.props.GripForward = lv;
        }
    },
    methods: {
        Activate: (s) => s.game.activateTool(s),
        Clone: (s) => s.clone()
    }
});
function gripOf(tool) {
    const p = tool.props;
    const f = p.GripForward, r = p.GripRight, u = p.GripUp, pos = p.GripPos;
    return new CFrame([pos.x, pos.y, pos.z, r.x, u.x, -f.x, r.y, u.y, -f.y, r.z, u.z, -f.z]);
}
defClass('HopperBin', 'BackpackItem', { events: ['Selected', 'Deselected'], defaults: { Active: false, BinType: 0 } });
defClass('Accoutrement', 'Instance', { defaults: { AttachmentPoint: () => new CFrame(), AttachmentPos: () => V3(0, 0, 0), AttachmentForward: () => V3(0, 0, -1), AttachmentRight: () => V3(1, 0, 0), AttachmentUp: () => V3(0, 1, 0) } });
defClass('Hat', 'Accoutrement', {});
defClass('Accessory', 'Accoutrement', {});

defClass('LuaSourceContainer', 'Instance', {});
defClass('BaseScript', 'LuaSourceContainer', { defaults: { Disabled: false, Source: '', LinkedSource: '' } });
defClass('Script', 'BaseScript', {});
defClass('LocalScript', 'BaseScript', {});
defClass('ModuleScript', 'LuaSourceContainer', { defaults: { Source: '', LinkedSource: '' } });

for (const vc of VALUE_CLASSES) {
    const dv = { IntValue: 0, NumberValue: 0, StringValue: '', BoolValue: false, ObjectValue: undefined, Color3Value: () => new Color3(), BrickColorValue: () => new BrickColor(194), Vector3Value: () => V3(0, 0, 0), CFrameValue: () => new CFrame(), RayValue: () => new Ray(V3(0, 0, 0), V3(0, 0, 0)) }[vc];
    defClass(vc, 'Instance', { defaults: { Value: dv } });
}

defClass('RemoteEvent', 'Instance', {
    events: ['OnServerEvent', 'OnClientEvent'],
    methods: {
        FireServer: (s, ...a) => { s.signal('OnServerEvent').fire(s.game.localPlayer, ...a); },
        FireClient: (s, p, ...a) => { s.signal('OnClientEvent').fire(...a); },
        FireAllClients: (s, ...a) => { s.signal('OnClientEvent').fire(...a); }
    }
});
defClass('RemoteFunction', 'Instance', {
    defaults: { OnServerInvoke: undefined, OnClientInvoke: undefined },
    methods: {
        InvokeServer: GEN(function* (s, ...a) { const f = s.props.OnServerInvoke; if (f === undefined) return []; return yield* L.call(f, [s.game.localPlayer, ...a]); }),
        InvokeClient: GEN(function* (s, p, ...a) { const f = s.props.OnClientInvoke; if (f === undefined) return []; return yield* L.call(f, a); })
    }
});
defClass('BindableEvent', 'Instance', {
    events: ['Event'],
    methods: { Fire: (s, ...a) => { s.signal('Event').fire(...a); } }
});
defClass('BindableFunction', 'Instance', {
    defaults: { OnInvoke: undefined },
    methods: { Invoke: GEN(function* (s, ...a) { const f = s.props.OnInvoke; if (f === undefined) return []; return yield* L.call(f, a); }) }
});

defClass('JointInstance', 'Instance', { defaults: { Part0: undefined, Part1: undefined, C0: () => new CFrame(), C1: () => new CFrame(), Enabled: true } });
for (const n of ['Weld', 'ManualWeld', 'Snap', 'Glue', 'Motor6D', 'Motor', 'VelocityMotor']) {
    const extra = {};
    if (n === 'Motor' || n === 'VelocityMotor') { extra.MaxVelocity = 0; extra.DesiredAngle = 0; extra.CurrentAngle = 0; }
    if (n === 'Motor6D') extra.Transform = () => new CFrame();
    defClass(n, 'JointInstance', { defaults: extra });
}
defClass('WeldConstraint', 'Instance', { defaults: { Part0: undefined, Part1: undefined, Enabled: true } });
defClass('Attachment', 'Instance', {
    defaults: { CFrame: () => new CFrame() },
    getters: {
        Position: (s) => s.props.CFrame.luaIndex('Position'),
        Orientation: (s) => eulerDeg(s.props.CFrame),
        WorldPosition: (s) => (s._parent && s._parent.isA('BasePart') ? cfPoint(s._parent.props.CFrame, s.props.CFrame.luaIndex('Position')) : V3(0, 0, 0)),
        WorldCFrame: (s) => (s._parent && s._parent.isA('BasePart') ? cfMul(s._parent.props.CFrame, s.props.CFrame) : s.props.CFrame)
    },
    setters: {
        Position: (s, v) => { const m = s.props.CFrame.m.slice(); m[0] = v.x; m[1] = v.y; m[2] = v.z; s.props.CFrame = new CFrame(m); s.game.phys.attachJoint && s.game.constraintsTouch(s); },
        CFrame: (s, v) => { s.props.CFrame = v; s.game.constraintsTouch(s); }
    }
});
defClass('Constraint', 'Instance', { defaults: { Attachment0: undefined, Attachment1: undefined, Enabled: true, Visible: false, Color: () => new BrickColor(194) } });
defClass('HingeConstraint', 'Constraint', { defaults: { LimitsEnabled: false, LowerAngle: -45, UpperAngle: 45, ActuatorType: () => E('ActuatorType', 'None'), AngularVelocity: 0, MotorMaxTorque: 0, TargetAngle: 0, CurrentAngle: 0, CollideConnected: false } });
defClass('BallSocketConstraint', 'Constraint', { defaults: { LimitsEnabled: false, UpperAngle: 45, CollideConnected: false } });
defClass('RopeConstraint', 'Constraint', { defaults: { Length: 10, Thickness: 0.1 } });
defClass('RodConstraint', 'Constraint', { defaults: { Length: 5 } });
defClass('SpringConstraint', 'Constraint', { defaults: { FreeLength: 1, Stiffness: 0, Damping: 0, Coils: 8, Radius: 0.4, Thickness: 0.1 } });

defClass('BodyMover', 'Instance', {});
defClass('BodyForce', 'BodyMover', { defaults: { Force: () => V3(0, 0, 0) } });
defClass('BodyThrust', 'BodyMover', { defaults: { Force: () => V3(0, 0, 0), Location: () => V3(0, 0, 0) } });
defClass('BodyVelocity', 'BodyMover', { defaults: { Velocity: () => V3(0, 0, 0), MaxForce: () => V3(4000, 4000, 4000), P: 1250 } });
defClass('BodyPosition', 'BodyMover', { defaults: { Position: () => V3(0, 0, 0), MaxForce: () => V3(4000, 4000, 4000), P: 10000, D: 500 } });
defClass('BodyGyro', 'BodyMover', { defaults: { CFrame: () => new CFrame(), MaxTorque: () => V3(400000, 0, 400000), P: 3000, D: 500 } });
defClass('BodyAngularVelocity', 'BodyMover', { defaults: { AngularVelocity: () => V3(0, 0, 0), MaxTorque: () => V3(4000, 4000, 4000), P: 1250 } });

defClass('DataModelMesh', 'Instance', { defaults: { Scale: () => V3(1, 1, 1), Offset: () => V3(0, 0, 0), VertexColor: () => V3(1, 1, 1) } });
defClass('SpecialMesh', 'DataModelMesh', { defaults: { MeshType: () => E('MeshType', 'Head'), MeshId: '', TextureId: '' } });
defClass('BlockMesh', 'DataModelMesh', {});
defClass('CylinderMesh', 'DataModelMesh', {});
defClass('FileMesh', 'DataModelMesh', { defaults: { MeshId: '', TextureId: '' } });
defClass('FaceInstance', 'Instance', { defaults: { Face: () => E('NormalId', 'Front') } });
defClass('Decal', 'FaceInstance', { defaults: { Texture: '', Transparency: 0, Color3: () => new Color3(1, 1, 1), Shiny: 20, Specular: 0 } });
defClass('Texture', 'Decal', { defaults: { StudsPerTileU: 2, StudsPerTileV: 2, OffsetStudsU: 0, OffsetStudsV: 0 } });

defClass('Fire', 'Instance', { defaults: { Color: () => new Color3(1, 0.5, 0), SecondaryColor: () => new Color3(1, 0, 0), Heat: 9, Size: 5, Enabled: true } });
defClass('Smoke', 'Instance', { defaults: { Color: () => new Color3(1, 1, 1), Opacity: 0.5, RiseVelocity: 1, Size: 1, Enabled: true } });
defClass('Sparkles', 'Instance', { defaults: { SparkleColor: () => new Color3(0.56, 0.9, 1), Enabled: true } });
defClass('ForceField', 'Instance', { defaults: { Visible: true } });
defClass('ParticleEmitter', 'Instance', {
    defaults: {
        Enabled: true, Rate: 20, Lifetime: () => new NumberRange(5, 10), Speed: () => new NumberRange(5, 5), Size: () => new Keypoints('number', [new KeypointItem(0, 1), new KeypointItem(1, 1)]),
        Color: () => new Keypoints('color', [new KeypointItem(0, new Color3(1, 1, 1)), new KeypointItem(1, new Color3(1, 1, 1))]),
        Transparency: () => new Keypoints('number', [new KeypointItem(0, 0), new KeypointItem(1, 0)]), Texture: '', Acceleration: () => V3(0, 0, 0), Drag: 0,
        SpreadAngle: () => new Vector2(0, 0), Rotation: () => new NumberRange(0, 0), RotSpeed: () => new NumberRange(0, 0), LightEmission: 0, EmissionDirection: () => E('NormalId', 'Top'),
        VelocityInheritance: 0, LockedToPart: false
    },
    methods: { Emit: (s, n) => s.game.hooks.emit && s.game.hooks.emit(s, n === undefined ? 1 : n) }
});
defClass('Light', 'Instance', { defaults: { Brightness: 1, Color: () => new Color3(1, 1, 1), Enabled: true, Shadows: false } });
defClass('PointLight', 'Light', { defaults: { Range: 8 } });
defClass('SpotLight', 'Light', { defaults: { Range: 16, Angle: 90, Face: () => E('NormalId', 'Front') } });
defClass('SurfaceLight', 'Light', { defaults: { Range: 16, Angle: 90, Face: () => E('NormalId', 'Front') } });
defClass('Explosion', 'Instance', {
    events: ['Hit'],
    defaults: { BlastRadius: 4, BlastPressure: 500000, DestroyJointRadiusPercent: 1, ExplosionType: () => E('ExplosionType', 'Craters'), Position: () => V3(0, 0, 0), Visible: true }
});
defClass('Sound', 'Instance', {
    events: ['Ended', 'Played', 'Paused', 'Resumed', 'Loaded'],
    defaults: { SoundId: '', Volume: 0.5, Pitch: 1, PlaybackSpeed: 1, Looped: false, Playing: false, TimePosition: 0, PlayOnRemove: false, IsPaused: false, RollOffMode: 0, MaxDistance: 10000, EmitterSize: 10 },
    getters: { IsPlaying: (s) => !!s.props.Playing, TimeLength: (s) => s.ext_length || 0, IsLoaded: () => true },
    setters: {
        Playing: (s, v) => { s.props.Playing = !!v; s.game.soundChanged(s, !!v ? 'play' : 'stop'); },
        Volume: (s, v) => { s.props.Volume = v; s.game.soundChanged(s, 'volume'); },
        TimePosition: (s, v) => { s.props.TimePosition = v; s.game.soundChanged(s, 'seek'); }
    },
    methods: {
        Play: (s) => { s.props.Playing = true; s.props.IsPaused = false; s.game.soundChanged(s, 'play'); s.fireSignal('Played'); },
        Stop: (s) => { s.props.Playing = false; s.props.TimePosition = 0; s.game.soundChanged(s, 'stop'); },
        Pause: (s) => { s.props.Playing = false; s.props.IsPaused = true; s.game.soundChanged(s, 'pause'); s.fireSignal('Paused'); },
        Resume: (s) => { s.props.Playing = true; s.props.IsPaused = false; s.game.soundChanged(s, 'play'); s.fireSignal('Resumed'); }
    }
});
defClass('SoundGroup', 'Instance', { defaults: { Volume: 1 } });
defClass('ClickDetector', 'Instance', { events: ['MouseClick', 'MouseHoverEnter', 'MouseHoverLeave', 'RightMouseClick'], defaults: { MaxActivationDistance: 32 } });
defClass('Team', 'Instance', { defaults: { TeamColor: () => new BrickColor(194), AutoAssignable: true } });
defClass('BodyColors', 'Instance', { defaults: { HeadColor: () => new BrickColor(24), TorsoColor: () => new BrickColor(23), LeftArmColor: () => new BrickColor(24), RightArmColor: () => new BrickColor(24), LeftLegColor: () => new BrickColor(37), RightLegColor: () => new BrickColor(37) } });
defClass('Shirt', 'Instance', { defaults: { ShirtTemplate: '' } });
defClass('Pants', 'Instance', { defaults: { PantsTemplate: '' } });
defClass('ShirtGraphic', 'Instance', { defaults: { Graphic: '' } });
defClass('CharacterMesh', 'Instance', { defaults: { MeshId: 0, BaseTextureId: 0, OverlayTextureId: 0, BodyPart: 0 } });
defClass('SelectionBox', 'Instance', { defaults: { Adornee: undefined, Color: () => new BrickColor(21), LineThickness: 0.02, Visible: true } });
defClass('Hint', 'Instance', { defaults: { Text: '' } });
defClass('Message', 'Instance', { defaults: { Text: '' } });
defClass('StringValueDummy', 'Instance', {});

defClass('GuiBase', 'Instance', {});
defClass('LayerCollector', 'GuiBase', { defaults: { Enabled: true } });
defClass('ScreenGui', 'LayerCollector', { defaults: { ResetOnSpawn: true, DisplayOrder: 0 } });
defClass('BillboardGui', 'LayerCollector', { defaults: { Adornee: undefined, Size: () => new UDim2(0, 100, 0, 100), StudsOffset: () => V3(0, 0, 0), AlwaysOnTop: false, ExtentsOffset: () => V3(0, 0, 0), Active: false } });
defClass('SurfaceGui', 'LayerCollector', { defaults: { Adornee: undefined, Face: () => E('NormalId', 'Front'), CanvasSize: () => new Vector2(800, 600), AlwaysOnTop: false } });
defClass('GuiObject', 'GuiBase', {
    defaults: {
        Position: () => new UDim2(0, 0, 0, 0), Size: () => new UDim2(0, 100, 0, 100), BackgroundColor3: () => new Color3(0.64, 0.64, 0.64),
        BackgroundTransparency: 0, BorderColor3: () => new Color3(0.1, 0.1, 0.1), BorderSizePixel: 1, Visible: true, ZIndex: 1, Active: false,
        ClipsDescendants: false, Rotation: 0, AnchorPoint: () => new Vector2(0, 0), LayoutOrder: 0, SizeConstraint: () => E('SizeConstraint', 'RelativeXY'), Draggable: false
    },
    events: ['InputBegan', 'InputEnded', 'InputChanged', 'MouseEnter', 'MouseLeave', 'MouseMoved', 'MouseButton1Down', 'MouseButton1Up', 'MouseButton2Down', 'MouseButton2Up']
});
defClass('Frame', 'GuiObject', { defaults: { Style: 0 } });
defClass('GuiLabel', 'GuiObject', {});
defClass('GuiButton', 'GuiObject', { events: ['MouseButton1Click', 'MouseButton2Click', 'Activated'], defaults: { AutoButtonColor: true, Selected: false, Modal: false } });
const TEXT_DEFAULTS = { Text: '', TextColor3: () => new Color3(0.1, 0.1, 0.1), TextSize: 14, FontSize: 2, Font: () => E('Font', 'Legacy'), TextWrapped: false, TextScaled: false, TextTransparency: 0, TextStrokeTransparency: 1, TextStrokeColor3: () => new Color3(0, 0, 0), TextXAlignment: () => E('TextXAlignment', 'Center'), TextYAlignment: () => E('TextYAlignment', 'Center'), TextBounds: () => new Vector2(0, 0) };
defClass('TextLabel', 'GuiLabel', { defaults: TEXT_DEFAULTS });
defClass('TextButton', 'GuiButton', { defaults: TEXT_DEFAULTS });
defClass('TextBox', 'GuiObject', { defaults: Object.assign({ ClearTextOnFocus: true, MultiLine: false, PlaceholderText: '', PlaceholderColor3: () => new Color3(0.7, 0.7, 0.7) }, TEXT_DEFAULTS), events: ['FocusLost', 'Focused'], methods: { CaptureFocus: () => {}, ReleaseFocus: () => {}, IsFocused: () => false } });
const IMG_DEFAULTS = { Image: '', ImageTransparency: 0, ImageColor3: () => new Color3(1, 1, 1), ScaleType: () => E('ScaleType', 'Stretch'), SliceCenter: undefined, ImageRectOffset: () => new Vector2(0, 0), ImageRectSize: () => new Vector2(0, 0) };
defClass('ImageLabel', 'GuiLabel', { defaults: IMG_DEFAULTS });
defClass('ImageButton', 'GuiButton', { defaults: IMG_DEFAULTS });
defClass('ScrollingFrame', 'GuiObject', { defaults: { CanvasSize: () => new UDim2(0, 0, 2, 0), ScrollBarThickness: 12, CanvasPosition: () => new Vector2(0, 0) } });
defClass('UIListLayout', 'Instance', { defaults: { FillDirection: () => E('FillDirection', 'Vertical'), Padding: () => new UDim(0, 0), SortOrder: 0 } });
defClass('UICorner', 'Instance', { defaults: { CornerRadius: () => new UDim(0, 8) } });

defClass('Player', 'Instance', {
    events: ['CharacterAdded', 'CharacterRemoving', 'Chatted', 'Idled'],
    defaults: { UserId: 1, Character: undefined, Team: undefined, TeamColor: () => new BrickColor(194), AccountAge: 365, MembershipType: 0, CharacterAppearance: '', CameraMode: 0, Neutral: true, DisplayName: '', FollowUserId: 0, CanLoadCharacterAppearance: true, Guest: false },
    getters: {
        Backpack: (s) => s.findChild('Backpack'),
        PlayerGui: (s) => s.findChild('PlayerGui'),
        PlayerScripts: (s) => s.findChild('PlayerScripts'),
        StarterGear: (s) => s.findChild('StarterGear')
    },
    methods: {
        Kick: (s, m) => { s.game.kick(m); },
        LoadCharacter: (s) => { s.game.loadCharacter(); },
        GetMouse: (s) => s.game.mouse,
        IsFriendsWith: () => false,
        IsInGroup: () => false,
        GetRankInGroup: () => 0,
        GetRoleInGroup: () => 'Guest',
        HasAppearanceLoaded: () => true,
        DistanceFromCharacter: (s, p) => { const c = s.props.Character; const h = c && c.findChild('HumanoidRootPart'); return h ? cfPoint(h.props.CFrame, V3(0, 0, 0)).luaIndex('Magnitude') * 0 + Math.sqrt((h.props.CFrame.m[0] - p.x) ** 2 + (h.props.CFrame.m[1] - p.y) ** 2 + (h.props.CFrame.m[2] - p.z) ** 2) : 0; },
        ClearCharacterAppearance: () => {},
        LoadCharacterAppearance: () => {},
        Move: () => {}
    }
});
defClass('Backpack', 'Instance', {});
defClass('PlayerGui', 'Instance', { methods: { SetTopbarTransparency: () => {}, GetGuiObjectsAtPosition: () => tbl([]) } });
defClass('PlayerScripts', 'Instance', {});
defClass('StarterGear', 'Instance', {});

defClass('Service', 'Instance', { creatable: false });
defClass('Workspace', 'Service', {
    events: ['ChildAdded'],
    defaults: { Gravity: 196.2, FallenPartsDestroyHeight: -500, CurrentCamera: undefined, FilteringEnabled: false, StreamingEnabled: false, Terrain: undefined, DistributedGameTime: 0, AllowThirdPartySales: false },
    getters: { DistributedGameTime: (s) => s.game.state.scheduler.time },
    setters: { Gravity: (s, v) => { s.props.Gravity = v; s.game.phys.setGravity(v); } },
    methods: {
        FindPartOnRay: (s, ray, ignore) => {
            const r = s.game.phys.raycast(ray.Origin, ray.Direction, ray.Direction.len(), ignore ? (ignore instanceof Instance ? [ignore] : ignore.arr) : []);
            if (!r) return [undefined, cfPoint(new CFrame([ray.Origin.x + ray.Direction.x, ray.Origin.y + ray.Direction.y, ray.Origin.z + ray.Direction.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]), V3(0, 0, 0)), V3(0, 1, 0), E('Material', 'Plastic')];
            return [r.part, r.position, r.normal, r.part.props.Material];
        },
        FindPartOnRayWithIgnoreList: (s, ray, ignore) => CLASSES.Workspace.methods.FindPartOnRay(s, ray, ignore),
        FindPartOnRayWithWhitelist: (s, ray) => CLASSES.Workspace.methods.FindPartOnRay(s, ray),
        Raycast: (s, origin, dir, params) => {
            const ig = params && params.ignore ? params.ignore : [];
            const r = s.game.phys.raycast(origin, dir, dir.len(), ig);
            if (!r) return undefined;
            return new RaycastResult(r);
        },
        FindPartsInRegion3: (s, reg, ignore, max) => tbl(s.game.phys.queryParts([reg.Min.x, reg.Min.y, reg.Min.z], [reg.Max.x, reg.Max.y, reg.Max.z], ignore ? [ignore] : null).slice(0, max || 20)),
        FindPartsInRegion3WithIgnoreList: (s, reg, ignore, max) => tbl(s.game.phys.queryParts([reg.Min.x, reg.Min.y, reg.Min.z], [reg.Max.x, reg.Max.y, reg.Max.z], ignore ? ignore.arr : null).slice(0, max || 20)),
        GetPartBoundsInRadius: (s, pos, r) => tbl(s.game.phys.queryParts([pos.x - r, pos.y - r, pos.z - r], [pos.x + r, pos.y + r, pos.z + r])),
        GetPartBoundsInBox: (s, cf, size) => { const r = Math.max(size.x, size.y, size.z); return tbl(s.game.phys.queryParts([cf.m[0] - r, cf.m[1] - r, cf.m[2] - r], [cf.m[0] + r, cf.m[1] + r, cf.m[2] + r])); },
        BreakJoints: (s) => breakJoints(s),
        MakeJoints: () => {},
        GetServerTimeNow: () => Date.now() / 1000,
        FindFirstChild: (s, n, r) => s.findChild(n, r === true)
    }
});
class RaycastResult extends HostObject {
    constructor(r) { super(); this.r = r; }
    get luaType() { return 'RaycastResult'; }
    luaIndex(k) {
        switch (k) {
            case 'Instance': return this.r.part;
            case 'Position': return this.r.position;
            case 'Normal': return this.r.normal;
            case 'Distance': return this.r.distance;
            case 'Material': return this.r.part.props.Material;
        }
        return undefined;
    }
    luaNewIndex() {}
}
class RaycastParams extends HostObject {
    constructor() { super(); this.ignore = []; this.FilterType = 0; }
    get luaType() { return 'RaycastParams'; }
    luaIndex(k) {
        if (k === 'FilterDescendantsInstances') return tbl(this.ignore.slice());
        if (k === 'FilterType') return this.FilterType;
        return this[k];
    }
    luaNewIndex(k, v) {
        if (k === 'FilterDescendantsInstances') this.ignore = v instanceof L.LuaTable ? v.arr.slice() : [];
        else this[k] = v;
    }
}
defClass('Lighting', 'Service', {
    defaults: {
        Ambient: () => new Color3(0, 0, 0), OutdoorAmbient: () => new Color3(0.5, 0.5, 0.5), Brightness: 1, ColorShift_Top: () => new Color3(0, 0, 0), ColorShift_Bottom: () => new Color3(0, 0, 0),
        FogColor: () => new Color3(0.75, 0.75, 0.75), FogStart: 0, FogEnd: 100000, GlobalShadows: true, TimeOfDay: '14:00:00', ClockTime: 14, GeographicLatitude: 41.7333, Outlines: true, ShadowColor: () => new Color3(0.7, 0.7, 0.72), ExposureCompensation: 0
    },
    setters: {
        TimeOfDay: (s, v) => { s.props.TimeOfDay = String(v); const p = String(v).split(':').map(Number); s.props.ClockTime = (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600; },
        ClockTime: (s, v) => { s.props.ClockTime = v; const h = Math.floor(v), m = Math.floor((v - h) * 60), sc = Math.floor(((v - h) * 60 - m) * 60); s.props.TimeOfDay = [h, m, sc].map(n => String(n).padStart(2, '0')).join(':'); }
    },
    methods: { GetMinutesAfterMidnight: (s) => s.props.ClockTime * 60, SetMinutesAfterMidnight: (s, m) => s.set('ClockTime', m / 60) }
});
defClass('Sky', 'Instance', { defaults: { SkyboxBk: '', SkyboxDn: '', SkyboxFt: '', SkyboxLf: '', SkyboxRt: '', SkyboxUp: '', CelestialBodiesShown: true, StarCount: 3000, SunAngularSize: 21, MoonAngularSize: 11 } });
defClass('Atmosphere', 'Instance', { defaults: { Density: 0.395, Color: () => new Color3(0.78, 0.67, 0.5), Haze: 0 } });
for (const n of ['BloomEffect', 'BlurEffect', 'SunRaysEffect', 'ColorCorrectionEffect', 'DepthOfFieldEffect']) defClass(n, 'Instance', { defaults: { Enabled: true, Intensity: 0.4, Size: 24, Brightness: 0, Contrast: 0, Saturation: 0, TintColor: () => new Color3(1, 1, 1) } });

defClass('Players', 'Service', {
    events: ['PlayerAdded', 'PlayerRemoving'],
    defaults: { RespawnTime: 5, CharacterAutoLoads: true, MaxPlayers: 12, NumPlayers: 1 },
    getters: { LocalPlayer: (s) => s.game.localPlayer, NumPlayers: () => 1 },
    methods: {
        GetPlayers: (s) => tbl(s.game.localPlayer ? [s.game.localPlayer] : []),
        GetPlayerFromCharacter: (s, c) => (s.game.localPlayer && s.game.localPlayer.props.Character === c ? s.game.localPlayer : undefined),
        GetPlayerByUserId: (s, id) => (s.game.localPlayer && s.game.localPlayer.props.UserId === id ? s.game.localPlayer : undefined),
        GetUserIdFromNameAsync: () => 1,
        GetNameFromUserIdAsync: (s) => s.game.localPlayer.props.Name,
        FindFirstChild: (s, n, r) => s.findChild(n, r === true),
        Chat: () => {},
        ReportAbuse: () => {},
        playerFromCharacter: (s, c) => (s.game.localPlayer && s.game.localPlayer.props.Character === c ? s.game.localPlayer : undefined),
        GetPlayerFromCharacterLegacy: () => undefined
    }
});
for (const n of ['ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'StarterPack', 'StarterGui', 'StarterPlayer', 'StarterPlayerScripts', 'StarterCharacterScripts', 'ReplicatedFirst', 'Teams', 'SoundService', 'Chat', 'CollectionService', 'PhysicsService', 'BadgeService', 'TeleportService', 'MarketplaceService', 'PointsService', 'GuiService', 'InsertService', 'AdService', 'TextService', 'LogService', 'NotificationService', 'ScriptService', 'ContentProvider', 'GroupService', 'FriendService', 'Selection', 'ChangeHistoryService', 'CSGDictionaryService', 'NonReplicatedCSGDictionaryService', 'AssetService', 'SocialService', 'GamePassService', 'CookiesService', 'TimerService', 'FWService', 'RenderHooksService', 'Geometry', 'ScriptInformationProvider', 'KeyboardService', 'MouseService', 'DataStoreService', 'PathfindingService', 'LocalizationService', 'StarterPlayerService']) {
    defClass(n, 'Service', n === 'StarterPlayer' ? { defaults: { CameraMaxZoomDistance: 400, CameraMinZoomDistance: 0.5, CharacterWalkSpeed: 16, CharacterJumpPower: 50, HealthDisplayDistance: 100, NameDisplayDistance: 100, EnableMouseLockOption: true, AutoJumpEnabled: true } } : {});
}
CLASSES.SoundService.methods = { PlayLocalSound: (s, snd) => { snd.set('Playing', true); }, SetListener: () => {}, GetListener: () => undefined };
CLASSES.SoundService.defaults = { AmbientReverb: 0, DistanceFactor: 3.33, DopplerScale: 1, RolloffScale: 1 };
CLASSES.StarterGui.methods = { SetCoreGuiEnabled: () => {}, SetCore: () => {}, GetCore: () => undefined, GetCoreGuiEnabled: () => true };
CLASSES.StarterGui.defaults = { ShowDevelopmentGui: true };
CLASSES.GuiService.methods = { GetGuiInset: () => [V3(0, 36, 0), V3(0, 0, 0)], IsTenFootInterface: () => false, AddKey: () => {}, SetMenuIsOpen: () => {} };
CLASSES.CollectionService.methods = {
    AddTag: (s, i, t) => { if (!i.tags) i.tags = new Set(); i.tags.add(t); },
    RemoveTag: (s, i, t) => { if (i.tags) i.tags.delete(t); },
    HasTag: (s, i, t) => !!(i.tags && i.tags.has(t)),
    GetTags: (s, i) => tbl(i.tags ? Array.from(i.tags) : []),
    GetTagged: (s, t) => tbl(s.game.root.descendants().filter(d => d.tags && d.tags.has(t)))
};
CLASSES.PhysicsService.methods = { CreateCollisionGroup: () => {}, SetPartCollisionGroup: () => {}, CollisionGroupSetCollidable: () => {}, RegisterCollisionGroup: () => {}, CollisionGroupContainsPart: () => false };
CLASSES.BadgeService.methods = { AwardBadge: () => true, UserHasBadge: () => false, UserHasBadgeAsync: () => false };
CLASSES.TeleportService.methods = { Teleport: () => {}, TeleportToPlaceInstance: () => {}, GetLocalPlayerTeleportData: () => undefined, TeleportToSpawnByName: () => {} };
CLASSES.MarketplaceService.events = ['PromptPurchaseFinished', 'PromptProductPurchaseFinished'];
CLASSES.MarketplaceService.methods = {
    GetProductInfo: () => { const t = new L.LuaTable(); t.set('Name', 'Item'); t.set('Description', ''); t.set('PriceInRobux', 0); t.set('AssetTypeId', 0); t.set('Creator', new L.LuaTable()); return t; },
    PlayerOwnsAsset: () => false, UserOwnsGamePassAsync: () => false, PromptPurchase: () => {}, PromptGamePassPurchase: () => {}
};
CLASSES.PointsService.methods = { AwardPoints: () => 0, GetAwardablePoints: () => 0, GetGamePointBalance: () => 0, GetPointBalance: () => 0 };
CLASSES.TextService.methods = { GetTextSize: (s, text, size) => new Vector2(String(text).length * size * 0.5, size) };
CLASSES.ContentProvider.methods = { PreloadAsync: () => {}, Preload: () => {} };
CLASSES.InsertService.methods = { LoadAsset: () => { throw new L.LuaError('InsertService is not supported offline'); } };
CLASSES.Teams.methods = { GetTeams: (s) => tbl(s.children.filter(c => c.className === 'Team')) };
CLASSES.ReplicatedFirst.methods = { RemoveDefaultLoadingScreen: () => {}, IsFinishedReplicating: () => true };
CLASSES.DataStoreService.methods = { GetDataStore: () => { throw new L.LuaError('DataStore is not available'); } };
CLASSES.PathfindingService.methods = { FindPathAsync: () => { throw new L.LuaError('Pathfinding is not available'); } };

defClass('Debris', 'Service', {
    defaults: { MaxItems: 1000 },
    methods: {
        AddItem: (s, inst, t) => {
            if (!(inst instanceof Instance)) return;
            s.game.state.scheduler.add(() => { if (!inst.destroyed) inst.destroy(); }, [], t === undefined ? 10 : t);
        },
        addItem: (s, inst, t) => CLASSES.Debris.methods.AddItem(s, inst, t)
    }
});
defClass('RunService', 'Service', {
    events: ['Heartbeat', 'RenderStepped', 'Stepped'],
    methods: {
        IsClient: () => true, IsServer: () => true, IsStudio: () => false, IsRunning: () => true, IsRunMode: () => true, IsEdit: () => false,
        BindToRenderStep: (s, name, pri, fn) => { s.game.renderBinds.set(name, { fn, pri }); },
        UnbindFromRenderStep: (s, name) => { s.game.renderBinds.delete(name); },
        Run: () => {}, Pause: () => {}, Stop: () => {},
        setThrottleFramerateEnabled: () => {}
    }
});
defClass('HttpService', 'Service', {
    defaults: { HttpEnabled: false },
    methods: {
        GenerateGUID: (s, wrap) => { const g = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); return wrap === false ? g : '{' + g + '}'; },
        JSONEncode: (s, v) => JSON.stringify(luaToJson(v)),
        JSONDecode: (s, str) => jsonToLua(JSON.parse(str)),
        UrlEncode: (s, str) => encodeURIComponent(str),
        GetAsync: () => { throw new L.LuaError('Http requests are not enabled. Enable via game settings'); },
        PostAsync: () => { throw new L.LuaError('Http requests are not enabled. Enable via game settings'); },
        RequestAsync: () => { throw new L.LuaError('Http requests are not enabled. Enable via game settings'); }
    }
});
function luaToJson(v) {
    if (v instanceof L.LuaTable) {
        if (v.hash === null || v.hash.size === 0) return v.arr.map(luaToJson);
        const o = {};
        for (const k of v.keys()) o[String(k)] = luaToJson(v.get(k));
        return o;
    }
    if (v instanceof Instance) return null;
    return v === undefined ? null : v;
}
function jsonToLua(v) {
    if (Array.isArray(v)) { const t = new L.LuaTable(); v.forEach((x, i) => t.set(i + 1, jsonToLua(x))); return t; }
    if (v && typeof v === 'object') { const t = new L.LuaTable(); for (const k of Object.keys(v)) t.set(k, jsonToLua(v[k])); return t; }
    return v === null ? undefined : v;
}

defClass('UserInputService', 'Service', {
    events: ['InputBegan', 'InputEnded', 'InputChanged', 'TouchTap', 'TouchStarted', 'TouchEnded', 'TouchMoved', 'WindowFocused', 'WindowFocusReleased', 'JumpRequest'],
    defaults: { MouseBehavior: 0, MouseIconEnabled: true, TouchEnabled: false, KeyboardEnabled: true, MouseEnabled: true, GamepadEnabled: false, ModalEnabled: false },
    methods: {
        IsKeyDown: (s, k) => s.game.keysDown.has(enumNum(k)),
        GetMouseLocation: (s) => new Vector2(s.game.mousePos.x, s.game.mousePos.y),
        GetMouseDelta: () => new Vector2(0, 0),
        IsMouseButtonPressed: (s, b) => s.game.mouseButtons.has(enumNum(b)),
        GetFocusedTextBox: () => undefined,
        GetKeysPressed: (s) => tbl(Array.from(s.game.keysDown).map(k => ENUMS.KeyCode.fromValue(k)).filter(Boolean)),
        GetConnectedGamepads: () => tbl([]),
        GetLastInputType: () => E('UserInputType', 'Keyboard')
    }
});
defClass('ContextActionService', 'Service', {
    methods: {
        BindAction: (s, name, fn, btn, ...keys) => { s.game.actions.set(name, { fn, keys: keys.map(k => (k instanceof EnumItem ? k.Value : k)) }); },
        BindActionAtPriority: (s, name, fn, btn, pri, ...keys) => { s.game.actions.set(name, { fn, keys: keys.map(k => (k instanceof EnumItem ? k.Value : k)) }); },
        UnbindAction: (s, name) => { s.game.actions.delete(name); },
        UnbindAllActions: (s) => { s.game.actions.clear(); },
        SetTitle: () => {}, SetPosition: () => {}, SetImage: () => {}, GetBoundActionInfo: () => new L.LuaTable()
    }
});

class Tween extends HostObject {
    constructor(game, inst, info, goals) {
        super();
        this.game = game;
        this.inst = inst;
        this.info = info;
        this.goals = goals;
        this.state = 0;
        this.t = 0;
        this.from = null;
        this.sigs = {};
        this.reversing = false;
        this.reps = 0;
    }
    get luaType() { return 'Tween'; }
    sig(n) { return this.sigs[n] || (this.sigs[n] = new Signal(this.game, 'Tween.' + n)); }
    luaIndex(k) {
        switch (k) {
            case 'Play': return (s) => s.play();
            case 'Pause': return (s) => { if (s.state === 2) { s.state = 3; } };
            case 'Cancel': return (s) => s.cancel();
            case 'Completed': return this.sig('Completed');
            case 'PlaybackState': return ENUMS.PlaybackState.fromValue(this.state);
            case 'Instance': return this.inst;
            case 'TweenInfo': return this.info;
            case 'Destroy': return (s) => s.cancel();
        }
        return undefined;
    }
    luaNewIndex() {}
    play() {
        if (this.state === 2) return;
        if (this.state !== 3) {
            this.t = -this.info.DelayTime;
            this.from = {};
            for (const k of Object.keys(this.goals)) this.from[k] = this.inst.get(k);
            this.reps = 0;
            this.reversing = false;
        }
        this.state = 2;
        this.game.tweens.add(this);
    }
    cancel() {
        if (this.state === 2 || this.state === 3) {
            this.state = 5;
            this.game.tweens.delete(this);
            this.sig('Completed').fire(ENUMS.PlaybackState.items.Cancelled);
        }
    }
    update(dt) {
        if (this.state !== 2) return;
        this.t += dt;
        if (this.t < 0) return;
        const dur = Math.max(this.info.Time, 1e-6);
        let a = Math.min(this.t / dur, 1);
        if (this.reversing) a = 1 - a;
        const e = ease(this.info.EasingStyle, this.info.EasingDirection, a);
        for (const k of Object.keys(this.goals)) {
            const v = lerpValue(this.from[k], this.goals[k], e);
            if (v !== undefined) this.inst.set(k, v);
        }
        if (this.t >= dur) {
            if (this.info.Reverses && !this.reversing) { this.reversing = true; this.t = 0; return; }
            if (this.info.RepeatCount < 0 || this.reps < this.info.RepeatCount) { this.reps++; this.reversing = false; this.t = 0; return; }
            this.state = 4;
            this.game.tweens.delete(this);
            this.sig('Completed').fire(ENUMS.PlaybackState.items.Completed);
        }
    }
}
Tween.luaName = 'Tween';

function lerpValue(a, b, t) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (a instanceof Vector3 && b instanceof Vector3) return V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    if (a instanceof Vector2 && b instanceof Vector2) return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (a instanceof CFrame && b instanceof CFrame) return cfLerp(a, b, t);
    if (a instanceof Color3 && b instanceof Color3) return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    if (a instanceof UDim2 && b instanceof UDim2) return new UDim2(a.xs + (b.xs - a.xs) * t, a.xo + (b.xo - a.xo) * t, a.ys + (b.ys - a.ys) * t, a.yo + (b.yo - a.yo) * t);
    if (typeof b === 'boolean') return t >= 1 ? b : a;
    return t >= 1 ? b : a;
}

function easeIn(style, t) {
    switch (style) {
        case 0: return t;
        case 1: return 1 - Math.cos(t * Math.PI / 2);
        case 2: return t * t * (2.70158 * t - 1.70158);
        case 3: return t * t;
        case 4: return t * t * t * t;
        case 5: return t * t * t * t * t;
        case 6: return 1 - bounceOut(1 - t);
        case 7: return t === 0 ? 0 : (t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3));
        case 8: return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
        case 9: return 1 - Math.sqrt(1 - t * t);
        case 10: return t * t * t;
    }
    return t;
}
function bounceOut(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
}
function ease(style, dir, t) {
    const st = enumNum(style), d = enumNum(dir);
    if (st === 0) return t;
    if (d === 0) return easeIn(st, t);
    if (d === 1) return 1 - easeIn(st, 1 - t);
    return t < 0.5 ? easeIn(st, t * 2) / 2 : 1 - easeIn(st, (1 - t) * 2) / 2;
}

defClass('TweenService', 'Service', {
    methods: {
        Create: (s, inst, info, goals) => {
            const g = {};
            if (goals instanceof L.LuaTable) for (const k of goals.keys()) g[k] = goals.get(k);
            return new Tween(s.game, inst, info, g);
        },
        GetValue: (s, a, style, dir) => ease(style, dir, a)
    }
});

defClass('DataModel', 'Instance', {
    defaults: { PlaceId: 0, GameId: 0, JobId: 'local', CreatorId: 0, PlaceVersion: 1, Name: 'Game' },
    events: ['Loaded', 'Close'],
    getters: { Workspace: (s) => s.game.workspace },
    methods: {
        GetService: (s, n) => s.game.getService(n),
        getService: (s, n) => s.game.getService(n),
        service: (s, n) => s.game.getService(n),
        FindService: (s, n) => s.children.find(c => c.className === n),
        IsLoaded: () => true,
        BindToClose: () => {},
        GetObjects: () => tbl([]),
        SetPlaceId: () => {},
        IsA: (s, c) => c === 'DataModel' || c === 'Instance' || c === 'ServiceProvider'
    }
});
