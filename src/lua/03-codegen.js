const CMP_OPS = new Set(['<', '>', '<=', '>=', '==', '~=']);
const ARITH_FN = { '+': '$add', '-': '$sub', '*': '$mul', '/': '$div', '%': '$mod', '^': '$pow', '//': '$idiv', '..': '$concat', '<': '$lt', '>': '$gt', '<=': '$le', '>=': '$ge', '==': '$eq' };

class FnGen {
    constructor() {
        this.tmps = 0;
        this.uids = 0;
        this.loops = [];
    }
    tmp() { return '$t' + (++this.tmps); }
    uid() { return '$u' + (++this.uids); }
}

function isMultiNode(n) {
    return n.k === 'Call' || n.k === 'Method' || n.k === 'Vararg';
}

function genFunction(node, outer) {
    const fg = new FnGen();
    const parts = [];
    const params = node.params;
    let head = '';
    for (let i = 0; i < params.length; i++) head += 'let ' + params[i] + ' = $a[' + i + '];';
    if (node.vararg) head += 'const $va = $a.length > ' + params.length + ' ? $a.slice(' + params.length + ') : $E;';
    const body = genBlock(node.body, fg);
    let tdecl = '';
    if (fg.tmps > 0) {
        const names = [];
        for (let i = 1; i <= fg.tmps; i++) names.push('$t' + i);
        tdecl = 'let ' + names.join(',') + ';';
    }
    parts.push('new $LF(function*($a){', head, tdecl, body, 'return $E;}, ', JSON.stringify(node.name || '?'), ')');
    return parts.join('');
}

function genBlock(stats, fg) {
    let out = '';
    for (const s of stats) out += genStat(s, fg);
    return out;
}

function truthyExpr(n, fg) {
    if (n.k === 'True') return 'true';
    if (n.k === 'False' || n.k === 'Nil') return 'false';
    if (n.k === 'Bin' && CMP_OPS.has(n.op)) return genExpr(n, fg);
    if (n.k === 'Un' && n.op === 'not') return '!(' + truthyExpr(n.e, fg) + ')';
    if (n.k === 'And') return '(' + truthyExpr(n.l, fg) + ' && ' + truthyExpr(n.r, fg) + ')';
    if (n.k === 'Or') return '(' + truthyExpr(n.l, fg) + ' || ' + truthyExpr(n.r, fg) + ')';
    const t = fg.tmp();
    return '((' + t + ' = ' + genExpr(n, fg) + ') !== undefined && ' + t + ' !== false)';
}

function genArgs(args, fg) {
    if (args.length === 0) return '[]';
    const items = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (i === args.length - 1 && isMultiNode(a)) items.push('...' + genMulti(a, fg));
        else items.push(genExpr(a, fg));
    }
    return '[' + items.join(',') + ']';
}

function genCall(n, fg) {
    const tf = fg.tmp();
    const ta = fg.tmp();
    let prefix = '';
    let fcode;
    let argsCode;
    if (n.k === 'Call') {
        fcode = genExpr(n.f, fg);
        argsCode = genArgs(n.args, fg);
    } else {
        const to = fg.tmp();
        fcode = '$index(' + to + ',' + JSON.stringify(n.name) + ')';
        prefix = to + ' = ' + genExpr(n.o, fg) + ',';
        const items = [to];
        for (let i = 0; i < n.args.length; i++) {
            const a = n.args[i];
            if (i === n.args.length - 1 && isMultiNode(a)) items.push('...' + genMulti(a, fg));
            else items.push(genExpr(a, fg));
        }
        argsCode = '[' + items.join(',') + ']';
    }
    return '(' + prefix + tf + ' = ' + fcode + ',' + ta + ' = ' + argsCode + ',' +
        tf + ' instanceof $LF ? (yield* ' + tf + '.f(' + ta + ')) : (typeof ' + tf + ' === \'function\' && ' + tf + '.$gen !== true) ? $ret(' + tf + '(...' + ta + ')) : (yield* $call(' + tf + ',' + ta + ')))';
}

function genMulti(n, fg) {
    if (n.k === 'Call' || n.k === 'Method') return genCall(n, fg);
    if (n.k === 'Vararg') return '$va';
    return '[' + genExpr(n, fg) + ']';
}

function genExpr(n, fg) {
    switch (n.k) {
        case 'Nil': return 'undefined';
        case 'True': return 'true';
        case 'False': return 'false';
        case 'Num': return Number.isFinite(n.v) ? (Object.is(n.v, -0) ? '-0' : String(n.v)) : (n.v > 0 ? 'Infinity' : '-Infinity');
        case 'Str': return JSON.stringify(n.v);
        case 'Vararg': return '$va[0]';
        case 'Local': return n.js;
        case 'Global': return '$gget(' + JSON.stringify(n.name) + ')';
        case 'Index': return '$index(' + genExpr(n.o, fg) + ',' + genExpr(n.key, fg) + ')';
        case 'Call':
        case 'Method': return genCall(n, fg) + '[0]';
        case 'Paren': return genExpr(n.e, fg);
        case 'Func': return genFunction(n, fg);
        case 'And': {
            const t = fg.tmp();
            return '((' + t + ' = ' + genExpr(n.l, fg) + ') === undefined || ' + t + ' === false ? ' + t + ' : ' + genExpr(n.r, fg) + ')';
        }
        case 'Or': {
            const t = fg.tmp();
            return '((' + t + ' = ' + genExpr(n.l, fg) + ') !== undefined && ' + t + ' !== false ? ' + t + ' : ' + genExpr(n.r, fg) + ')';
        }
        case 'Bin': {
            if (n.op === '~=') return '!$eq(' + genExpr(n.l, fg) + ',' + genExpr(n.r, fg) + ')';
            return ARITH_FN[n.op] + '(' + genExpr(n.l, fg) + ',' + genExpr(n.r, fg) + ')';
        }
        case 'Un':
            if (n.op === '-') return '$unm(' + genExpr(n.e, fg) + ')';
            if (n.op === '#') return '$len(' + genExpr(n.e, fg) + ')';
            return '!(' + truthyExpr(n.e, fg) + ')';
        case 'Table': return genTable(n, fg);
        case 'IfExp': {
            let code = genExpr(n.b, fg);
            for (let i = n.clauses.length - 1; i >= 0; i--) {
                code = '(' + truthyExpr(n.clauses[i].c, fg) + ' ? ' + genExpr(n.clauses[i].a, fg) + ' : ' + code + ')';
            }
            return code;
        }
        case 'Interp': {
            if (n.parts.length === 0) return '""';
            const items = n.parts.map(p => typeof p === 'string' ? JSON.stringify(p) : '$tostr(' + genExpr(p, fg) + ')');
            if (typeof n.parts[0] !== 'string') items.unshift('""');
            return '(' + items.join(' + ') + ')';
        }
    }
    throw new Error('codegen: unknown expression ' + n.k);
}

function genTable(n, fg) {
    const pos = [];
    const hash = [];
    for (let i = 0; i < n.items.length; i++) {
        const it = n.items[i];
        if (it.type === 'pos') {
            if (i === n.items.length - 1 && isMultiNode(it.e)) pos.push('...' + genMulti(it.e, fg));
            else pos.push(genExpr(it.e, fg));
        } else {
            hash.push(genExpr(it.k, fg), genExpr(it.v, fg));
        }
    }
    return '$tbl([' + pos.join(',') + '],[' + hash.join(',') + '])';
}

function genAssignTo(target, valueCode, fg) {
    if (target.k === 'Local') return target.js + ' = ' + valueCode + ';';
    if (target.k === 'Global') return '$gset(' + JSON.stringify(target.name) + ',' + valueCode + ');';
    return '$setindex(' + genExpr(target.o, fg) + ',' + genExpr(target.key, fg) + ',' + valueCode + ');';
}

function genStat(s, fg) {
    const ln = s.line ? '$S.line=' + s.line + ';' : '';
    switch (s.k) {
        case 'Local': {
            const names = s.names;
            const exprs = s.exprs;
            if (exprs.length === 0) return ln + 'let ' + names.join(',') + ';';
            const lastMulti = isMultiNode(exprs[exprs.length - 1]) && names.length > exprs.length - 1 + 0 && (exprs.length < names.length || exprs.length === names.length && false);
            if (names.length === exprs.length && !(isMultiNode(exprs[exprs.length - 1]) && false)) {
                const decls = names.map((nm, i) => nm + ' = ' + genExpr(exprs[i], fg));
                return ln + 'let ' + decls.join(',') + ';';
            }
            void lastMulti;
            const v = fg.tmp();
            const items = [];
            for (let i = 0; i < exprs.length; i++) {
                if (i === exprs.length - 1 && isMultiNode(exprs[i])) items.push('...' + genMulti(exprs[i], fg));
                else items.push(genExpr(exprs[i], fg));
            }
            const decls = names.map((nm, i) => nm + ' = ' + v + '[' + i + ']');
            return ln + v + ' = [' + items.join(',') + '];let ' + decls.join(',') + ';';
        }
        case 'LocalFunc':
            return ln + 'let ' + s.js + ' = ' + genFunction(s.f, fg) + ';';
        case 'Assign': {
            if (s.targets.length === 1 && s.exprs.length === 1) {
                const t = s.targets[0];
                const e = s.exprs[0];
                if (t.k === 'Index') {
                    return ln + '$setindex(' + genExpr(t.o, fg) + ',' + genExpr(t.key, fg) + ',' + genExpr(e, fg) + ');';
                }
                return ln + genAssignTo(t, genExpr(e, fg), fg);
            }
            const v = fg.tmp();
            const items = [];
            for (let i = 0; i < s.exprs.length; i++) {
                if (i === s.exprs.length - 1 && isMultiNode(s.exprs[i])) items.push('...' + genMulti(s.exprs[i], fg));
                else items.push(genExpr(s.exprs[i], fg));
            }
            let code = ln;
            const pre = [];
            const targets = s.targets.map(t => {
                if (t.k !== 'Index') return t;
                const to = fg.tmp();
                const tk = fg.tmp();
                pre.push(to + ' = ' + genExpr(t.o, fg) + ';' + tk + ' = ' + genExpr(t.key, fg) + ';');
                return { k: 'IndexTmp', o: to, key: tk };
            });
            code += pre.join('') + v + ' = [' + items.join(',') + '];';
            targets.forEach((t, i) => {
                const val = v + '[' + i + ']';
                if (t.k === 'IndexTmp') code += '$setindex(' + t.o + ',' + t.key + ',' + val + ');';
                else code += genAssignTo(t, val, fg);
            });
            return code;
        }
        case 'OpAssign': {
            const t = s.target;
            const fn = ARITH_FN[s.op];
            if (t.k === 'Index') {
                const to = fg.tmp();
                const tk = fg.tmp();
                return ln + to + ' = ' + genExpr(t.o, fg) + ';' + tk + ' = ' + genExpr(t.key, fg) + ';$setindex(' + to + ',' + tk + ',' + fn + '($index(' + to + ',' + tk + '),' + genExpr(s.e, fg) + '));';
            }
            const cur = t.k === 'Local' ? t.js : '$gget(' + JSON.stringify(t.name) + ')';
            return ln + genAssignTo(t, fn + '(' + cur + ',' + genExpr(s.e, fg) + ')', fg);
        }
        case 'CallStat':
            return ln + genCall(s.e, fg) + ';';
        case 'Do':
            return '{' + genBlock(s.body, fg) + '}';
        case 'While': {
            fg.loops.push({ type: 'while' });
            const cond = truthyExpr(s.c, fg);
            const body = genBlock(s.body, fg);
            fg.loops.pop();
            return ln + 'while (' + cond + '){if(--$S.budget<0)$timeout();' + body + '}';
        }
        case 'Repeat': {
            const condCode = truthyExpr(s.c, fg);
            fg.loops.push({ type: 'repeat', cond: condCode });
            const body = genBlock(s.body, fg);
            fg.loops.pop();
            return ln + 'for(;;){if(--$S.budget<0)$timeout();' + body + 'if(' + condCode + ')break;}';
        }
        case 'If': {
            let code = ln;
            s.clauses.forEach((cl, i) => {
                code += (i === 0 ? 'if (' : ' else if (') + truthyExpr(cl.c, fg) + '){' + genBlock(cl.body, fg) + '}';
            });
            if (s.orelse) code += ' else {' + genBlock(s.orelse, fg) + '}';
            return code;
        }
        case 'NumFor': {
            const id = fg.uid();
            const lim = id + 'l';
            const st = id + 's';
                        fg.loops.push({ type: 'for' });
            const body = genBlock(s.body, fg);
            fg.loops.pop();
            let stepCode = '1';
            let cond;
            if (s.step === null) {
                cond = id + ' <= ' + lim;
            } else if (s.step.k === 'Num' && s.step.v > 0) {
                stepCode = String(s.step.v);
                cond = id + ' <= ' + lim;
            } else if (s.step.k === 'Num' && s.step.v < 0) {
                stepCode = String(s.step.v);
                cond = id + ' >= ' + lim;
            } else {
                stepCode = '$forstep(' + genExpr(s.step, fg) + ')';
                cond = '(' + st + ' > 0 ? ' + id + ' <= ' + lim + ' : ' + id + ' >= ' + lim + ')';
            }
            return ln + 'for (let ' + id + ' = $fornum(' + genExpr(s.start, fg) + ',"initial"), ' + lim + ' = $fornum(' + genExpr(s.limit, fg) + ',"limit"), ' + st + ' = ' + stepCode + '; ' + cond + '; ' + id + ' += ' + st + '){if(--$S.budget<0)$timeout();let ' + s.v + ' = ' + id + ';' + body + '}';
        }
        case 'GenFor': {
            const id = fg.uid();
            fg.loops.push({ type: 'for' });
            const body = genBlock(s.body, fg);
            fg.loops.pop();
            const items = [];
            for (let i = 0; i < s.exprs.length; i++) {
                if (i === s.exprs.length - 1 && isMultiNode(s.exprs[i])) items.push('...' + genMulti(s.exprs[i], fg));
                else items.push(genExpr(s.exprs[i], fg));
            }
            const f = id + 'f';
            const st = id + 's';
            const v = id + 'v';
            const fast = id + 'q';
            const r = id + 'r';
            const decls = s.names.map((nm, i) => nm + ' = ' + r + '[' + i + ']');
            return ln + 'const ' + id + ' = [' + items.join(',') + '];let ' + f + ' = ' + id + '[0], ' + st + ' = ' + id + '[1], ' + v + ' = ' + id + '[2];const ' + fast + ' = $fastiter(' + f + ',' + st + ',' + v + ');' +
                'for(;;){if(--$S.budget<0)$timeout();let ' + r + ';if(' + fast + '){' + r + ' = ' + fast + '.next();if(!' + r + ')break;}else{' + r + ' = yield* $call(' + f + ',[' + st + ',' + v + ']);if(' + r + '[0]===undefined)break;' + v + ' = ' + r + '[0];}let ' + decls.join(',') + ';' + body + '}';
        }
        case 'Return': {
            if (s.exprs.length === 0) return ln + 'return $E;';
            if (s.exprs.length === 1 && isMultiNode(s.exprs[0])) return ln + 'return ' + genMulti(s.exprs[0], fg) + ';';
            const items = [];
            for (let i = 0; i < s.exprs.length; i++) {
                if (i === s.exprs.length - 1 && isMultiNode(s.exprs[i])) items.push('...' + genMulti(s.exprs[i], fg));
                else items.push(genExpr(s.exprs[i], fg));
            }
            return ln + 'return [' + items.join(',') + '];';
        }
        case 'Break': return 'break;';
        case 'Continue': {
            const loop = fg.loops[fg.loops.length - 1];
            if (loop && loop.type === 'repeat') return '{if(' + loop.cond + ')break;continue;}';
            return 'continue;';
        }
    }
    throw new Error('codegen: unknown statement ' + s.k);
}

function compileToJs(src, chunk) {
    const ast = parseSource(src, chunk);
    const fg = new FnGen();
    return genFunction(ast, fg);
}
