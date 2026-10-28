(function (root) {
    'use strict';

    const MAGIC = '<roblox!';
    const SIGNATURE = [0x89, 0xff, 0x0d, 0x0a, 0x1a, 0x0a];
    const ZSTD_MAGIC = 0xfd2fb528;

    const T = {
        String: 1, Bool: 2, Int: 3, Float: 4, Double: 5, UDim: 6, UDim2: 7, Ray: 8, Faces: 9, Axes: 10,
        BrickColor: 11, Color3: 12, Vector2: 13, Vector3: 14, Vector2int16: 15, CFrame: 16, CFrameQuat: 17,
        Enum: 18, Ref: 19, Vector3int16: 20, NumberSequence: 21, ColorSequence: 22, NumberRange: 23, Rect: 24,
        PhysicalProperties: 25, Color3uint8: 26, Int64: 27, SharedString: 28, Bytes: 29, OptionalCFrame: 30,
        UniqueId: 31, Font: 32, SecurityCapabilities: 33
    };

    function lz4Decompress(src, dstSize) {
        const dst = new Uint8Array(dstSize);
        let s = 0;
        let d = 0;
        const n = src.length;
        while (s < n) {
            const token = src[s++];
            let literal = token >> 4;
            if (literal === 15) {
                let b;
                do {
                    b = src[s++];
                    literal += b;
                } while (b === 255 && s < n);
            }
            if (literal > 0) {
                if (s + literal > n || d + literal > dstSize) throw new Error('LZ4: literal run out of bounds');
                dst.set(src.subarray(s, s + literal), d);
                s += literal;
                d += literal;
            }
            if (s >= n) break;
            const offset = src[s] | (src[s + 1] << 8);
            s += 2;
            if (offset === 0 || offset > d) throw new Error('LZ4: invalid match offset');
            let match = token & 15;
            if (match === 15) {
                let b;
                do {
                    b = src[s++];
                    match += b;
                } while (b === 255 && s < n);
            }
            match += 4;
            if (d + match > dstSize) throw new Error('LZ4: match out of bounds');
            let from = d - offset;
            if (offset >= match) {
                dst.copyWithin(d, from, from + match);
                d += match;
            } else {
                for (let i = 0; i < match; i++) dst[d++] = dst[from++];
            }
        }
        if (d !== dstSize) throw new Error('LZ4: size mismatch ' + d + ' != ' + dstSize);
        return dst;
    }

    function getZstd() {
        if (root.fzstd && root.fzstd.decompress) return root.fzstd;
        if (typeof require === 'function') {
            try { return require('fzstd'); } catch (e) { return null; }
        }
        return null;
    }

    function ensureZstd() {
        if (getZstd()) return Promise.resolve(true);
        if (typeof document === 'undefined') return Promise.resolve(false);
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/fzstd@0.1.1/umd/index.js';
            script.onload = () => resolve(!!getZstd());
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    const ORIENT_NORMALS = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];

    function orientIdToMatrix(id) {
        const x = ORIENT_NORMALS[Math.floor(id / 6) % 6];
        const y = ORIENT_NORMALS[id % 6];
        const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
        return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
    }

    function quatToMatrix(x, y, z, w) {
        const n = Math.hypot(x, y, z, w) || 1;
        x /= n; y /= n; z /= n; w /= n;
        return [
            1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
            2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
            2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
        ];
    }

    class Reader {
        constructor(bytes) {
            this.b = bytes;
            this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            this.p = 0;
        }
        need(n) {
            if (this.p + n > this.b.length) throw new Error('Read out of bounds');
        }
        u8() { this.need(1); return this.b[this.p++]; }
        u32() { this.need(4); const r = this.v.getUint32(this.p, true); this.p += 4; return r; }
        i32() { this.need(4); const r = this.v.getInt32(this.p, true); this.p += 4; return r; }
        f32() { this.need(4); const r = this.v.getFloat32(this.p, true); this.p += 4; return r; }
        f64() { this.need(8); const r = this.v.getFloat64(this.p, true); this.p += 8; return r; }
        str() {
            const len = this.u32();
            this.need(len);
            const out = decodeUtf8(this.b.subarray(this.p, this.p + len));
            this.p += len;
            return out;
        }
        bytes(n) {
            this.need(n);
            const out = this.b.subarray(this.p, this.p + n);
            this.p += n;
            return out;
        }
        u32s(n) {
            this.need(n * 4);
            const out = new Array(n);
            const b = this.b;
            const base = this.p;
            for (let i = 0; i < n; i++) {
                out[i] = ((b[base + i] << 24) | (b[base + n + i] << 16) | (b[base + 2 * n + i] << 8) | b[base + 3 * n + i]) >>> 0;
            }
            this.p += n * 4;
            return out;
        }
        i32s(n) {
            const raw = this.u32s(n);
            for (let i = 0; i < n; i++) {
                const v = raw[i];
                raw[i] = (v >>> 1) ^ -(v & 1);
            }
            return raw;
        }
        refs(n) {
            const out = this.i32s(n);
            let last = 0;
            for (let i = 0; i < n; i++) {
                out[i] += last;
                last = out[i];
            }
            return out;
        }
        f32s(n) {
            const raw = this.u32s(n);
            const tmp = new DataView(new ArrayBuffer(4));
            for (let i = 0; i < n; i++) {
                const v = raw[i];
                tmp.setUint32(0, ((v >>> 1) | (v << 31)) >>> 0);
                raw[i] = tmp.getFloat32(0);
            }
            return raw;
        }
    }

    function decodeUtf8(bytes) {
        if (typeof TextDecoder !== 'undefined') return new TextDecoder('utf-8').decode(bytes);
        return Buffer.from(bytes).toString('utf8');
    }

    function vec3(x, y, z) { return { $: 'Vector3', x, y, z }; }
    function cframe(p, r) { return { $: 'CFrame', m: [p[0], p[1], p[2], r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]] }; }

    function readPropertyValues(r, type, n, nodes, resolveRef) {
        const out = new Array(n);
        switch (type) {
            case T.String:
                for (let i = 0; i < n; i++) out[i] = r.str();
                break;
            case T.Bool:
                for (let i = 0; i < n; i++) out[i] = r.u8() !== 0;
                break;
            case T.Int: {
                const v = r.i32s(n);
                for (let i = 0; i < n; i++) out[i] = v[i];
                break;
            }
            case T.Float: {
                const v = r.f32s(n);
                for (let i = 0; i < n; i++) out[i] = v[i];
                break;
            }
            case T.Double:
                for (let i = 0; i < n; i++) out[i] = r.f64();
                break;
            case T.UDim: {
                const s = r.f32s(n);
                const o = r.i32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'UDim', s: s[i], o: o[i] };
                break;
            }
            case T.UDim2: {
                const xs = r.f32s(n);
                const ys = r.f32s(n);
                const xo = r.i32s(n);
                const yo = r.i32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'UDim2', xs: xs[i], xo: xo[i], ys: ys[i], yo: yo[i] };
                break;
            }
            case T.Ray:
                for (let i = 0; i < n; i++) {
                    const o = [r.f32(), r.f32(), r.f32()];
                    const d = [r.f32(), r.f32(), r.f32()];
                    out[i] = { $: 'Ray', o, d };
                }
                break;
            case T.Faces:
            case T.Axes:
                for (let i = 0; i < n; i++) out[i] = { $: type === T.Faces ? 'Faces' : 'Axes', mask: r.u8() };
                break;
            case T.BrickColor: {
                const v = r.u32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'BrickColor', n: v[i] };
                break;
            }
            case T.Color3: {
                const rr = r.f32s(n);
                const gg = r.f32s(n);
                const bb = r.f32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'Color3', r: rr[i], g: gg[i], b: bb[i] };
                break;
            }
            case T.Color3uint8: {
                const rr = r.bytes(n);
                const gg = r.bytes(n);
                const bb = r.bytes(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'Color3', r: rr[i] / 255, g: gg[i] / 255, b: bb[i] / 255 };
                break;
            }
            case T.Vector2: {
                const x = r.f32s(n);
                const y = r.f32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'Vector2', x: x[i], y: y[i] };
                break;
            }
            case T.Vector3: {
                const x = r.f32s(n);
                const y = r.f32s(n);
                const z = r.f32s(n);
                for (let i = 0; i < n; i++) out[i] = vec3(x[i], y[i], z[i]);
                break;
            }
            case T.Vector2int16:
                for (let i = 0; i < n; i++) {
                    const x = r.bytes(2);
                    const y = r.bytes(2);
                    out[i] = { $: 'Vector2', x: (x[0] | (x[1] << 8)) << 16 >> 16, y: (y[0] | (y[1] << 8)) << 16 >> 16 };
                }
                break;
            case T.Vector3int16:
                for (let i = 0; i < n; i++) {
                    const a = r.bytes(6);
                    out[i] = vec3((a[0] | (a[1] << 8)) << 16 >> 16, (a[2] | (a[3] << 8)) << 16 >> 16, (a[4] | (a[5] << 8)) << 16 >> 16);
                }
                break;
            case T.CFrame:
            case T.CFrameQuat: {
                const rots = new Array(n);
                for (let i = 0; i < n; i++) {
                    const id = r.u8();
                    if (id !== 0) {
                        rots[i] = orientIdToMatrix(id - 1);
                    } else if (type === T.CFrameQuat) {
                        const qx = r.f32();
                        const qy = r.f32();
                        const qz = r.f32();
                        const qw = r.f32();
                        rots[i] = quatToMatrix(qx, qy, qz, qw);
                    } else {
                        const m = new Array(9);
                        for (let k = 0; k < 9; k++) m[k] = r.f32();
                        rots[i] = m;
                    }
                }
                const x = r.f32s(n);
                const y = r.f32s(n);
                const z = r.f32s(n);
                for (let i = 0; i < n; i++) out[i] = cframe([x[i], y[i], z[i]], rots[i]);
                break;
            }
            case T.Enum: {
                const v = r.u32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'Enum', v: v[i] };
                break;
            }
            case T.Ref: {
                const v = r.refs(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'Ref', ref: v[i] };
                break;
            }
            case T.NumberSequence:
                for (let i = 0; i < n; i++) {
                    const count = r.u32();
                    const keys = [];
                    for (let k = 0; k < count; k++) keys.push({ t: r.f32(), v: r.f32(), e: r.f32() });
                    out[i] = { $: 'NumberSequence', keys };
                }
                break;
            case T.ColorSequence:
                for (let i = 0; i < n; i++) {
                    const count = r.u32();
                    const keys = [];
                    for (let k = 0; k < count; k++) {
                        const t = r.f32();
                        const cr = r.f32();
                        const cg = r.f32();
                        const cb = r.f32();
                        r.f32();
                        keys.push({ t, r: cr, g: cg, b: cb });
                    }
                    out[i] = { $: 'ColorSequence', keys };
                }
                break;
            case T.NumberRange:
                for (let i = 0; i < n; i++) out[i] = { $: 'NumberRange', min: r.f32(), max: r.f32() };
                break;
            case T.Rect: {
                const x0 = r.f32s(n);
                const y0 = r.f32s(n);
                const x1 = r.f32s(n);
                const y1 = r.f32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'Rect', x0: x0[i], y0: y0[i], x1: x1[i], y1: y1[i] };
                break;
            }
            case T.PhysicalProperties:
                for (let i = 0; i < n; i++) {
                    if (r.u8() !== 0) {
                        out[i] = { $: 'PhysicalProperties', density: r.f32(), friction: r.f32(), elasticity: r.f32(), frictionWeight: r.f32(), elasticityWeight: r.f32() };
                    } else {
                        out[i] = null;
                    }
                }
                break;
            case T.Int64: {
                const raw = r.bytes(n * 8);
                for (let i = 0; i < n; i++) {
                    let hi = 0;
                    let lo = 0;
                    for (let k = 0; k < 4; k++) {
                        hi = hi * 256 + raw[k * n + i];
                        lo = lo * 256 + raw[(k + 4) * n + i];
                    }
                    const big = BigInt(hi) * 4294967296n + BigInt(lo);
                    const dec = (big >> 1n) ^ -(big & 1n);
                    out[i] = Number(dec);
                }
                break;
            }
            case T.SharedString: {
                const v = r.u32s(n);
                for (let i = 0; i < n; i++) out[i] = { $: 'SharedString', index: v[i] };
                break;
            }
            case T.OptionalCFrame:
                return null;
            default:
                return null;
        }
        return out;
    }

    function readChunks(bytes, onChunk, header) {
        const r = new Reader(bytes);
        r.p = header;
        while (r.p + 16 <= bytes.length) {
            const name = String.fromCharCode(bytes[r.p], bytes[r.p + 1], bytes[r.p + 2], bytes[r.p + 3]);
            r.p += 4;
            const compressed = r.u32();
            const size = r.u32();
            r.u32();
            let data;
            if (compressed === 0) {
                data = r.bytes(size);
            } else {
                const raw = r.bytes(compressed);
                if (raw.length >= 4 && (raw[0] | (raw[1] << 8) | (raw[2] << 16) | (raw[3] << 24)) >>> 0 === ZSTD_MAGIC) {
                    const z = getZstd();
                    if (!z) throw new Error('This file uses Zstandard compression and the decoder could not be loaded');
                    data = z.decompress(raw);
                } else {
                    data = lz4Decompress(raw, size);
                }
            }
            if (name === 'END\0') break;
            onChunk(name, data);
        }
    }

    function isZstdFile(bytes) {
        let p = 32;
        while (p + 16 <= bytes.length) {
            const compressed = bytes[p + 4] | (bytes[p + 5] << 8) | (bytes[p + 6] << 16) | (bytes[p + 7] << 24);
            const size = bytes[p + 8] | (bytes[p + 9] << 8) | (bytes[p + 10] << 16) | (bytes[p + 11] << 24);
            if (compressed !== 0 && p + 20 <= bytes.length) {
                const m = (bytes[p + 16] | (bytes[p + 17] << 8) | (bytes[p + 18] << 16) | (bytes[p + 19] << 24)) >>> 0;
                if (m === ZSTD_MAGIC) return true;
            }
            p += 16 + (compressed !== 0 ? compressed : size);
        }
        return false;
    }

    function makeNode(className) {
        return { className, ref: null, props: {}, children: [], parent: null, isService: false };
    }

    function parseBinary(bytes) {
        for (let i = 0; i < MAGIC.length; i++) {
            if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error('Not a Roblox binary file');
        }
        for (let i = 0; i < SIGNATURE.length; i++) {
            if (bytes[8 + i] !== SIGNATURE[i]) throw new Error('Corrupt Roblox file header');
        }
        const hv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const typeCount = hv.getUint32(16, true);
        const objectCount = hv.getUint32(20, true);

        const classes = new Array(typeCount);
        const byId = new Array(objectCount);
        const roots = [];
        const stats = { warnings: [], skippedProps: {} };
        const sstr = [];

        readChunks(bytes, (name, data) => {
            const r = new Reader(data);
            if (name === 'INST') {
                const classId = r.u32();
                const className = r.str();
                const format = r.u8();
                const count = r.u32();
                const ids = r.refs(count);
                const nodes = [];
                for (let i = 0; i < count; i++) {
                    const node = makeNode(className);
                    node.ref = ids[i];
                    byId[ids[i]] = node;
                    nodes.push(node);
                }
                if (format === 1) {
                    for (let i = 0; i < count; i++) nodes[i].isService = r.u8() !== 0;
                }
                classes[classId] = { name: className, nodes };
            } else if (name === 'PROP') {
                const classId = r.u32();
                const propName = r.str();
                const type = r.u8();
                const cls = classes[classId];
                if (!cls) return;
                let values;
                try {
                    values = readPropertyValues(r, type, cls.nodes.length, cls.nodes);
                } catch (e) {
                    stats.warnings.push('Property ' + cls.name + '.' + propName + ': ' + e.message);
                    return;
                }
                if (!values) {
                    const key = cls.name + '.' + propName;
                    stats.skippedProps[key] = type;
                    return;
                }
                for (let i = 0; i < cls.nodes.length; i++) cls.nodes[i].props[propName] = values[i];
            } else if (name === 'PRNT') {
                r.u8();
                const count = r.u32();
                const oids = r.refs(count);
                const pids = r.refs(count);
                for (let i = 0; i < count; i++) {
                    const node = byId[oids[i]];
                    if (!node) continue;
                    if (pids[i] === -1 || !byId[pids[i]]) {
                        roots.push(node);
                    } else {
                        const parent = byId[pids[i]];
                        node.parent = parent;
                        parent.children.push(node);
                    }
                }
            } else if (name === 'SSTR') {
                r.u32();
                const count = r.u32();
                for (let i = 0; i < count; i++) {
                    r.bytes(16);
                    const len = r.u32();
                    sstr.push(r.bytes(len));
                }
            }
        }, 32);

        resolveRefs(byId);
        return { format: 'binary', roots, byRef: byId, stats };
    }

    function resolveRefs(byId) {
        for (const key in byId) {
            const node = byId[key];
            if (!node) continue;
            for (const prop in node.props) {
                const v = node.props[prop];
                if (v && v.$ === 'Ref') {
                    v.node = v.ref >= 0 ? (byId[v.ref] || null) : null;
                }
            }
        }
    }

    function decodeEntities(s) {
        if (s.indexOf('&') < 0) return s;
        return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|lt|gt|amp|quot|apos);/g, (m, e) => {
            switch (e) {
                case 'lt': return '<';
                case 'gt': return '>';
                case 'amp': return '&';
                case 'quot': return '"';
                case 'apos': return "'";
                default:
                    if (e[1] === 'x') return String.fromCodePoint(parseInt(e.slice(2), 16));
                    return String.fromCodePoint(parseInt(e.slice(1), 10));
            }
        });
    }

    function parseXmlTree(s) {
        const root = { tag: '#root', attrs: {}, children: [], text: '' };
        const stack = [root];
        const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        let i = 0;
        const n = s.length;
        while (i < n) {
            const lt = s.indexOf('<', i);
            const top = stack[stack.length - 1];
            if (lt < 0) {
                top.text += decodeEntities(s.slice(i));
                break;
            }
            if (lt > i) top.text += decodeEntities(s.slice(i, lt));
            const c1 = s.charCodeAt(lt + 1);
            if (c1 === 33) {
                if (s.startsWith('<!--', lt)) {
                    const e = s.indexOf('-->', lt + 4);
                    i = e < 0 ? n : e + 3;
                } else if (s.startsWith('<![CDATA[', lt)) {
                    const e = s.indexOf(']]>', lt + 9);
                    const end = e < 0 ? n : e;
                    top.text += s.slice(lt + 9, end);
                    i = e < 0 ? n : e + 3;
                } else {
                    const e = s.indexOf('>', lt);
                    i = e < 0 ? n : e + 1;
                }
                continue;
            }
            if (c1 === 63) {
                const e = s.indexOf('?>', lt);
                i = e < 0 ? n : e + 2;
                continue;
            }
            const gt = s.indexOf('>', lt);
            if (gt < 0) break;
            if (c1 === 47) {
                if (stack.length > 1) stack.pop();
                i = gt + 1;
                continue;
            }
            let body = s.slice(lt + 1, gt);
            let selfClose = false;
            if (body.charCodeAt(body.length - 1) === 47) {
                selfClose = true;
                body = body.slice(0, -1);
            }
            let sp = 0;
            while (sp < body.length && body.charCodeAt(sp) > 32) sp++;
            const el = { tag: body.slice(0, sp), attrs: {}, children: [], text: '' };
            if (sp < body.length) {
                attrRe.lastIndex = 0;
                const rest = body.slice(sp);
                let m;
                while ((m = attrRe.exec(rest))) el.attrs[m[1]] = decodeEntities(m[2] !== undefined ? m[2] : m[3]);
            }
            top.children.push(el);
            if (!selfClose) stack.push(el);
            i = gt + 1;
        }
        return root;
    }

    function childText(el, tag) {
        for (let i = 0; i < el.children.length; i++) {
            if (el.children[i].tag === tag) return el.children[i].text;
        }
        return null;
    }

    function num(el, tag, fallback) {
        const t = childText(el, tag);
        if (t === null) return fallback;
        const v = parseFloat(t);
        return isNaN(v) ? fallback : v;
    }

    function parseXmlValue(el) {
        const tag = el.tag;
        const text = el.text;
        switch (tag) {
            case 'string':
            case 'ProtectedString':
            case 'BinaryString':
            case 'SharedString':
                return text;
            case 'Content': {
                const url = childText(el, 'url');
                if (url !== null) return url.trim();
                return text.trim();
            }
            case 'bool':
                return text.trim().toLowerCase() === 'true';
            case 'int':
            case 'int64':
            case 'token':
                return tag === 'token' ? { $: 'Enum', v: parseInt(text, 10) || 0 } : (parseInt(text, 10) || 0);
            case 'float':
            case 'double': {
                const t = text.trim();
                if (t === 'INF') return Infinity;
                if (t === '-INF') return -Infinity;
                const v = parseFloat(t);
                return isNaN(v) ? 0 : v;
            }
            case 'BrickColor':
                return { $: 'BrickColor', n: parseInt(text, 10) || 194 };
            case 'Color3':
            case 'Color3uint8': {
                if (el.children.length === 0) {
                    const u = parseInt(text, 10) >>> 0;
                    return { $: 'Color3', r: ((u >> 16) & 255) / 255, g: ((u >> 8) & 255) / 255, b: (u & 255) / 255 };
                }
                return { $: 'Color3', r: num(el, 'R', 0), g: num(el, 'G', 0), b: num(el, 'B', 0) };
            }
            case 'Vector3':
                return vec3(num(el, 'X', 0), num(el, 'Y', 0), num(el, 'Z', 0));
            case 'Vector3int16':
                return vec3(num(el, 'X', 0), num(el, 'Y', 0), num(el, 'Z', 0));
            case 'Vector2':
            case 'Vector2int16':
                return { $: 'Vector2', x: num(el, 'X', 0), y: num(el, 'Y', 0) };
            case 'CoordinateFrame':
            case 'CFrame':
                return {
                    $: 'CFrame',
                    m: [num(el, 'X', 0), num(el, 'Y', 0), num(el, 'Z', 0),
                        num(el, 'R00', 1), num(el, 'R01', 0), num(el, 'R02', 0),
                        num(el, 'R10', 0), num(el, 'R11', 1), num(el, 'R12', 0),
                        num(el, 'R20', 0), num(el, 'R21', 0), num(el, 'R22', 1)]
                };
            case 'UDim2':
                return { $: 'UDim2', xs: num(el, 'XS', 0), xo: num(el, 'XO', 0), ys: num(el, 'YS', 0), yo: num(el, 'YO', 0) };
            case 'UDim':
                return { $: 'UDim', s: num(el, 'S', 0), o: num(el, 'O', 0) };
            case 'Ref': {
                const t = text.trim();
                return { $: 'Ref', ref: t === 'null' || t === '' ? null : t, node: null };
            }
            case 'Faces':
            case 'faces':
                return { $: 'Faces', mask: parseInt(childText(el, 'faces') || text, 10) || 0 };
            case 'Axes':
            case 'axes':
                return { $: 'Axes', mask: parseInt(childText(el, 'axes') || text, 10) || 0 };
            case 'NumberRange': {
                const p = text.trim().split(/\s+/).map(parseFloat);
                return { $: 'NumberRange', min: p[0] || 0, max: p.length > 1 ? p[1] : (p[0] || 0) };
            }
            case 'NumberSequence': {
                const p = text.trim().split(/\s+/).map(parseFloat);
                const keys = [];
                for (let i = 0; i + 2 < p.length; i += 3) keys.push({ t: p[i], v: p[i + 1], e: p[i + 2] });
                return { $: 'NumberSequence', keys };
            }
            case 'ColorSequence': {
                const p = text.trim().split(/\s+/).map(parseFloat);
                const keys = [];
                for (let i = 0; i + 4 < p.length; i += 5) keys.push({ t: p[i], r: p[i + 1], g: p[i + 2], b: p[i + 3] });
                return { $: 'ColorSequence', keys };
            }
            case 'Rect2D':
                return { $: 'Rect', x0: num(el.children[0] || el, 'X', 0), y0: num(el.children[0] || el, 'Y', 0), x1: num(el.children[1] || el, 'X', 0), y1: num(el.children[1] || el, 'Y', 0) };
            case 'PhysicalProperties': {
                if (childText(el, 'CustomPhysics') !== 'true') return null;
                return {
                    $: 'PhysicalProperties',
                    density: num(el, 'Density', 1), friction: num(el, 'Friction', 0.3), elasticity: num(el, 'Elasticity', 0.5),
                    frictionWeight: num(el, 'FrictionWeight', 1), elasticityWeight: num(el, 'ElasticityWeight', 1)
                };
            }
            case 'Ray': {
                const o = el.children.find(c => c.tag === 'origin');
                const d = el.children.find(c => c.tag === 'direction');
                return {
                    $: 'Ray',
                    o: o ? [num(o, 'X', 0), num(o, 'Y', 0), num(o, 'Z', 0)] : [0, 0, 0],
                    d: d ? [num(d, 'X', 0), num(d, 'Y', 0), num(d, 'Z', 0)] : [0, 0, 0]
                };
            }
            default:
                return undefined;
        }
    }

    function parseXml(text) {
        const tree = parseXmlTree(text);
        let rootEl = null;
        for (const c of tree.children) {
            if (c.tag === 'roblox') { rootEl = c; break; }
        }
        if (!rootEl) throw new Error('Not a Roblox XML file');
        const byRef = {};
        const roots = [];
        const stats = { warnings: [], skippedProps: {} };

        const build = (el, parent) => {
            const node = makeNode(el.attrs.class || 'Instance');
            node.ref = el.attrs.referent || null;
            if (node.ref) byRef[node.ref] = node;
            node.parent = parent;
            for (const c of el.children) {
                if (c.tag === 'Properties') {
                    for (const p of c.children) {
                        const name = p.attrs.name;
                        if (!name) continue;
                        const v = parseXmlValue(p);
                        if (v === undefined) {
                            stats.skippedProps[node.className + '.' + name] = p.tag;
                        } else {
                            node.props[name] = v;
                        }
                    }
                } else if (c.tag === 'Item') {
                    node.children.push(build(c, node));
                }
            }
            return node;
        };

        for (const c of rootEl.children) {
            if (c.tag === 'Item') roots.push(build(c, null));
        }
        resolveRefs(byRef);
        return { format: 'xml', roots, byRef, stats };
    }

    function toBytes(data) {
        if (typeof data === 'string') return data;
        if (data instanceof Uint8Array) return data;
        if (data instanceof ArrayBuffer) return new Uint8Array(data);
        if (data && data.buffer instanceof ArrayBuffer) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        throw new Error('Unsupported input');
    }

    function sniff(bytes) {
        let binary = bytes.length > 8;
        for (let i = 0; i < 8 && binary; i++) {
            if (bytes[i] !== MAGIC.charCodeAt(i)) binary = false;
        }
        return binary ? 'binary' : 'xml';
    }

    function parse(data) {
        const input = toBytes(data);
        if (typeof input === 'string') return parseXml(input);
        if (sniff(input) === 'binary') return parseBinary(input);
        return parseXml(decodeUtf8(input));
    }

    async function parseAsync(data) {
        const input = toBytes(data);
        if (typeof input !== 'string' && sniff(input) === 'binary' && isZstdFile(input)) {
            await ensureZstd();
        }
        return parse(input);
    }

    function walk(nodes, fn) {
        const stack = nodes.slice().reverse();
        while (stack.length) {
            const node = stack.pop();
            fn(node);
            for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
        }
    }

    root.RBXParser = { parse, parseAsync, parseBinary, parseXml, lz4Decompress, orientIdToMatrix, walk, sniff };
    if (typeof module !== 'undefined' && module.exports) module.exports = root.RBXParser;
})(typeof window !== 'undefined' ? window : globalThis);
