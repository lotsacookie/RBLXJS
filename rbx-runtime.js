(function (root, factory) {
    if (typeof module === "object" && module.exports) module.exports = factory(require("./rbx-lua.js"), require("./rbx-physics.js"));
    else root.RBXRuntime = factory(root.RBXLua, root.RBXPhysics);
})(typeof self !== "undefined" ? self : this, function (L, RBXPhysics) {
"use strict";
const fmtN = L.fmtNumber;
const R2D = 180 / Math.PI;

function isNum(v) { return typeof v === 'number'; }

class HostObject {
    get luaType() { return this.constructor.luaName; }
    luaToString() { return this.constructor.luaName; }
    luaEq(o) { return this === o; }
}

function methodLookup(cls, k) {
    const m = cls.methods[k];
    return m;
}

class Vector3 extends HostObject {
    constructor(x, y, z) {
        super();
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    }
    luaIndex(k) {
        switch (k) {
            case 'X': case 'x': return this.x;
            case 'Y': case 'y': return this.y;
            case 'Z': case 'z': return this.z;
            case 'Magnitude': case 'magnitude': return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
            case 'Unit': case 'unit': {
                const m = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
                return m === 0 ? new Vector3(0, 0, 0) : new Vector3(this.x / m, this.y / m, this.z / m);
            }
        }
        return Vector3.methods[k];
    }
    luaNewIndex() { throw new L.LuaError('Vector3 is read-only'); }
    luaToString() { return fmtN(this.x) + ', ' + fmtN(this.y) + ', ' + fmtN(this.z); }
    luaEq(o) { return o instanceof Vector3 && o.x === this.x && o.y === this.y && o.z === this.z; }
    luaArith(op, a, b) {
        if (op === 'unm') return new Vector3(-a.x, -a.y, -a.z);
        const av = a instanceof Vector3;
        const bv = b instanceof Vector3;
        switch (op) {
            case 'add': if (av && bv) return new Vector3(a.x + b.x, a.y + b.y, a.z + b.z); break;
            case 'sub': if (av && bv) return new Vector3(a.x - b.x, a.y - b.y, a.z - b.z); break;
            case 'mul':
                if (av && bv) return new Vector3(a.x * b.x, a.y * b.y, a.z * b.z);
                if (av && isNum(b)) return new Vector3(a.x * b, a.y * b, a.z * b);
                if (bv && isNum(a)) return new Vector3(b.x * a, b.y * a, b.z * a);
                break;
            case 'div':
                if (av && bv) return new Vector3(a.x / b.x, a.y / b.y, a.z / b.z);
                if (av && isNum(b)) return new Vector3(a.x / b, a.y / b, a.z / b);
                break;
        }
        throw new L.LuaError('attempt to perform arithmetic (' + op + ') on Vector3 and ' + L.typeofName(av ? b : a));
    }
    len() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
}
Vector3.luaName = 'Vector3';
Vector3.methods = {
    Dot: (s, o) => s.x * o.x + s.y * o.y + s.z * o.z,
    Cross: (s, o) => new Vector3(s.y * o.z - s.z * o.y, s.z * o.x - s.x * o.z, s.x * o.y - s.y * o.x),
    Lerp: (s, o, t) => new Vector3(s.x + (o.x - s.x) * t, s.y + (o.y - s.y) * t, s.z + (o.z - s.z) * t),
    FuzzyEq: (s, o, e) => { e = e === undefined ? 1e-5 : e; return Math.abs(s.x - o.x) <= e && Math.abs(s.y - o.y) <= e && Math.abs(s.z - o.z) <= e; },
    Angle: (s, o) => Math.acos(Math.max(-1, Math.min(1, (s.x * o.x + s.y * o.y + s.z * o.z) / (s.len() * o.len() || 1))))
};

class Vector2 extends HostObject {
    constructor(x, y) { super(); this.x = x || 0; this.y = y || 0; }
    luaIndex(k) {
        switch (k) {
            case 'X': case 'x': return this.x;
            case 'Y': case 'y': return this.y;
            case 'Magnitude': return Math.sqrt(this.x * this.x + this.y * this.y);
            case 'Unit': { const m = Math.sqrt(this.x * this.x + this.y * this.y); return m === 0 ? new Vector2(0, 0) : new Vector2(this.x / m, this.y / m); }
        }
        return Vector2.methods[k];
    }
    luaNewIndex() { throw new L.LuaError('Vector2 is read-only'); }
    luaToString() { return fmtN(this.x) + ', ' + fmtN(this.y); }
    luaEq(o) { return o instanceof Vector2 && o.x === this.x && o.y === this.y; }
    luaArith(op, a, b) {
        if (op === 'unm') return new Vector2(-a.x, -a.y);
        const av = a instanceof Vector2;
        const bv = b instanceof Vector2;
        if (op === 'add' && av && bv) return new Vector2(a.x + b.x, a.y + b.y);
        if (op === 'sub' && av && bv) return new Vector2(a.x - b.x, a.y - b.y);
        if (op === 'mul') { if (av && bv) return new Vector2(a.x * b.x, a.y * b.y); if (av) return new Vector2(a.x * b, a.y * b); return new Vector2(b.x * a, b.y * a); }
        if (op === 'div') { if (av && bv) return new Vector2(a.x / b.x, a.y / b.y); return new Vector2(a.x / b, a.y / b); }
        throw new L.LuaError('attempt to perform arithmetic on Vector2');
    }
}
Vector2.luaName = 'Vector2';
Vector2.methods = {
    Dot: (s, o) => s.x * o.x + s.y * o.y,
    Lerp: (s, o, t) => new Vector2(s.x + (o.x - s.x) * t, s.y + (o.y - s.y) * t)
};

class UDim extends HostObject {
    constructor(s, o) { super(); this.Scale = s || 0; this.Offset = o || 0; }
    luaIndex(k) { return k === 'Scale' ? this.Scale : (k === 'Offset' ? this.Offset : undefined); }
    luaNewIndex() { throw new L.LuaError('UDim is read-only'); }
    luaToString() { return '{' + fmtN(this.Scale) + ', ' + fmtN(this.Offset) + '}'; }
    luaEq(o) { return o instanceof UDim && o.Scale === this.Scale && o.Offset === this.Offset; }
}
UDim.luaName = 'UDim';

class UDim2 extends HostObject {
    constructor(xs, xo, ys, yo) { super(); this.xs = xs || 0; this.xo = xo || 0; this.ys = ys || 0; this.yo = yo || 0; }
    luaIndex(k) {
        switch (k) {
            case 'X': return new UDim(this.xs, this.xo);
            case 'Y': return new UDim(this.ys, this.yo);
            case 'Width': return new UDim(this.xs, this.xo);
            case 'Height': return new UDim(this.ys, this.yo);
        }
        return undefined;
    }
    luaNewIndex() { throw new L.LuaError('UDim2 is read-only'); }
    luaToString() { return '{' + fmtN(this.xs) + ', ' + fmtN(this.xo) + '}, {' + fmtN(this.ys) + ', ' + fmtN(this.yo) + '}'; }
    luaEq(o) { return o instanceof UDim2 && o.xs === this.xs && o.xo === this.xo && o.ys === this.ys && o.yo === this.yo; }
    luaArith(op, a, b) {
        if (op === 'add') return new UDim2(a.xs + b.xs, a.xo + b.xo, a.ys + b.ys, a.yo + b.yo);
        if (op === 'sub') return new UDim2(a.xs - b.xs, a.xo - b.xo, a.ys - b.ys, a.yo - b.yo);
        throw new L.LuaError('attempt to perform arithmetic on UDim2');
    }
}
UDim2.luaName = 'UDim2';

class CFrame extends HostObject {
    constructor(m) {
        super();
        this.m = m || [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];
    }
    get p() { return new Vector3(this.m[0], this.m[1], this.m[2]); }
    luaIndex(k) {
        const m = this.m;
        switch (k) {
            case 'p': case 'Position': return new Vector3(m[0], m[1], m[2]);
            case 'X': return m[0];
            case 'Y': return m[1];
            case 'Z': return m[2];
            case 'lookVector': case 'LookVector': return new Vector3(-m[5], -m[8], -m[11]);
            case 'rightVector': case 'RightVector': return new Vector3(m[3], m[6], m[9]);
            case 'upVector': case 'UpVector': return new Vector3(m[4], m[7], m[10]);
        }
        return CFrame.methods[k];
    }
    luaNewIndex() { throw new L.LuaError('CFrame is read-only'); }
    luaToString() { return this.m.map(fmtN).join(', '); }
    luaEq(o) { return o instanceof CFrame && o.m.every((v, i) => v === this.m[i]); }
    luaArith(op, a, b) {
        if (op === 'mul') {
            if (a instanceof CFrame && b instanceof CFrame) return cfMul(a, b);
            if (a instanceof CFrame && b instanceof Vector3) return cfPoint(a, b);
        }
        if (op === 'add' && a instanceof CFrame && b instanceof Vector3) {
            const m = a.m.slice(); m[0] += b.x; m[1] += b.y; m[2] += b.z; return new CFrame(m);
        }
        if (op === 'sub' && a instanceof CFrame && b instanceof Vector3) {
            const m = a.m.slice(); m[0] -= b.x; m[1] -= b.y; m[2] -= b.z; return new CFrame(m);
        }
        throw new L.LuaError('attempt to perform arithmetic (' + op + ') on CFrame');
    }
}
CFrame.luaName = 'CFrame';

function cfMul(a, b) {
    const A = a.m, B = b.m;
    return new CFrame([
        A[0] + A[3] * B[0] + A[4] * B[1] + A[5] * B[2],
        A[1] + A[6] * B[0] + A[7] * B[1] + A[8] * B[2],
        A[2] + A[9] * B[0] + A[10] * B[1] + A[11] * B[2],
        A[3] * B[3] + A[4] * B[6] + A[5] * B[9], A[3] * B[4] + A[4] * B[7] + A[5] * B[10], A[3] * B[5] + A[4] * B[8] + A[5] * B[11],
        A[6] * B[3] + A[7] * B[6] + A[8] * B[9], A[6] * B[4] + A[7] * B[7] + A[8] * B[10], A[6] * B[5] + A[7] * B[8] + A[8] * B[11],
        A[9] * B[3] + A[10] * B[6] + A[11] * B[9], A[9] * B[4] + A[10] * B[7] + A[11] * B[10], A[9] * B[5] + A[10] * B[8] + A[11] * B[11]
    ]);
}
function cfPoint(a, v) {
    const A = a.m;
    return new Vector3(A[0] + A[3] * v.x + A[4] * v.y + A[5] * v.z, A[1] + A[6] * v.x + A[7] * v.y + A[8] * v.z, A[2] + A[9] * v.x + A[10] * v.y + A[11] * v.z);
}
function cfVec(a, v) {
    const A = a.m;
    return new Vector3(A[3] * v.x + A[4] * v.y + A[5] * v.z, A[6] * v.x + A[7] * v.y + A[8] * v.z, A[9] * v.x + A[10] * v.y + A[11] * v.z);
}
function cfInverse(a) {
    const A = a.m;
    const px = A[0], py = A[1], pz = A[2];
    const r = [A[3], A[6], A[9], A[4], A[7], A[10], A[5], A[8], A[11]];
    return new CFrame([
        -(r[0] * px + r[1] * py + r[2] * pz),
        -(r[3] * px + r[4] * py + r[5] * pz),
        -(r[6] * px + r[7] * py + r[8] * pz),
        r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]
    ]);
}
function cfFromQuat(x, y, z, w, px, py, pz) {
    const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    x /= n; y /= n; z /= n; w /= n;
    return new CFrame([
        px || 0, py || 0, pz || 0,
        1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
        2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
        2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
    ]);
}
function cfToQuat(cf) {
    const m = cf.m;
    const r00 = m[3], r01 = m[4], r02 = m[5], r10 = m[6], r11 = m[7], r12 = m[8], r20 = m[9], r21 = m[10], r22 = m[11];
    const tr = r00 + r11 + r22;
    let x, y, z, w;
    if (tr > 0) {
        const s = Math.sqrt(tr + 1) * 2;
        w = 0.25 * s; x = (r21 - r12) / s; y = (r02 - r20) / s; z = (r10 - r01) / s;
    } else if (r00 > r11 && r00 > r22) {
        const s = Math.sqrt(1 + r00 - r11 - r22) * 2;
        w = (r21 - r12) / s; x = 0.25 * s; y = (r01 + r10) / s; z = (r02 + r20) / s;
    } else if (r11 > r22) {
        const s = Math.sqrt(1 + r11 - r00 - r22) * 2;
        w = (r02 - r20) / s; x = (r01 + r10) / s; y = 0.25 * s; z = (r12 + r21) / s;
    } else {
        const s = Math.sqrt(1 + r22 - r00 - r11) * 2;
        w = (r10 - r01) / s; x = (r02 + r20) / s; y = (r12 + r21) / s; z = 0.25 * s;
    }
    const n = Math.sqrt(x * x + y * y + z * z + w * w) || 1;
    return [x / n, y / n, z / n, w / n];
}
function cfAngles(rx, ry, rz) {
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    return new CFrame([0, 0, 0,
        cy * cz, -cy * sz, sy,
        cx * sz + sx * sy * cz, cx * cz - sx * sy * sz, -sx * cy,
        sx * sz - cx * sy * cz, sx * cz + cx * sy * sz, cx * cy]);
}
function cfLookAt(pos, target, up) {
    up = up || new Vector3(0, 1, 0);
    let zx = pos.x - target.x, zy = pos.y - target.y, zz = pos.z - target.z;
    let zl = Math.sqrt(zx * zx + zy * zy + zz * zz);
    if (zl === 0) return new CFrame([pos.x, pos.y, pos.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
    zx /= zl; zy /= zl; zz /= zl;
    let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
    let xl = Math.sqrt(xx * xx + xy * xy + xz * xz);
    if (xl < 1e-8) {
        xx = 1; xy = 0; xz = 0; xl = 1;
        if (Math.abs(zx) > 0.9) { xx = 0; xz = 1; }
        const cx = xy * zz - xz * zy, cy = xz * zx - xx * zz, cz = xx * zy - xy * zx;
        const cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
        xx = cx / cl; xy = cy / cl; xz = cz / cl;
    } else { xx /= xl; xy /= xl; xz /= xl; }
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new CFrame([pos.x, pos.y, pos.z, xx, yx, zx, xy, yy, zy, xz, yz, zz]);
}
function cfAxisAngle(axis, ang) {
    const l = axis.len() || 1;
    const x = axis.x / l, y = axis.y / l, z = axis.z / l;
    const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
    return new CFrame([0, 0, 0,
        t * x * x + c, t * x * y - s * z, t * x * z + s * y,
        t * x * y + s * z, t * y * y + c, t * y * z - s * x,
        t * x * z - s * y, t * y * z + s * x, t * z * z + c]);
}
CFrame.methods = {
    inverse: (s) => cfInverse(s),
    Inverse: (s) => cfInverse(s),
    toWorldSpace: (s, o) => (o instanceof CFrame ? cfMul(s, o) : cfPoint(s, o)),
    ToWorldSpace: (s, o) => (o instanceof CFrame ? cfMul(s, o) : cfPoint(s, o)),
    toObjectSpace: (s, o) => cfMul(cfInverse(s), o),
    ToObjectSpace: (s, o) => cfMul(cfInverse(s), o),
    pointToWorldSpace: (s, v) => cfPoint(s, v),
    PointToWorldSpace: (s, v) => cfPoint(s, v),
    pointToObjectSpace: (s, v) => cfPoint(cfInverse(s), v),
    PointToObjectSpace: (s, v) => cfPoint(cfInverse(s), v),
    vectorToWorldSpace: (s, v) => cfVec(s, v),
    VectorToWorldSpace: (s, v) => cfVec(s, v),
    vectorToObjectSpace: (s, v) => cfVec(cfInverse(s), v),
    VectorToObjectSpace: (s, v) => cfVec(cfInverse(s), v),
    components: (s) => s.m.slice(),
    GetComponents: (s) => s.m.slice(),
    toEulerAnglesXYZ: (s) => cfEuler(s),
    ToEulerAnglesXYZ: (s) => cfEuler(s),
    ToOrientation: (s) => cfEuler(s),
    lerp: (s, o, t) => cfLerp(s, o, t),
    Lerp: (s, o, t) => cfLerp(s, o, t),
    FuzzyEq: (s, o, e) => s.m.every((v, i) => Math.abs(v - o.m[i]) <= (e === undefined ? 1e-5 : e))
};
function cfEuler(s) {
    const m = s.m;
    const ry = Math.asin(Math.max(-1, Math.min(1, m[5])));
    const rx = Math.atan2(-m[8], m[11]);
    const rz = Math.atan2(-m[4], m[3]);
    return [rx, ry, rz];
}
function cfLerp(a, b, t) {
    const qa = cfToQuat(a);
    let qb = cfToQuat(b);
    let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
    if (d < 0) { qb = qb.map(v => -v); d = -d; }
    let ka, kb;
    if (d > 0.9995) { ka = 1 - t; kb = t; } else {
        const th = Math.acos(d), sn = Math.sin(th);
        ka = Math.sin((1 - t) * th) / sn; kb = Math.sin(t * th) / sn;
    }
    return cfFromQuat(qa[0] * ka + qb[0] * kb, qa[1] * ka + qb[1] * kb, qa[2] * ka + qb[2] * kb, qa[3] * ka + qb[3] * kb,
        a.m[0] + (b.m[0] - a.m[0]) * t, a.m[1] + (b.m[1] - a.m[1]) * t, a.m[2] + (b.m[2] - a.m[2]) * t);
}

const IDENTITY = () => new CFrame();

class Color3 extends HostObject {
    constructor(r, g, b) { super(); this.r = r || 0; this.g = g || 0; this.b = b || 0; }
    luaIndex(k) {
        switch (k) {
            case 'R': case 'r': return this.r;
            case 'G': case 'g': return this.g;
            case 'B': case 'b': return this.b;
        }
        return Color3.methods[k];
    }
    luaNewIndex() { throw new L.LuaError('Color3 is read-only'); }
    luaToString() { return fmtN(this.r) + ', ' + fmtN(this.g) + ', ' + fmtN(this.b); }
    luaEq(o) { return o instanceof Color3 && o.r === this.r && o.g === this.g && o.b === this.b; }
    hex() { return (Math.round(this.r * 255) << 16) | (Math.round(this.g * 255) << 8) | Math.round(this.b * 255); }
}
Color3.luaName = 'Color3';
Color3.methods = {
    Lerp: (s, o, t) => new Color3(s.r + (o.r - s.r) * t, s.g + (o.g - s.g) * t, s.b + (o.b - s.b) * t),
    ToHSV: (s) => {
        const mx = Math.max(s.r, s.g, s.b), mn = Math.min(s.r, s.g, s.b), d = mx - mn;
        let h = 0;
        if (d !== 0) {
            if (mx === s.r) h = ((s.g - s.b) / d) % 6; else if (mx === s.g) h = (s.b - s.r) / d + 2; else h = (s.r - s.g) / d + 4;
            h /= 6; if (h < 0) h += 1;
        }
        return [h, mx === 0 ? 0 : d / mx, mx];
    }
};

const BC_PALETTE = {
    1: ['White', 242, 243, 243], 5: ['Brick yellow', 215, 197, 154], 9: ['Light reddish violet', 232, 186, 200], 18: ['Nougat', 204, 142, 105],
    21: ['Bright red', 196, 40, 28], 23: ['Bright blue', 13, 105, 172], 24: ['Bright yellow', 245, 205, 48], 26: ['Black', 27, 42, 53],
    28: ['Dark green', 40, 127, 71], 37: ['Bright green', 75, 151, 75], 38: ['Dark orange', 160, 95, 53], 45: ['Light blue', 180, 210, 228],
    101: ['Medium red', 218, 134, 122], 102: ['Medium blue', 110, 153, 202], 104: ['Bright violet', 107, 50, 124],
    105: ['Br. yellowish orange', 226, 155, 64], 106: ['Bright orange', 218, 133, 65], 119: ['Br. yellowish green', 164, 189, 71],
    125: ['Light orange', 234, 184, 146], 133: ['Neon orange', 213, 115, 61], 141: ['Earth green', 39, 70, 45],
    192: ['Reddish brown', 105, 64, 40], 194: ['Medium stone grey', 163, 162, 165], 199: ['Dark stone grey', 99, 95, 98],
    208: ['Light stone grey', 229, 228, 223], 217: ['Brown', 124, 92, 70], 226: ['Cool yellow', 253, 234, 140],
    1001: ['Institutional white', 248, 248, 248], 1002: ['Mid gray', 205, 205, 205], 1003: ['Really black', 17, 17, 17],
    1004: ['Really red', 255, 0, 0], 1006: ['Alder', 180, 128, 255], 1008: ['Olive', 193, 190, 66], 1009: ['Really yellow', 255, 255, 0],
    1010: ['Really blue', 0, 0, 255], 1011: ['Navy blue', 0, 32, 96], 1012: ['Deep blue', 33, 84, 185], 1013: ['Cyan', 4, 175, 236],
    1014: ['CGA brown', 170, 85, 0], 1015: ['Magenta', 170, 0, 170], 1016: ['Pink', 255, 102, 204], 1017: ['Deep orange', 255, 175, 0],
    1018: ['Teal', 18, 238, 212], 1019: ['Toothpaste', 0, 255, 255], 1020: ['Lime green', 0, 255, 0], 1021: ['Camo', 58, 125, 21],
    1022: ['Grime', 127, 142, 100], 1023: ['Lavender', 140, 91, 159], 1024: ['Pastel light blue', 175, 221, 255],
    1025: ['Pastel orange', 255, 201, 201], 1026: ['Pastel violet', 177, 167, 255], 1027: ['Pastel blue-green', 159, 243, 233],
    1028: ['Pastel green', 204, 255, 204], 1029: ['Pastel yellow', 255, 255, 204], 1030: ['Pastel brown', 255, 204, 153],
    1031: ['Royal purple', 98, 37, 209], 1032: ['Hot pink', 255, 0, 191]
};
const BC_BY_NAME = {};
for (const n of Object.keys(BC_PALETTE)) BC_BY_NAME[BC_PALETTE[n][0].toLowerCase()] = Number(n);

class BrickColor extends HostObject {
    constructor(n) { super(); this.n = BC_PALETTE[n] ? n : 194; }
    get entry() { return BC_PALETTE[this.n]; }
    luaIndex(k) {
        const e = this.entry;
        switch (k) {
            case 'Name': return e[0];
            case 'Number': return this.n;
            case 'Color': return new Color3(e[1] / 255, e[2] / 255, e[3] / 255);
            case 'r': return e[1] / 255;
            case 'g': return e[2] / 255;
            case 'b': return e[3] / 255;
        }
        return undefined;
    }
    luaNewIndex() { throw new L.LuaError('BrickColor is read-only'); }
    luaToString() { return this.entry[0]; }
    luaEq(o) { return o instanceof BrickColor && o.n === this.n; }
}
BrickColor.luaName = 'BrickColor';

function nearestBrickColor(c) {
    let best = 194, bd = Infinity;
    for (const n of Object.keys(BC_PALETTE)) {
        const e = BC_PALETTE[n];
        const d = (e[1] / 255 - c.r) ** 2 + (e[2] / 255 - c.g) ** 2 + (e[3] / 255 - c.b) ** 2;
        if (d < bd) { bd = d; best = Number(n); }
    }
    return new BrickColor(best);
}

class Ray extends HostObject {
    constructor(o, d) { super(); this.Origin = o; this.Direction = d; }
    luaIndex(k) {
        if (k === 'Origin') return this.Origin;
        if (k === 'Direction') return this.Direction;
        if (k === 'Unit') { const m = this.Direction.len() || 1; return new Ray(this.Origin, new Vector3(this.Direction.x / m, this.Direction.y / m, this.Direction.z / m)); }
        return Ray.methods[k];
    }
    luaNewIndex() { throw new L.LuaError('Ray is read-only'); }
    luaToString() { return '{' + this.Origin.luaToString() + '}, {' + this.Direction.luaToString() + '}'; }
}
Ray.luaName = 'Ray';
Ray.methods = {
    ClosestPoint: (s, p) => {
        const d = s.Direction, l2 = d.x * d.x + d.y * d.y + d.z * d.z || 1;
        const t = Math.max(0, Math.min(1, ((p.x - s.Origin.x) * d.x + (p.y - s.Origin.y) * d.y + (p.z - s.Origin.z) * d.z) / l2));
        return new Vector3(s.Origin.x + d.x * t, s.Origin.y + d.y * t, s.Origin.z + d.z * t);
    }
};

class Region3 extends HostObject {
    constructor(a, b) { super(); this.Min = a; this.Max = b; }
    luaIndex(k) {
        if (k === 'CFrame') return new CFrame([(this.Min.x + this.Max.x) / 2, (this.Min.y + this.Max.y) / 2, (this.Min.z + this.Max.z) / 2, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
        if (k === 'Size') return new Vector3(this.Max.x - this.Min.x, this.Max.y - this.Min.y, this.Max.z - this.Min.z);
        return undefined;
    }
    luaNewIndex() { throw new L.LuaError('Region3 is read-only'); }
}
Region3.luaName = 'Region3';

class TweenInfo extends HostObject {
    constructor(time, style, dir, rep, rev, delay) {
        super();
        this.Time = time === undefined ? 1 : time;
        this.EasingStyle = style;
        this.EasingDirection = dir;
        this.RepeatCount = rep || 0;
        this.Reverses = !!rev;
        this.DelayTime = delay || 0;
    }
    luaIndex(k) { return this[k]; }
    luaNewIndex() { throw new L.LuaError('TweenInfo is read-only'); }
}
TweenInfo.luaName = 'TweenInfo';

class NumberRange extends HostObject {
    constructor(a, b) { super(); this.Min = a; this.Max = b === undefined ? a : b; }
    luaIndex(k) { return this[k]; }
    luaNewIndex() { throw new L.LuaError('NumberRange is read-only'); }
    luaToString() { return fmtN(this.Min) + ' ' + fmtN(this.Max); }
}
NumberRange.luaName = 'NumberRange';

class Keypoints extends HostObject {
    constructor(kind, pts) { super(); this.kind = kind; this.Keypoints = pts; }
    luaIndex(k) {
        if (k === 'Keypoints') { const t = new L.LuaTable(); t.arr = this.Keypoints.slice(); return t; }
        return undefined;
    }
    luaNewIndex() { throw new L.LuaError('read-only'); }
    sample(t) {
        const p = this.Keypoints;
        for (let i = 0; i < p.length - 1; i++) {
            if (t >= p[i].Time && t <= p[i + 1].Time) {
                const f = (t - p[i].Time) / ((p[i + 1].Time - p[i].Time) || 1);
                if (this.kind === 'color') return new Color3(p[i].Value.r + (p[i + 1].Value.r - p[i].Value.r) * f, p[i].Value.g + (p[i + 1].Value.g - p[i].Value.g) * f, p[i].Value.b + (p[i + 1].Value.b - p[i].Value.b) * f);
                return p[i].Value + (p[i + 1].Value - p[i].Value) * f;
            }
        }
        return p[p.length - 1].Value;
    }
    get luaType() { return this.kind === 'color' ? 'ColorSequence' : 'NumberSequence'; }
}
Keypoints.luaName = 'NumberSequence';

class KeypointItem extends HostObject {
    constructor(t, v, e) { super(); this.Time = t; this.Value = v; this.Envelope = e || 0; }
    luaIndex(k) { return this[k]; }
    luaNewIndex() { throw new L.LuaError('read-only'); }
}
KeypointItem.luaName = 'Keypoint';

const ENUM_DEFS = {
    Material: { Plastic: 256, SmoothPlastic: 272, Neon: 288, Wood: 512, WoodPlanks: 528, Marble: 784, Basalt: 788, Slate: 800, CrackedLava: 804, Concrete: 816, Limestone: 820, Granite: 832, Pavement: 836, Brick: 848, Pebble: 880, Cobblestone: 890, Rock: 896, Sandstone: 912, CorrodedMetal: 1040, DiamondPlate: 1056, Foil: 1072, Metal: 1088, Grass: 1280, LeafyGrass: 1284, Sand: 1296, Fabric: 1312, Snow: 1328, Mud: 1344, Ground: 1360, Asphalt: 1376, Salt: 1392, Ice: 1536, Glacier: 1552, Glass: 1568, ForceField: 1584 },
    PartType: { Ball: 0, Block: 1, Cylinder: 2 },
    SurfaceType: { Smooth: 0, Glue: 1, Weld: 2, Studs: 3, Inlet: 4, Universal: 5, Hinge: 6, Motor: 7, SteppingMotor: 8, SmoothNoOutlines: 10 },
    NormalId: { Right: 0, Top: 1, Back: 2, Left: 3, Bottom: 4, Front: 5 },
    FormFactor: { Symmetric: 0, Brick: 1, Plate: 2, Custom: 3 },
    EasingStyle: { Linear: 0, Sine: 1, Back: 2, Quad: 3, Quart: 4, Quint: 5, Bounce: 6, Elastic: 7, Exponential: 8, Circular: 9, Cubic: 10 },
    EasingDirection: { In: 0, Out: 1, InOut: 2 },
    PlaybackState: { Begin: 0, Delayed: 1, Playing: 2, Paused: 3, Completed: 4, Cancelled: 5 },
    HumanoidStateType: { FallingDown: 0, Ragdoll: 1, GettingUp: 2, Jumping: 3, Swimming: 4, Freefall: 5, Flying: 6, Landed: 7, Running: 8, Seated: 10, PlatformStanding: 14, Dead: 15, Physics: 16 },
    ExplosionType: { NoCraters: 0, Craters: 1, CratersAndDebris: 2 },
    TextXAlignment: { Left: 0, Center: 1, Right: 2 },
    TextYAlignment: { Top: 0, Center: 1, Bottom: 2 },
    Font: { Legacy: 0, Arial: 1, ArialBold: 2, SourceSans: 3, SourceSansBold: 4, SourceSansLight: 5, SourceSansItalic: 6 },
    ScaleType: { Stretch: 0, Slice: 1, Tile: 2 },
    SizeConstraint: { RelativeXY: 0, RelativeXX: 1, RelativeYY: 2 },
    FillDirection: { Horizontal: 0, Vertical: 1 },
    CameraType: { Fixed: 0, Watch: 1, Attach: 2, Track: 3, Follow: 4, Custom: 5, Scriptable: 6 },
    RunContext: { Legacy: 0, Server: 1, Client: 2 },
    Technology: { Legacy: 0, Voxel: 1 },
    MeshType: { Head: 0, Torso: 1, Wedge: 2, Prism: 3, Pyramid: 4, ParallelRamp: 5, RightAngleRamp: 6, CornerWedge: 7, Brick: 8, Sphere: 9, Cylinder: 10, FileMesh: 11 },
    RigType: { R6: 0, R15: 1 },
    CollisionFidelity: { Default: 0, Hull: 1, Box: 2 },
    Axis: { X: 0, Y: 1, Z: 2 },
    UserInputType: { MouseButton1: 0, MouseButton2: 1, MouseButton3: 2, MouseWheel: 3, MouseMovement: 4, Touch: 7, Keyboard: 8, Focus: 9, None: 12 },
    UserInputState: { Begin: 0, Change: 1, End: 2, Cancel: 3, None: 4 },
    KeyCode: { Unknown: 0, Backspace: 8, Tab: 9, Return: 13, Escape: 27, Space: 32, Delete: 127, Zero: 48, One: 49, Two: 50, Three: 51, Four: 52, Five: 53, Six: 54, Seven: 55, Eight: 56, Nine: 57, A: 97, B: 98, C: 99, D: 100, E: 101, F: 102, G: 103, H: 104, I: 105, J: 106, K: 107, L: 108, M: 109, N: 110, O: 111, P: 112, Q: 113, R: 114, S: 115, T: 116, U: 117, V: 118, W: 119, X: 120, Y: 121, Z: 122, LeftShift: 304, RightShift: 303, LeftControl: 306, LeftAlt: 308, Up: 273, Down: 274, Right: 275, Left: 276 },
    ZIndexBehavior: { Global: 0, Sibling: 1 },
    ParticleOrientation: { FacingCamera: 0, FacingCameraWorldUp: 1, VelocityParallel: 2, VelocityPerpendicular: 3 },
    ActuatorType: { None: 0, Motor: 1, Servo: 2 },
    ClientAnimatorThrottlingMode: { Default: 0 },
    Limb: { Head: 0, Torso: 1, LeftArm: 2, RightArm: 3, LeftLeg: 4, RightLeg: 5, Unknown: 6 },
    ThumbnailType: { HeadShot: 0, AvatarBust: 1, AvatarThumbnail: 2 },
    ThumbnailSize: { Size48x48: 0, Size180x180: 1, Size420x420: 2 },
    TeleportState: { Started: 0, InProgress: 1, Failed: 2 },
    DominantAxis: { Width: 0, Height: 1 },
    HumanoidDisplayDistanceType: { Viewer: 0, Subject: 1, None: 2 },
    AnimationPriority: { Idle: 0, Movement: 1, Action: 2, Core: 1000 }
};

class EnumItem extends HostObject {
    constructor(type, name, value) { super(); this.EnumType = type; this.Name = name; this.Value = value; }
    luaIndex(k) { return k === 'Name' ? this.Name : (k === 'Value' ? this.Value : (k === 'EnumType' ? this.EnumType : undefined)); }
    luaNewIndex() { throw new L.LuaError('Enum is read-only'); }
    luaToString() { return 'Enum.' + this.EnumType.Name + '.' + this.Name; }
}
EnumItem.luaName = 'EnumItem';

class EnumType extends HostObject {
    constructor(name, items) {
        super();
        this.Name = name;
        this.items = {};
        this.byValue = new Map();
        for (const k of Object.keys(items)) {
            const it = new EnumItem(this, k, items[k]);
            this.items[k] = it;
            this.byValue.set(items[k], it);
        }
    }
    luaIndex(k) {
        if (k === 'GetEnumItems') return (s) => { const t = new L.LuaTable(); t.arr = Object.values(s.items); return t; };
        return this.items[k];
    }
    luaNewIndex() { throw new L.LuaError('Enum is read-only'); }
    luaToString() { return 'Enum.' + this.Name; }
    fromValue(v) { return this.byValue.get(v); }
}
EnumType.luaName = 'Enum';

const ENUMS = {};
for (const n of Object.keys(ENUM_DEFS)) ENUMS[n] = new EnumType(n, ENUM_DEFS[n]);

class EnumRoot extends HostObject {
    luaIndex(k) { return ENUMS[k]; }
    luaNewIndex() { throw new L.LuaError('Enum is read-only'); }
    luaToString() { return 'Enums'; }
}
EnumRoot.luaName = 'Enums';

const PROP_ENUM = {
    Material: 'Material', Shape: 'PartType', FormFactor: 'FormFactor', formFactorRaw: 'FormFactor',
    TopSurface: 'SurfaceType', BottomSurface: 'SurfaceType', LeftSurface: 'SurfaceType', RightSurface: 'SurfaceType', FrontSurface: 'SurfaceType', BackSurface: 'SurfaceType',
    Face: 'NormalId', ExplosionType: 'ExplosionType', MeshType: 'MeshType', EasingStyle: 'EasingStyle', EasingDirection: 'EasingDirection', CameraType: 'CameraType',
    TextXAlignment: 'TextXAlignment', TextYAlignment: 'TextYAlignment', Font: 'Font', ScaleType: 'ScaleType', RigType: 'RigType'
};

function enumItemOf(prop, v) {
    const e = PROP_ENUM[prop];
    if (e && ENUMS[e]) {
        const it = ENUMS[e].fromValue(v);
        if (it) return it;
    }
    return v;
}
function enumNum(v) {
    if (v instanceof EnumItem) return v.Value;
    return typeof v === 'number' ? v : 0;
}

function tableOf(arr) {
    const t = new L.LuaTable();
    t.arr = arr.slice();
    return t;
}

function makeTypeGlobals(state) {
    const mk = (obj) => state.makeTable(obj);
    const g = {};
    const v3 = mk({
        new: (x, y, z) => new Vector3(x, y, z),
        FromNormalId: (n) => {
            const v = enumNum(n);
            return [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(-1, 0, 0), new Vector3(0, -1, 0), new Vector3(0, 0, -1)][v] || new Vector3();
        },
        FromAxis: (a) => [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)][enumNum(a)] || new Vector3()
    });
    v3.set('zero', new Vector3(0, 0, 0));
    v3.set('one', new Vector3(1, 1, 1));
    v3.set('xAxis', new Vector3(1, 0, 0));
    v3.set('yAxis', new Vector3(0, 1, 0));
    v3.set('zAxis', new Vector3(0, 0, 1));
    g.Vector3 = v3;
    g.Vector2 = mk({ new: (x, y) => new Vector2(x, y) });
    g.Vector2.set('zero', new Vector2(0, 0));
    g.UDim = mk({ new: (s, o) => new UDim(s, o) });
    g.UDim2 = mk({
        new: (a, b, c, d) => {
            if (a instanceof UDim) return new UDim2(a.Scale, a.Offset, b.Scale, b.Offset);
            return new UDim2(a, b, c, d);
        },
        fromScale: (x, y) => new UDim2(x, 0, y, 0),
        fromOffset: (x, y) => new UDim2(0, x, 0, y)
    });
    g.CFrame = mk({
        new: (...a) => {
            if (a.length === 0) return new CFrame();
            if (a.length === 1 && a[0] instanceof Vector3) return new CFrame([a[0].x, a[0].y, a[0].z, 1, 0, 0, 0, 1, 0, 0, 0, 1]);
            if (a.length === 2 && a[0] instanceof Vector3 && a[1] instanceof Vector3) return cfLookAt(a[0], a[1]);
            if (a.length === 3) return new CFrame([a[0], a[1], a[2], 1, 0, 0, 0, 1, 0, 0, 0, 1]);
            if (a.length === 7) return cfFromQuat(a[3], a[4], a[5], a[6], a[0], a[1], a[2]);
            if (a.length === 12) return new CFrame(a.slice());
            throw new L.LuaError('invalid arguments to CFrame.new');
        },
        Angles: (x, y, z) => cfAngles(x || 0, y || 0, z || 0),
        fromEulerAnglesXYZ: (x, y, z) => cfAngles(x || 0, y || 0, z || 0),
        fromEulerAnglesYXZ: (x, y, z) => cfMul(cfMul(cfAngles(0, y || 0, 0), cfAngles(x || 0, 0, 0)), cfAngles(0, 0, z || 0)),
        fromOrientation: (x, y, z) => cfMul(cfMul(cfAngles(0, y || 0, 0), cfAngles(x || 0, 0, 0)), cfAngles(0, 0, z || 0)),
        fromAxisAngle: (a, t) => cfAxisAngle(a, t),
        fromMatrix: (p, x, y, z) => {
            if (z === undefined) z = new Vector3(x.y * y.z - x.z * y.y, x.z * y.x - x.x * y.z, x.x * y.y - x.y * y.x);
            return new CFrame([p.x, p.y, p.z, x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z]);
        },
        lookAt: (p, t, u) => cfLookAt(p, t, u)
    });
    g.CFrame.set('identity', new CFrame());
    g.Color3 = mk({
        new: (r, gg, b) => new Color3(Math.max(0, Math.min(1, r || 0)), Math.max(0, Math.min(1, gg || 0)), Math.max(0, Math.min(1, b || 0))),
        fromRGB: (r, gg, b) => new Color3((r || 0) / 255, (gg || 0) / 255, (b || 0) / 255),
        fromHSV: (h, s, v) => {
            const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
            const c = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][((i % 6) + 6) % 6];
            return new Color3(c[0], c[1], c[2]);
        }
    });
    const bcFn = {
        new: (a, b, c) => {
            if (typeof a === 'number' && b === undefined) return new BrickColor(a);
            if (typeof a === 'string') return new BrickColor(BC_BY_NAME[a.toLowerCase()] || 194);
            if (a instanceof Color3) return nearestBrickColor(a);
            if (typeof a === 'number') return nearestBrickColor(new Color3(a, b, c));
            return new BrickColor(194);
        },
        random: () => { const k = Object.keys(BC_PALETTE); return new BrickColor(Number(k[Math.floor(Math.random() * k.length)])); }
    };
    const named = { White: 1, Black: 26, Red: 21, Blue: 23, Yellow: 24, Green: 37, Gray: 194, DarkGray: 199, Orange: 106, Purple: 104, Pink: 1016 };
    for (const k of Object.keys(named)) bcFn[k] = () => new BrickColor(named[k]);
    g.BrickColor = mk(bcFn);
    g.Ray = mk({ new: (o, d) => new Ray(o, d) });
    g.Region3 = mk({ new: (a, b) => new Region3(a, b) });
    g.TweenInfo = mk({ new: (t, s, d, r, rev, dl) => new TweenInfo(t, s || ENUMS.EasingStyle.items.Quad, d || ENUMS.EasingDirection.items.Out, r, rev, dl) });
    g.NumberRange = mk({ new: (a, b) => new NumberRange(a, b) });
    g.NumberSequenceKeypoint = mk({ new: (t, v, e) => new KeypointItem(t, v, e) });
    g.ColorSequenceKeypoint = mk({ new: (t, v) => new KeypointItem(t, v) });
    g.NumberSequence = mk({
        new: (a, b) => {
            if (a instanceof L.LuaTable) return new Keypoints('number', a.arr.slice());
            if (b === undefined) return new Keypoints('number', [new KeypointItem(0, a), new KeypointItem(1, a)]);
            return new Keypoints('number', [new KeypointItem(0, a), new KeypointItem(1, b)]);
        }
    });
    g.ColorSequence = mk({
        new: (a, b) => {
            if (a instanceof L.LuaTable) return new Keypoints('color', a.arr.slice());
            if (b === undefined) return new Keypoints('color', [new KeypointItem(0, a), new KeypointItem(1, a)]);
            return new Keypoints('color', [new KeypointItem(0, a), new KeypointItem(1, b)]);
        }
    });
    g.Enum = new EnumRoot();
    return g;
}
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
const PX = RBXPhysics;
const WELD_KINDS = new Set(['Weld', 'ManualWeld', 'Snap', 'Motor6D']);
const FIXED_KINDS = new Set(['WeldConstraint', 'Glue']);
const MOTOR_KINDS = new Set(['Motor', 'VelocityMotor', 'Motor6DHinge']);
const CONSTRAINT_KINDS = new Set(['HingeConstraint', 'BallSocketConstraint', 'RopeConstraint', 'RodConstraint', 'SpringConstraint']);
const ROOT_FRAME = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

function partCF(p) { return p.props.CFrame; }
function partSize(p) { return p.props.Size; }
function enumValue(v) { return v instanceof EnumItem ? v.Value : v; }

function cfQuatArr(cf) { return cfToQuat(cf); }

class PhysicsSync {
    constructor(game) {
        this.game = game;
        this.world = new PX.World({ gravity: [0, -196.2, 0], cellSize: 32 });
        this.dirty = new Set();
        this.dirtyJoints = new Set();
        this.assemblies = new Set();
        this.joints = new Set();
        this.touch = new Map();
        this.simTime = 0;
        this.accum = 0;
        this.fixedStep = 1 / 60;
        this.maxSubsteps = 4;
        this.bodyMovers = new Set();
        this.characterBodies = new Map();
        this.world.onBegin = (a, b) => this.beginContact(a, b);
        this.world.onEnd = (a, b) => this.endContact(a, b);
        this.world.filter = (a, b) => this.shouldCollide(a, b);
        this.motors = new Set();
    }

    setGravity(g) {
        this.world.gravity = [0, -g, 0];
    }

    shouldCollide(a, b) {
        if (a.body.type === 'kinematic' && b.body.type === 'kinematic') return false;
        const pa = a.userData && a.userData.part;
        const pb = b.userData && b.userData.part;
        if (pa && pb && this.game.collisionFilter) return this.game.collisionFilter(pa, pb);
        return true;
    }

    beginContact(a, b) {
        const pa = a.userData && a.userData.part;
        const pb = b.userData && b.userData.part;
        if (!pa || !pb || pa === pb) return;
        const key = pa.uid < pb.uid ? pa.uid + ':' + pb.uid : pb.uid + ':' + pa.uid;
        const e = this.touch.get(key);
        if (e) { e.n++; return; }
        this.touch.set(key, { n: 1, a: pa, b: pb });
        if (pa.props.CanTouch === false || pb.props.CanTouch === false) return;
        pa.fireSignal('Touched', pb);
        pb.fireSignal('Touched', pa);
        this.game.touched(pa, pb);
    }

    endContact(a, b) {
        const pa = a.userData && a.userData.part;
        const pb = b.userData && b.userData.part;
        if (!pa || !pb || pa === pb) return;
        const key = pa.uid < pb.uid ? pa.uid + ':' + pb.uid : pb.uid + ':' + pa.uid;
        const e = this.touch.get(key);
        if (!e) return;
        e.n--;
        if (e.n > 0) return;
        this.touch.delete(key);
        pa.fireSignal('TouchEnded', pb);
        pb.fireSignal('TouchEnded', pa);
    }

    addPart(part) {
        if (part.ext === null) part.ext = {};
        const x = part.ext;
        if (x.registered) return;
        x.registered = true;
        x.joints = x.joints || new Set();
        x.assembly = null;
        this.dirty.add(part);
    }

    removePart(part) {
        const x = part.ext;
        if (!x || !x.registered) return;
        x.registered = false;
        this.dirty.delete(part);
        if (x.assembly) {
            const asm = x.assembly;
            this.destroyAssembly(asm, part);
            for (const m of asm.members) if (m.part !== part && m.part.ext && m.part.ext.registered) this.dirty.add(m.part);
        }
        x.assembly = null;
    }

    markDirty(part) {
        if (part.ext && part.ext.registered) this.dirty.add(part);
    }

    attachJoint(j) {
        const x = j.ext || (j.ext = {});
        if (x.attached) for (const p of x.attached) if (p && p.ext && p.ext.joints) { p.ext.joints.delete(j); this.markDirty(p); }
        x.attached = [];
        x.rel = null;
        if (!this.game.inWorkspace(j)) { this.joints.delete(j); this.dirtyJoints.add(j); return; }
        this.joints.add(j);
        const kind = j.className;
        const ps = [];
        if (WELD_KINDS.has(kind) || FIXED_KINDS.has(kind) || MOTOR_KINDS.has(kind)) {
            ps.push(j.props.Part0, j.props.Part1);
        } else if (CONSTRAINT_KINDS.has(kind)) {
            const a0 = j.props.Attachment0, a1 = j.props.Attachment1;
            ps.push(a0 && a0._parent, a1 && a1._parent);
        }
        for (const p of ps) {
            if (p && p instanceof Instance && p.isA('BasePart')) {
                if (p.ext === null) p.ext = {};
                if (!p.ext.joints) p.ext.joints = new Set();
                p.ext.joints.add(j);
                x.attached.push(p);
                this.markDirty(p);
            }
        }
        this.dirtyJoints.add(j);
    }

    detachJoint(j) {
        const x = j.ext;
        this.joints.delete(j);
        this.dirtyJoints.delete(j);
        if (!x) return;
        if (x.pj) { this.world.removeJoint(x.pj); x.pj = null; }
        this.motors.delete(j);
        if (x.attached) for (const p of x.attached) if (p && p.ext && p.ext.joints) { p.ext.joints.delete(j); this.markDirty(p); }
        x.attached = [];
    }

    jointActive(j) {
        if (j.props.Enabled === false) return false;
        return true;
    }

    mergeKind(j) {
        return (WELD_KINDS.has(j.className) || FIXED_KINDS.has(j.className)) && this.jointActive(j);
    }

    partGroup(start) {
        const seen = new Set([start]);
        const queue = [start];
        const order = [];
        while (queue.length) {
            const p = queue.shift();
            order.push(p);
            for (const j of p.ext.joints) {
                if (!this.mergeKind(j)) continue;
                const o = j.props.Part0 === p ? j.props.Part1 : j.props.Part0;
                if (!o || !o.ext || !o.ext.registered || seen.has(o) || o.ext.noPhysics) continue;
                seen.add(o);
                queue.push(o);
            }
        }
        return order;
    }

    volume(p) {
        const s = partSize(p);
        return s.x * s.y * s.z;
    }

    destroyAssembly(asm, except) {
        if (asm.body) this.world.removeBody(asm.body);
        asm.body = null;
        this.assemblies.delete(asm);
        for (const m of asm.members) {
            if (m.part !== except && m.part.ext) m.part.ext.assembly = null;
            m.shape = null;
        }
        for (const j of asm.joints) {
            if (j.ext && j.ext.pj) { this.world.removeJoint(j.ext.pj); j.ext.pj = null; }
            if (this.joints.has(j)) this.dirtyJoints.add(j);
        }
        asm.joints.clear();
    }

    shapeDef(part, rel) {
        const s = partSize(part);
        const q = cfToQuat(rel);
        const shapeEnum = enumValue(part.props.Shape);
        let type = 'box';
        let size = [Math.max(s.x, 0.05), Math.max(s.y, 0.05), Math.max(s.z, 0.05)];
        const cn = part.className;
        if (cn === 'WedgePart') type = 'wedge';
        else if (cn === 'CornerWedgePart') type = 'cornerwedge';
        else if (shapeEnum === 0 && cn !== 'MeshPart') { type = 'sphere'; const d = Math.min(size[0], size[1], size[2]); size = [d, d, d]; }
        else if (shapeEnum === 2 && cn !== 'MeshPart') type = 'cylinder';
        const cc = part.props.CanCollide !== false;
        return {
            type, size,
            offset: [rel.m[0], rel.m[1], rel.m[2]],
            quat: q,
            sensor: !cc,
            friction: part.props.Friction === undefined ? 0.3 : part.props.Friction,
            restitution: part.props.Elasticity === undefined ? 0.5 : part.props.Elasticity,
            density: 0.7,
            userData: { part }
        };
    }

    flush() {
        if (this.dirty.size === 0 && this.dirtyJoints.size === 0) return;
        const guard = 8;
        let rounds = 0;
        while ((this.dirty.size > 0 || this.dirtyJoints.size > 0) && rounds++ < guard) {
            const todo = Array.from(this.dirty);
            this.dirty.clear();
            const done = new Set();
            for (const p of todo) {
                if (done.has(p) || !p.ext || !p.ext.registered) continue;
                if (p.ext.noPhysics) { done.add(p); continue; }
                const group = this.partGroup(p);
                for (const g of group) done.add(g);
                for (const g of group) if (g.ext.assembly) this.destroyAssembly(g.ext.assembly);
                this.buildAssembly(group);
            }
            const js = Array.from(this.dirtyJoints);
            this.dirtyJoints.clear();
            for (const j of js) this.buildJoint(j);
        }
    }

    buildAssembly(group) {
        let root = null;
        for (const p of group) if (p.props.Anchored === true) { root = p; break; }
        const anchored = root !== null;
        if (!root) {
            let bv = -1;
            for (const p of group) { const v = this.volume(p); if (v > bv) { bv = v; root = p; } }
        }
        const frames = new Map();
        frames.set(root, partCF(root));
        const queue = [root];
        while (queue.length) {
            const p = queue.shift();
            const pf = frames.get(p);
            for (const j of p.ext.joints) {
                if (!this.mergeKind(j)) continue;
                const p0 = j.props.Part0, p1 = j.props.Part1;
                const o = p0 === p ? p1 : p0;
                if (!o || frames.has(o) || group.indexOf(o) < 0) continue;
                let of;
                if (WELD_KINDS.has(j.className)) {
                    const c0 = j.props.C0 || new CFrame(), c1 = j.props.C1 || new CFrame();
                    if (p0 === p) of = cfMul(cfMul(pf, c0), cfInverse(c1));
                    else of = cfMul(cfMul(pf, c1), cfInverse(c0));
                } else {
                    if (!j.ext.rel) j.ext.rel = cfMul(cfInverse(partCF(p0)), partCF(p1));
                    of = p0 === p ? cfMul(pf, j.ext.rel) : cfMul(pf, cfInverse(j.ext.rel));
                }
                frames.set(o, of);
                queue.push(o);
            }
        }
        const rootCF = frames.get(root);
        const asm = { members: [], root, body: null, joints: new Set(), anchored, rootCF };
        const b = this.world.createBody({
            type: anchored ? 'static' : 'dynamic',
            position: [rootCF.m[0], rootCF.m[1], rootCF.m[2]],
            quaternion: cfToQuat(rootCF),
            userData: { asm }
        });
        this.world.removeBody(b);
        const inv = cfInverse(rootCF);
        for (const p of group) {
            const f = frames.get(p) || partCF(p);
            const rel = cfMul(inv, f);
            const m = { part: p, rel, shape: null };
            asm.members.push(m);
            p.ext.assembly = asm;
            p.ext.member = m;
            if (f !== partCF(p) && !cfNear(f, partCF(p))) this.setCFrameQuiet(p, f);
            m.shape = b.addShape(this.shapeDef(p, rel));
        }
        asm.body = b;
        if (!anchored) {
            const v = root.props.Velocity;
            if (v) b.vel = [v.x, v.y, v.z];
            const rv = root.props.RotVelocity;
            if (rv) b.angVel = [rv.x, rv.y, rv.z];
        }
        this.world.addBody(b);
        this.assemblies.add(asm);
        for (const m of asm.members) for (const j of m.part.ext.joints) if (!this.mergeKind(j) && this.joints.has(j)) this.dirtyJoints.add(j);
        return asm;
    }

    setCFrameQuiet(part, cf) {
        part.props.CFrame = cf;
        this.game.movedParts.add(part);
    }

    attFrame(att) {
        const p = att._parent;
        const lf = att.props.CFrame || new CFrame();
        return cfMul(partCF(p), lf);
    }

    buildJoint(j) {
        const x = j.ext;
        if (!x) return;
        if (x.pj) { this.world.removeJoint(x.pj); x.pj = null; }
        this.motors.delete(j);
        if (!this.joints.has(j) || !this.jointActive(j)) return;
        const kind = j.className;
        if (this.mergeKind(j)) return;
        let pa, pb, fa, fb;
        if (MOTOR_KINDS.has(kind)) {
            pa = j.props.Part0; pb = j.props.Part1;
            if (!pa || !pb) return;
            fa = cfMul(partCF(pa), j.props.C0 || new CFrame());
            fb = cfMul(partCF(pb), j.props.C1 || new CFrame());
        } else if (CONSTRAINT_KINDS.has(kind)) {
            const a0 = j.props.Attachment0, a1 = j.props.Attachment1;
            if (!a0 || !a1 || !a0._parent || !a1._parent) return;
            pa = a0._parent; pb = a1._parent;
            fa = this.attFrame(a0);
            fb = this.attFrame(a1);
        } else return;
        if (!pa.ext || !pb.ext || !pa.ext.assembly || !pb.ext.assembly) return;
        const A = pa.ext.assembly, B = pb.ext.assembly;
        if (A === B) return;
        const bodyA = A.body, bodyB = B.body;
        const toLocal = (asm, f) => cfMul(cfInverse(asm.rootCF), f);
        const la = toLocal(A, fa), lb = toLocal(B, fb);
        const axA = cfVec(la, new Vector3(0, 0, 1));
        const axB = cfVec(lb, new Vector3(0, 0, 1));
        const axAx = cfVec(la, new Vector3(1, 0, 0));
        const def = {
            bodyA: A.anchored ? null : bodyA,
            bodyB: B.anchored ? null : bodyB,
            localA: [la.m[0], la.m[1], la.m[2]],
            localB: [lb.m[0], lb.m[1], lb.m[2]],
            axisA: [axA.x, axA.y, axA.z],
            axisB: [axB.x, axB.y, axB.z],
            refA: [axAx.x, axAx.y, axAx.z]
        };
        if (A.anchored && B.anchored) return;
        if (A.anchored) { def.bodyA = null; def.localA = [fa.m[0], fa.m[1], fa.m[2]]; const w = cfVec(fa, new Vector3(0, 0, 1)); def.axisA = [w.x, w.y, w.z]; const wx = cfVec(fa, new Vector3(1, 0, 0)); def.refA = [wx.x, wx.y, wx.z]; }
        if (B.anchored) { def.bodyB = null; def.localB = [fb.m[0], fb.m[1], fb.m[2]]; const w = cfVec(fb, new Vector3(0, 0, 1)); def.axisB = [w.x, w.y, w.z]; }
        if (!def.bodyA) { const t = def.bodyA; def.bodyA = def.bodyB; def.bodyB = t; const ll = def.localA; def.localA = def.localB; def.localB = ll; const aa = def.axisA; def.axisA = def.axisB; def.axisB = aa; x.swapped = true; } else x.swapped = false;
        if (MOTOR_KINDS.has(kind) || kind === 'HingeConstraint') {
            def.type = 'hinge';
            if (kind === 'HingeConstraint') {
                if (j.props.LimitsEnabled) { def.lower = (j.props.LowerAngle || 0) * Math.PI / 180; def.upper = (j.props.UpperAngle || 0) * Math.PI / 180; }
                const act = enumValue(j.props.ActuatorType);
                if (act === 1) { def.motorEnabled = true; def.motorSpeed = j.props.AngularVelocity || 0; def.motorTorque = j.props.MotorMaxTorque === undefined ? 1e6 : j.props.MotorMaxTorque; }
            } else {
                def.motorEnabled = true;
                def.motorSpeed = 0;
                def.motorTorque = 1e6;
                this.motors.add(j);
            }
        } else if (kind === 'BallSocketConstraint') {
            def.type = 'ball';
            if (j.props.LimitsEnabled) def.maxCone = (j.props.UpperAngle || 45) * Math.PI / 180;
        } else if (kind === 'RopeConstraint' || kind === 'RodConstraint') {
            def.type = 'distance';
            def.length = j.props.Length !== undefined ? j.props.Length : Math.sqrt((fa.m[0] - fb.m[0]) ** 2 + (fa.m[1] - fb.m[1]) ** 2 + (fa.m[2] - fb.m[2]) ** 2);
            def.rope = kind === 'RopeConstraint';
        } else if (kind === 'SpringConstraint') {
            def.type = 'spring';
            def.length = j.props.FreeLength !== undefined ? j.props.FreeLength : 1;
            def.stiffness = j.props.Stiffness === undefined ? 0 : j.props.Stiffness;
            def.damping = j.props.Damping === undefined ? 0 : j.props.Damping;
        }
        if (j.props.CollideConnected === true) def.collide = true;
        x.pj = this.world.addJoint(def);
        A.joints.add(j);
        B.joints.add(j);
        x.A = A;
        x.B = B;
    }

    updateMotors(dt) {
        for (const j of this.motors) {
            const pj = j.ext && j.ext.pj;
            if (!pj) continue;
            const maxV = (j.props.MaxVelocity || 0) * 60;
            const des = j.props.DesiredAngle || 0;
            let cur = pj.angle || 0;
            if (j.ext.swapped) cur = -cur;
            let speed = 0;
            if (maxV > 0) {
                const err = des - cur;
                speed = Math.max(-maxV, Math.min(maxV, err / Math.max(dt, 1e-3)));
            }
            pj.motorSpeed = j.ext.swapped ? -speed : speed;
            if (cur !== j.props.CurrentAngle) j.props.CurrentAngle = cur;
            if (pj.a) pj.a.wake();
            if (pj.b) pj.b.wake();
        }
    }

    asmBody(part) {
        const a = part.ext && part.ext.assembly;
        return a ? a.body : null;
    }

    moveAssembly(part, cf) {
        const asm = part.ext && part.ext.assembly;
        if (!asm) { part.props.CFrame = cf; this.game.movedParts.add(part); return; }
        const m = part.ext.member;
        const rootCF = cfMul(cf, cfInverse(m.rel));
        asm.rootCF = rootCF;
        for (const mm of asm.members) {
            part_set: {
                mm.part.props.CFrame = cfMul(rootCF, mm.rel);
                this.game.movedParts.add(mm.part);
            }
        }
        asm.body.setTransform([rootCF.m[0], rootCF.m[1], rootCF.m[2]], cfToQuat(rootCF));
        for (const j of asm.joints) this.dirtyJoints.add(j);
    }

    setPartCFrame(part, cf) {
        if (part.ext && part.ext.noPhysics) { part.props.CFrame = cf; this.game.movedParts.add(part); return; }
        if (!part.ext || !part.ext.registered) { part.props.CFrame = cf; this.game.movedParts.add(part); return; }
        if (this.dirty.has(part)) { part.props.CFrame = cf; this.game.movedParts.add(part); return; }
        this.moveAssembly(part, cf);
    }

    applyBodyMovers(dt) {
        for (const mv of this.bodyMovers) {
            const part = mv._parent;
            if (!part || !part.ext || !part.ext.assembly) continue;
            const asm = part.ext.assembly;
            if (asm.anchored) continue;
            const b = asm.body;
            const p = mv.props;
            switch (mv.className) {
                case 'BodyForce': {
                    const f = p.Force || p.force;
                    if (f) b.applyForce([f.x, f.y, f.z]);
                    break;
                }
                case 'BodyThrust': {
                    const f = p.Force || p.force;
                    if (f) {
                        const w = cfVec(partCF(part), f);
                        b.applyForce([w.x, w.y, w.z], p.Location ? [p.Location.x, p.Location.y, p.Location.z] : undefined);
                    }
                    break;
                }
                case 'BodyVelocity': {
                    const mf = p.MaxForce || p.maxForce;
                    const tv = p.Velocity || p.velocity;
                    if (!mf || !tv) break;
                    const F = [0, 0, 0];
                    const t = [tv.x, tv.y, tv.z];
                    const m = [mf.x, mf.y, mf.z];
                    for (let i = 0; i < 3; i++) {
                        if (m[i] <= 0) continue;
                        const want = b.mass * (t[i] - b.vel[i]) / Math.max(dt, 1e-3) * 0.5;
                        F[i] = Math.max(-m[i], Math.min(m[i], want));
                    }
                    b.applyForce(F);
                    break;
                }
                case 'BodyPosition': {
                    const mf = p.MaxForce || p.maxForce;
                    const tp = p.Position || p.position;
                    if (!mf || !tp) break;
                    const P = p.P === undefined ? 10000 : p.P, D = p.D === undefined ? 500 : p.D;
                    const t = [tp.x, tp.y, tp.z];
                    const m = [mf.x, mf.y, mf.z];
                    const F = [0, 0, 0];
                    for (let i = 0; i < 3; i++) {
                        if (m[i] <= 0) continue;
                        const f = P * (t[i] - b.comW[i]) - D * b.vel[i];
                        F[i] = Math.max(-m[i], Math.min(m[i], f));
                    }
                    b.applyForce(F);
                    break;
                }
                case 'BodyGyro': {
                    const mt = p.MaxTorque || p.maxTorque;
                    const cf = p.CFrame || p.cframe;
                    if (!mt || !cf) break;
                    const P = p.P === undefined ? 3000 : p.P, D = p.D === undefined ? 500 : p.D;
                    const cur = b.quat;
                    const tq = cfToQuat(cf);
                    let dq = PX.math.qmul(tq, PX.math.qconj(cur));
                    if (dq[3] < 0) dq = dq.map(v => -v);
                    const s = Math.sqrt(Math.max(0, 1 - dq[3] * dq[3]));
                    const ang = 2 * Math.atan2(s, dq[3]);
                    const ax = s < 1e-6 ? [0, 0, 0] : [dq[0] / s, dq[1] / s, dq[2] / s];
                    const m = [mt.x, mt.y, mt.z];
                    const T = [0, 0, 0];
                    for (let i = 0; i < 3; i++) {
                        if (m[i] <= 0) continue;
                        const tr = P * ang * ax[i] - D * b.angVel[i];
                        T[i] = Math.max(-m[i], Math.min(m[i], tr));
                    }
                    b.applyTorque(T);
                    break;
                }
                case 'BodyAngularVelocity': {
                    const mt = p.MaxTorque || p.maxTorque;
                    const av = p.AngularVelocity || p.angularvelocity;
                    if (!mt || !av) break;
                    const t = [av.x, av.y, av.z];
                    const m = [mt.x, mt.y, mt.z];
                    const T = [0, 0, 0];
                    for (let i = 0; i < 3; i++) {
                        if (m[i] <= 0) continue;
                        T[i] = Math.max(-m[i], Math.min(m[i], (t[i] - b.angVel[i]) * 200));
                    }
                    b.applyTorque(T);
                    break;
                }
            }
        }
    }

    step(dt) {
        this.flush();
        this.accum += Math.min(dt, 0.1);
        let n = 0;
        while (this.accum >= this.fixedStep && n < this.maxSubsteps) {
            this.updateMotors(this.fixedStep);
            this.applyBodyMovers(this.fixedStep);
            this.world.step(this.fixedStep);
            this.simTime += this.fixedStep;
            this.accum -= this.fixedStep;
            n++;
            this.flush();
        }
        if (n === this.maxSubsteps) this.accum = 0;
        if (n > 0) this.syncBack();
    }

    syncBack() {
        const fallen = this.game.fallenHeight();
        const dead = [];
        for (const asm of this.assemblies) {
            if (asm.anchored) continue;
            const b = asm.body;
            if (!b || b.sleeping) continue;
            const cf = cfFromQuat(b.quat[0], b.quat[1], b.quat[2], b.quat[3], b.origin[0], b.origin[1], b.origin[2]);
            asm.rootCF = cf;
            for (const m of asm.members) {
                const f = cfMul(cf, m.rel);
                m.part.props.CFrame = f;
                m.part.props.Velocity = new Vector3(b.vel[0], b.vel[1], b.vel[2]);
                m.part.props.RotVelocity = new Vector3(b.angVel[0], b.angVel[1], b.angVel[2]);
                this.game.movedParts.add(m.part);
            }
            if (b.origin[1] < fallen) dead.push(asm);
        }
        for (const asm of dead) for (const m of asm.members.slice()) m.part.destroy();
    }

    raycast(origin, dir, maxDist, ignore, ignoreWater) {
        const ig = ignore || [];
        const hit = this.world.raycast([origin.x, origin.y, origin.z], [dir.x, dir.y, dir.z], maxDist, (s) => {
            const p = s.userData && s.userData.part;
            if (!p) return false;
            if (s.sensor && p.props.CanCollide === false) return false;
            if (p.props.Transparency === 1 && p.props.CanCollide === false) return false;
            for (const i of ig) if (p === i || p.isDescendantOf(i)) return false;
            if (this.game.rayFilter && !this.game.rayFilter(p)) return false;
            return true;
        });
        if (!hit) return null;
        return {
            part: hit.shape.userData.part,
            position: new Vector3(hit.point[0], hit.point[1], hit.point[2]),
            normal: new Vector3(hit.normal[0], hit.normal[1], hit.normal[2]),
            distance: hit.distance
        };
    }

    queryParts(mn, mx, ignore) {
        const out = [];
        const seen = new Set();
        for (const s of this.world.queryBox(mn, mx)) {
            const p = s.userData && s.userData.part;
            if (!p || seen.has(p)) continue;
            if (ignore && ignore.some(i => p === i || p.isDescendantOf(i))) continue;
            seen.add(p);
            out.push(p);
        }
        return out;
    }

    touching(part) {
        const out = [];
        for (const e of this.touch.values()) {
            if (e.a === part) out.push(e.b);
            else if (e.b === part) out.push(e.a);
        }
        return out;
    }

    addCharacterBody(part, size) {
        const b = this.world.createBody({ type: 'kinematic', position: [0, 0, 0], userData: { char: part } });
        this.world.removeBody(b);
        const sz = [size.x, size.y, size.z];
        b.addShape({ type: 'box', size: sz, sensor: false, friction: 0.3, density: 1, userData: { part } });
        b.addShape({ type: 'box', size: [sz[0] + 0.1, sz[1] + 0.1, sz[2] + 0.1], sensor: true, userData: { part } });
        this.world.addBody(b);
        this.characterBodies.set(part, b);
        return b;
    }

    moveCharacterPart(part, cf, dt) {
        const b = this.characterBodies.get(part);
        if (!b) return;
        b.moveKinematic([cf.m[0], cf.m[1], cf.m[2]], cfToQuat(cf), dt);
    }

    removeCharacterBody(part) {
        const b = this.characterBodies.get(part);
        if (!b) return;
        this.world.removeBody(b);
        this.characterBodies.delete(part);
    }
}

function cfNear(a, b) {
    for (let i = 0; i < 12; i++) if (Math.abs(a.m[i] - b.m[i]) > 1e-4) return false;
    return true;
}
const V3 = (x, y, z) => new Vector3(x, y, z);
const E = (enumName, itemName) => ENUMS[enumName].items[itemName];
const VALUE_CLASSES = new Set(['IntValue', 'NumberValue', 'StringValue', 'BoolValue', 'ObjectValue', 'Color3Value', 'BrickColorValue', 'Vector3Value', 'CFrameValue', 'RayValue']);

function eulerDeg(cf) {
    const e = cfEuler(cf);
    return V3(e[0] * R2D, e[1] * R2D, e[2] * R2D);
}

function capName(k) {
    let n = k.replace(/_xml$/, '');
    if (n.length && n[0] >= 'a' && n[0] <= 'z') n = n[0].toUpperCase() + n.slice(1);
    return n;
}

function partSetCFrame(s, cf) {
    s.game.phys.setPartCFrame(s, cf);
}

function setPartBrickColor(s, bc) {
    s.props.BrickColor = bc;
    const e = bc.entry;
    s.props.Color = new Color3(e[1] / 255, e[2] / 255, e[3] / 255);
}

defClass('PVInstance', 'Instance', {});
defClass('BasePart', 'PVInstance', {
    events: ['Touched', 'TouchEnded'],
    defaults: {
        Anchored: false, CanCollide: true, CanTouch: true, CFrame: () => new CFrame(), Size: () => V3(4, 1, 2),
        BrickColor: () => new BrickColor(194), Color: () => new Color3(163 / 255, 162 / 255, 165 / 255),
        Transparency: 0, Reflectance: 0, Material: () => E('Material', 'Plastic'), Shape: () => E('PartType', 'Block'),
        Friction: 0.3, Elasticity: 0.5, Locked: false, Velocity: () => V3(0, 0, 0), RotVelocity: () => V3(0, 0, 0),
        TopSurface: () => E('SurfaceType', 'Studs'), BottomSurface: () => E('SurfaceType', 'Inlet'),
        LeftSurface: () => E('SurfaceType', 'Smooth'), RightSurface: () => E('SurfaceType', 'Smooth'),
        FrontSurface: () => E('SurfaceType', 'Smooth'), BackSurface: () => E('SurfaceType', 'Smooth'),
        CastShadow: true, FormFactor: () => E('FormFactor', 'Custom')
    },
    getters: {
        Position: (s) => V3(s.props.CFrame.m[0], s.props.CFrame.m[1], s.props.CFrame.m[2]),
        Orientation: (s) => eulerDeg(s.props.CFrame),
        Rotation: (s) => eulerDeg(s.props.CFrame),
        AssemblyLinearVelocity: (s) => s.props.Velocity,
        AssemblyAngularVelocity: (s) => s.props.RotVelocity,
        Mass: (s) => partMass(s),
        Massless: () => false
    },
    setters: {
        CFrame: (s, v) => partSetCFrame(s, v),
        Position: (s, v) => { const m = s.props.CFrame.m.slice(); m[0] = v.x; m[1] = v.y; m[2] = v.z; partSetCFrame(s, new CFrame(m)); },
        Orientation: (s, v) => {
            const p = s.props.CFrame;
            const r = cfMul(cfMul(cfAngles(0, v.y / R2D, 0), cfAngles(v.x / R2D, 0, 0)), cfAngles(0, 0, v.z / R2D));
            r.m[0] = p.m[0]; r.m[1] = p.m[1]; r.m[2] = p.m[2];
            partSetCFrame(s, r);
        },
        Rotation: (s, v) => CLASSES.BasePart.setters.Orientation(s, v),
        Size: (s, v) => { s.props.Size = v; s.game.phys.markDirty(s); },
        Color: (s, v) => { s.props.Color = v; s.props.BrickColor = nearestBrickColor(v); },
        BrickColor: (s, v) => setPartBrickColor(s, v),
        Velocity: (s, v) => {
            s.props.Velocity = v;
            const b = s.game.phys.asmBody(s);
            if (b && b.type === 'dynamic') b.setVelocity([v.x, v.y, v.z]);
        },
        AssemblyLinearVelocity: (s, v) => CLASSES.BasePart.setters.Velocity(s, v),
        RotVelocity: (s, v) => {
            s.props.RotVelocity = v;
            const b = s.game.phys.asmBody(s);
            if (b && b.type === 'dynamic') b.setAngularVelocity([v.x, v.y, v.z]);
        },
        Anchored: (s, v) => { s.props.Anchored = !!v; s.game.phys.markDirty(s); },
        CanCollide: (s, v) => { s.props.CanCollide = !!v; s.game.phys.markDirty(s); },
        Shape: (s, v) => { s.props.Shape = v; s.game.phys.markDirty(s); },
        Friction: (s, v) => { s.props.Friction = v; s.game.phys.markDirty(s); },
        Elasticity: (s, v) => { s.props.Elasticity = v; s.game.phys.markDirty(s); },
        Name: (s, v) => { s.props.Name = String(v); }
    },
    methods: {
        GetMass: (s) => partMass(s),
        getMass: (s) => partMass(s),
        GetTouchingParts: (s) => tbl(s.game.phys.touching(s)),
        GetConnectedParts: (s, rec) => {
            const out = new Set();
            const q = [s];
            while (q.length) {
                const p = q.pop();
                for (const j of (p.ext && p.ext.joints) || []) {
                    for (const o of [j.props.Part0, j.props.Part1]) if (o && o !== s && !out.has(o)) { out.add(o); if (rec) q.push(o); }
                }
            }
            return tbl(Array.from(out));
        },
        BreakJoints: (s) => breakJoints(s),
        breakJoints: (s) => breakJoints(s),
        MakeJoints: (s) => makeJoints(s),
        makeJoints: (s) => makeJoints(s),
        SetNetworkOwner: () => {},
        SetNetworkOwnershipAuto: () => {},
        GetNetworkOwner: () => undefined,
        CanCollideWith: (s, o) => s.props.CanCollide !== false && o.props.CanCollide !== false,
        IsGrounded: (s) => !!(s.ext && s.ext.assembly && s.ext.assembly.anchored),
        GetRootPart: (s) => (s.ext && s.ext.assembly ? s.ext.assembly.root : s),
        Resize: (s, face, delta) => {
            const f = enumNum(face);
            const sz = s.props.Size;
            const axes = [[0, 1], [1, 1], [2, 1], [0, -1], [1, -1], [2, -1]][f];
            if (!axes) return false;
            const ns = [sz.x, sz.y, sz.z];
            ns[axes[0]] += delta;
            if (ns[axes[0]] <= 0) return false;
            const dir = [0, 0, 0];
            dir[axes[0]] = axes[1] * delta / 2;
            s.set('Size', V3(ns[0], ns[1], ns[2]));
            const off = cfVec(s.props.CFrame, V3(dir[0], dir[1], dir[2]));
            const m = s.props.CFrame.m.slice();
            m[0] += off.x; m[1] += off.y; m[2] += off.z;
            partSetCFrame(s, new CFrame(m));
            return true;
        },
        ApplyImpulse: (s, v) => { const b = s.game.phys.asmBody(s); if (b && b.type === 'dynamic') b.applyImpulse([v.x, v.y, v.z]); },
        ApplyAngularImpulse: (s, v) => { const b = s.game.phys.asmBody(s); if (b && b.type === 'dynamic') b.angVel = [b.angVel[0] + v.x / b.mass, b.angVel[1] + v.y / b.mass, b.angVel[2] + v.z / b.mass]; },
        GetVelocityAtPosition: (s, p) => { const b = s.game.phys.asmBody(s); if (!b) return V3(0, 0, 0); const v = b.velocityAt([p.x, p.y, p.z]); return V3(v[0], v[1], v[2]); }
    }
});

function partMass(s) {
    const b = s.game.phys.asmBody(s);
    const z = s.props.Size;
    const m = z.x * z.y * z.z * 0.7;
    if (b && b.mass > 0 && s.ext.assembly.members.length === 1) return b.mass;
    return m;
}

function breakJoints(s) {
    const targets = [];
    const collect = (o) => { if (o.isA('BasePart')) { for (const j of Array.from((o.ext && o.ext.joints) || [])) targets.push(j); } };
    if (s.isA('BasePart')) collect(s);
    else s.walk(collect);
    for (const j of targets) {
        if (WELD_KINDS.has(j.className) || FIXED_KINDS.has(j.className) || MOTOR_KINDS.has(j.className) || j.className === 'Glue') j.destroy();
    }
}

function makeJoints(s) {
    const parts = [];
    if (s.isA('BasePart')) parts.push(s);
    else s.walk(d => { if (d.isA('BasePart')) parts.push(d); });
    return;
}

defClass('Part', 'BasePart', {});
defClass('WedgePart', 'BasePart', {});
defClass('CornerWedgePart', 'BasePart', {});
defClass('TrussPart', 'BasePart', { defaults: { Size: () => V3(2, 2, 2) } });
defClass('SpawnLocation', 'Part', {
    defaults: { Size: () => V3(6, 1, 6), Neutral: true, Duration: 4, Enabled: true, AllowTeamChangeOnTouch: false, TeamColor: () => new BrickColor(194), Anchored: true },
    events: []
});
defClass('Seat', 'Part', { defaults: { Disabled: false, Occupant: undefined } });
defClass('VehicleSeat', 'BasePart', { defaults: { Disabled: false, Throttle: 0, Steer: 0, MaxSpeed: 25, Torque: 10, TurnSpeed: 1, Occupant: undefined, HeadsUpDisplay: true } });
defClass('MeshPart', 'BasePart', { defaults: { MeshId: '', TextureID: '' } });
defClass('UnionOperation', 'BasePart', {});
defClass('Terrain', 'BasePart', {});

defClass('Model', 'PVInstance', {
    defaults: { PrimaryPart: undefined },
    methods: {
        GetPrimaryPartCFrame: (s) => (s.props.PrimaryPart ? s.props.PrimaryPart.props.CFrame : modelCFrame(s)),
        SetPrimaryPartCFrame: (s, cf) => {
            const pp = s.props.PrimaryPart;
            if (!pp) throw new L.LuaError('SetPrimaryPartCFrame failed because no PrimaryPart has been set');
            modelTransform(s, cfMul(cf, cfInverse(pp.props.CFrame)));
        },
        GetModelCFrame: (s) => modelCFrame(s),
        GetModelSize: (s) => modelBounds(s).size,
        GetBoundingBox: (s) => { const b = modelBounds(s); return [new CFrame([b.center.x, b.center.y, b.center.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]), b.size]; },
        MoveTo: (s, pos) => {
            const b = modelBounds(s);
            const d = V3(pos.x - b.center.x, pos.y - b.center.y, pos.z - b.center.z);
            modelTransform(s, new CFrame([d.x, d.y, d.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
        },
        TranslateBy: (s, d) => modelTransform(s, new CFrame([d.x, d.y, d.z, 1, 0, 0, 0, 1, 0, 0, 0, 1])),
        BreakJoints: (s) => breakJoints(s),
        breakJoints: (s) => breakJoints(s),
        MakeJoints: (s) => makeJoints(s),
        makeJoints: (s) => makeJoints(s),
        GetExtentsSize: (s) => modelBounds(s).size
    }
});

function modelParts(s) {
    const out = [];
    s.walk(d => { if (d.isA('BasePart')) out.push(d); });
    return out;
}
function modelBounds(s) {
    const parts = modelParts(s);
    if (parts.length === 0) return { center: V3(0, 0, 0), size: V3(0, 0, 0) };
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) {
        const m = p.props.CFrame.m, z = p.props.Size;
        const hx = (Math.abs(m[3]) * z.x + Math.abs(m[4]) * z.y + Math.abs(m[5]) * z.z) / 2;
        const hy = (Math.abs(m[6]) * z.x + Math.abs(m[7]) * z.y + Math.abs(m[8]) * z.z) / 2;
        const hz = (Math.abs(m[9]) * z.x + Math.abs(m[10]) * z.y + Math.abs(m[11]) * z.z) / 2;
        mn = [Math.min(mn[0], m[0] - hx), Math.min(mn[1], m[1] - hy), Math.min(mn[2], m[2] - hz)];
        mx = [Math.max(mx[0], m[0] + hx), Math.max(mx[1], m[1] + hy), Math.max(mx[2], m[2] + hz)];
    }
    return { center: V3((mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2), size: V3(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) };
}
function modelCFrame(s) {
    const pp = s.props.PrimaryPart;
    if (pp) return pp.props.CFrame;
    const parts = modelParts(s);
    const b = modelBounds(s);
    const rot = parts.length ? parts[0].props.CFrame.m.slice(3) : [1, 0, 0, 0, 1, 0, 0, 0, 1];
    return new CFrame([b.center.x, b.center.y, b.center.z, ...rot]);
}
function modelTransform(s, delta) {
    const parts = modelParts(s);
    const targets = parts.map(p => cfMul(delta, p.props.CFrame));
    parts.forEach((p, i) => p.game.phys.setPartCFrame(p, targets[i]));
}

defClass('Folder', 'Instance', {});
defClass('Configuration', 'Instance', {});
defClass('Camera', 'Instance', {
    defaults: { CFrame: () => new CFrame([0, 10, 20, 1, 0, 0, 0, 1, 0, 0, 0, 1]), Focus: () => new CFrame(), FieldOfView: 70, CameraType: () => E('CameraType', 'Custom'), CameraSubject: undefined, ViewportSize: () => new Vector2(1280, 720), NearPlaneZ: -0.5 },
    methods: {
        GetRenderCFrame: (s) => s.props.CFrame,
        WorldToScreenPoint: (s, p) => worldToScreen(s, p),
        WorldToViewportPoint: (s, p) => worldToScreen(s, p),
        ViewportPointToRay: (s, x, y) => screenRay(s, x, y),
        ScreenPointToRay: (s, x, y) => screenRay(s, x, y)
    }
});
function worldToScreen(cam, p) {
    const vs = cam.props.ViewportSize;
    const cf = cam.props.CFrame;
    const d = cfPoint(cfInverse(cf), p);
    const f = 1 / Math.tan(cam.props.FieldOfView * Math.PI / 360);
    const aspect = vs.x / vs.y;
    const depth = -d.z;
    const nx = (d.x * f / aspect) / (depth || 1e-6);
    const ny = (d.y * f) / (depth || 1e-6);
    return [V3((nx * 0.5 + 0.5) * vs.x, (0.5 - ny * 0.5) * vs.y, depth), depth > 0 && Math.abs(nx) <= 1 && Math.abs(ny) <= 1];
}
function screenRay(cam, x, y) {
    const vs = cam.props.ViewportSize;
    const cf = cam.props.CFrame;
    const f = Math.tan(cam.props.FieldOfView * Math.PI / 360);
    const aspect = vs.x / vs.y;
    const nx = (x / vs.x) * 2 - 1;
    const ny = 1 - (y / vs.y) * 2;
    const dir = cfVec(cf, V3(nx * f * aspect, ny * f, -1));
    const l = dir.len() || 1;
    return new Ray(cf.luaIndex('Position'), V3(dir.x / l, dir.y / l, dir.z / l));
}

defClass('Humanoid', 'Instance', {
    events: ['Died', 'HealthChanged', 'Running', 'Jumping', 'Climbing', 'Seated', 'FreeFalling', 'GettingUp', 'StateChanged', 'Touched', 'MoveToFinished', 'Swimming', 'FallingDown', 'Strafing', 'PlatformStanding', 'Changed'],
    defaults: {
        Health: 100, MaxHealth: 100, WalkSpeed: 16, JumpPower: 50, HipHeight: 0, PlatformStand: false, Sit: false, Jump: false,
        AutoRotate: true, RigType: () => E('RigType', 'R6'), MoveDirection: () => V3(0, 0, 0), WalkToPoint: () => V3(0, 0, 0),
        WalkToPart: undefined, SeatPart: undefined, CameraOffset: () => V3(0, 0, 0), DisplayName: '', AutoJumpEnabled: true,
        DisplayDistanceType: () => E('HumanoidDisplayDistanceType', 'Viewer'), NameOcclusion: 0, RequiresNeck: true, BreakJointsOnDeath: true,
        Torso: undefined, LeftLeg: undefined, RightLeg: undefined, FloorMaterial: () => E('Material', 'Air'), MaxSlopeAngle: 89, AutoRotateInternal: true
    },
    getters: {
        Health: (s) => s.props.Health,
        Torso: (s) => s._parent ? s._parent.findChild('Torso') : undefined
    },
    setters: {
        Health: (s, v) => {
            v = Math.max(0, Math.min(s.props.MaxHealth, Number(v)));
            if (v !== v) return;
            const old = s.props.Health;
            s.props.Health = v;
            if (old !== v) s.fireSignal('HealthChanged', v);
            if (v <= 0 && !s.ext_dead) {
                s.ext_dead = true;
                s.fireSignal('Died');
                s.fireSignal('StateChanged', E('HumanoidStateType', 'Running'), E('HumanoidStateType', 'Dead'));
                s.game.humanoidDied(s);
            }
        },
        MaxHealth: (s, v) => { s.props.MaxHealth = v; if (s.props.Health > v) s.set('Health', v); },
        Jump: (s, v) => { s.props.Jump = !!v; },
        Sit: (s, v) => { s.props.Sit = !!v; if (!v) s.game.leaveSeat(s); }
    },
    methods: {
        TakeDamage: (s, d) => {
            const p = s._parent;
            if (p && p.children.some(c => c.className === 'ForceField')) return;
            if (s.props.Health > 0) s.set('Health', s.props.Health - d);
        },
        Move: (s, dir, rel) => { s.props.MoveDirection = dir; s.moveRequest = { dir, rel: rel === true }; },
        MoveTo: (s, pos, part) => { s.props.WalkToPoint = pos; s.props.WalkToPart = part; s.walkTo = { pos, part, t: s.game.state.scheduler.time }; },
        EquipTool: (s, tool) => s.game.equipTool(tool),
        UnequipTools: (s) => s.game.unequipTool(),
        GetState: (s) => E('HumanoidStateType', s.ext_dead ? 'Dead' : 'Running'),
        ChangeState: (s, st) => { if (enumNum(st) === 15) s.set('Health', 0); },
        SetStateEnabled: () => {},
        GetStateEnabled: () => true,
        LoadAnimation: (s, a) => new AnimationTrack(s.game, a),
        GetPlayingAnimationTracks: () => tbl([]),
        AddAccessory: (s, a) => { if (s._parent) a.set('Parent', s._parent); },
        RemoveAccessories: (s) => { if (s._parent) for (const c of s._parent.children.slice()) if (c.isA('Accoutrement')) c.destroy(); },
        GetAccessories: (s) => tbl(s._parent ? s._parent.children.filter(c => c.isA('Accoutrement')) : []),
        BuildRigFromAttachments: () => {},
        ApplyDescription: () => {}
    }
});

class AnimationTrack extends HostObject {
    constructor(game, anim) {
        super();
        this.game = game;
        this.anim = anim;
        this.playing = false;
        this.signals = {};
        this.IsPlaying = false;
        this.Looped = false;
        this.Priority = E('AnimationPriority', 'Core');
        this.Length = 1;
        this.Speed = 1;
        this.WeightCurrent = 1;
    }
    get luaType() { return 'AnimationTrack'; }
    sig(n) { return this.signals[n] || (this.signals[n] = new Signal(this.game, 'AnimationTrack.' + n)); }
    luaIndex(k) {
        switch (k) {
            case 'IsPlaying': return this.playing;
            case 'Looped': return this.Looped;
            case 'Priority': return this.Priority;
            case 'Length': return this.Length;
            case 'Speed': return this.Speed;
            case 'Animation': return this.anim;
            case 'Stopped': case 'KeyframeReached': case 'DidLoop': return this.sig(k);
            case 'Play': return (s) => { s.playing = true; };
            case 'Stop': return (s) => { s.playing = false; s.sig('Stopped').fire(); };
            case 'AdjustSpeed': return (s, v) => { s.Speed = v; };
            case 'AdjustWeight': return () => {};
            case 'GetTimeOfKeyframe': return () => 0;
        }
        return undefined;
    }
    luaNewIndex(k, v) { this[k] = v; }
}
AnimationTrack.luaName = 'AnimationTrack';

defClass('Animation', 'Instance', { defaults: { AnimationId: '' } });
defClass('Animator', 'Instance', { methods: { LoadAnimation: (s, a) => new AnimationTrack(s.game, a) } });

defClass('BackpackItem', 'Model', { defaults: { TextureId: '' } });
defClass('Tool', 'BackpackItem', {
    events: ['Equipped', 'Unequipped', 'Activated', 'Deactivated'],
    defaults: {
        CanBeDropped: true, RequiresHandle: true, Enabled: true, ToolTip: '', ManualActivationOnly: false,
        GripPos: () => V3(0, 0, 0), GripForward: () => V3(0, 0, -1), GripRight: () => V3(1, 0, 0), GripUp: () => V3(0, 1, 0)
    },
    getters: {
        Grip: (s) => gripOf(s),
        Handle: (s) => s.findChild('Handle')
    },
    setters: {
        Grip: (s, cf) => {
            s.props.GripPos = cf.luaIndex('Position');
            s.props.GripRight = cf.luaIndex('RightVector');
            s.props.GripUp = cf.luaIndex('UpVector');
            const lv = cf.luaIndex('LookVector');
            s.props.GripForward = lv;
        }
    },
    methods: {
        Activate: (s) => s.game.activateTool(s),
        Clone: (s) => s.clone()
    }
});
function gripOf(tool) {
    const p = tool.props;
    const f = p.GripForward, r = p.GripRight, u = p.GripUp, pos = p.GripPos;
    return new CFrame([pos.x, pos.y, pos.z, r.x, u.x, -f.x, r.y, u.y, -f.y, r.z, u.z, -f.z]);
}
defClass('HopperBin', 'BackpackItem', { events: ['Selected', 'Deselected'], defaults: { Active: false, BinType: 0 } });
defClass('Accoutrement', 'Instance', { defaults: { AttachmentPoint: () => new CFrame(), AttachmentPos: () => V3(0, 0, 0), AttachmentForward: () => V3(0, 0, -1), AttachmentRight: () => V3(1, 0, 0), AttachmentUp: () => V3(0, 1, 0) } });
defClass('Hat', 'Accoutrement', {});
defClass('Accessory', 'Accoutrement', {});

defClass('LuaSourceContainer', 'Instance', {});
defClass('BaseScript', 'LuaSourceContainer', { defaults: { Disabled: false, Source: '', LinkedSource: '' } });
defClass('Script', 'BaseScript', {});
defClass('LocalScript', 'BaseScript', {});
defClass('ModuleScript', 'LuaSourceContainer', { defaults: { Source: '', LinkedSource: '' } });

for (const vc of VALUE_CLASSES) {
    const dv = { IntValue: 0, NumberValue: 0, StringValue: '', BoolValue: false, ObjectValue: undefined, Color3Value: () => new Color3(), BrickColorValue: () => new BrickColor(194), Vector3Value: () => V3(0, 0, 0), CFrameValue: () => new CFrame(), RayValue: () => new Ray(V3(0, 0, 0), V3(0, 0, 0)) }[vc];
    defClass(vc, 'Instance', { defaults: { Value: dv } });
}

defClass('RemoteEvent', 'Instance', {
    events: ['OnServerEvent', 'OnClientEvent'],
    methods: {
        FireServer: (s, ...a) => { s.signal('OnServerEvent').fire(s.game.localPlayer, ...a); },
        FireClient: (s, p, ...a) => { s.signal('OnClientEvent').fire(...a); },
        FireAllClients: (s, ...a) => { s.signal('OnClientEvent').fire(...a); }
    }
});
defClass('RemoteFunction', 'Instance', {
    defaults: { OnServerInvoke: undefined, OnClientInvoke: undefined },
    methods: {
        InvokeServer: GEN(function* (s, ...a) { const f = s.props.OnServerInvoke; if (f === undefined) return []; return yield* L.call(f, [s.game.localPlayer, ...a]); }),
        InvokeClient: GEN(function* (s, p, ...a) { const f = s.props.OnClientInvoke; if (f === undefined) return []; return yield* L.call(f, a); })
    }
});
defClass('BindableEvent', 'Instance', {
    events: ['Event'],
    methods: { Fire: (s, ...a) => { s.signal('Event').fire(...a); } }
});
defClass('BindableFunction', 'Instance', {
    defaults: { OnInvoke: undefined },
    methods: { Invoke: GEN(function* (s, ...a) { const f = s.props.OnInvoke; if (f === undefined) return []; return yield* L.call(f, a); }) }
});

defClass('JointInstance', 'Instance', { defaults: { Part0: undefined, Part1: undefined, C0: () => new CFrame(), C1: () => new CFrame(), Enabled: true } });
for (const n of ['Weld', 'ManualWeld', 'Snap', 'Glue', 'Motor6D', 'Motor', 'VelocityMotor']) {
    const extra = {};
    if (n === 'Motor' || n === 'VelocityMotor') { extra.MaxVelocity = 0; extra.DesiredAngle = 0; extra.CurrentAngle = 0; }
    if (n === 'Motor6D') extra.Transform = () => new CFrame();
    defClass(n, 'JointInstance', { defaults: extra });
}
defClass('WeldConstraint', 'Instance', { defaults: { Part0: undefined, Part1: undefined, Enabled: true } });
defClass('Attachment', 'Instance', {
    defaults: { CFrame: () => new CFrame() },
    getters: {
        Position: (s) => s.props.CFrame.luaIndex('Position'),
        Orientation: (s) => eulerDeg(s.props.CFrame),
        WorldPosition: (s) => (s._parent && s._parent.isA('BasePart') ? cfPoint(s._parent.props.CFrame, s.props.CFrame.luaIndex('Position')) : V3(0, 0, 0)),
        WorldCFrame: (s) => (s._parent && s._parent.isA('BasePart') ? cfMul(s._parent.props.CFrame, s.props.CFrame) : s.props.CFrame)
    },
    setters: {
        Position: (s, v) => { const m = s.props.CFrame.m.slice(); m[0] = v.x; m[1] = v.y; m[2] = v.z; s.props.CFrame = new CFrame(m); s.game.phys.attachJoint && s.game.constraintsTouch(s); },
        CFrame: (s, v) => { s.props.CFrame = v; s.game.constraintsTouch(s); }
    }
});
defClass('Constraint', 'Instance', { defaults: { Attachment0: undefined, Attachment1: undefined, Enabled: true, Visible: false, Color: () => new BrickColor(194) } });
defClass('HingeConstraint', 'Constraint', { defaults: { LimitsEnabled: false, LowerAngle: -45, UpperAngle: 45, ActuatorType: () => E('ActuatorType', 'None'), AngularVelocity: 0, MotorMaxTorque: 0, TargetAngle: 0, CurrentAngle: 0, CollideConnected: false } });
defClass('BallSocketConstraint', 'Constraint', { defaults: { LimitsEnabled: false, UpperAngle: 45, CollideConnected: false } });
defClass('RopeConstraint', 'Constraint', { defaults: { Length: 10, Thickness: 0.1 } });
defClass('RodConstraint', 'Constraint', { defaults: { Length: 5 } });
defClass('SpringConstraint', 'Constraint', { defaults: { FreeLength: 1, Stiffness: 0, Damping: 0, Coils: 8, Radius: 0.4, Thickness: 0.1 } });

defClass('BodyMover', 'Instance', {});
defClass('BodyForce', 'BodyMover', { defaults: { Force: () => V3(0, 0, 0) } });
defClass('BodyThrust', 'BodyMover', { defaults: { Force: () => V3(0, 0, 0), Location: () => V3(0, 0, 0) } });
defClass('BodyVelocity', 'BodyMover', { defaults: { Velocity: () => V3(0, 0, 0), MaxForce: () => V3(4000, 4000, 4000), P: 1250 } });
defClass('BodyPosition', 'BodyMover', { defaults: { Position: () => V3(0, 0, 0), MaxForce: () => V3(4000, 4000, 4000), P: 10000, D: 500 } });
defClass('BodyGyro', 'BodyMover', { defaults: { CFrame: () => new CFrame(), MaxTorque: () => V3(400000, 0, 400000), P: 3000, D: 500 } });
defClass('BodyAngularVelocity', 'BodyMover', { defaults: { AngularVelocity: () => V3(0, 0, 0), MaxTorque: () => V3(4000, 4000, 4000), P: 1250 } });

defClass('DataModelMesh', 'Instance', { defaults: { Scale: () => V3(1, 1, 1), Offset: () => V3(0, 0, 0), VertexColor: () => V3(1, 1, 1) } });
defClass('SpecialMesh', 'DataModelMesh', { defaults: { MeshType: () => E('MeshType', 'Head'), MeshId: '', TextureId: '' } });
defClass('BlockMesh', 'DataModelMesh', {});
defClass('CylinderMesh', 'DataModelMesh', {});
defClass('FileMesh', 'DataModelMesh', { defaults: { MeshId: '', TextureId: '' } });
defClass('FaceInstance', 'Instance', { defaults: { Face: () => E('NormalId', 'Front') } });
defClass('Decal', 'FaceInstance', { defaults: { Texture: '', Transparency: 0, Color3: () => new Color3(1, 1, 1), Shiny: 20, Specular: 0 } });
defClass('Texture', 'Decal', { defaults: { StudsPerTileU: 2, StudsPerTileV: 2, OffsetStudsU: 0, OffsetStudsV: 0 } });

defClass('Fire', 'Instance', { defaults: { Color: () => new Color3(1, 0.5, 0), SecondaryColor: () => new Color3(1, 0, 0), Heat: 9, Size: 5, Enabled: true } });
defClass('Smoke', 'Instance', { defaults: { Color: () => new Color3(1, 1, 1), Opacity: 0.5, RiseVelocity: 1, Size: 1, Enabled: true } });
defClass('Sparkles', 'Instance', { defaults: { SparkleColor: () => new Color3(0.56, 0.9, 1), Enabled: true } });
defClass('ForceField', 'Instance', { defaults: { Visible: true } });
defClass('ParticleEmitter', 'Instance', {
    defaults: {
        Enabled: true, Rate: 20, Lifetime: () => new NumberRange(5, 10), Speed: () => new NumberRange(5, 5), Size: () => new Keypoints('number', [new KeypointItem(0, 1), new KeypointItem(1, 1)]),
        Color: () => new Keypoints('color', [new KeypointItem(0, new Color3(1, 1, 1)), new KeypointItem(1, new Color3(1, 1, 1))]),
        Transparency: () => new Keypoints('number', [new KeypointItem(0, 0), new KeypointItem(1, 0)]), Texture: '', Acceleration: () => V3(0, 0, 0), Drag: 0,
        SpreadAngle: () => new Vector2(0, 0), Rotation: () => new NumberRange(0, 0), RotSpeed: () => new NumberRange(0, 0), LightEmission: 0, EmissionDirection: () => E('NormalId', 'Top'),
        VelocityInheritance: 0, LockedToPart: false
    },
    methods: { Emit: (s, n) => s.game.hooks.emit && s.game.hooks.emit(s, n === undefined ? 1 : n) }
});
defClass('Light', 'Instance', { defaults: { Brightness: 1, Color: () => new Color3(1, 1, 1), Enabled: true, Shadows: false } });
defClass('PointLight', 'Light', { defaults: { Range: 8 } });
defClass('SpotLight', 'Light', { defaults: { Range: 16, Angle: 90, Face: () => E('NormalId', 'Front') } });
defClass('SurfaceLight', 'Light', { defaults: { Range: 16, Angle: 90, Face: () => E('NormalId', 'Front') } });
defClass('Explosion', 'Instance', {
    events: ['Hit'],
    defaults: { BlastRadius: 4, BlastPressure: 500000, DestroyJointRadiusPercent: 1, ExplosionType: () => E('ExplosionType', 'Craters'), Position: () => V3(0, 0, 0), Visible: true }
});
defClass('Sound', 'Instance', {
    events: ['Ended', 'Played', 'Paused', 'Resumed', 'Loaded'],
    defaults: { SoundId: '', Volume: 0.5, Pitch: 1, PlaybackSpeed: 1, Looped: false, Playing: false, TimePosition: 0, PlayOnRemove: false, IsPaused: false, RollOffMode: 0, MaxDistance: 10000, EmitterSize: 10 },
    getters: { IsPlaying: (s) => !!s.props.Playing, TimeLength: (s) => s.ext_length || 0, IsLoaded: () => true },
    setters: {
        Playing: (s, v) => { s.props.Playing = !!v; s.game.soundChanged(s, !!v ? 'play' : 'stop'); },
        Volume: (s, v) => { s.props.Volume = v; s.game.soundChanged(s, 'volume'); },
        TimePosition: (s, v) => { s.props.TimePosition = v; s.game.soundChanged(s, 'seek'); }
    },
    methods: {
        Play: (s) => { s.props.Playing = true; s.props.IsPaused = false; s.game.soundChanged(s, 'play'); s.fireSignal('Played'); },
        Stop: (s) => { s.props.Playing = false; s.props.TimePosition = 0; s.game.soundChanged(s, 'stop'); },
        Pause: (s) => { s.props.Playing = false; s.props.IsPaused = true; s.game.soundChanged(s, 'pause'); s.fireSignal('Paused'); },
        Resume: (s) => { s.props.Playing = true; s.props.IsPaused = false; s.game.soundChanged(s, 'play'); s.fireSignal('Resumed'); }
    }
});
defClass('SoundGroup', 'Instance', { defaults: { Volume: 1 } });
defClass('ClickDetector', 'Instance', { events: ['MouseClick', 'MouseHoverEnter', 'MouseHoverLeave', 'RightMouseClick'], defaults: { MaxActivationDistance: 32 } });
defClass('Team', 'Instance', { defaults: { TeamColor: () => new BrickColor(194), AutoAssignable: true } });
defClass('BodyColors', 'Instance', { defaults: { HeadColor: () => new BrickColor(24), TorsoColor: () => new BrickColor(23), LeftArmColor: () => new BrickColor(24), RightArmColor: () => new BrickColor(24), LeftLegColor: () => new BrickColor(37), RightLegColor: () => new BrickColor(37) } });
defClass('Shirt', 'Instance', { defaults: { ShirtTemplate: '' } });
defClass('Pants', 'Instance', { defaults: { PantsTemplate: '' } });
defClass('ShirtGraphic', 'Instance', { defaults: { Graphic: '' } });
defClass('CharacterMesh', 'Instance', { defaults: { MeshId: 0, BaseTextureId: 0, OverlayTextureId: 0, BodyPart: 0 } });
defClass('SelectionBox', 'Instance', { defaults: { Adornee: undefined, Color: () => new BrickColor(21), LineThickness: 0.02, Visible: true } });
defClass('Hint', 'Instance', { defaults: { Text: '' } });
defClass('Message', 'Instance', { defaults: { Text: '' } });
defClass('StringValueDummy', 'Instance', {});

defClass('GuiBase', 'Instance', {});
defClass('LayerCollector', 'GuiBase', { defaults: { Enabled: true } });
defClass('ScreenGui', 'LayerCollector', { defaults: { ResetOnSpawn: true, DisplayOrder: 0 } });
defClass('BillboardGui', 'LayerCollector', { defaults: { Adornee: undefined, Size: () => new UDim2(0, 100, 0, 100), StudsOffset: () => V3(0, 0, 0), AlwaysOnTop: false, ExtentsOffset: () => V3(0, 0, 0), Active: false } });
defClass('SurfaceGui', 'LayerCollector', { defaults: { Adornee: undefined, Face: () => E('NormalId', 'Front'), CanvasSize: () => new Vector2(800, 600), AlwaysOnTop: false } });
defClass('GuiObject', 'GuiBase', {
    defaults: {
        Position: () => new UDim2(0, 0, 0, 0), Size: () => new UDim2(0, 100, 0, 100), BackgroundColor3: () => new Color3(0.64, 0.64, 0.64),
        BackgroundTransparency: 0, BorderColor3: () => new Color3(0.1, 0.1, 0.1), BorderSizePixel: 1, Visible: true, ZIndex: 1, Active: false,
        ClipsDescendants: false, Rotation: 0, AnchorPoint: () => new Vector2(0, 0), LayoutOrder: 0, SizeConstraint: () => E('SizeConstraint', 'RelativeXY'), Draggable: false
    },
    events: ['InputBegan', 'InputEnded', 'InputChanged', 'MouseEnter', 'MouseLeave', 'MouseMoved', 'MouseButton1Down', 'MouseButton1Up', 'MouseButton2Down', 'MouseButton2Up']
});
defClass('Frame', 'GuiObject', { defaults: { Style: 0 } });
defClass('GuiLabel', 'GuiObject', {});
defClass('GuiButton', 'GuiObject', { events: ['MouseButton1Click', 'MouseButton2Click', 'Activated'], defaults: { AutoButtonColor: true, Selected: false, Modal: false } });
const TEXT_DEFAULTS = { Text: '', TextColor3: () => new Color3(0.1, 0.1, 0.1), TextSize: 14, FontSize: 2, Font: () => E('Font', 'Legacy'), TextWrapped: false, TextScaled: false, TextTransparency: 0, TextStrokeTransparency: 1, TextStrokeColor3: () => new Color3(0, 0, 0), TextXAlignment: () => E('TextXAlignment', 'Center'), TextYAlignment: () => E('TextYAlignment', 'Center'), TextBounds: () => new Vector2(0, 0) };
defClass('TextLabel', 'GuiLabel', { defaults: TEXT_DEFAULTS });
defClass('TextButton', 'GuiButton', { defaults: TEXT_DEFAULTS });
defClass('TextBox', 'GuiObject', { defaults: Object.assign({ ClearTextOnFocus: true, MultiLine: false, PlaceholderText: '', PlaceholderColor3: () => new Color3(0.7, 0.7, 0.7) }, TEXT_DEFAULTS), events: ['FocusLost', 'Focused'], methods: { CaptureFocus: () => {}, ReleaseFocus: () => {}, IsFocused: () => false } });
const IMG_DEFAULTS = { Image: '', ImageTransparency: 0, ImageColor3: () => new Color3(1, 1, 1), ScaleType: () => E('ScaleType', 'Stretch'), SliceCenter: undefined, ImageRectOffset: () => new Vector2(0, 0), ImageRectSize: () => new Vector2(0, 0) };
defClass('ImageLabel', 'GuiLabel', { defaults: IMG_DEFAULTS });
defClass('ImageButton', 'GuiButton', { defaults: IMG_DEFAULTS });
defClass('ScrollingFrame', 'GuiObject', { defaults: { CanvasSize: () => new UDim2(0, 0, 2, 0), ScrollBarThickness: 12, CanvasPosition: () => new Vector2(0, 0) } });
defClass('UIListLayout', 'Instance', { defaults: { FillDirection: () => E('FillDirection', 'Vertical'), Padding: () => new UDim(0, 0), SortOrder: 0 } });
defClass('UICorner', 'Instance', { defaults: { CornerRadius: () => new UDim(0, 8) } });

defClass('Player', 'Instance', {
    events: ['CharacterAdded', 'CharacterRemoving', 'Chatted', 'Idled'],
    defaults: { UserId: 1, Character: undefined, Team: undefined, TeamColor: () => new BrickColor(194), AccountAge: 365, MembershipType: 0, CharacterAppearance: '', CameraMode: 0, Neutral: true, DisplayName: '', FollowUserId: 0, CanLoadCharacterAppearance: true, Guest: false },
    getters: {
        Backpack: (s) => s.findChild('Backpack'),
        PlayerGui: (s) => s.findChild('PlayerGui'),
        PlayerScripts: (s) => s.findChild('PlayerScripts'),
        StarterGear: (s) => s.findChild('StarterGear')
    },
    methods: {
        Kick: (s, m) => { s.game.kick(m); },
        LoadCharacter: (s) => { s.game.loadCharacter(); },
        GetMouse: (s) => s.game.mouse,
        IsFriendsWith: () => false,
        IsInGroup: () => false,
        GetRankInGroup: () => 0,
        GetRoleInGroup: () => 'Guest',
        HasAppearanceLoaded: () => true,
        DistanceFromCharacter: (s, p) => { const c = s.props.Character; const h = c && c.findChild('HumanoidRootPart'); return h ? cfPoint(h.props.CFrame, V3(0, 0, 0)).luaIndex('Magnitude') * 0 + Math.sqrt((h.props.CFrame.m[0] - p.x) ** 2 + (h.props.CFrame.m[1] - p.y) ** 2 + (h.props.CFrame.m[2] - p.z) ** 2) : 0; },
        ClearCharacterAppearance: () => {},
        LoadCharacterAppearance: () => {},
        Move: () => {}
    }
});
defClass('Backpack', 'Instance', {});
defClass('PlayerGui', 'Instance', { methods: { SetTopbarTransparency: () => {}, GetGuiObjectsAtPosition: () => tbl([]) } });
defClass('PlayerScripts', 'Instance', {});
defClass('StarterGear', 'Instance', {});

defClass('Service', 'Instance', { creatable: false });
defClass('Workspace', 'Service', {
    events: ['ChildAdded'],
    defaults: { Gravity: 196.2, FallenPartsDestroyHeight: -500, CurrentCamera: undefined, FilteringEnabled: false, StreamingEnabled: false, Terrain: undefined, DistributedGameTime: 0, AllowThirdPartySales: false },
    getters: { DistributedGameTime: (s) => s.game.state.scheduler.time },
    setters: { Gravity: (s, v) => { s.props.Gravity = v; s.game.phys.setGravity(v); } },
    methods: {
        FindPartOnRay: (s, ray, ignore) => {
            const r = s.game.phys.raycast(ray.Origin, ray.Direction, ray.Direction.len(), ignore ? (ignore instanceof Instance ? [ignore] : ignore.arr) : []);
            if (!r) return [undefined, cfPoint(new CFrame([ray.Origin.x + ray.Direction.x, ray.Origin.y + ray.Direction.y, ray.Origin.z + ray.Direction.z, 1, 0, 0, 0, 1, 0, 0, 0, 1]), V3(0, 0, 0)), V3(0, 1, 0), E('Material', 'Plastic')];
            return [r.part, r.position, r.normal, r.part.props.Material];
        },
        FindPartOnRayWithIgnoreList: (s, ray, ignore) => CLASSES.Workspace.methods.FindPartOnRay(s, ray, ignore),
        FindPartOnRayWithWhitelist: (s, ray) => CLASSES.Workspace.methods.FindPartOnRay(s, ray),
        Raycast: (s, origin, dir, params) => {
            const ig = params && params.ignore ? params.ignore : [];
            const r = s.game.phys.raycast(origin, dir, dir.len(), ig);
            if (!r) return undefined;
            return new RaycastResult(r);
        },
        FindPartsInRegion3: (s, reg, ignore, max) => tbl(s.game.phys.queryParts([reg.Min.x, reg.Min.y, reg.Min.z], [reg.Max.x, reg.Max.y, reg.Max.z], ignore ? [ignore] : null).slice(0, max || 20)),
        FindPartsInRegion3WithIgnoreList: (s, reg, ignore, max) => tbl(s.game.phys.queryParts([reg.Min.x, reg.Min.y, reg.Min.z], [reg.Max.x, reg.Max.y, reg.Max.z], ignore ? ignore.arr : null).slice(0, max || 20)),
        GetPartBoundsInRadius: (s, pos, r) => tbl(s.game.phys.queryParts([pos.x - r, pos.y - r, pos.z - r], [pos.x + r, pos.y + r, pos.z + r])),
        GetPartBoundsInBox: (s, cf, size) => { const r = Math.max(size.x, size.y, size.z); return tbl(s.game.phys.queryParts([cf.m[0] - r, cf.m[1] - r, cf.m[2] - r], [cf.m[0] + r, cf.m[1] + r, cf.m[2] + r])); },
        BreakJoints: (s) => breakJoints(s),
        MakeJoints: () => {},
        GetServerTimeNow: () => Date.now() / 1000,
        FindFirstChild: (s, n, r) => s.findChild(n, r === true)
    }
});
class RaycastResult extends HostObject {
    constructor(r) { super(); this.r = r; }
    get luaType() { return 'RaycastResult'; }
    luaIndex(k) {
        switch (k) {
            case 'Instance': return this.r.part;
            case 'Position': return this.r.position;
            case 'Normal': return this.r.normal;
            case 'Distance': return this.r.distance;
            case 'Material': return this.r.part.props.Material;
        }
        return undefined;
    }
    luaNewIndex() {}
}
class RaycastParams extends HostObject {
    constructor() { super(); this.ignore = []; this.FilterType = 0; }
    get luaType() { return 'RaycastParams'; }
    luaIndex(k) {
        if (k === 'FilterDescendantsInstances') return tbl(this.ignore.slice());
        if (k === 'FilterType') return this.FilterType;
        return this[k];
    }
    luaNewIndex(k, v) {
        if (k === 'FilterDescendantsInstances') this.ignore = v instanceof L.LuaTable ? v.arr.slice() : [];
        else this[k] = v;
    }
}
defClass('Lighting', 'Service', {
    defaults: {
        Ambient: () => new Color3(0, 0, 0), OutdoorAmbient: () => new Color3(0.5, 0.5, 0.5), Brightness: 1, ColorShift_Top: () => new Color3(0, 0, 0), ColorShift_Bottom: () => new Color3(0, 0, 0),
        FogColor: () => new Color3(0.75, 0.75, 0.75), FogStart: 0, FogEnd: 100000, GlobalShadows: true, TimeOfDay: '14:00:00', ClockTime: 14, GeographicLatitude: 41.7333, Outlines: true, ShadowColor: () => new Color3(0.7, 0.7, 0.72), ExposureCompensation: 0
    },
    setters: {
        TimeOfDay: (s, v) => { s.props.TimeOfDay = String(v); const p = String(v).split(':').map(Number); s.props.ClockTime = (p[0] || 0) + (p[1] || 0) / 60 + (p[2] || 0) / 3600; },
        ClockTime: (s, v) => { s.props.ClockTime = v; const h = Math.floor(v), m = Math.floor((v - h) * 60), sc = Math.floor(((v - h) * 60 - m) * 60); s.props.TimeOfDay = [h, m, sc].map(n => String(n).padStart(2, '0')).join(':'); }
    },
    methods: { GetMinutesAfterMidnight: (s) => s.props.ClockTime * 60, SetMinutesAfterMidnight: (s, m) => s.set('ClockTime', m / 60) }
});
defClass('Sky', 'Instance', { defaults: { SkyboxBk: '', SkyboxDn: '', SkyboxFt: '', SkyboxLf: '', SkyboxRt: '', SkyboxUp: '', CelestialBodiesShown: true, StarCount: 3000, SunAngularSize: 21, MoonAngularSize: 11 } });
defClass('Atmosphere', 'Instance', { defaults: { Density: 0.395, Color: () => new Color3(0.78, 0.67, 0.5), Haze: 0 } });
for (const n of ['BloomEffect', 'BlurEffect', 'SunRaysEffect', 'ColorCorrectionEffect', 'DepthOfFieldEffect']) defClass(n, 'Instance', { defaults: { Enabled: true, Intensity: 0.4, Size: 24, Brightness: 0, Contrast: 0, Saturation: 0, TintColor: () => new Color3(1, 1, 1) } });

defClass('Players', 'Service', {
    events: ['PlayerAdded', 'PlayerRemoving'],
    defaults: { RespawnTime: 5, CharacterAutoLoads: true, MaxPlayers: 12, NumPlayers: 1 },
    getters: { LocalPlayer: (s) => s.game.localPlayer, NumPlayers: () => 1 },
    methods: {
        GetPlayers: (s) => tbl(s.game.localPlayer ? [s.game.localPlayer] : []),
        GetPlayerFromCharacter: (s, c) => (s.game.localPlayer && s.game.localPlayer.props.Character === c ? s.game.localPlayer : undefined),
        GetPlayerByUserId: (s, id) => (s.game.localPlayer && s.game.localPlayer.props.UserId === id ? s.game.localPlayer : undefined),
        GetUserIdFromNameAsync: () => 1,
        GetNameFromUserIdAsync: (s) => s.game.localPlayer.props.Name,
        FindFirstChild: (s, n, r) => s.findChild(n, r === true),
        Chat: () => {},
        ReportAbuse: () => {},
        playerFromCharacter: (s, c) => (s.game.localPlayer && s.game.localPlayer.props.Character === c ? s.game.localPlayer : undefined),
        GetPlayerFromCharacterLegacy: () => undefined
    }
});
for (const n of ['ReplicatedStorage', 'ServerStorage', 'ServerScriptService', 'StarterPack', 'StarterGui', 'StarterPlayer', 'StarterPlayerScripts', 'StarterCharacterScripts', 'ReplicatedFirst', 'Teams', 'SoundService', 'Chat', 'CollectionService', 'PhysicsService', 'BadgeService', 'TeleportService', 'MarketplaceService', 'PointsService', 'GuiService', 'InsertService', 'AdService', 'TextService', 'LogService', 'NotificationService', 'ScriptService', 'ContentProvider', 'GroupService', 'FriendService', 'Selection', 'ChangeHistoryService', 'CSGDictionaryService', 'NonReplicatedCSGDictionaryService', 'AssetService', 'SocialService', 'GamePassService', 'CookiesService', 'TimerService', 'FWService', 'RenderHooksService', 'Geometry', 'ScriptInformationProvider', 'KeyboardService', 'MouseService', 'DataStoreService', 'PathfindingService', 'LocalizationService', 'StarterPlayerService']) {
    defClass(n, 'Service', n === 'StarterPlayer' ? { defaults: { CameraMaxZoomDistance: 400, CameraMinZoomDistance: 0.5, CharacterWalkSpeed: 16, CharacterJumpPower: 50, HealthDisplayDistance: 100, NameDisplayDistance: 100, EnableMouseLockOption: true, AutoJumpEnabled: true } } : {});
}
CLASSES.SoundService.methods = { PlayLocalSound: (s, snd) => { snd.set('Playing', true); }, SetListener: () => {}, GetListener: () => undefined };
CLASSES.SoundService.defaults = { AmbientReverb: 0, DistanceFactor: 3.33, DopplerScale: 1, RolloffScale: 1 };
CLASSES.StarterGui.methods = { SetCoreGuiEnabled: () => {}, SetCore: () => {}, GetCore: () => undefined, GetCoreGuiEnabled: () => true };
CLASSES.StarterGui.defaults = { ShowDevelopmentGui: true };
CLASSES.GuiService.methods = { GetGuiInset: () => [V3(0, 36, 0), V3(0, 0, 0)], IsTenFootInterface: () => false, AddKey: () => {}, SetMenuIsOpen: () => {} };
CLASSES.CollectionService.methods = {
    AddTag: (s, i, t) => { if (!i.tags) i.tags = new Set(); i.tags.add(t); },
    RemoveTag: (s, i, t) => { if (i.tags) i.tags.delete(t); },
    HasTag: (s, i, t) => !!(i.tags && i.tags.has(t)),
    GetTags: (s, i) => tbl(i.tags ? Array.from(i.tags) : []),
    GetTagged: (s, t) => tbl(s.game.root.descendants().filter(d => d.tags && d.tags.has(t)))
};
CLASSES.PhysicsService.methods = { CreateCollisionGroup: () => {}, SetPartCollisionGroup: () => {}, CollisionGroupSetCollidable: () => {}, RegisterCollisionGroup: () => {}, CollisionGroupContainsPart: () => false };
CLASSES.BadgeService.methods = { AwardBadge: () => true, UserHasBadge: () => false, UserHasBadgeAsync: () => false };
CLASSES.TeleportService.methods = { Teleport: () => {}, TeleportToPlaceInstance: () => {}, GetLocalPlayerTeleportData: () => undefined, TeleportToSpawnByName: () => {} };
CLASSES.MarketplaceService.events = ['PromptPurchaseFinished', 'PromptProductPurchaseFinished'];
CLASSES.MarketplaceService.methods = {
    GetProductInfo: () => { const t = new L.LuaTable(); t.set('Name', 'Item'); t.set('Description', ''); t.set('PriceInRobux', 0); t.set('AssetTypeId', 0); t.set('Creator', new L.LuaTable()); return t; },
    PlayerOwnsAsset: () => false, UserOwnsGamePassAsync: () => false, PromptPurchase: () => {}, PromptGamePassPurchase: () => {}
};
CLASSES.PointsService.methods = { AwardPoints: () => 0, GetAwardablePoints: () => 0, GetGamePointBalance: () => 0, GetPointBalance: () => 0 };
CLASSES.TextService.methods = { GetTextSize: (s, text, size) => new Vector2(String(text).length * size * 0.5, size) };
CLASSES.ContentProvider.methods = { PreloadAsync: () => {}, Preload: () => {} };
CLASSES.InsertService.methods = { LoadAsset: () => { throw new L.LuaError('InsertService is not supported offline'); } };
CLASSES.Teams.methods = { GetTeams: (s) => tbl(s.children.filter(c => c.className === 'Team')) };
CLASSES.ReplicatedFirst.methods = { RemoveDefaultLoadingScreen: () => {}, IsFinishedReplicating: () => true };
CLASSES.DataStoreService.methods = { GetDataStore: () => { throw new L.LuaError('DataStore is not available'); } };
CLASSES.PathfindingService.methods = { FindPathAsync: () => { throw new L.LuaError('Pathfinding is not available'); } };

defClass('Debris', 'Service', {
    defaults: { MaxItems: 1000 },
    methods: {
        AddItem: (s, inst, t) => {
            if (!(inst instanceof Instance)) return;
            s.game.state.scheduler.add(() => { if (!inst.destroyed) inst.destroy(); }, [], t === undefined ? 10 : t);
        },
        addItem: (s, inst, t) => CLASSES.Debris.methods.AddItem(s, inst, t)
    }
});
defClass('RunService', 'Service', {
    events: ['Heartbeat', 'RenderStepped', 'Stepped'],
    methods: {
        IsClient: () => true, IsServer: () => true, IsStudio: () => false, IsRunning: () => true, IsRunMode: () => true, IsEdit: () => false,
        BindToRenderStep: (s, name, pri, fn) => { s.game.renderBinds.set(name, { fn, pri }); },
        UnbindFromRenderStep: (s, name) => { s.game.renderBinds.delete(name); },
        Run: () => {}, Pause: () => {}, Stop: () => {},
        setThrottleFramerateEnabled: () => {}
    }
});
defClass('HttpService', 'Service', {
    defaults: { HttpEnabled: false },
    methods: {
        GenerateGUID: (s, wrap) => { const g = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); return wrap === false ? g : '{' + g + '}'; },
        JSONEncode: (s, v) => JSON.stringify(luaToJson(v)),
        JSONDecode: (s, str) => jsonToLua(JSON.parse(str)),
        UrlEncode: (s, str) => encodeURIComponent(str),
        GetAsync: () => { throw new L.LuaError('Http requests are not enabled. Enable via game settings'); },
        PostAsync: () => { throw new L.LuaError('Http requests are not enabled. Enable via game settings'); },
        RequestAsync: () => { throw new L.LuaError('Http requests are not enabled. Enable via game settings'); }
    }
});
function luaToJson(v) {
    if (v instanceof L.LuaTable) {
        if (v.hash === null || v.hash.size === 0) return v.arr.map(luaToJson);
        const o = {};
        for (const k of v.keys()) o[String(k)] = luaToJson(v.get(k));
        return o;
    }
    if (v instanceof Instance) return null;
    return v === undefined ? null : v;
}
function jsonToLua(v) {
    if (Array.isArray(v)) { const t = new L.LuaTable(); v.forEach((x, i) => t.set(i + 1, jsonToLua(x))); return t; }
    if (v && typeof v === 'object') { const t = new L.LuaTable(); for (const k of Object.keys(v)) t.set(k, jsonToLua(v[k])); return t; }
    return v === null ? undefined : v;
}

defClass('UserInputService', 'Service', {
    events: ['InputBegan', 'InputEnded', 'InputChanged', 'TouchTap', 'TouchStarted', 'TouchEnded', 'TouchMoved', 'WindowFocused', 'WindowFocusReleased', 'JumpRequest'],
    defaults: { MouseBehavior: 0, MouseIconEnabled: true, TouchEnabled: false, KeyboardEnabled: true, MouseEnabled: true, GamepadEnabled: false, ModalEnabled: false },
    methods: {
        IsKeyDown: (s, k) => s.game.keysDown.has(enumNum(k)),
        GetMouseLocation: (s) => new Vector2(s.game.mousePos.x, s.game.mousePos.y),
        GetMouseDelta: () => new Vector2(0, 0),
        IsMouseButtonPressed: (s, b) => s.game.mouseButtons.has(enumNum(b)),
        GetFocusedTextBox: () => undefined,
        GetKeysPressed: (s) => tbl(Array.from(s.game.keysDown).map(k => ENUMS.KeyCode.fromValue(k)).filter(Boolean)),
        GetConnectedGamepads: () => tbl([]),
        GetLastInputType: () => E('UserInputType', 'Keyboard')
    }
});
defClass('ContextActionService', 'Service', {
    methods: {
        BindAction: (s, name, fn, btn, ...keys) => { s.game.actions.set(name, { fn, keys: keys.map(k => (k instanceof EnumItem ? k.Value : k)) }); },
        BindActionAtPriority: (s, name, fn, btn, pri, ...keys) => { s.game.actions.set(name, { fn, keys: keys.map(k => (k instanceof EnumItem ? k.Value : k)) }); },
        UnbindAction: (s, name) => { s.game.actions.delete(name); },
        UnbindAllActions: (s) => { s.game.actions.clear(); },
        SetTitle: () => {}, SetPosition: () => {}, SetImage: () => {}, GetBoundActionInfo: () => new L.LuaTable()
    }
});

class Tween extends HostObject {
    constructor(game, inst, info, goals) {
        super();
        this.game = game;
        this.inst = inst;
        this.info = info;
        this.goals = goals;
        this.state = 0;
        this.t = 0;
        this.from = null;
        this.sigs = {};
        this.reversing = false;
        this.reps = 0;
    }
    get luaType() { return 'Tween'; }
    sig(n) { return this.sigs[n] || (this.sigs[n] = new Signal(this.game, 'Tween.' + n)); }
    luaIndex(k) {
        switch (k) {
            case 'Play': return (s) => s.play();
            case 'Pause': return (s) => { if (s.state === 2) { s.state = 3; } };
            case 'Cancel': return (s) => s.cancel();
            case 'Completed': return this.sig('Completed');
            case 'PlaybackState': return ENUMS.PlaybackState.fromValue(this.state);
            case 'Instance': return this.inst;
            case 'TweenInfo': return this.info;
            case 'Destroy': return (s) => s.cancel();
        }
        return undefined;
    }
    luaNewIndex() {}
    play() {
        if (this.state === 2) return;
        if (this.state !== 3) {
            this.t = -this.info.DelayTime;
            this.from = {};
            for (const k of Object.keys(this.goals)) this.from[k] = this.inst.get(k);
            this.reps = 0;
            this.reversing = false;
        }
        this.state = 2;
        this.game.tweens.add(this);
    }
    cancel() {
        if (this.state === 2 || this.state === 3) {
            this.state = 5;
            this.game.tweens.delete(this);
            this.sig('Completed').fire(ENUMS.PlaybackState.items.Cancelled);
        }
    }
    update(dt) {
        if (this.state !== 2) return;
        this.t += dt;
        if (this.t < 0) return;
        const dur = Math.max(this.info.Time, 1e-6);
        let a = Math.min(this.t / dur, 1);
        if (this.reversing) a = 1 - a;
        const e = ease(this.info.EasingStyle, this.info.EasingDirection, a);
        for (const k of Object.keys(this.goals)) {
            const v = lerpValue(this.from[k], this.goals[k], e);
            if (v !== undefined) this.inst.set(k, v);
        }
        if (this.t >= dur) {
            if (this.info.Reverses && !this.reversing) { this.reversing = true; this.t = 0; return; }
            if (this.info.RepeatCount < 0 || this.reps < this.info.RepeatCount) { this.reps++; this.reversing = false; this.t = 0; return; }
            this.state = 4;
            this.game.tweens.delete(this);
            this.sig('Completed').fire(ENUMS.PlaybackState.items.Completed);
        }
    }
}
Tween.luaName = 'Tween';

function lerpValue(a, b, t) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
    if (a instanceof Vector3 && b instanceof Vector3) return V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    if (a instanceof Vector2 && b instanceof Vector2) return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (a instanceof CFrame && b instanceof CFrame) return cfLerp(a, b, t);
    if (a instanceof Color3 && b instanceof Color3) return new Color3(a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t);
    if (a instanceof UDim2 && b instanceof UDim2) return new UDim2(a.xs + (b.xs - a.xs) * t, a.xo + (b.xo - a.xo) * t, a.ys + (b.ys - a.ys) * t, a.yo + (b.yo - a.yo) * t);
    if (typeof b === 'boolean') return t >= 1 ? b : a;
    return t >= 1 ? b : a;
}

function easeIn(style, t) {
    switch (style) {
        case 0: return t;
        case 1: return 1 - Math.cos(t * Math.PI / 2);
        case 2: return t * t * (2.70158 * t - 1.70158);
        case 3: return t * t;
        case 4: return t * t * t * t;
        case 5: return t * t * t * t * t;
        case 6: return 1 - bounceOut(1 - t);
        case 7: return t === 0 ? 0 : (t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3));
        case 8: return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
        case 9: return 1 - Math.sqrt(1 - t * t);
        case 10: return t * t * t;
    }
    return t;
}
function bounceOut(t) {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
}
function ease(style, dir, t) {
    const st = enumNum(style), d = enumNum(dir);
    if (st === 0) return t;
    if (d === 0) return easeIn(st, t);
    if (d === 1) return 1 - easeIn(st, 1 - t);
    return t < 0.5 ? easeIn(st, t * 2) / 2 : 1 - easeIn(st, (1 - t) * 2) / 2;
}

defClass('TweenService', 'Service', {
    methods: {
        Create: (s, inst, info, goals) => {
            const g = {};
            if (goals instanceof L.LuaTable) for (const k of goals.keys()) g[k] = goals.get(k);
            return new Tween(s.game, inst, info, g);
        },
        GetValue: (s, a, style, dir) => ease(style, dir, a)
    }
});

defClass('DataModel', 'Instance', {
    defaults: { PlaceId: 0, GameId: 0, JobId: 'local', CreatorId: 0, PlaceVersion: 1, Name: 'Game' },
    events: ['Loaded', 'Close'],
    getters: { Workspace: (s) => s.game.workspace },
    methods: {
        GetService: (s, n) => s.game.getService(n),
        getService: (s, n) => s.game.getService(n),
        service: (s, n) => s.game.getService(n),
        FindService: (s, n) => s.children.find(c => c.className === n),
        IsLoaded: () => true,
        BindToClose: () => {},
        GetObjects: () => tbl([]),
        SetPlaceId: () => {},
        IsA: (s, c) => c === 'DataModel' || c === 'Instance' || c === 'ServiceProvider'
    }
});
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
return {
    Game, Instance, CLASSES, ENUMS, Vector3, Vector2, CFrame, Color3, BrickColor, UDim2, UDim, Ray, Signal, PhysicsSync, cfToQuat, cfFromQuat, cfMul, cfInverse, cfPoint, cfVec, cfAngles, cfLookAt, enumNum, nearestBrickColor, BC_PALETTE, gripOf, Tween, HostObject
};
});
