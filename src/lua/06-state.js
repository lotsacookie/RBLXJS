class Task {
    constructor(thread, chunk) {
        this.thread = thread;
        this.chunk = chunk;
        this.wake = 0;
        this.waitStart = 0;
        this.send = undefined;
        this.parked = false;
        this.dead = false;
        this.id = 0;
        thread.task = this;
    }
}

class Scheduler {
    constructor(state) {
        this.state = state;
        this.time = 0;
        this.tasks = [];
        this.nextId = 1;
    }
    create(fn, args, chunk) {
        const th = new Thread(fn, args);
        th.start();
        const task = new Task(th, chunk || (fn instanceof LuaFunction && fn.chunk) || S.chunk);
        task.id = this.nextId++;
        return task;
    }
    add(fn, args, delay, chunk) {
        const task = this.create(fn, args, chunk);
        task.wake = this.time + (delay || 0);
        task.waitStart = this.time;
        this.tasks.push(task);
        return task;
    }
    run(task, send) {
        const prevCurrent = S.current;
        const prevChunk = S.chunk;
        const prevLine = S.line;
        const prevCo = S.co;
        S.current = task;
        S.chunk = task.chunk;
        S.co = null;
        let r;
        try {
            r = task.thread.gen.next(send);
        } catch (e) {
            task.dead = true;
            task.thread.status = 'dead';
            this.state.reportError(e);
            S.current = prevCurrent;
            S.chunk = prevChunk;
            S.line = prevLine;
            S.co = prevCo;
            return;
        }
        S.current = prevCurrent;
        S.chunk = prevChunk;
        S.line = prevLine;
        S.co = prevCo;
        if (r.done) {
            task.dead = true;
            task.thread.status = 'dead';
            return;
        }
        const y = r.value;
        if (y && y.wait !== undefined) {
            task.waitStart = this.time;
            task.wake = this.time + Math.max(0, y.wait);
            task.parked = false;
        } else if (y && y.block) {
            task.parked = true;
        } else {
            task.dead = true;
            task.thread.status = 'dead';
            this.state.reportError(new LuaError('attempt to yield from outside a coroutine'));
        }
    }
    spawnNow(fn, args, chunk) {
        const task = this.create(fn, args, chunk);
        task.waitStart = this.time;
        task.wake = this.time;
        this.tasks.push(task);
        S.budget = BUDGET;
        this.run(task, undefined);
        return task;
    }
    wake(task, vals) {
        if (task.dead) return;
        task.parked = false;
        task.wake = this.time;
        task.send = vals;
    }
    cancel(task) {
        if (task.dead) return;
        task.dead = true;
        task.thread.status = 'dead';
        try { task.thread.gen.return(); } catch (e) {}
    }
    step(dt) {
        this.time += dt;
        const due = [];
        for (const t of this.tasks) if (!t.dead && !t.parked && t.wake <= this.time) due.push(t);
        if (due.length > 1) due.sort((a, b) => a.wake - b.wake || a.id - b.id);
        for (const t of due) {
            if (t.dead) continue;
            const send = t.send !== undefined ? t.send : [this.time - t.waitStart, this.time];
            t.send = undefined;
            S.budget = BUDGET;
            this.run(t, send);
        }
        if (this.tasks.length > 0) {
            let w = 0;
            for (let i = 0; i < this.tasks.length; i++) {
                const t = this.tasks[i];
                if (!t.dead) this.tasks[w++] = t;
            }
            this.tasks.length = w;
        }
    }
    count() {
        return this.tasks.length;
    }
}

const HELPER_NAMES = ['$S', '$LT', '$LF', '$index', '$setindex', '$call', '$ret', '$add', '$sub', '$mul', '$div', '$mod', '$pow', '$idiv', '$unm', '$len', '$concat', '$eq', '$lt', '$le', '$gt', '$ge', '$tbl', '$fastiter', '$fornum', '$forstep', '$E', '$timeout', '$tostr'];

function makeHelpers() {
    return {
        $S: S, $LT: LuaTable, $LF: LuaFunction, $index: index, $setindex: setindex, $call: call, $ret: ret,
        $add: add, $sub: sub, $mul: mul, $div: div, $mod: modOp, $pow: pow, $idiv: idiv, $unm: unm, $len: len,
        $concat: concat, $eq: eq, $lt: lt, $le: le, $gt: gt, $ge: ge, $tbl: tbl, $fastiter: fastiter,
        $fornum: fornum, $forstep: forstep, $E: EMPTY, $timeout: timeout, $tostr: tostr
    };
}

function compileFactory(src, chunk) {
    const js = compileToJs(src, chunk);
    const body = 'const {' + HELPER_NAMES.join(',') + '} = $h; return ' + js + ';';
    return new Function('$h', '$gget', '$gset', body);
}

function createState(opts) {
    opts = opts || {};
    const helpers = makeHelpers();
    const globals = new LuaTable();
    const state = {
        globals,
        out: opts.out || function (kind, text) { if (typeof console !== 'undefined') console.log(text); },
        onError: opts.onError || function (msg) { if (typeof console !== 'undefined') console.error(msg); },
        scheduler: null,
        host: opts.host || {}
    };
    const sched = new Scheduler(state);
    state.scheduler = sched;
    const cache = new Map();

    state.reportError = function (e) {
        const v = errorValue(e);
        state.onError(typeof v === 'string' ? v : tostr(v), e && e.luaTraceback, e);
    };

    state.makeEnv = function (extra) {
        const env = new LuaTable();
        const mt = new LuaTable();
        mt.set('__index', globals);
        env.mt = mt;
        if (extra) for (const k of Object.keys(extra)) env.set(k, extra[k]);
        return env;
    };

    state.load = function (src, chunk, env) {
        chunk = chunk || '?';
        let factory = cache.get(chunk + '\u0000' + src);
        if (!factory) {
            factory = compileFactory(src, chunk);
            if (cache.size > 200) cache.clear();
            cache.set(chunk + '\u0000' + src, factory);
        }
        const e = env || globals;
        const gget = (n) => index(e, n);
        const gset = (n, v) => setindex(e, n, v);
        const fn = factory(helpers, gget, gset);
        fn.chunk = chunk;
        return fn;
    };

    state.spawn = function (fn, args, chunk) {
        return sched.spawnNow(fn, args || [], chunk);
    };
    state.defer = function (fn, args, chunk) {
        return sched.add(fn, args || [], 0, chunk);
    };
    state.step = function (dt) {
        sched.step(dt);
    };
    state.wake = function (task, vals) {
        sched.wake(task, vals);
    };
    state.call = callSync;
    state.getCurrentTask = function () { return S.current; };

    const G = globals;
    const def = (name, fn, gen) => {
        if (gen) fn.$gen = true;
        G.set(name, fn);
        return fn;
    };

    def('print', (...a) => { state.out('print', a.map(tostr).join('\t')); });
    def('warn', (...a) => { state.out('warn', a.map(tostr).join(' ')); });
    def('error', (msg, level) => {
        if (typeof msg === 'string' && level !== 0) msg = errPos() + msg;
        throw new LuaError(msg);
    });
    def('assert', (...a) => {
        const v = a[0];
        if (v === undefined || v === false) {
            throw new LuaError(a.length > 1 ? a[1] : 'assertion failed!');
        }
        return a;
    });
    def('pcall', function* (f, ...args) {
        try {
            const r = yield* call(f, args);
            return [true, ...r];
        } catch (e) {
            if (e instanceof LuaSyntaxError && false) throw e;
            return [false, errorValue(e)];
        }
    }, true);
    def('xpcall', function* (f, h, ...args) {
        try {
            const r = yield* call(f, args);
            return [true, ...r];
        } catch (e) {
            const v = errorValue(e);
            let hr;
            try { hr = callSync(h, [v]); } catch (e2) { hr = [errorValue(e2)]; }
            return [false, ...hr];
        }
    }, true);
    def('select', (n, ...a) => {
        if (n === '#') return a.length;
        n = Math.trunc(checkNum(n, 1, 'select'));
        if (n < 0) n = a.length + n;
        else n = n - 1;
        if (n < 0) throw new LuaError(errPos() + "bad argument #1 to 'select' (index out of range)");
        return a.slice(n);
    });
    def('type', (...a) => {
        if (a.length === 0) throw new LuaError(errPos() + "bad argument #1 to 'type' (value expected)");
        return typeName(a[0]);
    });
    def('typeof', (v) => typeofName(v));
    def('tostring', (v) => tostr(v));
    def('tonumber', (v, base) => {
        if (base !== undefined) return tonum(typeof v === 'string' ? v : tostr(v), base);
        return tonum(v);
    });
    const nextF = def('next', (t, k) => {
        checkTable(t, 1, 'next');
        const r = t.nextKey(k);
        return r === undefined ? undefined : r;
    });
    nextFn = nextF;
    const ipI = (t, i) => {
        i = i + 1;
        const v = index(t, i);
        if (v === undefined) return undefined;
        return [i, v];
    };
    ipairsIter = ipI;
    def('ipairs', (t) => {
        if (t === undefined) throw new LuaError(errPos() + "bad argument #1 to 'ipairs' (table expected, got nil)");
        return [ipI, t, 0];
    });
    def('pairs', (t) => {
        if (t instanceof LuaTable) {
            if (t.mt !== null) {
                const h = t.mt.getStr('__pairs');
                if (h !== undefined) return callSync(h, [t]).slice(0, 3);
            }
            return [nextF, t, undefined];
        }
        if (t !== null && typeof t === 'object' && typeof t.luaPairs === 'function') return t.luaPairs();
        throw new LuaError(errPos() + "bad argument #1 to 'pairs' (table expected, got " + (t === undefined ? 'nil' : typeofName(t)) + ')');
    });
    def('rawget', (t, k) => checkTable(t, 1, 'rawget').get(k));
    def('rawset', (t, k, v) => { checkTable(t, 1, 'rawset').set(k, v); return t; });
    def('rawequal', (a, b) => a === b);
    def('rawlen', (t) => (typeof t === 'string' ? t.length : checkTable(t, 1, 'rawlen').length()));
    def('setmetatable', (t, m) => {
        checkTable(t, 1, 'setmetatable');
        if (m !== undefined && !(m instanceof LuaTable)) throw new LuaError(errPos() + "bad argument #2 to 'setmetatable' (nil or table expected)");
        if (t.mt !== null && t.mt.getStr('__metatable') !== undefined) throw new LuaError('cannot change a protected metatable');
        if (t.frozen) throw new LuaError('attempt to modify a readonly table');
        t.mt = m === undefined ? null : m;
        return t;
    });
    def('getmetatable', (t) => {
        const m = getmetatable(t);
        if (m === null || m === undefined) return undefined;
        const p = m.getStr('__metatable');
        return p !== undefined ? p : m;
    });
    def('unpack', G.get('unpack') || ((t, i, j) => {
        const a = i === undefined ? 1 : i;
        const b = j === undefined ? t.length() : j;
        const out = [];
        for (let k = a; k <= b; k++) out.push(t.get(k));
        return out;
    }));
    def('collectgarbage', (opt) => (opt === 'count' ? 256 : 0));
    def('gcinfo', () => 256);
    def('newproxy', () => new LuaTable());
    G.set('_VERSION', 'Luau');
    def('tick', () => Date.now() / 1000);
    def('time', () => sched.time);
    def('elapsedTime', () => sched.time);
    def('wait', function* (t) {
        const r = yield { wait: t === undefined ? 1 / 30 : (t < 1 / 30 ? 1 / 30 : t) };
        return r;
    }, true);
    def('spawn', (f, ...args) => { const task = sched.add(f, args, 0); return task.thread; });
    def('delay', (t, f, ...args) => { const task = sched.add(f, args, Math.max(0, t || 0)); return task.thread; });
    def('loadstring', (src, name) => {
        try {
            return state.load(checkStr(src, 1, 'loadstring'), name === undefined ? '=(loadstring)' : name, null);
        } catch (e) {
            return [undefined, errorValue(e)];
        }
    });
    def('getfenv', () => G);
    def('setfenv', (f) => f);

    const strLib = makeStringLib();
    G.set('string', strLib);
    stringLib = strLib;
    const sm = new LuaTable();
    sm.set('__index', strLib);
    stringMeta = sm;
    G.set('table', makeTableLib());
    const mathLib = makeMathLib();
    G.set('math', mathLib);
    G.set('bit32', makeBit32Lib());
    G.set('utf8', makeUtf8Lib());
    G.set('os', makeOsLib());
    const tbU = G.get('table').get('unpack');
    G.set('unpack', tbU);
    G.set('_G', G);
    G.set('shared', new LuaTable());

    let currentCo = null;
    const co = new LuaTable();
    G.set('coroutine', co);
    const mainThread = new Thread(null, []);
    mainThread.status = 'running';

    function* resume(c, ...args) {
        if (!(c instanceof Thread)) throw new LuaError(errPos() + "bad argument #1 to 'resume' (coroutine expected)");
        if (c.status === 'dead') return [false, 'cannot resume dead coroutine'];
        if (c.status !== 'suspended') return [false, 'cannot resume non-suspended coroutine'];
        const prev = S.co;
        if (prev) prev.status = 'normal';
        c.status = 'running';
        S.co = c;
        let input;
        try {
            if (!c.started) {
                c.args = args;
                c.start();
                input = undefined;
            } else {
                input = args;
            }
            for (;;) {
                const r = c.gen.next(input);
                if (r.done) {
                    c.status = 'dead';
                    c.dead = true;
                    return [true, ...r.value];
                }
                const y = r.value;
                if (y && y.cy) {
                    c.status = 'suspended';
                    return [true, ...y.cy];
                }
                input = yield y;
                S.co = c;
            }
        } catch (e) {
            c.status = 'dead';
            c.dead = true;
            return [false, errorValue(e)];
        } finally {
            S.co = prev;
            if (prev) prev.status = 'running';
        }
    }
    resume.$gen = true;
    co.set('create', (f) => new Thread(f, []));
    co.set('resume', resume);
    co.set('yield', Object.assign(function* (...v) {
        if (S.co === null) throw new LuaError(errPos() + 'attempt to yield from outside a coroutine');
        return yield { cy: v };
    }, { $gen: true }));
    co.set('status', (c) => c.status);
    co.set('isyieldable', () => S.co !== null);
    co.set('running', () => (S.co === null ? [mainThread, true] : [S.co, false]));
    co.set('wrap', (f) => {
        const c = new Thread(f, []);
        const w = function* (...args) {
            const r = yield* resume(c, ...args);
            if (r[0] === true) return r.slice(1);
            throw new LuaError(r[1]);
        };
        w.$gen = true;
        return w;
    });
    co.set('close', (c) => {
        if (c.status === 'suspended' || c.status === 'dead') {
            if (c.gen) { try { c.gen.return(); } catch (e) {} }
            c.status = 'dead';
            return true;
        }
        return [false, 'cannot close a ' + c.status + ' coroutine'];
    });

    const task = new LuaTable();
    G.set('task', task);
    task.set('spawn', (f, ...args) => {
        const t = f instanceof Thread ? f : null;
        if (t) return t;
        return sched.spawnNow(f, args).thread;
    });
    task.set('defer', (f, ...args) => sched.add(f, args, 0).thread);
    task.set('delay', (t, f, ...args) => sched.add(f, args, Math.max(0, t || 0)).thread);
    task.set('wait', Object.assign(function* (t) {
        const r = yield { wait: t === undefined ? 0 : t };
        return r[0];
    }, { $gen: true }));
    task.set('cancel', (th) => { if (th && th.task) sched.cancel(th.task); });

    state.defineGlobal = function (name, value) { G.set(name, value); };
    state.makeTable = function (obj) {
        const t = new LuaTable();
        for (const k of Object.keys(obj)) t.set(k, obj[k]);
        return t;
    };
    state.waitBlock = function* () {
        return yield { block: true };
    };
    return state;
}

function syntaxCheck(src, chunk) {
    parseSource(src, chunk);
}
