const SERVICE_CLASSES = new Set(['Workspace', 'Lighting', 'Players', 'ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'StarterPack', 'StarterGui', 'StarterPlayer', 'StarterPlayerScripts', 'StarterCharacterScripts', 'ReplicatedFirst', 'Teams', 'SoundService', 'Chat', 'Debris', 'RunService', 'TweenService', 'HttpService', 'UserInputService', 'ContextActionService', 'CollectionService', 'PhysicsService', 'BadgeService', 'TeleportService', 'MarketplaceService', 'PointsService', 'GuiService', 'InsertService', 'AdService', 'TextService', 'LogService', 'NotificationService', 'ScriptService', 'ContentProvider', 'GroupService', 'FriendService', 'Selection', 'ChangeHistoryService', 'AssetService', 'SocialService', 'GamePassService', 'CookiesService', 'TimerService', 'DataStoreService', 'PathfindingService', 'LocalizationService']);
const SKIP_CLASSES = new Set(['Camera', 'Terrain', 'Selection', 'ScriptInformationProvider', 'CSGDictionaryService', 'NonReplicatedCSGDictionaryService', 'FWService', 'RenderHooksService', 'Geometry', 'KeyboardService', 'MouseService', 'ChangeHistoryService']);
const JOINT_CLASSES = new Set(['Weld', 'ManualWeld', 'Snap', 'Glue', 'Motor6D', 'Motor', 'VelocityMotor', 'WeldConstraint', 'HingeConstraint', 'BallSocketConstraint', 'RopeConstraint', 'RodConstraint', 'SpringConstraint']);
const BODY_MOVERS = new Set(['BodyForce', 'BodyThrust', 'BodyVelocity', 'BodyPosition', 'BodyGyro', 'BodyAngularVelocity']);
const JOINT_PROPS = new Set(['Part0', 'Part1', 'C0', 'C1', 'Enabled', 'Attachment0', 'Attachment1', 'Length', 'FreeLength', 'Stiffness', 'Damping', 'LimitsEnabled', 'LowerAngle', 'UpperAngle', 'ActuatorType', 'AngularVelocity', 'MotorMaxTorque', 'CollideConnected']);

function ensureClass(name) {
    if (!CLASSES[name]) defClass(name, 'Instance', {});
}

function convertValue(prop, v, refMap) {
    if (v === null || typeof v !== 'object') return v;
    switch (v.$) {
        case 'Vector3': return new Vector3(v.x, v.y, v.z);
        case 'Vector2': return new Vector2(v.x, v.y);
        case 'CFrame': return new CFrame(v.m.slice());
        case 'Color3': return new Color3(v.r, v.g, v.b);
        case 'BrickColor': return new BrickColor(v.n);
        case 'Enum': return enumItemOf(prop, v.v);
        case 'UDim2': return new UDim2(v.xs, v.xo, v.ys, v.yo);
        case 'UDim': return new UDim(v.s, v.o);
        case 'Ref': return v.node ? refMap.get(v.node) : undefined;
        case 'NumberRange': return new NumberRange(v.min, v.max);
        case 'NumberSequence': return new Keypoints('number', v.keys.map(k => new KeypointItem(k.t, k.v, k.e)));
        case 'ColorSequence': return new Keypoints('color', v.keys.map(k => new KeypointItem(k.t, new Color3(k.r, k.g, k.b))));
        case 'Ray': return new Ray(new Vector3(v.o.x, v.o.y, v.o.z), new Vector3(v.d.x, v.d.y, v.d.z));
        default: return undefined;
    }
}

function makeRandom(seed) {
    let a = (seed === undefined ? (Math.random() * 4294967296) : Math.floor(seed * 7919)) >>> 0;
    const next = () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    class RandomObj extends HostObject {
        get luaType() { return 'Random'; }
        luaIndex(k) {
            switch (k) {
                case 'NextNumber': return (s, lo, hi) => (lo === undefined ? next() : lo + next() * (hi - lo));
                case 'NextInteger': return (s, lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
                case 'NextUnitVector': return () => { const z = next() * 2 - 1, t = next() * Math.PI * 2, r = Math.sqrt(1 - z * z); return V3(r * Math.cos(t), r * Math.sin(t), z); };
                case 'Clone': return () => makeRandom(next() * 1e6);
            }
            return undefined;
        }
        luaNewIndex() {}
    }
    return new RandomObj();
}

class Mouse extends HostObject {
    constructor(game) {
        super();
        this.game = game;
        this.hit = new CFrame();
        this.target = undefined;
        this.x = 0;
        this.y = 0;
        this.origin = new CFrame();
        this.unitRay = new Ray(V3(0, 0, 0), V3(0, 0, -1));
        this.sigs = {};
        this.Icon = '';
        this.TargetFilter = undefined;
        this.vx = 1280;
        this.vy = 720;
    }
    get luaType() { return 'Mouse'; }
    sig(n) { return this.sigs[n] || (this.sigs[n] = new Signal(this.game, 'Mouse.' + n)); }
    luaIndex(k) {
        switch (k) {
            case 'Hit': return this.hit;
            case 'Target': return this.target;
            case 'X': return this.x;
            case 'Y': return this.y;
            case 'ViewSizeX': return this.vx;
            case 'ViewSizeY': return this.vy;
            case 'UnitRay': return this.unitRay;
            case 'Origin': return this.origin;
            case 'Icon': return this.Icon;
            case 'TargetFilter': return this.TargetFilter;
            case 'Button1Down': case 'Button1Up': case 'Button2Down': case 'Button2Up': case 'Move': case 'Idle': case 'WheelForward': case 'WheelBackward': case 'KeyDown': case 'KeyUp': case 'Changed':
                return this.sig(k);
        }
        return undefined;
    }
    luaNewIndex(k, v) {
        if (k === 'Icon') this.Icon = v;
        else if (k === 'TargetFilter') this.TargetFilter = v;
    }
}
Mouse.luaName = 'Mouse';

class InputObject extends HostObject {
    constructor(type, code, state, x, y) {
        super();
        this.UserInputType = type;
        this.KeyCode = code;
        this.UserInputState = state;
        this.Position = V3(x || 0, y || 0, 0);
        this.Delta = V3(0, 0, 0);
    }
    get luaType() { return 'InputObject'; }
    luaIndex(k) { return this[k]; }
    luaNewIndex() {}
}
InputObject.luaName = 'InputObject';

class Game {
    constructor(opts) {
        opts = opts || {};
        this.hooks = opts.hooks || {};
        this.outputHandler = opts.out || null;
        this.errorHandler = opts.onError || null;
        this.state = L.createState({
            out: (kind, text) => this.output(kind, text),
            onError: (msg, trace) => this.scriptError(msg, trace)
        });
        this.root = new Instance('DataModel', this);
        this.running = false;
        this.movedParts = new Set();
        this.tweens = new Set();
        this.renderBinds = new Map();
        this.actions = new Map();
        this.keysDown = new Set();
        this.mouseButtons = new Set();
        this.mousePos = { x: 0, y: 0 };
        this.hotbarOrder = [];
        this.heldTool = null;
        this.localPlayer = null;
        this.sitCooldown = 0;
        this.collisionFilter = null;
        this.rayFilter = null;
        this.time = 0;
        this.phys = new PhysicsSync(this);
        this.mouse = new Mouse(this);
        this.deferredErrors = [];
        this.workspace = this.getService('Workspace');
        this.camera = this.newInstance('Camera', this.workspace);
        this.camera.props.Name = 'Camera';
        this.workspace.props.CurrentCamera = this.camera;
        for (const n of ['Players', 'Lighting', 'ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'StarterPack', 'StarterGui', 'StarterPlayer', 'ReplicatedFirst', 'Teams', 'SoundService', 'Debris', 'RunService', 'TweenService', 'HttpService', 'UserInputService', 'ContextActionService', 'CollectionService', 'Chat']) this.getService(n);
        const sp = this.getService('StarterPlayer');
        if (!sp.findChild('StarterPlayerScripts')) this.newInstance('StarterPlayerScripts', sp);
        if (!sp.findChild('StarterCharacterScripts')) this.newInstance('StarterCharacterScripts', sp);
        this.installGlobals();
    }

    hook(name, ...args) {
        const h = this.hooks[name];
        if (h) {
            try { return h(...args); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
        }
        return undefined;
    }

    output(kind, text) {
        if (this.outputHandler) this.outputHandler(kind, text);
        this.hook('output', kind, text);
    }

    scriptError(msg, trace) {
        this.output('error', String(msg));
        if (this.errorHandler) this.errorHandler(msg, trace);
    }

    newInstance(className, parent) {
        ensureClass(className);
        const inst = new Instance(className, this);
        if (parent) inst.setParent(parent);
        return inst;
    }

    getService(name) {
        for (const c of this.root.children) if (c.className === name) return c;
        ensureClass(name);
        const inst = new Instance(name, this);
        inst.setParent(this.root);
        return inst;
    }

    fallenHeight() {
        const h = this.workspace.props.FallenPartsDestroyHeight;
        return typeof h === 'number' ? h : -500;
    }

    inWorkspace(inst) {
        const ws = this.workspace;
        return inst === ws || inst.isDescendantOf(ws);
    }

    isCharacterDescendant(inst) {
        const pl = this.localPlayer;
        const ch = pl && pl.props.Character;
        if (!ch) return false;
        return inst === ch || inst.isDescendantOf(ch);
    }

    propChanged(inst, k, v) {
        if (inst.isA('BasePart')) {
            this.hook('partChanged', inst, k, v);
            if (k === 'Transparency' || k === 'Size' || k === 'Color' || k === 'BrickColor' || k === 'Material') this.movedParts.add(inst);
            return;
        }
        if (JOINT_CLASSES.has(inst.className)) {
            if (JOINT_PROPS.has(k)) this.phys.attachJoint(inst);
            return;
        }
        if (inst.className === 'Lighting' || inst.className === 'Sky' || inst.className === 'Atmosphere') {
            this.hook('lighting', inst, k, v);
            return;
        }
        this.hook('instanceChanged', inst, k, v);
        if (inst.className === 'Workspace' && k === 'FallenPartsDestroyHeight') return;
    }

    constraintsTouch(att) {
        for (const j of this.phys.joints) {
            if (j.props.Attachment0 === att || j.props.Attachment1 === att) this.phys.attachJoint(j);
        }
    }

    cloned(dst) {}

    instanceDestroyed(inst) {
        for (const t of Array.from(this.tweens)) if (t.inst === inst) this.tweens.delete(t);
        const i = this.hotbarOrder.indexOf(inst);
        if (i >= 0) this.hotbarOrder.splice(i, 1);
        if (inst.ext && inst.ext.task) this.state.scheduler.cancel(inst.ext.task);
    }

    parentChanged(inst, old, np, wasIn, nowIn) {
        const ws = this.workspace;
        const wasW = old !== null && wasIn && (old === ws || old.isDescendantOf(ws));
        const nowW = np !== null && nowIn && (np === ws || np.isDescendantOf(ws));
        if (nowW && !wasW) inst.walk((d) => this.worldAdded(d));
        else if (!nowW && wasW) inst.walk((d) => this.worldRemoved(d));
        else if (nowW && wasW) inst.walk((d) => this.worldMoved(d));
        if (this.running && (wasIn || nowIn)) {
            inst.walk((d) => {
                if (d.isA('BaseScript')) this.evalScript(d);
            });
        }
        if (this.hasGui(inst) || (old && this.hasGui(old))) this.guiParentChanged(inst, old, np);
        if (inst.isA('BackpackItem') || (old && (old.className === 'Backpack')) || (np && np.className === 'Backpack')) this.refreshHotbar();
    }

    hasGui(inst) {
        let p = inst;
        while (p) { if (p.className === 'PlayerGui' || p.className === 'BillboardGui' || p.className === 'SurfaceGui') return true; p = p._parent; }
        return false;
    }

    guiParentChanged(inst, old, np) {
        const under = (x) => { let p = x; while (p) { if (p.className === 'PlayerGui') return p.inGame(); p = p._parent; } return false; };
        const was = old ? under(old) : false;
        const now = np ? under(np) : false;
        if (now && !was) inst.walk((d) => { if (d.isA('GuiBase')) this.hook('guiAdded', d); });
        else if (!now && was) inst.walk((d) => { if (d.isA('GuiBase')) this.hook('guiRemoved', d); });
        else if (now && was) this.hook('guiMoved', inst);
    }

    worldAdded(d) {
        if (d.isA('BasePart')) {
            if (d.ext === null) d.ext = {};
            const inChar = this.isCharacterDescendant(d);
            if (inChar) {
                d.ext.noPhysics = true;
                d.ext.held = !(d.ext.character);
                if (!this.phys.characterBodies.has(d) && d.ext.held) this.phys.addCharacterBody(d, d.props.Size);
            } else {
                d.ext.noPhysics = false;
                d.ext.held = false;
                this.phys.addPart(d);
            }
            this.movedParts.add(d);
            this.hook('partAdded', d);
            return;
        }
        if (JOINT_CLASSES.has(d.className)) this.phys.attachJoint(d);
        else if (BODY_MOVERS.has(d.className)) this.phys.bodyMovers.add(d);
        else if (d.className === 'Explosion') this.explode(d);
        else if (d.className === 'Sound') { if (d.props.Playing) this.soundChanged(d, 'play'); }
        this.hook('instanceAdded', d);
    }

    worldRemoved(d) {
        if (d.isA('BasePart')) {
            this.phys.removePart(d);
            this.phys.removeCharacterBody(d);
            this.movedParts.delete(d);
            this.hook('partRemoved', d);
            return;
        }
        if (JOINT_CLASSES.has(d.className)) this.phys.detachJoint(d);
        else if (BODY_MOVERS.has(d.className)) this.phys.bodyMovers.delete(d);
        this.hook('instanceRemoved', d);
    }

    worldMoved(d) {
        if (d.isA('BasePart')) {
            const inChar = this.isCharacterDescendant(d);
            const held = !!(d.ext && d.ext.held);
            if (inChar && !held && !(d.ext && d.ext.character)) {
                this.phys.removePart(d);
                d.ext.noPhysics = true;
                d.ext.held = true;
                if (!this.phys.characterBodies.has(d)) this.phys.addCharacterBody(d, d.props.Size);
            } else if (!inChar && held) {
                this.phys.removeCharacterBody(d);
                d.ext.noPhysics = false;
                d.ext.held = false;
                this.phys.addPart(d);
            }
        }
    }

    soundChanged(s, action) {
        this.hook('sound', s, action);
    }

    touched(pa, pb) {
        const seatA = pa.className === 'Seat' || pa.className === 'VehicleSeat';
        const seatB = pb.className === 'Seat' || pb.className === 'VehicleSeat';
        if (seatA !== seatB) {
            const seat = seatA ? pa : pb;
            const other = seatA ? pb : pa;
            const hum = other._parent && other._parent.findChild('Humanoid');
            if (hum && other.className !== 'Part' || (hum && other._parent === (this.localPlayer && this.localPlayer.props.Character))) this.trySit(hum, seat);
        }
    }

    trySit(hum, seat) {
        if (!hum || hum.ext_dead || hum.props.SeatPart || seat.props.Disabled || seat.props.Occupant) return;
        if (this.time < this.sitCooldown) return;
        if (hum._parent !== (this.localPlayer && this.localPlayer.props.Character)) return;
        hum.props.SeatPart = seat;
        hum.props.Sit = true;
        seat.props.Occupant = hum;
        hum.fireSignal('Seated', true, seat);
        this.hook('sit', hum, seat);
    }

    leaveSeat(hum) {
        const seat = hum.props.SeatPart;
        if (!seat) return;
        hum.props.SeatPart = undefined;
        hum.props.Sit = false;
        seat.props.Occupant = undefined;
        this.sitCooldown = this.time + 1;
        hum.fireSignal('Seated', false, undefined);
        this.hook('unsit', hum, seat);
    }

    humanoidDied(h) {
        if (h._parent && this.localPlayer && h._parent === this.localPlayer.props.Character) {
            if (h.props.SeatPart) this.leaveSeat(h);
            if (this.heldTool) this.unequipTool();
            this.hook('died', h);
        }
    }

    evalScript(s) {
        if (s.className === 'ModuleScript') return;
        const should = s.inGame() && !s.props.Disabled && this.scriptRunnable(s);
        const running = !!(s.ext && s.ext.task);
        if (should && !running) this.startScript(s);
        else if (!should && running) this.stopScript(s);
    }

    scriptRunnable(s) {
        const isLocal = s.className === 'LocalScript';
        let allowed = false;
        let p = s._parent;
        while (p) {
            const c = p.className;
            if (c === 'ServerStorage' || c === 'ReplicatedStorage' || c === 'StarterPack' || c === 'StarterGui' || c === 'StarterPlayer' || c === 'StarterPlayerScripts' || c === 'StarterCharacterScripts' || c === 'StarterGear' || c === 'Lighting' || c === 'Teams' || c === 'SoundService') return false;
            if (c === 'Workspace' || c === 'ServerScriptService') { if (!isLocal || this.isCharacterDescendant(s)) allowed = true; }
            if (c === 'Backpack' || c === 'PlayerGui' || c === 'PlayerScripts' || c === 'ReplicatedFirst') allowed = true;
            p = p._parent;
        }
        return allowed;
    }

    startScript(s) {
        if (s.ext === null) s.ext = {};
        const chunk = s.fullName() || s.props.Name;
        const env = this.state.makeEnv({ script: s });
        let fn;
        try {
            fn = this.state.load(String(s.props.Source || ''), chunk, env);
        } catch (e) {
            this.state.reportError(e);
            s.ext.task = null;
            return;
        }
        s.ext.task = this.state.spawn(fn, [], chunk);
        if (s.ext.task && s.ext.task.dead) s.ext.task = { dead: true, done: true, thread: s.ext.task.thread };
    }

    stopScript(s) {
        const t = s.ext && s.ext.task;
        if (t && t.thread) this.state.scheduler.cancel(t);
        if (s.ext) s.ext.task = null;
    }

    requireModule(m) {
        const self = this;
        return (function* () {
            if (!(m instanceof Instance) || m.className !== 'ModuleScript') throw new L.LuaError('Attempted to call require with invalid argument(s).');
            if (m.modState) {
                if (m.modState.loading) throw new L.LuaError('Requested module was required recursively');
                return [m.modState.value];
            }
            const st = m.modState = { loading: true, value: undefined };
            const env = self.state.makeEnv({ script: m });
            let fn;
            try {
                fn = self.state.load(String(m.props.Source || ''), m.fullName() || m.props.Name, env);
            } catch (e) {
                m.modState = null;
                throw e;
            }
            try {
                const r = yield* L.call(fn, []);
                st.value = r[0];
            } catch (e) {
                m.modState = null;
                throw e;
            }
            st.loading = false;
            return [st.value];
        })();
    }

    installGlobals() {
        const st = this.state;
        const G = st.globals;
        const self = this;
        const types = makeTypeGlobals(st);
        for (const k of Object.keys(types)) G.set(k, types[k]);
        const InstanceT = st.makeTable({
            new: (cn, parent) => {
                const c = CLASSES[cn];
                if (!c || !c.creatable) throw new L.LuaError("Can't create a new " + cn);
                const inst = new Instance(cn, self);
                if (cn === 'Tool' || cn === 'HopperBin') inst.props.Name = cn === 'Tool' ? 'Tool' : 'HopperBin';
                if (parent !== undefined) inst.setParent(parent);
                return inst;
            }
        });
        G.set('Instance', InstanceT);
        G.set('game', this.root);
        G.set('Game', this.root);
        G.set('workspace', this.workspace);
        G.set('Workspace', this.workspace);
        const reqFn = function* (m) { return yield* self.requireModule(m); };
        reqFn.$gen = true;
        G.set('require', reqFn);
        G.set('Random', st.makeTable({ new: (seed) => makeRandom(seed) }));
        G.set('RaycastParams', st.makeTable({ new: () => new RaycastParams() }));
        G.set('printidentity', () => { self.output('print', 'Current identity is 2'); });
        G.set('version', () => 'version 0.2016.0');
        G.set('settings', () => new L.LuaTable());
        G.set('UserSettings', () => new L.LuaTable());
        G.set('LoadLibrary', () => new L.LuaTable());
        G.set('stats', () => new L.LuaTable());
        G.set('ypcall', G.get('pcall'));
        G.set('Delay', G.get('delay'));
        G.set('Spawn', G.get('spawn'));
        G.set('Wait', G.get('wait'));
        G.set('elapsedTime', () => st.scheduler.time);
        G.set('time', () => st.scheduler.time);
    }

    buildNodes(roots, forcePlace) {
        const map = new Map();
        const nodes = [];
        const collect = (n) => { nodes.push(n); for (const c of n.children) collect(c); };
        for (const r of roots) collect(r);
        const created = [];
        for (const n of nodes) {
            if (SKIP_CLASSES.has(n.className)) continue;
            if (n.parent && SKIP_CLASSES.has(n.parent.className) && n.parent.className !== 'Terrain') { }
            ensureClass(n.className);
            const inst = new Instance(n.className, this);
            map.set(n, inst);
            created.push([n, inst]);
        }
        for (const [n, inst] of created) {
            const p = inst.props;
            for (const raw of Object.keys(n.props)) {
                let k = raw;
                if (raw === 'formFactorRaw') k = 'FormFactor';
                else if (raw === 'Color3uint8') k = 'Color3uint8';
                else k = capName(raw);
                const v = convertValue(k, n.props[raw], map);
                if (k === 'Color3uint8') { inst.color8 = n.props[raw]; continue; }
                if (v === undefined && n.props[raw] !== undefined && n.props[raw] !== null && typeof n.props[raw] === 'object') {
                    if (n.props[raw].$ === 'Ref') p[k] = undefined;
                    continue;
                }
                p[k] = v;
            }
            if (inst.isA('BasePart')) {
                const c8 = n.props.Color3uint8;
                if (typeof c8 === 'number') {
                    p.Color = new Color3(((c8 >> 16) & 255) / 255, ((c8 >> 8) & 255) / 255, (c8 & 255) / 255);
                    if (!(n.props.BrickColor)) p.BrickColor = nearestBrickColor(p.Color);
                } else if (p.BrickColor instanceof BrickColor) {
                    const e = p.BrickColor.entry;
                    p.Color = new Color3(e[1] / 255, e[2] / 255, e[3] / 255);
                }
                if (!(p.CFrame instanceof CFrame)) p.CFrame = new CFrame();
                if (!(p.Size instanceof Vector3)) p.Size = V3(4, 1, 2);
                if (n.className === 'Part' || n.className === 'SpawnLocation' || n.className === 'Seat') {
                    if (!p.Shape) p.Shape = E('PartType', 'Block');
                }
            }
            if (n.className === 'Tool' || n.className === 'HopperBin') {
                if (p.GripPos === undefined) p.GripPos = V3(0, 0, 0);
            }
        }
        return { map, created };
    }

    instantiate(roots) {
        const { map } = this.buildNodes(roots);
        const top = [];
        const link = (n) => {
            const inst = map.get(n);
            if (!inst) return null;
            for (const c of n.children) {
                const ci = link(c);
                if (ci) { ci._parent = inst; inst.children.push(ci); }
            }
            return inst;
        };
        for (const r of roots) {
            const i = link(r);
            if (i) top.push(i);
        }
        return top;
    }

    loadParsed(parsed) {
        const roots = parsed.roots;
        const isPlace = roots.some(r => SERVICE_CLASSES.has(r.className) || r.isService);
        const loose = [];
        const serviceNodes = [];
        for (const r of roots) {
            if (r.className === 'DataModel') {
                for (const c of r.children) serviceNodes.push(c);
            } else if (SERVICE_CLASSES.has(r.className) || r.isService) serviceNodes.push(r);
            else loose.push(r);
        }
        const out = { places: isPlace, services: 0, parts: 0, scripts: 0 };
        for (const sn of serviceNodes) {
            if (SKIP_CLASSES.has(sn.className)) continue;
            const svc = this.getService(sn.className);
            const cleaned = { className: sn.className, props: sn.props, children: [], parent: null };
            const holder = this.instantiate([{ className: 'Folder', props: {}, children: sn.children, parent: null }])[0];
            this.applyServiceProps(svc, sn);
            if (sn.className === 'Players') continue;
            for (const c of holder.children.slice()) {
                c._parent = null;
                holder.children.splice(holder.children.indexOf(c), 1);
                c.setParent(svc);
            }
            out.services++;
        }
        if (loose.length) {
            const insts = this.instantiate(loose);
            for (const i of insts) i.setParent(this.workspace);
        }
        this.workspace.descendants().forEach(d => { if (d.isA('BasePart')) out.parts++; else if (d.isA('BaseScript')) out.scripts++; });
        const cam = this.workspace.findChild('Camera');
        if (cam && cam !== this.camera) cam.destroy();
        this.workspace.props.CurrentCamera = this.camera;
        this.phys.setGravity(this.workspace.props.Gravity || 196.2);
        this.hook('lighting', this.getService('Lighting'), null);
        return out;
    }

    applyServiceProps(svc, node) {
        for (const raw of Object.keys(node.props)) {
            const k = capName(raw);
            if (k === 'Name' || k === 'CurrentCamera' || k === 'PrimaryPart') continue;
            const v = convertValue(k, node.props[raw], new Map());
            if (v === undefined && node.props[raw] !== null && typeof node.props[raw] === 'object') continue;
            if (svc.className === 'Lighting' && (k === 'TimeOfDay')) { svc.set('TimeOfDay', v); continue; }
            svc.props[k] = v;
        }
    }

    loadBaseplate() {
        const ws = this.workspace;
        const bp = this.newInstance('Part');
        bp.props.Name = 'Baseplate';
        bp.props.Size = V3(512, 20, 512);
        bp.props.CFrame = new CFrame([0, -10, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
        bp.props.Anchored = true;
        bp.props.Locked = true;
        setPartBrickColor(bp, new BrickColor(199));
        bp.props.Color = new Color3(99 / 255, 95 / 255, 98 / 255);
        bp.setParent(ws);
        const sp = this.newInstance('SpawnLocation');
        sp.props.Name = 'SpawnLocation';
        sp.props.Size = V3(12, 1, 12);
        sp.props.CFrame = new CFrame([0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
        sp.props.Anchored = true;
        sp.props.Locked = true;
        sp.props.TopSurface = E('SurfaceType', 'Smooth');
        sp.props.BottomSurface = E('SurfaceType', 'Smooth');
        setPartBrickColor(sp, new BrickColor(194));
        sp.setParent(ws);
        const deco = this.newInstance('Decal');
        deco.props.Texture = 'rbxasset://Textures/SpawnLocation.png';
        deco.props.Face = E('NormalId', 'Top');
        deco.setParent(sp);
        return { places: true, parts: 2 };
    }

    start() {
        this.running = true;
        for (const d of this.root.descendants()) if (d.isA('BaseScript')) this.evalScript(d);
        this.phys.flush();
        this.addPlayer();
        this.loadCharacter();
    }

    addPlayer() {
        const players = this.getService('Players');
        const p = new Instance('Player', this);
        p.props.Name = this.playerName || 'Player1';
        p.props.UserId = this.userId || 1;
        this.localPlayer = p;
        p.setParent(players);
        this.newInstance('Backpack', p);
        this.newInstance('PlayerGui', p);
        this.newInstance('PlayerScripts', p);
        this.newInstance('StarterGear', p);
        for (const sc of this.getService('StarterPlayer').findChild('StarterPlayerScripts').children) sc.clone().setParent(p.findChild('PlayerScripts'));
        players.fireSignal('PlayerAdded', p);
        return p;
    }

    findSpawn() {
        const spawns = [];
        this.workspace.walk(d => { if (d.className === 'SpawnLocation' && d.props.Enabled !== false) spawns.push(d); });
        let sp = null;
        const neutral = spawns.filter(s => s.props.Neutral !== false);
        const pool = neutral.length ? neutral : spawns;
        if (pool.length) sp = pool[Math.floor(Math.random() * pool.length)];
        if (!sp) return { cf: new CFrame([0, 10, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]), spawn: null };
        const z = sp.props.Size, c = sp.props.CFrame;
        const lx = (Math.random() - 0.5) * Math.max(0, z.x - 2), lz = (Math.random() - 0.5) * Math.max(0, z.z - 2);
        const p = cfPoint(c, V3(lx, z.y / 2 + 3, lz));
        return { cf: new CFrame([p.x, p.y, p.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]), spawn: sp };
    }

    buildCharacter(name) {
        const model = this.newInstance('Model');
        model.props.Name = name;
        const mk = (n, size, off, brick) => {
            const p = this.newInstance('Part');
            p.props.Name = n;
            p.props.Size = size;
            p.props.CFrame = new CFrame([off.x, off.y, off.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
            p.props.TopSurface = E('SurfaceType', 'Smooth');
            p.props.BottomSurface = E('SurfaceType', 'Smooth');
            setPartBrickColor(p, new BrickColor(brick));
            p.ext = { character: true, noPhysics: true };
            p._parent = model;
            model.children.push(p);
            return p;
        };
        const hrp = mk('HumanoidRootPart', V3(2, 2, 1), V3(0, 0, 0), 194);
        hrp.props.Transparency = 1;
        hrp.props.CanCollide = true;
        const torso = mk('Torso', V3(2, 2, 1), V3(0, 0, 0), 23);
        const head = mk('Head', V3(2, 1, 1), V3(0, 1.5, 0), 24);
        const la = mk('Left Arm', V3(1, 2, 1), V3(-1.5, 0, 0), 24);
        const ra = mk('Right Arm', V3(1, 2, 1), V3(1.5, 0, 0), 24);
        const ll = mk('Left Leg', V3(1, 2, 1), V3(-0.5, -2, 0), 37);
        const rl = mk('Right Leg', V3(1, 2, 1), V3(0.5, -2, 0), 37);
        const hm = new Instance('SpecialMesh', this);
        hm.props.MeshType = E('MeshType', 'Head');
        hm.props.Scale = V3(1.25, 1.25, 1.25);
        hm._parent = head; head.children.push(hm);
        const face = new Instance('Decal', this);
        face.props.Name = 'face';
        face.props.Texture = 'face.png';
        face._parent = head; head.children.push(face);
        const joint = (n, p0, p1, c0, c1, parent) => {
            const j = new Instance('Motor6D', this);
            j.props.Name = n;
            j.props.Part0 = p0;
            j.props.Part1 = p1;
            j.props.C0 = c0;
            j.props.C1 = c1;
            j._parent = parent; parent.children.push(j);
        };
        const cfp = (x, y, z) => new CFrame([x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
        joint('RootJoint', hrp, torso, cfp(0, 0, 0), cfp(0, 0, 0), hrp);
        joint('Neck', torso, head, cfp(0, 1, 0), cfp(0, -0.5, 0), torso);
        joint('Left Shoulder', torso, la, cfp(-1, 0.5, 0), cfp(0.5, 0.5, 0), torso);
        joint('Right Shoulder', torso, ra, cfp(1, 0.5, 0), cfp(-0.5, 0.5, 0), torso);
        joint('Left Hip', torso, ll, cfp(-1, -1, 0), cfp(-0.5, 1, 0), torso);
        joint('Right Hip', torso, rl, cfp(1, -1, 0), cfp(0.5, 1, 0), torso);
        const hum = new Instance('Humanoid', this);
        hum.props.Name = 'Humanoid';
        hum._parent = model; model.children.push(hum);
        const bc = new Instance('BodyColors', this);
        bc._parent = model; model.children.push(bc);
        model.props.PrimaryPart = hrp;
        return model;
    }

    clearPlayerContainers() {
        const p = this.localPlayer;
        const bp = p.findChild('Backpack');
        for (const c of bp.children.slice()) c.destroy();
    }

    loadCharacter() {
        const p = this.localPlayer;
        if (!p) return null;
        const old = p.props.Character;
        if (old) {
            p.fireSignal('CharacterRemoving', old);
            if (this.heldTool) { this.heldTool = null; }
            old.destroy();
            p.props.Character = undefined;
        }
        const spawn = this.findSpawn();
        const ch = this.buildCharacter(p.props.Name);
        this.clearPlayerContainers();
        const hrp = ch.findChild('HumanoidRootPart');
        this.heldTool = null;
        const cfs = spawn.cf;
        p.props.Character = ch;
        this.placeCharacter(ch, cfs);
        ch.setParent(this.workspace);
        for (const part of ch.children) if (part.isA('BasePart')) { this.phys.addCharacterBody(part, part.props.Size); }
        const bp = p.findChild('Backpack');
        for (const c of this.getService('StarterPack').children) c.clone().setParent(bp);
        for (const c of p.findChild('StarterGear').children) c.clone().setParent(bp);
        const pg = p.findChild('PlayerGui');
        for (const c of Array.from(pg.children)) if (c.props.ResetOnSpawn !== false) c.destroy();
        for (const c of this.getService('StarterGui').children) c.clone().setParent(pg);
        const scripts = this.getService('StarterPlayer').findChild('StarterCharacterScripts');
        if (scripts) for (const c of scripts.children) c.clone().setParent(ch);
        const dur = spawn.spawn ? spawn.spawn.props.Duration : 0;
        if (dur > 0) {
            const ff = this.newInstance('ForceField', ch);
            this.state.scheduler.add(() => { if (!ff.destroyed) ff.destroy(); }, [], dur);
        }
        p.fireSignal('CharacterAdded', ch);
        this.refreshHotbar();
        this.hook('characterSpawned', ch, cfs);
        return ch;
    }

    placeCharacter(ch, rootCF) {
        const offs = { 'HumanoidRootPart': [0, 0, 0], 'Torso': [0, 0, 0], 'Head': [0, 1.5, 0], 'Left Arm': [-1.5, 0, 0], 'Right Arm': [1.5, 0, 0], 'Left Leg': [-0.5, -2, 0], 'Right Leg': [0.5, -2, 0] };
        for (const part of ch.children) {
            const o = offs[part.props.Name];
            if (!o || !part.isA('BasePart')) continue;
            part.props.CFrame = cfMul(rootCF, new CFrame([o[0], o[1], o[2], 1, 0, 0, 0, 1, 0, 0, 0, 1]));
            this.movedParts.add(part);
        }
    }

    humanoid() {
        const p = this.localPlayer;
        const ch = p && p.props.Character;
        return ch ? ch.findChild('Humanoid') : null;
    }

    character() {
        const p = this.localPlayer;
        return p ? p.props.Character : null;
    }

    setCharacterTransforms(cfs, dt) {
        const ch = this.character();
        if (!ch) return;
        for (const part of ch.children) {
            if (!part.isA('BasePart')) continue;
            const m = cfs[part.props.Name];
            if (!m) continue;
            const cf = new CFrame(m);
            part.props.CFrame = cf;
            this.movedParts.add(part);
            this.phys.moveCharacterPart(part, cf, dt);
        }
        const tool = this.heldTool;
        if (tool && !tool.destroyed) {
            const arm = ch.findChild('Right Arm');
            const handle = tool.findChild('Handle');
            if (arm && handle) {
                const c0 = new CFrame([0, -1, 0, 1, 0, 0, 0, 0, 1, 0, -1, 0]);
                const hcf = cfMul(cfMul(arm.props.CFrame, c0), cfInverse(gripOf(tool)));
                const inv = cfInverse(handle.props.CFrame);
                const parts = [];
                tool.walk(d => { if (d.isA('BasePart')) parts.push(d); });
                if (!tool.heldRel) tool.heldRel = new Map();
                for (const p of parts) {
                    if (!tool.heldRel.has(p)) tool.heldRel.set(p, p === handle ? new CFrame() : cfMul(inv, p.props.CFrame));
                    const cf = cfMul(hcf, tool.heldRel.get(p));
                    p.props.CFrame = cf;
                    this.movedParts.add(p);
                    this.phys.moveCharacterPart(p, cf, dt);
                }
            }
        }
    }

    refreshHotbar() {
        const p = this.localPlayer;
        if (!p) return;
        const bp = p.findChild('Backpack');
        const ch = p.props.Character;
        const present = [];
        if (bp) for (const c of bp.children) if (c.isA('BackpackItem')) present.push(c);
        if (ch) for (const c of ch.children) if (c.isA('BackpackItem')) present.push(c);
        const set = new Set(present);
        this.hotbarOrder = this.hotbarOrder.filter(t => set.has(t));
        for (const t of present) if (this.hotbarOrder.indexOf(t) < 0) this.hotbarOrder.push(t);
        this.hook('hotbar', this.hotbarOrder);
    }

    hotbarTools() {
        return this.hotbarOrder.slice();
    }

    equipTool(tool) {
        const ch = this.character();
        const hum = this.humanoid();
        if (!ch || !hum || hum.ext_dead || !(tool instanceof Instance) || !tool.isA('BackpackItem')) return false;
        if (this.heldTool === tool) return true;
        if (this.heldTool) this.unequipTool();
        if (tool.className === 'Tool' && tool.props.RequiresHandle !== false && !tool.findChild('Handle')) return false;
        tool.heldRel = null;
        tool.setParent(ch);
        this.heldTool = tool;
        if (tool.className === 'Tool') tool.fireSignal('Equipped', this.mouse);
        else tool.fireSignal('Selected', this.mouse);
        this.refreshHotbar();
        return true;
    }

    unequipTool() {
        const tool = this.heldTool;
        if (!tool) return;
        this.heldTool = null;
        const p = this.localPlayer;
        if (tool.className === 'Tool') tool.fireSignal('Unequipped'); else tool.fireSignal('Deselected');
        const bp = p && p.findChild('Backpack');
        if (!tool.destroyed && bp) tool.setParent(bp);
        this.refreshHotbar();
    }

    dropTool() {
        const tool = this.heldTool;
        if (!tool || tool.props.CanBeDropped === false) return;
        const ch = this.character();
        const hrp = ch && ch.findChild('HumanoidRootPart');
        this.heldTool = null;
        tool.fireSignal('Unequipped');
        if (hrp && tool.findChild('Handle')) {
            const h = tool.findChild('Handle');
            const target = cfMul(hrp.props.CFrame, new CFrame([0, 0, -3, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
            const parts = [];
            tool.walk(d => { if (d.isA('BasePart')) parts.push(d); });
            const inv = cfInverse(h.props.CFrame);
            const rels = parts.map(p => cfMul(inv, p.props.CFrame));
            tool.setParent(this.workspace);
            parts.forEach((p, i) => { p.props.Anchored = false; p.ext && (p.ext.noPhysics = false); p.props.CFrame = cfMul(target, rels[i]); this.phys.markDirty(p); });
        } else tool.setParent(this.workspace);
        this.refreshHotbar();
    }

    activateTool(tool) {
        if (!tool || tool.destroyed) return;
        if (tool !== this.heldTool) return;
        if (tool.props.Enabled === false) return;
        tool.fireSignal('Activated');
        tool.fireSignal('Deactivated');
    }

    explode(e) {
        const g = this;
        const pos = e.props.Position;
        const radius = e.props.BlastRadius;
        const pressure = e.props.BlastPressure;
        const pct = e.props.DestroyJointRadiusPercent;
        const parts = this.phys.queryParts([pos.x - radius, pos.y - radius, pos.z - radius], [pos.x + radius, pos.y + radius, pos.z + radius]);
        const hit = [];
        for (const p of parts) {
            const m = p.props.CFrame.m;
            const dx = m[0] - pos.x, dy = m[1] - pos.y, dz = m[2] - pos.z;
            const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
            const ext = Math.max(p.props.Size.x, p.props.Size.y, p.props.Size.z) / 2;
            if (d - ext > radius) continue;
            hit.push({ p, d, dx, dy, dz });
        }
        for (const h of hit) {
            const p = h.p;
            const hum = p._parent && p._parent.findChild && p._parent.findChild('Humanoid');
            if (hum && pct > 0 && h.d <= radius * Math.max(pct, 0.0001) + 2) {
                if (!p._parent.children.some(c => c.className === 'ForceField')) hum.set('Health', 0);
                continue;
            }
            if (pct > 0 && h.d <= radius * pct + Math.max(p.props.Size.x, p.props.Size.y, p.props.Size.z) / 2) breakJoints(p);
        }
        this.phys.flush();
        for (const h of hit) {
            const p = h.p;
            if (p.destroyed) continue;
            const b = this.phys.asmBody(p);
            if (b && b.type === 'dynamic') {
                const l = Math.max(h.d, 0.001);
                const fall = Math.max(0.15, 1 - h.d / (radius * 1.5));
                const mag = b.mass * 90 * fall * (pressure / 500000);
                b.applyImpulse([h.dx / l * mag, (h.dy / l * 0.6 + 0.5) * mag, h.dz / l * mag], [p.props.CFrame.m[0], p.props.CFrame.m[1], p.props.CFrame.m[2]]);
            }
            e.fireSignal('Hit', p, h.d);
        }
        this.hook('explosion', e, pos);
        this.state.scheduler.add(() => { if (!e.destroyed) e.destroy(); }, [], 2);
    }

    clickPart(part) {
        let p = part;
        while (p && p !== this.workspace) {
            for (const c of p.children) {
                if (c.className === 'ClickDetector') {
                    const hrp = this.character() && this.character().findChild('HumanoidRootPart');
                    if (hrp) {
                        const m = part.props.CFrame.m, h = hrp.props.CFrame.m;
                        const d = Math.sqrt((m[0] - h[0]) ** 2 + (m[1] - h[1]) ** 2 + (m[2] - h[2]) ** 2);
                        if (d > c.props.MaxActivationDistance + Math.max(part.props.Size.x, part.props.Size.y, part.props.Size.z)) continue;
                    }
                    c.fireSignal('MouseClick', this.localPlayer);
                    return true;
                }
            }
            p = p._parent;
        }
        return false;
    }

    input(kind, data) {
        const uis = this.getService('UserInputService');
        const T = ENUMS.UserInputType.items, S = ENUMS.UserInputState.items;
        if (kind === 'keydown' || kind === 'keyup') {
            const down = kind === 'keydown';
            const code = ENUMS.KeyCode.fromValue(data.code) || ENUMS.KeyCode.items.Unknown;
            if (down) this.keysDown.add(data.code); else this.keysDown.delete(data.code);
            const io = new InputObject(T.Keyboard, code, down ? S.Begin : S.End);
            uis.fireSignal(down ? 'InputBegan' : 'InputEnded', io, !!data.processed);
            for (const a of this.actions.values()) {
                if (a.keys.indexOf(data.code) >= 0) this.state.spawn(a.fn, [a.name || 'action', down ? S.Begin : S.End, io]);
            }
            const mk = this.mouse.sigs[down ? 'KeyDown' : 'KeyUp'];
            if (mk) mk.fire(String.fromCharCode(data.code));
        } else if (kind === 'mousedown' || kind === 'mouseup') {
            const down = kind === 'mousedown';
            const btn = data.button === 2 ? T.MouseButton2 : T.MouseButton1;
            if (down) this.mouseButtons.add(btn.Value); else this.mouseButtons.delete(btn.Value);
            const io = new InputObject(btn, ENUMS.KeyCode.items.Unknown, down ? S.Begin : S.End, data.x, data.y);
            uis.fireSignal(down ? 'InputBegan' : 'InputEnded', io, !!data.processed);
            const sg = this.mouse.sigs[(data.button === 2 ? 'Button2' : 'Button1') + (down ? 'Down' : 'Up')];
            if (sg) sg.fire();
        } else if (kind === 'mousemove') {
            this.mousePos.x = data.x;
            this.mousePos.y = data.y;
            const sg = this.mouse.sigs.Move;
            if (sg) sg.fire();
            const io = new InputObject(T.MouseMovement, ENUMS.KeyCode.items.Unknown, S.Change, data.x, data.y);
            uis.fireSignal('InputChanged', io, false);
        } else if (kind === 'wheel') {
            const sg = this.mouse.sigs[data.delta > 0 ? 'WheelForward' : 'WheelBackward'];
            if (sg) sg.fire();
        }
    }

    updateMouse(hitPos, target, x, y, ray, vw, vh) {
        const m = this.mouse;
        m.hit = new CFrame([hitPos.x, hitPos.y, hitPos.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
        m.target = target || undefined;
        m.x = x;
        m.y = y;
        m.unitRay = ray;
        m.origin = new CFrame([ray.Origin.x, ray.Origin.y, ray.Origin.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
        m.vx = vw;
        m.vy = vh;
        this.mousePos.x = x;
        this.mousePos.y = y;
    }

    syncCamera(cf, fov, vw, vh) {
        const c = this.camera.props;
        const scriptable = enumNum(c.CameraType) === 6;
        if (!scriptable) {
            c.CFrame = cf;
            c.FieldOfView = fov;
        }
        c.ViewportSize = new Vector2(vw, vh);
    }

    cameraScriptable() {
        return enumNum(this.camera.props.CameraType) === 6;
    }

    kick(msg) {
        this.hook('kick', msg === undefined ? 'You were kicked' : msg);
    }

    update(dt) {
        this.time += dt;
        const run = this.getService('RunService');
        run.fireSignal('Stepped', this.time, dt);
        this.state.step(dt);
        for (const t of Array.from(this.tweens)) t.update(dt);
        this.phys.step(dt);
        run.fireSignal('Heartbeat', dt);
        run.fireSignal('RenderStepped', dt);
        if (this.renderBinds.size) for (const b of Array.from(this.renderBinds.values())) this.state.spawn(b.fn, [dt]);
        if (this.movedParts.size) {
            const moved = this.movedParts;
            this.movedParts = new Set();
            this.hook('moved', moved);
        }
    }

    runSource(src, name) {
        const env = this.state.makeEnv({});
        try {
            const fn = this.state.load(src, name || 'console', env);
            this.state.spawn(fn, [], name || 'console');
        } catch (e) {
            this.state.reportError(e);
        }
    }

    treeText(inst, depth, out) {
        out = out || [];
        depth = depth || 0;
        const i = inst || this.root;
        out.push('  '.repeat(depth) + i.props.Name + ' [' + i.className + ']');
        for (const c of i.children) this.treeText(c, depth + 1, out);
        return out;
    }
}
