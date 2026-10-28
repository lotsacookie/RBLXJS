const EMPTY = Object.freeze([]);
const BUDGET = 20000000;
const S = { line: 0, budget: BUDGET, current: null, chunk: '?', onTimeout: null };

let idCounter = 0x1000;
const idMap = new WeakMap();
function objectId(o) {
    let id = idMap.get(o);
    if (!id) {
        id = '0x' + (0x5a000000 + (++idCounter) * 24).toString(16).padStart(8, '0');
        idMap.set(o, id);
    }
    return id;
}

class LuaTable {
    constructor() {
        this.arr = [];
        this.hash = null;
        this.mt = null;
    }
    get(k) {
        if (typeof k === 'number') {
            const a = this.arr;
            if (k >= 1 && k <= a.length && (k | 0) === k) return a[k - 1];
            if (k !== k) return undefined;
        }
        return this.hash === null ? undefined : this.hash.get(k);
    }
    getStr(k) {
        return this.hash === null ? undefined : this.hash.get(k);
    }
    set(k, v) {
        if (typeof k === 'number') {
            if (k !== k) throw new LuaError('table index is NaN');
            const a = this.arr;
            const n = a.length;
            if ((k | 0) === k && k >= 1) {
                if (k <= n) {
                    a[k - 1] = v;
                    if (v === undefined && k === n) {
                        let m = n - 1;
                        while (m > 0 && a[m - 1] === undefined) m--;
                        a.length = m;
                    }
                    return;
                }
                if (k === n + 1) {
                    if (v === undefined) {
                        if (this.hash !== null) this.hash.delete(k);
                        return;
                    }
                    a.push(v);
                    if (this.hash !== null && this.hash.size > 0) {
                        this.hash.delete(k);
                        let nk = k + 1;
                        let nv;
                        while ((nv = this.hash.get(nk)) !== undefined) {
                            a.push(nv);
                            this.hash.delete(nk);
                            nk++;
                        }
                    }
                    return;
                }
            }
        } else if (k === undefined) {
            throw new LuaError('table index is nil');
        }
        if (v === undefined) {
            if (this.hash !== null) this.hash.delete(k);
            return;
        }
        if (this.hash === null) this.hash = new Map();
        this.hash.set(k, v);
    }
    length() {
        const n = this.arr.length;
        if (n > 0 || this.hash === null) return n;
        let i = 0;
        while (this.hash.get(i + 1) !== undefined) i++;
        return i;
    }
    keys() {
        const out = [];
        for (let i = 0; i < this.arr.length; i++) if (this.arr[i] !== undefined) out.push(i + 1);
        if (this.hash !== null) for (const k of this.hash.keys()) out.push(k);
        return out;
    }
    nextKey(k) {
        const a = this.arr;
        let i = 0;
        if (k !== undefined) {
            if (typeof k === 'number' && (k | 0) === k && k >= 1 && k <= a.length) {
                i = k;
            } else {
                if (this.hash === null) return undefined;
                let found = false;
                for (const hk of this.hash.keys()) {
                    if (found) return [hk, this.hash.get(hk)];
                    if (hk === k) found = true;
                }
                return undefined;
            }
        }
        for (; i < a.length; i++) if (a[i] !== undefined) return [i + 1, a[i]];
        if (this.hash !== null) {
            for (const hk of this.hash.keys()) return [hk, this.hash.get(hk)];
        }
        return undefined;
    }
}

class LuaFunction {
    constructor(f, name) {
        this.f = f;
        this.name = name;
    }
}

function typeName(v) {
    switch (typeof v) {
        case 'undefined': return 'nil';
        case 'boolean': return 'boolean';
        case 'number': return 'number';
        case 'string': return 'string';
        case 'function': return 'function';
        default:
            if (v instanceof LuaTable) return 'table';
            if (v instanceof LuaFunction) return 'function';
            if (v instanceof Thread) return 'thread';
            return 'userdata';
    }
}

function typeofName(v) {
    if (v !== null && typeof v === 'object' && !(v instanceof LuaTable) && !(v instanceof LuaFunction) && !(v instanceof Thread)) {
        return v.luaType || 'userdata';
    }
    return typeName(v);
}

function fmtNumber(n) {
    if (n !== n) return 'nan';
    if (n === Infinity) return 'inf';
    if (n === -Infinity) return '-inf';
    if (Number.isInteger(n) && Math.abs(n) < 1e15) return String(n);
    return fmtG(n, 14);
}

function fmtG(n, prec) {
    if (n !== n) return 'nan';
    if (n === Infinity) return 'inf';
    if (n === -Infinity) return '-inf';
    if (n === 0) return Object.is(n, -0) ? '-0' : '0';
    if (prec === 0) prec = 1;
    const e = Number(n.toExponential(prec - 1).split('e')[1]);
    let s;
    if (e < -4 || e >= prec) {
        s = n.toExponential(prec - 1);
        let [m, ex] = s.split('e');
        if (m.indexOf('.') >= 0) m = m.replace(/0+$/, '').replace(/\.$/, '');
        const sign = ex[0] === '-' ? '-' : '+';
        ex = ex.replace(/^[+-]/, '');
        if (ex.length < 2) ex = '0' + ex;
        return m + 'e' + sign + ex;
    }
    s = n.toFixed(Math.max(0, prec - 1 - e));
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
}

function tostr(v) {
    switch (typeof v) {
        case 'string': return v;
        case 'number': return fmtNumber(v);
        case 'undefined': return 'nil';
        case 'boolean': return v ? 'true' : 'false';
        case 'function': return 'function: builtin: ' + objectId(v);
        default:
            if (v instanceof LuaTable) {
                if (v.mt !== null) {
                    const h = v.mt.get('__tostring');
                    if (h !== undefined) return tostr(first(callSync(h, [v])));
                    const nm = v.mt.get('__type');
                    if (typeof nm === 'string') return nm + ': ' + objectId(v);
                }
                return 'table: ' + objectId(v);
            }
            if (v instanceof LuaFunction) return 'function: ' + objectId(v);
            if (v instanceof Thread) return 'thread: ' + objectId(v);
            if (typeof v.luaToString === 'function') return v.luaToString();
            return 'userdata: ' + objectId(v);
    }
}

function first(r) { return r[0]; }

function tonum(v, base) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') {
        const s = v.trim();
        if (base !== undefined && base !== 10) {
            const m = s.toLowerCase();
            if (!/^-?[0-9a-z]+$/.test(m)) return undefined;
            const r = parseInt(m, base);
            return isNaN(r) ? undefined : r;
        }
        if (s === '') return undefined;
        if (/^[-+]?0[xX][0-9a-fA-F]+$/.test(s)) return parseInt(s, 16);
        if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(s)) return parseFloat(s);
        if (/^[-+]?(inf|infinity)$/i.test(s)) return s[0] === '-' ? -Infinity : Infinity;
        if (/^nan$/i.test(s)) return NaN;
        return undefined;
    }
    return undefined;
}

function callSync(f, args) {
    if (f instanceof LuaFunction) {
        const g = f.f(args);
        const r = g.next();
        if (!r.done) throw new LuaError('attempt to yield across a C-call boundary');
        return r.value;
    }
    if (typeof f === 'function') {
        if (f.$gen) {
            const g = f(...args);
            const r = g.next();
            if (!r.done) throw new LuaError('attempt to yield across a C-call boundary');
            return ret(r.value);
        }
        return ret(f(...args));
    }
    const mt = getmetatable(f);
    if (mt) {
        const h = mt.get('__call');
        if (h !== undefined) return callSync(h, [f, ...args]);
    }
    if (f !== null && typeof f === 'object' && typeof f.luaCall === 'function') return ret(f.luaCall(...args));
    throw new LuaError(errPos() + 'attempt to call a ' + typeName(f) + ' value');
}

function* call(f, args) {
    if (f instanceof LuaFunction) return yield* f.f(args);
    if (typeof f === 'function') {
        if (f.$gen) return ret(yield* f(...args));
        return ret(f(...args));
    }
    const mt = getmetatable(f);
    if (mt) {
        const h = mt.get('__call');
        if (h !== undefined) return yield* call(h, [f, ...args]);
    }
    if (f !== null && typeof f === 'object' && typeof f.luaCall === 'function') return ret(f.luaCall(...args));
    throw new LuaError(errPos() + 'attempt to call a ' + typeName(f) + ' value');
}

function ret(r) {
    if (r === undefined) return EMPTY;
    if (Array.isArray(r)) return r;
    return [r];
}

function errPos() {
    return S.chunk + ':' + S.line + ': ';
}

function getmetatable(v) {
    if (v instanceof LuaTable) return v.mt;
    if (typeof v === 'string') return stringMeta;
    return null;
}

let stringMeta = null;
let stringLib = null;

function index(o, k) {
    if (o instanceof LuaTable) {
        const v = o.get(k);
        if (v !== undefined || o.mt === null) return v;
        const h = o.mt.getStr('__index');
        if (h === undefined) return undefined;
        if (h instanceof LuaTable) return index(h, k);
        if (typeof h === 'function' || h instanceof LuaFunction) return first(callSync(h, [o, k]));
        return index(h, k);
    }
    if (typeof o === 'string') return stringLib.get(k);
    if (o !== null && typeof o === 'object' && typeof o.luaIndex === 'function') return o.luaIndex(k);
    throw new LuaError(errPos() + 'attempt to index ' + (o === undefined ? 'nil' : typeName(o)) + ' with \'' + tostr(k) + '\'');
}

function setindex(o, k, v) {
    if (o instanceof LuaTable) {
        if (o.mt === null) {
            o.set(k, v);
            return;
        }
        const existing = o.get(k);
        if (existing !== undefined) {
            o.set(k, v);
            return;
        }
        const h = o.mt.getStr('__newindex');
        if (h === undefined) {
            o.set(k, v);
            return;
        }
        if (h instanceof LuaTable) {
            setindex(h, k, v);
            return;
        }
        callSync(h, [o, k, v]);
        return;
    }
    if (o !== null && typeof o === 'object' && typeof o.luaNewIndex === 'function') {
        o.luaNewIndex(k, v);
        return;
    }
    throw new LuaError(errPos() + 'attempt to index ' + (o === undefined ? 'nil' : typeName(o)) + ' with \'' + tostr(k) + '\'');
}

function metaOp(name, a, b) {
    let h;
    if (a instanceof LuaTable && a.mt !== null) h = a.mt.getStr(name);
    if (h === undefined && b instanceof LuaTable && b.mt !== null) h = b.mt.getStr(name);
    return h;
}

function hostArith(op, a, b) {
    if (a !== null && typeof a === 'object' && typeof a.luaArith === 'function') return a.luaArith(op, a, b);
    if (b !== null && typeof b === 'object' && typeof b.luaArith === 'function') return b.luaArith(op, a, b);
    return undefined;
}

const ARITH_NAMES = { add: '__add', sub: '__sub', mul: '__mul', div: '__div', mod: '__mod', pow: '__pow', idiv: '__idiv' };

function arithSlow(op, a, b) {
    if ((typeof a === 'string' || typeof a === 'number') && (typeof b === 'string' || typeof b === 'number')) {
        const x = tonum(a);
        const y = tonum(b);
        if (x !== undefined && y !== undefined) {
            switch (op) {
                case 'add': return x + y;
                case 'sub': return x - y;
                case 'mul': return x * y;
                case 'div': return x / y;
                case 'mod': return mod(x, y);
                case 'pow': return Math.pow(x, y);
                case 'idiv': return Math.floor(x / y);
            }
        }
    }
    const h = metaOp(ARITH_NAMES[op], a, b);
    if (h !== undefined) return first(callSync(h, [a, b]));
    const hv = hostArith(op, a, b);
    if (hv !== undefined) return hv;
    const bad = (typeof a === 'number' || (typeof a === 'string' && tonum(a) !== undefined)) ? b : a;
    throw new LuaError(errPos() + 'attempt to perform arithmetic (' + op + ') on ' + (bad === undefined ? 'nil' : typeofName(bad)) + ' value');
}

function mod(a, b) {
    if (b === 0) return NaN;
    if (b === Infinity) return a >= 0 ? a : (a === -Infinity ? NaN : b);
    if (b === -Infinity) return a <= 0 ? a : b;
    const r = a % b;
    return (r !== 0 && (r < 0) !== (b < 0)) ? r + b : r;
}

function add(a, b) { return typeof a === 'number' && typeof b === 'number' ? a + b : arithSlow('add', a, b); }
function sub(a, b) { return typeof a === 'number' && typeof b === 'number' ? a - b : arithSlow('sub', a, b); }
function mul(a, b) { return typeof a === 'number' && typeof b === 'number' ? a * b : arithSlow('mul', a, b); }
function div(a, b) { return typeof a === 'number' && typeof b === 'number' ? a / b : arithSlow('div', a, b); }
function modOp(a, b) { return typeof a === 'number' && typeof b === 'number' ? mod(a, b) : arithSlow('mod', a, b); }
function pow(a, b) { return typeof a === 'number' && typeof b === 'number' ? Math.pow(a, b) : arithSlow('pow', a, b); }
function idiv(a, b) { return typeof a === 'number' && typeof b === 'number' ? Math.floor(a / b) : arithSlow('idiv', a, b); }

function unm(a) {
    if (typeof a === 'number') return -a;
    if (typeof a === 'string') {
        const x = tonum(a);
        if (x !== undefined) return -x;
    }
    if (a instanceof LuaTable && a.mt !== null) {
        const h = a.mt.getStr('__unm');
        if (h !== undefined) return first(callSync(h, [a, a]));
    }
    if (a !== null && typeof a === 'object' && typeof a.luaArith === 'function') return a.luaArith('unm', a, a);
    throw new LuaError(errPos() + 'attempt to perform arithmetic (unm) on ' + (a === undefined ? 'nil' : typeofName(a)) + ' value');
}

function len(a) {
    if (typeof a === 'string') return a.length;
    if (a instanceof LuaTable) {
        if (a.mt !== null) {
            const h = a.mt.getStr('__len');
            if (h !== undefined) return first(callSync(h, [a]));
        }
        return a.length();
    }
    if (a !== null && typeof a === 'object' && typeof a.luaLen === 'function') return a.luaLen();
    throw new LuaError(errPos() + 'attempt to get length of a ' + (a === undefined ? 'nil' : typeName(a)) + ' value');
}

function concat(a, b) {
    const ta = typeof a;
    const tb = typeof b;
    if ((ta === 'string' || ta === 'number') && (tb === 'string' || tb === 'number')) {
        return (ta === 'number' ? fmtNumber(a) : a) + (tb === 'number' ? fmtNumber(b) : b);
    }
    const h = metaOp('__concat', a, b);
    if (h !== undefined) return first(callSync(h, [a, b]));
    const bad = (ta === 'string' || ta === 'number') ? b : a;
    throw new LuaError(errPos() + 'attempt to concatenate a ' + (bad === undefined ? 'nil' : typeofName(bad)) + ' value');
}

function eq(a, b) {
    if (a === b) return true;
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
    if (a instanceof LuaTable && b instanceof LuaTable) {
        const h = metaOp('__eq', a, b);
        if (h !== undefined) {
            const r = first(callSync(h, [a, b]));
            return r !== undefined && r !== false;
        }
        return false;
    }
    if (typeof a.luaEq === 'function') return a.luaEq(b);
    return false;
}

function lt(a, b) {
    const ta = typeof a;
    if (ta === 'number' && typeof b === 'number') return a < b;
    if (ta === 'string' && typeof b === 'string') return a < b;
    const h = metaOp('__lt', a, b);
    if (h !== undefined) {
        const r = first(callSync(h, [a, b]));
        return r !== undefined && r !== false;
    }
    if (a !== null && typeof a === 'object' && typeof a.luaLt === 'function') return a.luaLt(b);
    throw new LuaError(errPos() + 'attempt to compare ' + typeofName(a) + ' < ' + typeofName(b));
}

function le(a, b) {
    const ta = typeof a;
    if (ta === 'number' && typeof b === 'number') return a <= b;
    if (ta === 'string' && typeof b === 'string') return a <= b;
    let h = metaOp('__le', a, b);
    if (h !== undefined) {
        const r = first(callSync(h, [a, b]));
        return r !== undefined && r !== false;
    }
    h = metaOp('__lt', b, a);
    if (h !== undefined) {
        const r = first(callSync(h, [b, a]));
        return !(r !== undefined && r !== false);
    }
    if (a !== null && typeof a === 'object' && typeof a.luaLe === 'function') return a.luaLe(b);
    throw new LuaError(errPos() + 'attempt to compare ' + typeofName(a) + ' <= ' + typeofName(b));
}

function gt(a, b) { return lt(b, a); }
function ge(a, b) { return le(b, a); }

function tbl(pos, hash) {
    const t = new LuaTable();
    let n = pos.length;
    while (n > 0 && pos[n - 1] === undefined) n--;
    t.arr = n === pos.length ? pos : pos.slice(0, n);
    for (let i = 0; i < t.arr.length; i++) {
        if (t.arr[i] === undefined) {
            const rest = t.arr.slice(i + 1);
            t.arr.length = i;
            for (let j = 0; j < rest.length; j++) if (rest[j] !== undefined) t.set(i + 2 + j, rest[j]);
            break;
        }
    }
    for (let i = 0; i < hash.length; i += 2) {
        const v = hash[i + 1];
        if (v !== undefined) t.set(hash[i], v);
    }
    return t;
}

function fornum(v, what) {
    if (typeof v === 'number') return v;
    const n = tonum(v);
    if (n === undefined) throw new LuaError(errPos() + "'for' " + what + ' value must be a number');
    return n;
}

function forstep(v) {
    const n = fornum(v, 'step');
    if (n === 0) throw new LuaError(errPos() + "'for' step is zero");
    return n;
}

let nextFn = null;
let ipairsIter = null;

function fastiter(f, s, v) {
    if (f === nextFn && s instanceof LuaTable && v === undefined) {
        const t = s;
        let i = 0;
        let keys = null;
        let ki = 0;
        return {
            next() {
                const a = t.arr;
                while (i < a.length) {
                    const x = a[i++];
                    if (x !== undefined) return [i, x];
                }
                if (t.hash === null) return null;
                if (keys === null) keys = Array.from(t.hash.keys());
                while (ki < keys.length) {
                    const k = keys[ki++];
                    const x = t.hash.get(k);
                    if (x !== undefined) return [k, x];
                }
                return null;
            }
        };
    }
    if (f === ipairsIter && s instanceof LuaTable && s.mt === null) {
        const t = s;
        let i = 0;
        return {
            next() {
                const x = t.arr[i];
                if (x === undefined) return null;
                i++;
                return [i, x];
            }
        };
    }
    return null;
}

function timeout() {
    S.budget = BUDGET;
    throw new LuaError(errPos() + 'Script timeout: exhausted allowed execution time');
}

class Thread {
    constructor(fn, args) {
        this.fn = fn;
        this.args = args || EMPTY;
        this.gen = null;
        this.status = 'suspended';
        this.started = false;
        this.dead = false;
    }
    start() {
        if (this.fn instanceof LuaFunction) {
            this.gen = this.fn.f(this.args);
        } else if (typeof this.fn === 'function' && this.fn.$gen) {
            const f = this.fn;
            const a = this.args;
            this.gen = (function* () { return ret(yield* f(...a)); })();
        } else {
            const f = this.fn;
            const a = this.args;
            this.gen = (function* () { return ret(f(...a)); })();
        }
        this.started = true;
    }
}

function errorValue(e) {
    if (e instanceof LuaError) return e.value;
    if (e instanceof RangeError) return errPos() + 'stack overflow';
    if (e && e.message) return errPos() + String(e.message);
    return String(e);
}
