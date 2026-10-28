class Connection extends HostObject {
    constructor(sig, fn) {
        super();
        this.sig = sig;
        this.fn = fn;
        this.connected = true;
    }
    luaIndex(k) {
        if (k === 'Connected') return this.connected;
        if (k === 'Disconnect' || k === 'disconnect') return Connection.disconnect;
        return undefined;
    }
    luaNewIndex() {}
    luaToString() { return 'RBXScriptConnection'; }
    get luaType() { return 'RBXScriptConnection'; }
}
Connection.disconnect = (c) => {
    c.connected = false;
    const i = c.sig.conns.indexOf(c);
    if (i >= 0) c.sig.conns.splice(i, 1);
};

const SIGNAL_WAIT = function* (s) {
    s.waiters.push(s.game.state.getCurrentTask());
    const r = yield* s.game.state.waitBlock();
    return r;
};
SIGNAL_WAIT.$gen = true;

class Signal extends HostObject {
    constructor(game, name) {
        super();
        this.game = game;
        this.name = name;
        this.conns = [];
        this.waiters = [];
    }
    get luaType() { return 'RBXScriptSignal'; }
    luaToString() { return 'Signal ' + this.name; }
    luaIndex(k) {
        if (k === 'Connect' || k === 'connect') return (s, fn) => s.connect(fn);
        if (k === 'Wait' || k === 'wait') return SIGNAL_WAIT;
        return undefined;
    }
    luaNewIndex() {}
    connect(fn) {
        const c = new Connection(this, fn);
        this.conns.push(c);
        return c;
    }
    fire(...args) {
        if (this.conns.length > 0) {
            const list = this.conns.slice();
            for (const c of list) {
                if (!c.connected) continue;
                const f = c.fn;
                if (typeof f === 'function' && !f.$gen) {
                    try { f(...args); } catch (e) { this.game.state.reportError(e); }
                } else {
                    this.game.state.spawn(f, args);
                }
            }
        }
        if (this.waiters.length > 0) {
            const w = this.waiters;
            this.waiters = [];
            for (const t of w) this.game.state.wake(t, args);
        }
    }
    hasListeners() { return this.conns.length > 0 || this.waiters.length > 0; }
}

const CLASSES = {};
function defClass(name, parent, opts) {
    opts = opts || {};
    CLASSES[name] = {
        name,
        parent: parent || null,
        defaults: opts.defaults || {},
        events: opts.events || [],
        methods: opts.methods || {},
        getters: opts.getters || {},
        setters: opts.setters || {},
        creatable: opts.creatable !== false
    };
}
function classChain(name) {
    const out = [];
    let c = CLASSES[name];
    while (c) { out.push(c); c = c.parent ? CLASSES[c.parent] : null; }
    return out;
}
function classIsA(name, target) {
    let c = CLASSES[name];
    while (c) { if (c.name === target) return true; c = c.parent ? CLASSES[c.parent] : null; }
    return false;
}

let INSTANCE_ID = 0;

class Instance extends HostObject {
    constructor(className, game) {
        super();
        this.className = className;
        this.game = game;
        this.uid = ++INSTANCE_ID;
        this.props = Object.create(null);
        this.children = [];
        this._parent = null;
        this.signals = null;
        this.attrs = null;
        this.tags = null;
        this.destroyed = false;
        this.chain = classChain(className);
        this.ext = null;
        for (let i = this.chain.length - 1; i >= 0; i--) {
            const d = this.chain[i].defaults;
            for (const k of Object.keys(d)) {
                const v = d[k];
                this.props[k] = typeof v === 'function' ? v() : v;
            }
        }
        if (this.props.Name === undefined) this.props.Name = className;
        this.hostInit();
    }
    hostInit() {}
    get luaType() { return 'Instance'; }
    luaToString() { return this.props.Name; }
    get Name() { return this.props.Name; }
    get parent() { return this._parent; }
    isA(c) { return classIsA(this.className, c); }

    signal(name) {
        if (this.signals === null) this.signals = Object.create(null);
        let s = this.signals[name];
        if (!s) s = this.signals[name] = new Signal(this.game, this.props.Name + '.' + name);
        return s;
    }
    fireSignal(name, ...args) {
        if (this.signals !== null) {
            const s = this.signals[name];
            if (s !== undefined) s.fire(...args);
        }
    }
    hasSignal(name) {
        if (this.signals === null) return false;
        const s = this.signals[name];
        return s !== undefined && s.hasListeners();
    }
    hasEvent(name) {
        for (const c of this.chain) if (c.events.indexOf(name) >= 0) return true;
        return false;
    }
    findMethod(k) {
        for (const c of this.chain) {
            const m = c.methods[k];
            if (m !== undefined) return m;
        }
        return undefined;
    }

    get(k) {
        for (const c of this.chain) {
            const g = c.getters[k];
            if (g !== undefined) return g(this);
        }
        const v = this.props[k];
        if (v !== undefined) return v;
        return undefined;
    }

    luaIndex(k) {
        if (typeof k !== 'string') return undefined;
        if (k === 'Parent') return this._parent === null ? undefined : this._parent;
        if (k === 'ClassName') return this.className;
        for (const c of this.chain) {
            const g = c.getters[k];
            if (g !== undefined) return g(this);
        }
        const v = this.props[k];
        if (v !== undefined) return v;
        const m = this.findMethod(k);
        if (m !== undefined) return m;
        if (this.hasEvent(k)) return this.signal(k);
        for (let i = 0; i < this.children.length; i++) if (this.children[i].props.Name === k) return this.children[i];
        return undefined;
    }

    luaNewIndex(k, v) {
        this.set(k, v);
    }

    set(k, v) {
        if (k === 'Parent') {
            this.setParent(v === undefined ? null : v);
            return;
        }
        if (k === 'ClassName') throw new L.LuaError('ClassName is read-only');
        for (const c of this.chain) {
            const s = c.setters[k];
            if (s !== undefined) {
                s(this, v);
                this.afterSet(k, v);
                return;
            }
        }
        if (this.props[k] === v) return;
        this.props[k] = v;
        this.afterSet(k, v);
    }

    afterSet(k, v) {
        this.game.propChanged(this, k, v);
        if (this.signals !== null) {
            this.fireSignal('Changed', k);
            const s = this.signals['$prop:' + k];
            if (s) s.fire();
        }
    }

    setRaw(k, v) {
        this.props[k] = v;
    }

    isDescendantOf(o) {
        let p = this._parent;
        while (p !== null) { if (p === o) return true; p = p._parent; }
        return false;
    }

    inGame() {
        let p = this;
        while (p._parent !== null) p = p._parent;
        return p === this.game.root;
    }

    setParent(np) {
        if (np === undefined) np = null;
        if (this.destroyed && np !== null) throw new L.LuaError('The Parent property of ' + this.props.Name + ' is locked, current parent: NULL, new parent ' + np.props.Name);
        if (np !== null && !(np instanceof Instance)) throw new L.LuaError('Attempt to set Parent to non-Instance');
        if (np === this._parent) return;
        if (np === this) throw new L.LuaError('Attempt to set ' + this.props.Name + ' as its own parent');
        if (np !== null && np.isDescendantOf(this)) throw new L.LuaError('Attempt to set ' + this.props.Name + ' as a descendant of itself');
        const old = this._parent;
        const wasIn = this.inGame();
        if (old !== null) {
            const i = old.children.indexOf(this);
            if (i >= 0) old.children.splice(i, 1);
        }
        this._parent = np;
        if (np !== null) np.children.push(this);
        const nowIn = this.inGame();
        if (old !== null) {
            old.fireSignal('ChildRemoved', this);
            let a = old;
            while (a !== null) {
                if (a.signals !== null && a.signals.DescendantRemoving !== undefined) a.fireSignal('DescendantRemoving', this);
                a = a._parent;
            }
        }
        if (np !== null) {
            np.fireSignal('ChildAdded', this);
            let a = np;
            while (a !== null) {
                if (a.signals !== null && a.signals.DescendantAdded !== undefined) a.fireSignal('DescendantAdded', this);
                a = a._parent;
            }
        }
        this.walk((d) => {
            if (d.signals !== null && d.signals.AncestryChanged !== undefined) d.fireSignal('AncestryChanged', this, np === null ? undefined : np);
        });
        this.game.parentChanged(this, old, np, wasIn, nowIn);
        if (this.signals !== null) this.fireSignal('Changed', 'Parent');
    }

    walk(fn) {
        fn(this);
        for (let i = 0; i < this.children.length; i++) this.children[i].walk(fn);
    }

    descendants(out) {
        out = out || [];
        for (const c of this.children) {
            out.push(c);
            c.descendants(out);
        }
        return out;
    }

    findChild(name, recursive) {
        for (const c of this.children) if (c.props.Name === name) return c;
        if (recursive) {
            for (const c of this.children) {
                const r = c.findChild(name, true);
                if (r) return r;
            }
        }
        return undefined;
    }

    fullName() {
        const parts = [];
        let p = this;
        while (p !== null && p !== this.game.root) {
            parts.unshift(p.props.Name);
            p = p._parent;
        }
        return parts.join('.');
    }

    destroy() {
        if (this.destroyed) return;
        this.fireSignal('Destroying');
        const kids = this.children.slice();
        for (const c of kids) c.destroy();
        this.destroyed = true;
        const old = this._parent;
        if (old !== null) {
            this._parent = null;
            const i = old.children.indexOf(this);
            if (i >= 0) old.children.splice(i, 1);
            const wasIn = old.inGame();
            old.fireSignal('ChildRemoved', this);
            this.game.parentChanged(this, old, null, wasIn, false);
        }
        this.game.instanceDestroyed(this);
        if (this.signals !== null) {
            for (const k of Object.keys(this.signals)) {
                const s = this.signals[k];
                for (const c of s.conns) c.connected = false;
                s.conns = [];
            }
        }
    }

    clone() {
        const map = new Map();
        const make = (src) => {
            const n = new Instance(src.className, src.game);
            n.constructInstance = true;
            map.set(src, n);
            for (const k of Object.keys(src.props)) n.props[k] = src.props[k];
            if (src.attrs) n.attrs = Object.assign(Object.create(null), src.attrs);
            if (src.tags) n.tags = new Set(src.tags);
            for (const c of src.children) {
                if (c.archivable === false) continue;
                const cc = make(c);
                cc._parent = n;
                n.children.push(cc);
            }
            return n;
        };
        const root = make(this);
        for (const [src, dst] of map) {
            for (const k of Object.keys(dst.props)) {
                const v = dst.props[k];
                if (v instanceof Instance && map.has(v)) dst.props[k] = map.get(v);
            }
        }
        for (const dst of map.values()) this.game.cloned(dst);
        return root;
    }
}
Instance.luaName = 'Instance';

const NATIVE = (fn) => fn;
const GEN = (fn) => { fn.$gen = true; return fn; };

function tbl(arr) {
    const t = new L.LuaTable();
    t.arr = arr;
    return t;
}

defClass('Instance', null, {
    events: ['Changed', 'ChildAdded', 'ChildRemoved', 'DescendantAdded', 'DescendantRemoving', 'AncestryChanged', 'Destroying'],
    defaults: { Archivable: true },
    getters: {
        Name: (s) => s.props.Name
    },
    methods: {
        Destroy: (s) => { s.destroy(); },
        destroy: (s) => { s.destroy(); },
        Remove: (s) => { s.destroy(); },
        remove: (s) => { s.destroy(); },
        ClearAllChildren: (s) => { for (const c of s.children.slice()) c.destroy(); },
        Clone: (s) => s.clone(),
        clone: (s) => s.clone(),
        GetChildren: (s) => tbl(s.children.slice()),
        getChildren: (s) => tbl(s.children.slice()),
        children: (s) => tbl(s.children.slice()),
        GetDescendants: (s) => tbl(s.descendants()),
        FindFirstChild: (s, n, r) => s.findChild(n, r === true),
        findFirstChild: (s, n, r) => s.findChild(n, r === true),
        FindFirstChildOfClass: (s, c) => s.children.find(x => x.className === c),
        FindFirstChildWhichIsA: (s, c, r) => {
            const f = (o) => {
                for (const x of o.children) if (x.isA(c)) return x;
                if (r) for (const x of o.children) { const y = f(x); if (y) return y; }
                return undefined;
            };
            return f(s);
        },
        FindFirstAncestor: (s, n) => { let p = s._parent; while (p) { if (p.props.Name === n) return p; p = p._parent; } return undefined; },
        FindFirstAncestorOfClass: (s, c) => { let p = s._parent; while (p) { if (p.className === c) return p; p = p._parent; } return undefined; },
        FindFirstAncestorWhichIsA: (s, c) => { let p = s._parent; while (p) { if (p.isA(c)) return p; p = p._parent; } return undefined; },
        IsA: (s, c) => s.isA(c),
        isA: (s, c) => s.isA(c),
        IsDescendantOf: (s, o) => s.isDescendantOf(o),
        isDescendantOf: (s, o) => s.isDescendantOf(o),
        IsAncestorOf: (s, o) => o.isDescendantOf(s),
        GetFullName: (s) => s.fullName(),
        GetDebugId: (s) => String(s.uid),
        GetPropertyChangedSignal: (s, p) => s.signal('$prop:' + p),
        SetAttribute: (s, k, v) => { if (!s.attrs) s.attrs = Object.create(null); s.attrs[k] = v; s.fireSignal('AttributeChanged', k); },
        GetAttribute: (s, k) => (s.attrs ? s.attrs[k] : undefined),
        GetAttributes: (s) => { const t = new L.LuaTable(); if (s.attrs) for (const k of Object.keys(s.attrs)) t.set(k, s.attrs[k]); return t; },
        WaitForChild: GEN(function* (s, n, timeout) {
            let c = s.findChild(n, false);
            if (c) return c;
            const g = s.game;
            const task = g.state.getCurrentTask();
            const sig = s.signal('ChildAdded');
            let done = false;
            let result;
            const conn = sig.connect((child) => {
                if (child.props.Name === n && !done) {
                    done = true;
                    result = child;
                    g.state.wake(task, [child]);
                }
            });
            if (timeout !== undefined) {
                g.state.scheduler.add(() => {
                    if (!done) { done = true; g.state.wake(task, [undefined]); }
                }, [], timeout);
            }
            const r = yield* g.state.waitBlock();
            Connection.disconnect(conn);
            return r.length > 0 ? r[0] : result;
        }),
        waitForChild: GEN(function* (s, n, t) { return yield* Instance_WaitForChild(s, n, t); })
    }
});
function Instance_WaitForChild(s, n, t) { return CLASSES.Instance.methods.WaitForChild(s, n, t); }
CLASSES.Instance.events.push('AttributeChanged');
