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
