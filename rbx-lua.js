(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory();
    else root.RBXLua = factory();
})(typeof self !== "undefined" ? self : this, function () {
"use strict";
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);

class LuaError extends Error {
    constructor(value, traceback) {
        super(typeof value === 'string' ? value : 'error object');
        this.value = value;
        this.luaTraceback = traceback;
    }
}

class LuaSyntaxError extends LuaError {}

function isAlpha(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95; }
function isDigit(c) { return c >= 48 && c <= 57; }
function isHex(c) { return isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102); }
function isSpace(c) { return c === 32 || (c >= 9 && c <= 13); }

function tokenize(src, chunk) {
    const tokens = [];
    let i = 0;
    let line = 1;
    const n = src.length;
    const fail = (msg) => { throw new LuaSyntaxError(chunk + ':' + line + ': ' + msg); };

    if (src.charCodeAt(0) === 35) {
        while (i < n && src.charCodeAt(i) !== 10) i++;
    }

    const readLongBracket = () => {
        let j = i + 1;
        let level = 0;
        while (src.charCodeAt(j) === 61) { level++; j++; }
        if (src.charCodeAt(j) !== 91) return null;
        const close = ']' + '='.repeat(level) + ']';
        const start = j + 1;
        let e = src.indexOf(close, start);
        if (e < 0) fail('unfinished long string');
        let text = src.slice(start, e);
        for (let k = 0; k < text.length; k++) if (text.charCodeAt(k) === 10) line++;
        i = e + close.length;
        if (text.charCodeAt(0) === 13 && text.charCodeAt(1) === 10) text = text.slice(2);
        else if (text.charCodeAt(0) === 10) text = text.slice(1);
        return text.replace(/\r\n/g, '\n');
    };

    const readEscape = (quote) => {
        const c = src[i + 1];
        i += 2;
        switch (c) {
            case 'n': return '\n';
            case 't': return '\t';
            case 'r': return '\r';
            case 'a': return '\x07';
            case 'b': return '\b';
            case 'f': return '\f';
            case 'v': return '\v';
            case '\\': return '\\';
            case '"': return '"';
            case "'": return "'";
            case '`': return '`';
            case '\n': line++; return '\n';
            case '\r':
                if (src[i] === '\n') i++;
                line++;
                return '\n';
            case 'x': {
                const h = src.substr(i, 2);
                if (!/^[0-9a-fA-F]{2}$/.test(h)) fail('invalid escape sequence');
                i += 2;
                return String.fromCharCode(parseInt(h, 16));
            }
            case 'z':
                while (i < n && isSpace(src.charCodeAt(i))) {
                    if (src.charCodeAt(i) === 10) line++;
                    i++;
                }
                return '';
            case 'u': {
                if (src[i] !== '{') fail('invalid escape sequence');
                const e = src.indexOf('}', i);
                const cp = parseInt(src.slice(i + 1, e), 16);
                i = e + 1;
                return String.fromCodePoint(cp);
            }
            default:
                if (c !== undefined && isDigit(c.charCodeAt(0))) {
                    let d = c;
                    let k = 0;
                    while (k < 2 && isDigit(src.charCodeAt(i))) { d += src[i]; i++; k++; }
                    const v = parseInt(d, 10);
                    if (v > 255) fail('decimal escape too large');
                    return String.fromCharCode(v);
                }
                return c;
        }
        return '';
    };

    while (i < n) {
        const c = src.charCodeAt(i);
        if (c === 10) { line++; i++; continue; }
        if (isSpace(c)) { i++; continue; }
        if (c === 45 && src.charCodeAt(i + 1) === 45) {
            i += 2;
            if (src.charCodeAt(i) === 91) {
                const save = i;
                const t = readLongBracket();
                if (t !== null) continue;
                i = save;
            }
            while (i < n && src.charCodeAt(i) !== 10) i++;
            continue;
        }
        const startLine = line;
        if (isAlpha(c)) {
            let j = i + 1;
            while (j < n && (isAlpha(src.charCodeAt(j)) || isDigit(src.charCodeAt(j)))) j++;
            const word = src.slice(i, j);
            i = j;
            tokens.push({ t: KEYWORDS.has(word) ? 'kw' : 'name', v: word, line: startLine });
            continue;
        }
        if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
            let j = i;
            let value;
            if (c === 48 && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
                j = i + 2;
                while (j < n && (isHex(src.charCodeAt(j)) || src[j] === '_')) j++;
                value = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16);
            } else if (c === 48 && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
                j = i + 2;
                while (j < n && (src[j] === '0' || src[j] === '1' || src[j] === '_')) j++;
                value = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 2);
            } else {
                while (j < n && (isDigit(src.charCodeAt(j)) || src[j] === '_')) j++;
                if (src[j] === '.') {
                    j++;
                    while (j < n && (isDigit(src.charCodeAt(j)) || src[j] === '_')) j++;
                }
                if (src[j] === 'e' || src[j] === 'E') {
                    let k = j + 1;
                    if (src[k] === '+' || src[k] === '-') k++;
                    if (isDigit(src.charCodeAt(k))) {
                        while (k < n && isDigit(src.charCodeAt(k))) k++;
                        j = k;
                    }
                }
                value = parseFloat(src.slice(i, j).replace(/_/g, ''));
            }
            if (isAlpha(src.charCodeAt(j))) fail('malformed number near \'' + src.slice(i, j + 1) + '\'');
            i = j;
            tokens.push({ t: 'number', v: value, line: startLine });
            continue;
        }
        if (c === 34 || c === 39) {
            const q = c;
            i++;
            let out = '';
            for (;;) {
                if (i >= n) fail('unfinished string');
                const d = src.charCodeAt(i);
                if (d === q) { i++; break; }
                if (d === 10) fail('unfinished string');
                if (d === 92) { out += readEscape(q); continue; }
                out += src[i++];
            }
            tokens.push({ t: 'string', v: out, line: startLine });
            continue;
        }
        if (c === 96) {
            i++;
            const parts = [];
            let cur = '';
            for (;;) {
                if (i >= n) fail('unfinished string');
                const d = src.charCodeAt(i);
                if (d === 96) { i++; break; }
                if (d === 92) { cur += readEscape(96); continue; }
                if (d === 123) {
                    let depth = 1;
                    let j = i + 1;
                    while (j < n && depth > 0) {
                        if (src[j] === '{') depth++;
                        else if (src[j] === '}') depth--;
                        j++;
                    }
                    parts.push(cur);
                    cur = '';
                    parts.push({ code: src.slice(i + 1, j - 1), line });
                    i = j;
                    continue;
                }
                if (d === 10) line++;
                cur += src[i++];
            }
            parts.push(cur);
            tokens.push({ t: 'template', v: parts, line: startLine });
            continue;
        }
        if (c === 91) {
            const nx = src.charCodeAt(i + 1);
            if (nx === 91 || nx === 61) {
                const save = i;
                const t = readLongBracket();
                if (t !== null) {
                    tokens.push({ t: 'string', v: t, line: startLine });
                    continue;
                }
                i = save;
            }
        }
        const three = src.substr(i, 3);
        const two = src.substr(i, 2);
        if (three === '...' || three === '..=' || three === '//=') {
            tokens.push({ t: 'op', v: three, line: startLine });
            i += 3;
            continue;
        }
        if (['==', '~=', '<=', '>=', '..', '::', '+=', '-=', '*=', '/=', '%=', '^=', '//', '->'].indexOf(two) >= 0) {
            tokens.push({ t: 'op', v: two, line: startLine });
            i += 2;
            continue;
        }
        const ch = src[i];
        if ('+-*/%^#<>=(){}[];:,.?|&~!@'.indexOf(ch) >= 0) {
            tokens.push({ t: 'op', v: ch, line: startLine });
            i++;
            continue;
        }
        fail('unexpected symbol near \'' + ch + '\'');
    }
    tokens.push({ t: 'eof', v: '<eof>', line });
    return tokens;
}
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
const L_ESC = 37;
const CAP_UNFINISHED = -1;
const CAP_POSITION = -2;
const SPECIALS = /[\^$*+?.()[\]%-]/;

function isalpha(c) { return (c >= 65 && c <= 90) || (c >= 97 && c <= 122); }
function isdigit(c) { return c >= 48 && c <= 57; }
function islower(c) { return c >= 97 && c <= 122; }
function isupper(c) { return c >= 65 && c <= 90; }
function isspaceC(c) { return c === 32 || (c >= 9 && c <= 13); }
function iscntrl(c) { return c < 32 || c === 127; }
function ispunct(c) { return (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126); }
function isxdigit(c) { return isdigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102); }
function isalnum(c) { return isalpha(c) || isdigit(c); }
function isgraph(c) { return c > 32 && c < 127; }

function matchClass(c, cl) {
    let res;
    switch (cl | 32) {
        case 97: res = isalpha(c); break;
        case 99: res = iscntrl(c); break;
        case 100: res = isdigit(c); break;
        case 103: res = isgraph(c); break;
        case 108: res = islower(c); break;
        case 112: res = ispunct(c); break;
        case 115: res = isspaceC(c); break;
        case 117: res = isupper(c); break;
        case 119: res = isalnum(c); break;
        case 120: res = isxdigit(c); break;
        default: return cl === c;
    }
    if (isupper(cl)) res = !res;
    return res;
}

class MatchState {
    constructor(src, pat) {
        this.src = src;
        this.pat = pat;
        this.level = 0;
        this.capture = [];
        this.depth = 0;
    }
    reprep() {
        this.level = 0;
        this.depth = 0;
    }
    classEnd(p) {
        const pat = this.pat;
        if (p >= pat.length) throw new LuaError('malformed pattern (ends with \'%\')');
        const c = pat.charCodeAt(p++);
        if (c === L_ESC) {
            if (p >= pat.length) throw new LuaError("malformed pattern (ends with '%')");
            return p + 1;
        }
        if (c === 91) {
            if (pat.charCodeAt(p) === 94) p++;
            do {
                if (p >= pat.length) throw new LuaError("malformed pattern (missing ']')");
                const cc = pat.charCodeAt(p++);
                if (cc === L_ESC && p < pat.length) p++;
            } while (pat.charCodeAt(p) !== 93);
            return p + 1;
        }
        return p;
    }
    matchBracketClass(c, p, ec) {
        const pat = this.pat;
        let sig = true;
        if (pat.charCodeAt(p + 1) === 94) {
            sig = false;
            p++;
        }
        while (++p < ec) {
            const pc = pat.charCodeAt(p);
            if (pc === L_ESC) {
                p++;
                if (matchClass(c, pat.charCodeAt(p))) return sig;
            } else if (pat.charCodeAt(p + 1) === 45 && p + 2 < ec) {
                p += 2;
                if (pat.charCodeAt(p - 2) <= c && c <= pat.charCodeAt(p)) return sig;
            } else if (pc === c) {
                return sig;
            }
        }
        return !sig;
    }
    singleMatch(s, p, ep) {
        if (s >= this.src.length) return false;
        const c = this.src.charCodeAt(s);
        const pc = this.pat.charCodeAt(p);
        switch (pc) {
            case 46: return true;
            case L_ESC: return matchClass(c, this.pat.charCodeAt(p + 1));
            case 91: return this.matchBracketClass(c, p, ep - 1);
            default: return pc === c;
        }
    }
    matchBalance(s, p) {
        if (p + 1 >= this.pat.length) throw new LuaError("malformed pattern (missing arguments to '%b')");
        if (s >= this.src.length || this.src.charCodeAt(s) !== this.pat.charCodeAt(p)) return -1;
        const b = this.pat.charCodeAt(p);
        const e = this.pat.charCodeAt(p + 1);
        let cont = 1;
        while (++s < this.src.length) {
            const c = this.src.charCodeAt(s);
            if (c === e) {
                if (--cont === 0) return s + 1;
            } else if (c === b) {
                cont++;
            }
        }
        return -1;
    }
    maxExpand(s, p, ep) {
        let i = 0;
        while (this.singleMatch(s + i, p, ep)) i++;
        while (i >= 0) {
            const res = this.match(s + i, ep + 1);
            if (res !== -1) return res;
            i--;
        }
        return -1;
    }
    minExpand(s, p, ep) {
        for (;;) {
            const res = this.match(s, ep + 1);
            if (res !== -1) return res;
            if (this.singleMatch(s, p, ep)) s++;
            else return -1;
        }
    }
    startCapture(s, p, what) {
        if (this.level >= 32) throw new LuaError('too many captures');
        this.capture[this.level] = { init: s, len: what };
        this.level++;
        const res = this.match(s, p);
        if (res === -1) this.level--;
        return res;
    }
    endCapture(s, p) {
        let l = -1;
        for (let i = this.level - 1; i >= 0; i--) {
            if (this.capture[i].len === CAP_UNFINISHED) { l = i; break; }
        }
        if (l < 0) throw new LuaError('invalid pattern capture');
        this.capture[l].len = s - this.capture[l].init;
        const res = this.match(s, p);
        if (res === -1) this.capture[l].len = CAP_UNFINISHED;
        return res;
    }
    matchCapture(s, l) {
        l = l - 49;
        if (l < 0 || l >= this.level || this.capture[l].len === CAP_UNFINISHED) throw new LuaError('invalid capture index');
        const cap = this.src.substr(this.capture[l].init, this.capture[l].len);
        if (this.src.length - s >= cap.length && this.src.substr(s, cap.length) === cap) return s + cap.length;
        return -1;
    }
    match(s, p) {
        if (++this.depth > 200) {
            this.depth--;
            throw new LuaError('pattern too complex');
        }
        try {
            const pat = this.pat;
            const plen = pat.length;
            for (;;) {
                if (p >= plen) return s;
                const pc = pat.charCodeAt(p);
                let dflt = false;
                switch (pc) {
                    case 40:
                        if (pat.charCodeAt(p + 1) === 41) return this.startCapture(s, p + 2, CAP_POSITION);
                        return this.startCapture(s, p + 1, CAP_UNFINISHED);
                    case 41:
                        return this.endCapture(s, p + 1);
                    case 36:
                        if (p + 1 === plen) return s === this.src.length ? s : -1;
                        dflt = true;
                        break;
                    case L_ESC: {
                        const nx = pat.charCodeAt(p + 1);
                        if (nx === 98) {
                            s = this.matchBalance(s, p + 2);
                            if (s !== -1) { p += 4; continue; }
                            return -1;
                        }
                        if (nx === 102) {
                            p += 2;
                            if (pat.charCodeAt(p) !== 91) throw new LuaError("missing '[' after '%f' in pattern");
                            const ep = this.classEnd(p);
                            const prev = s === 0 ? 0 : this.src.charCodeAt(s - 1);
                            const cur = s < this.src.length ? this.src.charCodeAt(s) : 0;
                            if (!this.matchBracketClass(prev, p, ep - 1) && this.matchBracketClass(cur, p, ep - 1)) {
                                p = ep;
                                continue;
                            }
                            return -1;
                        }
                        if (nx >= 48 && nx <= 57) {
                            s = this.matchCapture(s, nx);
                            if (s !== -1) { p += 2; continue; }
                            return -1;
                        }
                        dflt = true;
                        break;
                    }
                    default:
                        dflt = true;
                }
                if (dflt) {
                    const ep = this.classEnd(p);
                    const epc = pat.charCodeAt(ep);
                    if (!this.singleMatch(s, p, ep)) {
                        if (epc === 42 || epc === 63 || epc === 45) { p = ep + 1; continue; }
                        return -1;
                    }
                    switch (epc) {
                        case 63: {
                            const res = this.match(s + 1, ep + 1);
                            if (res !== -1) return res;
                            p = ep + 1;
                            continue;
                        }
                        case 43: return this.maxExpand(s + 1, p, ep);
                        case 42: return this.maxExpand(s, p, ep);
                        case 45: return this.minExpand(s, p, ep);
                        default:
                            s++;
                            p = ep;
                            continue;
                    }
                }
            }
        } finally {
            this.depth--;
        }
    }
    getCapture(i, s, e) {
        if (i >= this.level) {
            if (i === 0) return this.src.slice(s, e);
            throw new LuaError('invalid capture index');
        }
        const c = this.capture[i];
        if (c.len === CAP_UNFINISHED) throw new LuaError('unfinished capture');
        if (c.len === CAP_POSITION) return c.init + 1;
        return this.src.substr(c.init, c.len);
    }
    captures(s, e, wholeIfNone) {
        const n = this.level === 0 && wholeIfNone ? 1 : this.level;
        const out = [];
        for (let i = 0; i < n; i++) out.push(this.getCapture(i, s, e));
        return out;
    }
}

function strIndex(i, len) {
    if (i > 0) return i;
    if (i === 0) return 1;
    if (i < -len) return 1;
    return len + i + 1;
}

function checkStr(v, n, fname) {
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return fmtNumber(v);
    throw new LuaError(errPos() + "bad argument #" + n + " to '" + fname + "' (string expected, got " + (v === undefined ? 'no value' : typeofName(v)) + ')');
}

function checkNum(v, n, fname, def) {
    if (typeof v === 'number') return v;
    if (v === undefined && def !== undefined) return def;
    const x = typeof v === 'string' ? tonum(v) : undefined;
    if (x !== undefined) return x;
    throw new LuaError(errPos() + "bad argument #" + n + " to '" + fname + "' (number expected, got " + (v === undefined ? 'no value' : typeofName(v)) + ')');
}

function checkTable(v, n, fname) {
    if (v instanceof LuaTable) return v;
    throw new LuaError(errPos() + "bad argument #" + n + " to '" + fname + "' (table expected, got " + (v === undefined ? 'no value' : typeofName(v)) + ')');
}

function strFindAux(find, s, pat, init, plain) {
    s = checkStr(s, 1, find ? 'find' : 'match');
    pat = checkStr(pat, 2, find ? 'find' : 'match');
    let i = strIndex(init === undefined ? 1 : Math.trunc(checkNum(init, 3, 'find')), s.length) - 1;
    if (i > s.length) return undefined;
    if (find && ((plain !== undefined && plain !== false) || !SPECIALS.test(pat))) {
        const k = s.indexOf(pat, i);
        if (k < 0) return undefined;
        return [k + 1, k + pat.length];
    }
    const anchor = pat.charCodeAt(0) === 94;
    const p = anchor ? 1 : 0;
    const ms = new MatchState(s, pat);
    let s1 = i;
    do {
        ms.reprep();
        const e = ms.match(s1, p);
        if (e !== -1) {
            if (find) return [s1 + 1, e, ...ms.captures(s1, e, false)];
            return ms.captures(s1, e, true);
        }
        s1++;
    } while (s1 <= s.length && !anchor);
    return undefined;
}

function strGmatch(s, pat) {
    s = checkStr(s, 1, 'gmatch');
    pat = checkStr(pat, 2, 'gmatch');
    let pos = 0;
    let lastMatch = -1;
    const ms = new MatchState(s, pat);
    return function () {
        for (let src = pos; src <= s.length; src++) {
            ms.reprep();
            const e = ms.match(src, 0);
            if (e !== -1 && e !== lastMatch) {
                pos = lastMatch = e;
                return ms.captures(src, e, true);
            }
        }
        pos = s.length + 1;
        return undefined;
    };
}

function strGsub(s, pat, repl, maxN) {
    s = checkStr(s, 1, 'gsub');
    pat = checkStr(pat, 2, 'gsub');
    const tr = typeName(repl);
    if (tr !== 'string' && tr !== 'number' && tr !== 'table' && tr !== 'function') {
        throw new LuaError(errPos() + "bad argument #3 to 'gsub' (string/function/table expected, got " + typeofName(repl) + ')');
    }
    const anchor = pat.charCodeAt(0) === 94;
    const p = anchor ? 1 : 0;
    const max = maxN === undefined ? s.length + 1 : Math.trunc(checkNum(maxN, 4, 'gsub'));
    const ms = new MatchState(s, pat);
    let src = 0;
    let n = 0;
    let lastMatch = -1;
    let out = '';
    const replString = typeof repl === 'number' ? fmtNumber(repl) : repl;
    while (n < max) {
        ms.reprep();
        const e = ms.match(src, p);
        if (e !== -1 && e !== lastMatch) {
            n++;
            const whole = s.slice(src, e);
            let value;
            if (tr === 'string' || tr === 'number') {
                value = '';
                for (let i = 0; i < replString.length; i++) {
                    const c = replString.charCodeAt(i);
                    if (c !== L_ESC) {
                        value += replString[i];
                    } else {
                        i++;
                        const d = replString.charCodeAt(i);
                        if (d === L_ESC) value += '%';
                        else if (d >= 48 && d <= 57) {
                            if (d === 48) value += whole;
                            else {
                                const cv = ms.getCapture(d - 49, src, e);
                                value += typeof cv === 'number' ? fmtNumber(cv) : cv;
                            }
                        } else {
                            throw new LuaError("invalid use of '%' in replacement string");
                        }
                    }
                }
            } else {
                const caps = ms.captures(src, e, true);
                let r;
                if (tr === 'table') r = index(repl, caps[0]);
                else r = first(callSync(repl, caps));
                if (r === undefined || r === false) {
                    value = whole;
                } else if (typeof r === 'string') {
                    value = r;
                } else if (typeof r === 'number') {
                    value = fmtNumber(r);
                } else {
                    throw new LuaError('invalid replacement value (a ' + typeName(r) + ')');
                }
            }
            out += value;
            src = lastMatch = e;
        } else if (src < s.length) {
            out += s[src++];
        } else {
            break;
        }
        if (anchor) break;
    }
    if (src < s.length) out += s.slice(src);
    return [out, n];
}

function pad(str, width, left, zero) {
    if (str.length >= width) return str;
    const fill = width - str.length;
    if (left) return str + ' '.repeat(fill);
    if (zero) {
        const m = /^([+\- ]?(?:0[xX])?)(.*)$/.exec(str);
        return m[1] + '0'.repeat(fill) + m[2];
    }
    return ' '.repeat(fill) + str;
}

function strFormat(fmt, ...args) {
    fmt = checkStr(fmt, 1, 'format');
    let out = '';
    let ai = 0;
    for (let i = 0; i < fmt.length; i++) {
        const ch = fmt[i];
        if (ch !== '%') { out += ch; continue; }
        i++;
        if (fmt[i] === '%') { out += '%'; continue; }
        let flags = '';
        while ('-+ #0'.indexOf(fmt[i]) >= 0 && i < fmt.length) flags += fmt[i++];
        let width = '';
        while (isdigit(fmt.charCodeAt(i))) width += fmt[i++];
        let prec = null;
        if (fmt[i] === '.') {
            i++;
            prec = '';
            while (isdigit(fmt.charCodeAt(i))) prec += fmt[i++];
            prec = prec === '' ? 0 : parseInt(prec, 10);
        }
        const conv = fmt[i];
        const w = width === '' ? 0 : parseInt(width, 10);
        const left = flags.indexOf('-') >= 0;
        const zero = flags.indexOf('0') >= 0 && !left;
        const plus = flags.indexOf('+') >= 0;
        const space = flags.indexOf(' ') >= 0;
        const argn = ai + 2;
        const arg = args[ai++];
        let s;
        const sign = (v, str) => (v >= 0 && !Object.is(v, -0) ? (plus ? '+' : (space ? ' ' : '')) : '') + str;
        switch (conv) {
            case 'd':
            case 'i': {
                const v = Math.trunc(checkNum(arg, argn, 'format'));
                let digits = String(Math.abs(v));
                if (prec !== null) digits = digits.padStart(prec, '0');
                s = (v < 0 ? '-' : (plus ? '+' : (space ? ' ' : ''))) + digits;
                s = pad(s, w, left, zero && prec === null);
                break;
            }
            case 'u': {
                const v = Math.trunc(checkNum(arg, argn, 'format'));
                s = pad(String(v < 0 ? v + 4294967296 : v), w, left, zero);
                break;
            }
            case 'c':
                s = pad(String.fromCharCode(checkNum(arg, argn, 'format')), w, left, false);
                break;
            case 'x':
            case 'X':
            case 'o': {
                let v = Math.trunc(checkNum(arg, argn, 'format'));
                if (v < 0) v += 4294967296;
                s = v.toString(conv === 'o' ? 8 : 16);
                if (conv === 'X') s = s.toUpperCase();
                if (prec !== null) s = s.padStart(prec, '0');
                if (flags.indexOf('#') >= 0 && v !== 0) s = (conv === 'o' ? '0' : (conv === 'x' ? '0x' : '0X')) + s;
                s = pad(s, w, left, zero && prec === null);
                break;
            }
            case 'e':
            case 'E': {
                const v = checkNum(arg, argn, 'format');
                let t = v.toExponential(prec === null ? 6 : prec);
                t = t.replace(/e([+-])(\d)$/, 'e$10$2');
                if (conv === 'E') t = t.toUpperCase();
                s = pad(sign(v, t), w, left, zero);
                break;
            }
            case 'f':
            case 'F': {
                const v = checkNum(arg, argn, 'format');
                let t;
                if (v === Infinity) t = 'inf';
                else if (v === -Infinity) t = '-inf';
                else if (v !== v) t = 'nan';
                else t = v.toFixed(Math.min(100, prec === null ? 6 : prec));
                s = pad(sign(v, t), w, left, zero && isFinite(v));
                break;
            }
            case 'g':
            case 'G': {
                const v = checkNum(arg, argn, 'format');
                let t = fmtG(v, prec === null ? 6 : prec);
                if (conv === 'G') t = t.toUpperCase();
                s = pad(sign(v, t), w, left, zero);
                break;
            }
            case 'q': {
                const v = checkStr(arg, argn, 'format');
                s = '"' + v.replace(/[\\"\n\r\0]/g, (c) => c === '\n' ? '\\n' : (c === '\r' ? '\\r' : (c === '\0' ? '\\0' : '\\' + c))) + '"';
                break;
            }
            case 's': {
                let v = tostr(arg);
                if (prec !== null) v = v.slice(0, prec);
                s = pad(v, w, left, false);
                break;
            }
            default:
                throw new LuaError(errPos() + "invalid option '%" + (conv || '') + "' to 'format'");
        }
        out += s;
    }
    return out;
}

function makeStringLib() {
    const t = new LuaTable();
    const set = (k, f) => t.set(k, f);
    set('len', (s) => checkStr(s, 1, 'len').length);
    set('sub', (s, i, j) => {
        s = checkStr(s, 1, 'sub');
        const l = s.length;
        let a = strIndex(Math.trunc(checkNum(i, 2, 'sub', 1)), l);
        let b = j === undefined ? -1 : Math.trunc(checkNum(j, 3, 'sub'));
        if (b < 0) b = l + b + 1;
        else if (b > l) b = l;
        if (a > b) return '';
        return s.slice(a - 1, b);
    });
    set('upper', (s) => checkStr(s, 1, 'upper').toUpperCase());
    set('lower', (s) => checkStr(s, 1, 'lower').toLowerCase());
    set('rep', (s, n, sep) => {
        s = checkStr(s, 1, 'rep');
        n = Math.trunc(checkNum(n, 2, 'rep'));
        if (n <= 0) return '';
        if (sep === undefined || sep === '') {
            if (s.length * n > 1e8) throw new LuaError('resulting string too large');
            return s.repeat(n);
        }
        return new Array(n).fill(s).join(checkStr(sep, 3, 'rep'));
    });
    set('reverse', (s) => checkStr(s, 1, 'reverse').split('').reverse().join(''));
    set('byte', (s, i, j) => {
        s = checkStr(s, 1, 'byte');
        const a = strIndex(Math.trunc(checkNum(i, 2, 'byte', 1)), s.length);
        let b = j === undefined ? a : Math.trunc(checkNum(j, 3, 'byte'));
        if (b < 0) b = s.length + b + 1;
        if (b > s.length) b = s.length;
        const out = [];
        for (let k = a; k <= b; k++) out.push(s.charCodeAt(k - 1));
        return out;
    });
    set('char', (...codes) => codes.map((c, i) => String.fromCharCode(checkNum(c, i + 1, 'char'))).join(''));
    set('find', (s, p, i, plain) => strFindAux(true, s, p, i, plain));
    set('match', (s, p, i) => strFindAux(false, s, p, i));
    set('gmatch', (s, p) => strGmatch(s, p));
    set('gsub', (s, p, r, n) => strGsub(s, p, r, n));
    set('format', strFormat);
    set('split', (s, sep) => {
        s = checkStr(s, 1, 'split');
        sep = sep === undefined ? ',' : checkStr(sep, 2, 'split');
        const parts = sep === '' ? s.split('') : s.split(sep);
        const out = new LuaTable();
        out.arr = parts;
        return out;
    });
    return t;
}

function makeTableLib() {
    const t = new LuaTable();
    const set = (k, f) => t.set(k, f);
    const rawlen = (tb) => tb.mt !== null && tb.mt.getStr('__len') !== undefined ? len(tb) : tb.length();
    t.set('insert', function (tb, a, b) {
        checkTable(tb, 1, 'insert');
        const n = rawlen(tb);
        if (arguments.length === 2) {
            tb.set(n + 1, a);
            return undefined;
        }
        if (arguments.length !== 3) throw new LuaError("wrong number of arguments to 'insert'");
        const pos = Math.trunc(checkNum(a, 2, 'insert'));
        if (pos < 1 || pos > n + 1) throw new LuaError(errPos() + "bad argument #2 to 'insert' (position out of bounds)");
        if (tb.arr.length === n && tb.hash === null && b !== undefined) {
            tb.arr.splice(pos - 1, 0, b);
            return undefined;
        }
        for (let i = n; i >= pos; i--) tb.set(i + 1, tb.get(i));
        tb.set(pos, b);
        return undefined;
    });
    t.set('remove', function (tb, p) {
        checkTable(tb, 1, 'remove');
        const n = rawlen(tb);
        if (p === undefined) {
            if (n === 0) return undefined;
            const v = tb.get(n);
            tb.set(n, undefined);
            return v;
        }
        const pos = Math.trunc(checkNum(p, 2, 'remove'));
        if (n === 0 && (pos === 0 || pos === n)) return tb.get(pos);
        if (pos < 1 || pos > n + 1) throw new LuaError(errPos() + "bad argument #2 to 'remove' (position out of bounds)");
        if (tb.arr.length === n && pos <= n) {
            return tb.arr.splice(pos - 1, 1)[0];
        }
        const v = tb.get(pos);
        for (let i = pos; i < n; i++) tb.set(i, tb.get(i + 1));
        tb.set(n, undefined);
        return v;
    });
    set('concat', (tb, sep, i, j) => {
        checkTable(tb, 1, 'concat');
        sep = sep === undefined ? '' : checkStr(sep, 2, 'concat');
        const a = i === undefined ? 1 : Math.trunc(checkNum(i, 3, 'concat'));
        const b = j === undefined ? rawlen(tb) : Math.trunc(checkNum(j, 4, 'concat'));
        const parts = [];
        for (let k = a; k <= b; k++) {
            const v = tb.get(k);
            if (typeof v === 'string') parts.push(v);
            else if (typeof v === 'number') parts.push(fmtNumber(v));
            else throw new LuaError(errPos() + "invalid value (at index " + k + ") in table for 'concat'");
        }
        return parts.join(sep);
    });
    const unpack = (tb, i, j) => {
        checkTable(tb, 1, 'unpack');
        const a = i === undefined ? 1 : Math.trunc(i);
        const b = j === undefined ? rawlen(tb) : Math.trunc(j);
        if (b - a >= 1e6) throw new LuaError('too many results to unpack');
        const out = [];
        for (let k = a; k <= b; k++) out.push(tb.get(k));
        return out;
    };
    set('unpack', unpack);
    set('pack', (...args) => {
        const tb = new LuaTable();
        for (let i = 0; i < args.length; i++) if (args[i] !== undefined) tb.set(i + 1, args[i]);
        tb.set('n', args.length);
        return tb;
    });
    set('getn', (tb) => rawlen(checkTable(tb, 1, 'getn')));
    set('maxn', (tb) => {
        let m = 0;
        for (const k of tb.keys()) if (typeof k === 'number' && k > m) m = k;
        return m;
    });
    set('sort', (tb, cmp) => {
        checkTable(tb, 1, 'sort');
        const n = rawlen(tb);
        const items = [];
        for (let i = 1; i <= n; i++) items.push(tb.get(i));
        let fn;
        if (cmp === undefined) {
            fn = (a, b) => (lt(a, b) ? -1 : (lt(b, a) ? 1 : 0));
        } else {
            fn = (a, b) => {
                const r1 = first(callSync(cmp, [a, b]));
                if (r1 !== undefined && r1 !== false) return -1;
                const r2 = first(callSync(cmp, [b, a]));
                return r2 !== undefined && r2 !== false ? 1 : 0;
            };
        }
        items.sort(fn);
        for (let i = 0; i < n; i++) tb.set(i + 1, items[i]);
        return undefined;
    });
    set('foreach', (tb, f) => {
        for (const k of tb.keys()) {
            const r = callSync(f, [k, tb.get(k)]);
            if (r.length > 0 && r[0] !== undefined) return r;
        }
        return undefined;
    });
    set('foreachi', (tb, f) => {
        const n = rawlen(tb);
        for (let i = 1; i <= n; i++) {
            const r = callSync(f, [i, tb.get(i)]);
            if (r.length > 0 && r[0] !== undefined) return r;
        }
        return undefined;
    });
    set('find', (tb, v, init) => {
        const n = rawlen(tb);
        for (let i = init === undefined ? 1 : init; i <= n; i++) if (tb.get(i) === v) return i;
        return undefined;
    });
    set('clear', (tb) => {
        tb.arr = [];
        tb.hash = null;
        return undefined;
    });
    set('clone', (tb) => {
        const c = new LuaTable();
        c.arr = tb.arr.slice();
        if (tb.hash !== null) c.hash = new Map(tb.hash);
        c.mt = tb.mt;
        return c;
    });
    set('create', (n, v) => {
        const tb = new LuaTable();
        tb.arr = new Array(Math.max(0, Math.trunc(n))).fill(v);
        if (v === undefined) tb.arr = [];
        return tb;
    });
    set('move', (a1, f, e, tpos, a2) => {
        a2 = a2 === undefined ? a1 : a2;
        if (e >= f) {
            if (tpos > e || tpos <= f || a1 !== a2) {
                for (let i = 0; i <= e - f; i++) a2.set(tpos + i, a1.get(f + i));
            } else {
                for (let i = e - f; i >= 0; i--) a2.set(tpos + i, a1.get(f + i));
            }
        }
        return a2;
    });
    set('freeze', (tb) => { tb.frozen = true; return tb; });
    set('isfrozen', (tb) => tb.frozen === true);
    return t;
}

function makeRng(seed) {
    let a = (seed === undefined ? (Date.now() ^ (Math.random() * 4294967296)) : Math.floor(seed * 1000003) ^ 0x9e3779b9) >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function makeMathLib() {
    const t = new LuaTable();
    const set = (k, f) => t.set(k, f);
    let rng = makeRng();
    t.set('pi', Math.PI);
    t.set('huge', Infinity);
    const wrap1 = (name, f) => set(name, (x) => f(checkNum(x, 1, name)));
    ['abs', 'ceil', 'floor', 'sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp', 'sinh', 'cosh', 'tanh'].forEach(n => wrap1(n, Math[n]));
    set('atan2', (y, x) => Math.atan2(checkNum(y, 1, 'atan2'), checkNum(x, 2, 'atan2')));
    set('pow', (a, b) => Math.pow(checkNum(a, 1, 'pow'), checkNum(b, 2, 'pow')));
    set('fmod', (a, b) => checkNum(a, 1, 'fmod') % checkNum(b, 2, 'fmod'));
    set('modf', (x) => {
        x = checkNum(x, 1, 'modf');
        const i = x >= 0 ? Math.floor(x) : Math.ceil(x);
        return [i, Number.isFinite(x) ? x - i : 0];
    });
    set('log', (x, b) => {
        x = checkNum(x, 1, 'log');
        if (b === undefined) return Math.log(x);
        b = checkNum(b, 2, 'log');
        if (b === 2) return Math.log2(x);
        if (b === 10) return Math.log10(x);
        return Math.log(x) / Math.log(b);
    });
    set('log10', (x) => Math.log10(checkNum(x, 1, 'log10')));
    set('deg', (x) => checkNum(x, 1, 'deg') * 180 / Math.PI);
    set('rad', (x) => checkNum(x, 1, 'rad') * Math.PI / 180);
    set('min', (...a) => {
        if (a.length === 0) throw new LuaError(errPos() + "bad argument #1 to 'min' (number expected, got no value)");
        let m = checkNum(a[0], 1, 'min');
        for (let i = 1; i < a.length; i++) m = Math.min(m, checkNum(a[i], i + 1, 'min'));
        return m;
    });
    set('max', (...a) => {
        if (a.length === 0) throw new LuaError(errPos() + "bad argument #1 to 'max' (number expected, got no value)");
        let m = checkNum(a[0], 1, 'max');
        for (let i = 1; i < a.length; i++) m = Math.max(m, checkNum(a[i], i + 1, 'max'));
        return m;
    });
    set('clamp', (x, lo, hi) => Math.min(Math.max(checkNum(x, 1, 'clamp'), checkNum(lo, 2, 'clamp')), checkNum(hi, 3, 'clamp')));
    set('sign', (x) => { x = checkNum(x, 1, 'sign'); return x > 0 ? 1 : (x < 0 ? -1 : 0); });
    set('round', (x) => { x = checkNum(x, 1, 'round'); return x >= 0 ? Math.floor(x + 0.5) : Math.ceil(x - 0.5); });
    set('frexp', (x) => {
        x = checkNum(x, 1, 'frexp');
        if (x === 0 || !isFinite(x)) return [x, 0];
        let e = Math.max(-1023, Math.floor(Math.log2(Math.abs(x))) + 1);
        let m = x * Math.pow(2, -e);
        while (Math.abs(m) < 0.5) { m *= 2; e--; }
        while (Math.abs(m) >= 1) { m /= 2; e++; }
        return [m, e];
    });
    set('ldexp', (m, e) => checkNum(m, 1, 'ldexp') * Math.pow(2, checkNum(e, 2, 'ldexp')));
    set('random', (a, b) => {
        const r = rng();
        if (a === undefined) return r;
        a = Math.trunc(checkNum(a, 1, 'random'));
        if (b === undefined) {
            if (a < 1) throw new LuaError(errPos() + "bad argument #1 to 'random' (interval is empty)");
            return Math.floor(r * a) + 1;
        }
        b = Math.trunc(checkNum(b, 2, 'random'));
        if (a > b) throw new LuaError(errPos() + "bad argument #2 to 'random' (interval is empty)");
        return Math.floor(r * (b - a + 1)) + a;
    });
    set('randomseed', (s) => { rng = makeRng(s === undefined ? undefined : checkNum(s, 1, 'randomseed')); return undefined; });
    const perm = [];
    for (let i = 0; i < 256; i++) perm.push(i);
    const prng = makeRng(1234);
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(prng() * (i + 1));
        const tmp = perm[i];
        perm[i] = perm[j];
        perm[j] = tmp;
    }
    const p = perm.concat(perm);
    const fade = (x) => x * x * x * (x * (x * 6 - 15) + 10);
    const grad = (h, x, y, z) => {
        const u = (h & 15) < 8 ? x : y;
        const v = (h & 15) < 4 ? y : ((h & 15) === 12 || (h & 15) === 14 ? x : z);
        return (((h & 1) === 0) ? u : -u) + (((h & 2) === 0) ? v : -v);
    };
    set('noise', (x, y, z) => {
        x = checkNum(x, 1, 'noise');
        y = y === undefined ? 0 : y;
        z = z === undefined ? 0 : z;
        const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
        x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
        const u = fade(x), v = fade(y), w = fade(z);
        const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
        const l = (a, b, c) => b + a * (c - b);
        return l(w, l(v, l(u, grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z)), l(u, grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z))),
            l(v, l(u, grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1)), l(u, grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1))));
    });
    t.rngRef = () => rng;
    return t;
}

function makeBit32Lib() {
    const t = new LuaTable();
    const u = (x) => (Math.floor(x) >>> 0);
    t.set('band', (...a) => a.reduce((r, x) => (r & u(x)) >>> 0, 0xFFFFFFFF));
    t.set('bor', (...a) => a.reduce((r, x) => (r | u(x)) >>> 0, 0));
    t.set('bxor', (...a) => a.reduce((r, x) => (r ^ u(x)) >>> 0, 0));
    t.set('bnot', (x) => (~u(x)) >>> 0);
    t.set('btest', (...a) => a.reduce((r, x) => (r & u(x)) >>> 0, 0xFFFFFFFF) !== 0);
    t.set('lshift', (x, n) => (n >= 32 ? 0 : (n < 0 ? (u(x) >>> -n) : (u(x) << n))) >>> 0);
    t.set('rshift', (x, n) => (n >= 32 ? 0 : (n < 0 ? (u(x) << -n) : (u(x) >>> n))) >>> 0);
    t.set('arshift', (x, n) => (n >= 32 ? (u(x) & 0x80000000 ? 0xFFFFFFFF : 0) : ((u(x) | 0) >> n)) >>> 0);
    t.set('lrotate', (x, n) => { n &= 31; return ((u(x) << n) | (u(x) >>> (32 - n))) >>> 0; });
    t.set('rrotate', (x, n) => { n &= 31; return ((u(x) >>> n) | (u(x) << (32 - n))) >>> 0; });
    t.set('extract', (x, f, w) => { w = w === undefined ? 1 : w; return ((u(x) >>> f) & (w >= 32 ? 0xFFFFFFFF : ((1 << w) - 1))) >>> 0; });
    t.set('replace', (x, v, f, w) => {
        w = w === undefined ? 1 : w;
        const mask = (w >= 32 ? 0xFFFFFFFF : ((1 << w) - 1)) >>> 0;
        return ((u(x) & ~(mask << f)) | ((u(v) & mask) << f)) >>> 0;
    });
    return t;
}

function makeUtf8Lib() {
    const t = new LuaTable();
    t.set('char', (...c) => String.fromCodePoint(...c));
    t.set('charpattern', '[\0-\x7F\xC2-\xFD][\x80-\xBF]*');
    t.set('len', (s, i, j) => {
        s = checkStr(s, 1, 'len');
        return Array.from(s).length;
    });
    t.set('codepoint', (s, i, j) => {
        s = checkStr(s, 1, 'codepoint');
        const cps = Array.from(s).map(c => c.codePointAt(0));
        const a = i === undefined ? 1 : i;
        const b = j === undefined ? a : j;
        return cps.slice(a - 1, b);
    });
    t.set('codes', (s) => {
        const cps = Array.from(checkStr(s, 1, 'codes'));
        let k = 0;
        return [(() => {
            if (k >= cps.length) return undefined;
            const c = cps[k++];
            return [k, c.codePointAt(0)];
        }), s, 0];
    });
    t.set('offset', (s, n, i) => (i === undefined ? n : i + n - 1));
    return t;
}

function osDate(fmt, time) {
    fmt = fmt === undefined ? '%c' : fmt;
    let d = new Date((time === undefined ? Date.now() / 1000 : time) * 1000);
    let utc = false;
    if (fmt[0] === '!') {
        utc = true;
        fmt = fmt.slice(1);
    }
    const g = {
        Y: utc ? d.getUTCFullYear() : d.getFullYear(), m: (utc ? d.getUTCMonth() : d.getMonth()) + 1, d: utc ? d.getUTCDate() : d.getDate(),
        H: utc ? d.getUTCHours() : d.getHours(), M: utc ? d.getUTCMinutes() : d.getMinutes(), S: utc ? d.getUTCSeconds() : d.getSeconds(),
        w: utc ? d.getUTCDay() : d.getDay()
    };
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const p2 = (n) => String(n).padStart(2, '0');
    const yday = Math.floor((Date.UTC(g.Y, g.m - 1, g.d) - Date.UTC(g.Y, 0, 1)) / 86400000) + 1;
    if (fmt.startsWith('*t')) {
        const tb = new LuaTable();
        tb.set('year', g.Y); tb.set('month', g.m); tb.set('day', g.d);
        tb.set('hour', g.H); tb.set('min', g.M); tb.set('sec', g.S);
        tb.set('wday', g.w + 1); tb.set('yday', yday); tb.set('isdst', false);
        return tb;
    }
    return fmt.replace(/%(.)/g, (m, c) => {
        switch (c) {
            case 'Y': return String(g.Y);
            case 'y': return p2(g.Y % 100);
            case 'm': return p2(g.m);
            case 'd': return p2(g.d);
            case 'H': return p2(g.H);
            case 'I': return p2(g.H % 12 === 0 ? 12 : g.H % 12);
            case 'M': return p2(g.M);
            case 'S': return p2(g.S);
            case 'p': return g.H < 12 ? 'AM' : 'PM';
            case 'A': return days[g.w];
            case 'a': return days[g.w].slice(0, 3);
            case 'B': return months[g.m - 1];
            case 'b': return months[g.m - 1].slice(0, 3);
            case 'j': return String(yday).padStart(3, '0');
            case 'c': return days[g.w].slice(0, 3) + ' ' + months[g.m - 1].slice(0, 3) + ' ' + p2(g.d) + ' ' + p2(g.H) + ':' + p2(g.M) + ':' + p2(g.S) + ' ' + g.Y;
            case 'x': return p2(g.m) + '/' + p2(g.d) + '/' + p2(g.Y % 100);
            case 'X': return p2(g.H) + ':' + p2(g.M) + ':' + p2(g.S);
            case 'Z': return utc ? 'UTC' : 'LOCAL';
            case '%': return '%';
            default: return m;
        }
    });
}

function makeOsLib() {
    const t = new LuaTable();
    const startClock = Date.now();
    t.set('time', (tb) => {
        if (tb === undefined) return Math.floor(Date.now() / 1000);
        const g = (k, d) => { const v = tb.get(k); return v === undefined ? d : v; };
        return Math.floor(new Date(g('year', 1970), g('month', 1) - 1, g('day', 1), g('hour', 12), g('min', 0), g('sec', 0)).getTime() / 1000);
    });
    t.set('clock', () => (Date.now() - startClock) / 1000);
    t.set('date', osDate);
    t.set('difftime', (a, b) => a - (b === undefined ? 0 : b));
    t.set('getenv', () => undefined);
    return t;
}
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
return {
    createState, syntaxCheck, compileToJs, LuaTable, LuaFunction, LuaError, LuaSyntaxError, Thread,
    tostr, tonum, typeName, typeofName, index, setindex, callSync, call, ret, first, fmtNumber, eq, lt, le, S, errorValue, objectId
};
});
