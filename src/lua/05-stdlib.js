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
