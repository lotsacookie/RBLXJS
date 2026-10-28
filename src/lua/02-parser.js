const BINPRI = {
    'or': [1, 1], 'and': [2, 2],
    '<': [3, 3], '>': [3, 3], '<=': [3, 3], '>=': [3, 3], '~=': [3, 3], '==': [3, 3],
    '..': [9, 8], '+': [10, 10], '-': [10, 10],
    '*': [11, 11], '/': [11, 11], '//': [11, 11], '%': [11, 11],
    '^': [14, 13]
};
const UNARY_PRI = 12;
const COMPOUND = { '+=': '+', '-=': '-', '*=': '*', '/=': '/', '%=': '%', '^=': '^', '..=': '..', '//=': '//' };

class Parser {
    constructor(tokens, chunk) {
        this.tokens = tokens;
        this.p = 0;
        this.chunk = chunk;
        this.uid = 0;
        this.fs = null;
    }
    get tok() { return this.tokens[this.p]; }
    peek(k) { return this.tokens[Math.min(this.p + (k || 1), this.tokens.length - 1)]; }
    fail(msg, tok) {
        tok = tok || this.tok;
        throw new LuaSyntaxError(this.chunk + ':' + tok.line + ': ' + msg + ' near \'' + (tok.t === 'eof' ? '<eof>' : (typeof tok.v === 'string' ? tok.v : String(tok.v))) + '\'');
    }
    next() { return this.tokens[this.p++]; }
    isOp(v) { const t = this.tok; return t.t === 'op' && t.v === v; }
    isKw(v) { const t = this.tok; return t.t === 'kw' && t.v === v; }
    acceptOp(v) { if (this.isOp(v)) { this.p++; return true; } return false; }
    acceptKw(v) { if (this.isKw(v)) { this.p++; return true; } return false; }
    expectOp(v) { if (!this.acceptOp(v)) this.fail("'" + v + "' expected"); }
    expectKw(v) { if (!this.acceptKw(v)) this.fail("'" + v + "' expected"); }
    expectName() {
        const t = this.tok;
        if (t.t !== 'name') this.fail('<name> expected');
        this.p++;
        return t.v;
    }

    openFunc(vararg) {
        this.fs = { parent: this.fs, scopes: [new Map()], vararg: !!vararg };
    }
    closeFunc() { this.fs = this.fs.parent; }
    openScope() { this.fs.scopes.push(new Map()); }
    closeScope() { this.fs.scopes.pop(); }
    declare(name) {
        const js = name.replace(/[^A-Za-z0-9_]/g, '_') + '$' + (++this.uid);
        this.fs.scopes[this.fs.scopes.length - 1].set(name, js);
        return js;
    }
    resolve(name) {
        for (let f = this.fs; f; f = f.parent) {
            for (let i = f.scopes.length - 1; i >= 0; i--) {
                const js = f.scopes[i].get(name);
                if (js) return js;
            }
        }
        return null;
    }

    parseChunk() {
        this.openFunc(true);
        const body = this.parseBlock();
        if (this.tok.t !== 'eof') this.fail("'<eof>' expected");
        this.closeFunc();
        return { k: 'Func', params: [], vararg: true, body, name: 'main chunk', line: 0 };
    }

    blockEnd() {
        const t = this.tok;
        if (t.t === 'eof') return true;
        if (t.t === 'kw') return t.v === 'end' || t.v === 'else' || t.v === 'elseif' || t.v === 'until';
        return false;
    }

    parseBlock() {
        const out = [];
        while (!this.blockEnd()) {
            if (this.isKw('return')) {
                out.push(this.parseReturn());
                break;
            }
            const s = this.parseStatement();
            if (s) out.push(s);
        }
        return out;
    }

    parseScopedBlock() {
        this.openScope();
        const b = this.parseBlock();
        this.closeScope();
        return b;
    }

    parseReturn() {
        const line = this.next().line;
        let exprs = [];
        if (!this.blockEnd() && !this.isOp(';')) exprs = this.parseExprList();
        this.acceptOp(';');
        return { k: 'Return', exprs, line };
    }

    skipTypeList() {
        for (;;) {
            if (this.tok.t === 'name' && this.peek().t === 'op' && this.peek().v === ':' ) {
                this.p += 2;
            }
            this.skipType();
            if (!this.acceptOp(',')) break;
        }
    }

    skipBalanced(open, close) {
        let depth = 0;
        do {
            const t = this.tok;
            if (t.t === 'eof') this.fail('unfinished type');
            if (t.t === 'op' && t.v === open) depth++;
            else if (t.t === 'op' && t.v === close) depth--;
            this.p++;
        } while (depth > 0);
    }

    skipType() {
        const t = this.tok;
        if (t.t === 'op' && t.v === '(') {
            this.skipBalanced('(', ')');
            if (this.acceptOp('->')) this.skipType();
        } else if (t.t === 'op' && t.v === '{') {
            this.skipBalanced('{', '}');
        } else if (t.t === 'string' || (t.t === 'kw' && (t.v === 'nil' || t.v === 'true' || t.v === 'false'))) {
            this.p++;
        } else if (t.t === 'name' && t.v === 'typeof' && this.peek().v === '(') {
            this.p++;
            this.skipBalanced('(', ')');
        } else if (t.t === 'name') {
            this.p++;
            while (this.isOp('.')) { this.p++; this.expectName(); }
            if (this.isOp('<')) this.skipBalanced('<', '>');
        } else if (t.t === 'op' && t.v === '<') {
            this.skipBalanced('<', '>');
            this.skipType();
        } else {
            this.fail('type expected');
        }
        for (;;) {
            if (this.isOp('?')) { this.p++; continue; }
            if (this.isOp('|') || this.isOp('&')) { this.p++; this.skipType(); continue; }
            if (this.isOp('->')) { this.p++; this.skipType(); continue; }
            break;
        }
    }

    parseStatement() {
        const t = this.tok;
        const line = t.line;
        if (t.t === 'op' && t.v === ';') { this.p++; return null; }
        if (t.t === 'op' && t.v === '::') {
            this.p++;
            this.expectName();
            this.expectOp('::');
            return null;
        }
        if (t.t === 'kw') {
            switch (t.v) {
                case 'if': return this.parseIf();
                case 'while': {
                    this.p++;
                    const c = this.parseExpr();
                    this.expectKw('do');
                    const body = this.parseScopedBlock();
                    this.expectKw('end');
                    return { k: 'While', c, body, line };
                }
                case 'do': {
                    this.p++;
                    const body = this.parseScopedBlock();
                    this.expectKw('end');
                    return { k: 'Do', body, line };
                }
                case 'for': return this.parseFor();
                case 'repeat': {
                    this.p++;
                    this.openScope();
                    const body = this.parseBlock();
                    this.expectKw('until');
                    const c = this.parseExpr();
                    this.closeScope();
                    return { k: 'Repeat', body, c, line };
                }
                case 'function': return this.parseFunctionStat();
                case 'local': return this.parseLocal();
                case 'return': return this.parseReturn();
                case 'break': this.p++; return { k: 'Break', line };
            }
        }
        if (t.t === 'name') {
            if (t.v === 'continue') {
                const nx = this.peek();
                if (!(nx.t === 'op' && ['=', '.', ':', '(', '[', ',', '+=', '-=', '*=', '/=', '..='].indexOf(nx.v) >= 0)) {
                    this.p++;
                    return { k: 'Continue', line };
                }
            }
            if ((t.v === 'type' || t.v === 'export') && this.peek().t === 'name' && !(this.peek().v === 'continue')) {
                const save = this.p;
                if (t.v === 'export') {
                    this.p++;
                    if (this.tok.t === 'name' && this.tok.v === 'type') this.p++;
                    else { this.p = save; }
                } else {
                    this.p++;
                }
                if (this.p !== save && this.tok.t === 'name') {
                    this.p++;
                    if (this.isOp('<')) this.skipBalanced('<', '>');
                    if (this.acceptOp('=')) {
                        this.skipType();
                        return null;
                    }
                }
                this.p = save;
            }
        }
        return this.parseExprStat();
    }

    parseIf() {
        const line = this.tok.line;
        const clauses = [];
        let orelse = null;
        this.p++;
        let c = this.parseExpr();
        this.expectKw('then');
        clauses.push({ c, body: this.parseScopedBlock() });
        for (;;) {
            if (this.acceptKw('elseif')) {
                c = this.parseExpr();
                this.expectKw('then');
                clauses.push({ c, body: this.parseScopedBlock() });
            } else if (this.acceptKw('else')) {
                orelse = this.parseScopedBlock();
                this.expectKw('end');
                break;
            } else {
                this.expectKw('end');
                break;
            }
        }
        return { k: 'If', clauses, orelse, line };
    }

    parseFor() {
        const line = this.next().line;
        const n1 = this.expectName();
        if (this.isOp(':')) { this.p++; this.skipType(); }
        if (this.isOp('=')) {
            this.p++;
            const start = this.parseExpr();
            this.expectOp(',');
            const limit = this.parseExpr();
            let step = null;
            if (this.acceptOp(',')) step = this.parseExpr();
            this.expectKw('do');
            this.openScope();
            const v = this.declare(n1);
            const body = this.parseBlock();
            this.closeScope();
            this.expectKw('end');
            return { k: 'NumFor', v, start, limit, step, body, line };
        }
        const names = [n1];
        while (this.acceptOp(',')) {
            names.push(this.expectName());
            if (this.isOp(':')) { this.p++; this.skipType(); }
        }
        this.expectKw('in');
        const exprs = this.parseExprList();
        this.expectKw('do');
        this.openScope();
        const js = names.map(n => this.declare(n));
        const body = this.parseBlock();
        this.closeScope();
        this.expectKw('end');
        return { k: 'GenFor', names: js, exprs, body, line };
    }

    parseFunctionStat() {
        const line = this.next().line;
        let nameTok = this.expectName();
        let target = this.nameExpr(nameTok);
        let fullName = nameTok;
        let isMethod = false;
        while (this.isOp('.') || this.isOp(':')) {
            const sep = this.next().v;
            const key = this.expectName();
            fullName += sep + key;
            target = { k: 'Index', o: target, key: { k: 'Str', v: key } };
            if (sep === ':') { isMethod = true; break; }
        }
        if (this.isOp('<')) this.skipBalanced('<', '>');
        const f = this.parseFuncBody(isMethod, fullName, line);
        return { k: 'Assign', targets: [target], exprs: [f], line };
    }

    parseLocal() {
        const line = this.next().line;
        if (this.acceptKw('function')) {
            const name = this.expectName();
            const js = this.declare(name);
            if (this.isOp('<')) this.skipBalanced('<', '>');
            const f = this.parseFuncBody(false, name, line);
            return { k: 'LocalFunc', js, f, line };
        }
        const names = [];
        do {
            names.push(this.expectName());
            if (this.isOp(':')) { this.p++; this.skipType(); }
            if (this.isOp('<') && this.peek().t === 'name' && this.peek(2).v === '>') this.p += 3;
        } while (this.acceptOp(','));
        let exprs = [];
        if (this.acceptOp('=')) exprs = this.parseExprList();
        const js = names.map(n => this.declare(n));
        return { k: 'Local', names: js, exprs, line };
    }

    parseExprStat() {
        const line = this.tok.line;
        const e = this.parseSuffixed();
        const t = this.tok;
        if (t.t === 'op' && (t.v === '=' || t.v === ',')) {
            const targets = [e];
            while (this.acceptOp(',')) targets.push(this.parseSuffixed());
            this.expectOp('=');
            const exprs = this.parseExprList();
            for (const tg of targets) {
                if (tg.k !== 'Local' && tg.k !== 'Global' && tg.k !== 'Index') this.fail('syntax error');
            }
            return { k: 'Assign', targets, exprs, line };
        }
        if (t.t === 'op' && COMPOUND[t.v]) {
            this.p++;
            const rhs = this.parseExpr();
            if (e.k !== 'Local' && e.k !== 'Global' && e.k !== 'Index') this.fail('syntax error');
            return { k: 'OpAssign', target: e, op: COMPOUND[t.v], e: rhs, line };
        }
        if (e.k !== 'Call' && e.k !== 'Method') this.fail('syntax error');
        return { k: 'CallStat', e, line };
    }

    parseExprList() {
        const out = [this.parseExpr()];
        while (this.acceptOp(',')) out.push(this.parseExpr());
        return out;
    }

    nameExpr(name) {
        const js = this.resolve(name);
        return js ? { k: 'Local', js } : { k: 'Global', name };
    }

    parseFuncBody(isMethod, name, line) {
        this.openFunc(false);
        const params = [];
        if (isMethod) params.push(this.declare('self'));
        this.expectOp('(');
        let vararg = false;
        if (!this.isOp(')')) {
            do {
                if (this.isOp('...')) {
                    this.p++;
                    vararg = true;
                    if (this.isOp(':')) { this.p++; this.skipType(); }
                    break;
                }
                params.push(this.declare(this.expectName()));
                if (this.isOp(':')) { this.p++; this.skipType(); }
            } while (this.acceptOp(','));
        }
        this.expectOp(')');
        this.fs.vararg = vararg;
        if (this.isOp(':')) {
            this.p++;
            if (this.isOp('(')) this.skipBalanced('(', ')');
            else this.skipType();
        }
        const body = this.parseBlock();
        this.expectKw('end');
        this.closeFunc();
        return { k: 'Func', params, vararg, body, name: name || null, line };
    }

    parsePrimary() {
        const t = this.tok;
        if (t.t === 'name') {
            this.p++;
            return this.nameExpr(t.v);
        }
        if (t.t === 'op' && t.v === '(') {
            this.p++;
            const e = this.parseExpr();
            this.expectOp(')');
            return { k: 'Paren', e };
        }
        this.fail('unexpected symbol');
    }

    parseSuffixed() {
        let e = this.parsePrimary();
        for (;;) {
            const t = this.tok;
            if (t.t === 'op') {
                if (t.v === '.') {
                    this.p++;
                    const key = this.expectName();
                    e = { k: 'Index', o: e, key: { k: 'Str', v: key }, line: t.line };
                    continue;
                }
                if (t.v === '[') {
                    this.p++;
                    const key = this.parseExpr();
                    this.expectOp(']');
                    e = { k: 'Index', o: e, key, line: t.line };
                    continue;
                }
                if (t.v === ':') {
                    this.p++;
                    const name = this.expectName();
                    const args = this.parseCallArgs();
                    e = { k: 'Method', o: e, name, args, line: t.line };
                    continue;
                }
                if (t.v === '(' || t.v === '{') {
                    const args = this.parseCallArgs();
                    e = { k: 'Call', f: e, args, line: t.line };
                    continue;
                }
            } else if (t.t === 'string' || t.t === 'template') {
                const args = this.parseCallArgs();
                e = { k: 'Call', f: e, args, line: t.line };
                continue;
            }
            break;
        }
        return e;
    }

    parseCallArgs() {
        const t = this.tok;
        if (t.t === 'string') {
            this.p++;
            return [{ k: 'Str', v: t.v }];
        }
        if (t.t === 'template') {
            return [this.parseTemplate(this.next())];
        }
        if (t.t === 'op' && t.v === '{') return [this.parseTable()];
        this.expectOp('(');
        let args = [];
        if (!this.isOp(')')) args = this.parseExprList();
        this.expectOp(')');
        return args;
    }

    parseTemplate(tok) {
        const parts = [];
        for (const part of tok.v) {
            if (typeof part === 'string') {
                if (part !== '') parts.push(part);
            } else {
                const sub = new Parser(tokenize(part.code, this.chunk), this.chunk);
                sub.uid = this.uid + 1000;
                sub.fs = this.fs;
                const e = sub.parseExpr();
                this.uid = sub.uid;
                parts.push(e);
            }
        }
        return { k: 'Interp', parts };
    }

    parseTable() {
        this.expectOp('{');
        const items = [];
        while (!this.isOp('}')) {
            if (this.isOp('[')) {
                this.p++;
                const k = this.parseExpr();
                this.expectOp(']');
                this.expectOp('=');
                items.push({ type: 'kv', k, v: this.parseExpr() });
            } else if (this.tok.t === 'name' && this.peek().t === 'op' && this.peek().v === '=') {
                const name = this.next().v;
                this.p++;
                items.push({ type: 'kv', k: { k: 'Str', v: name }, v: this.parseExpr() });
            } else {
                items.push({ type: 'pos', e: this.parseExpr() });
            }
            if (!this.acceptOp(',') && !this.acceptOp(';')) break;
        }
        this.expectOp('}');
        return { k: 'Table', items };
    }

    parseSimple() {
        const t = this.tok;
        switch (t.t) {
            case 'number': this.p++; return { k: 'Num', v: t.v };
            case 'string': this.p++; return { k: 'Str', v: t.v };
            case 'template': this.p++; return this.parseTemplate(t);
            case 'kw':
                if (t.v === 'nil') { this.p++; return { k: 'Nil' }; }
                if (t.v === 'true') { this.p++; return { k: 'True' }; }
                if (t.v === 'false') { this.p++; return { k: 'False' }; }
                if (t.v === 'function') {
                    this.p++;
                    return this.parseFuncBody(false, null, t.line);
                }
                if (t.v === 'if') {
                    this.p++;
                    const c = this.parseExpr();
                    this.expectKw('then');
                    const a = this.parseExpr();
                    const clauses = [{ c, a }];
                    while (this.acceptKw('elseif')) {
                        const c2 = this.parseExpr();
                        this.expectKw('then');
                        clauses.push({ c: c2, a: this.parseExpr() });
                    }
                    this.expectKw('else');
                    const b = this.parseExpr();
                    return { k: 'IfExp', clauses, b };
                }
                break;
            case 'op':
                if (t.v === '...') {
                    if (!this.fs.vararg) this.fail("cannot use '...' outside a vararg function");
                    this.p++;
                    return { k: 'Vararg' };
                }
                if (t.v === '{') return this.parseTable();
                break;
        }
        const e = this.parseSuffixed();
        if (this.isOp('::')) {
            this.p++;
            this.skipType();
        }
        return e;
    }

    parseExpr(limit) {
        limit = limit || 0;
        let left;
        const t = this.tok;
        if ((t.t === 'kw' && t.v === 'not') || (t.t === 'op' && (t.v === '-' || t.v === '#'))) {
            this.p++;
            const e = this.parseExpr(UNARY_PRI);
            left = { k: 'Un', op: t.v, e };
        } else {
            left = this.parseSimple();
            if (this.isOp('::')) {
                this.p++;
                this.skipType();
            }
        }
        for (;;) {
            const o = this.tok;
            let op = null;
            if (o.t === 'op') op = o.v;
            else if (o.t === 'kw' && (o.v === 'and' || o.v === 'or')) op = o.v;
            const pri = op && BINPRI[op];
            if (!pri || pri[0] <= limit) break;
            this.p++;
            const right = this.parseExpr(pri[1]);
            if (op === 'and') left = { k: 'And', l: left, r: right };
            else if (op === 'or') left = { k: 'Or', l: left, r: right };
            else left = { k: 'Bin', op, l: left, r: right, line: o.line };
        }
        return left;
    }
}

function parseSource(src, chunk) {
    const tokens = tokenize(src, chunk);
    return new Parser(tokens, chunk).parseChunk();
}
