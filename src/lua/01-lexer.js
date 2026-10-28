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
