(function (root) {
    'use strict';

    const EPS = 1e-9;

    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
    function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
    function norm(a) {
        const l = len(a);
        return l < EPS ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
    }
    function lerp3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

    function qmul(a, b) {
        return [
            a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
            a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
            a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
            a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
        ];
    }
    function qnorm(q) {
        const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
        return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
    }
    function qconj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
    function qrot(q, v) {
        const tx = 2 * (q[1] * v[2] - q[2] * v[1]);
        const ty = 2 * (q[2] * v[0] - q[0] * v[2]);
        const tz = 2 * (q[0] * v[1] - q[1] * v[0]);
        return [
            v[0] + q[3] * tx + (q[1] * tz - q[2] * ty),
            v[1] + q[3] * ty + (q[2] * tx - q[0] * tz),
            v[2] + q[3] * tz + (q[0] * ty - q[1] * tx)
        ];
    }
    function qToMat(q) {
        const x = q[0], y = q[1], z = q[2], w = q[3];
        return [
            1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
            2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
            2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)
        ];
    }
    function matToQuat(m) {
        const t = m[0] + m[4] + m[8];
        let q;
        if (t > 0) {
            const s = Math.sqrt(t + 1) * 2;
            q = [(m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s, 0.25 * s];
        } else if (m[0] > m[4] && m[0] > m[8]) {
            const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
            q = [0.25 * s, (m[1] + m[3]) / s, (m[2] + m[6]) / s, (m[7] - m[5]) / s];
        } else if (m[4] > m[8]) {
            const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
            q = [(m[1] + m[3]) / s, 0.25 * s, (m[5] + m[7]) / s, (m[2] - m[6]) / s];
        } else {
            const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
            q = [(m[2] + m[6]) / s, (m[5] + m[7]) / s, 0.25 * s, (m[3] - m[1]) / s];
        }
        return qnorm(q);
    }
    function mulMV(m, v) {
        return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
    }
    function mulMM(a, b) {
        const r = new Array(9);
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
            }
        }
        return r;
    }
    function transposeM(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
    function invM(m) {
        const a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
        const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
        const det = a * A + b * B + c * C;
        if (Math.abs(det) < 1e-18) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
        const id = 1 / det;
        return [A * id, -(b * i - c * h) * id, (b * f - c * e) * id,
            B * id, (a * i - c * g) * id, -(a * f - c * d) * id,
            C * id, -(a * h - b * g) * id, (a * e - b * d) * id];
    }
    function axisAngleQ(axis, angle) {
        const n = norm(axis);
        const s = Math.sin(angle / 2);
        return [n[0] * s, n[1] * s, n[2] * s, Math.cos(angle / 2)];
    }

    function makeHull(verts, faceLists) {
        const c = [0, 0, 0];
        for (const v of verts) { c[0] += v[0]; c[1] += v[1]; c[2] += v[2]; }
        c[0] /= verts.length; c[1] /= verts.length; c[2] /= verts.length;
        const faces = [];
        const edgeMap = new Map();
        for (const list of faceLists) {
            let n = [0, 0, 0];
            for (let i = 1; i + 1 < list.length; i++) {
                const a = sub(verts[list[i]], verts[list[0]]);
                const b = sub(verts[list[i + 1]], verts[list[0]]);
                const cr = cross(a, b);
                n = add(n, cr);
            }
            n = norm(n);
            let idx = list.slice();
            if (dot(n, sub(verts[idx[0]], c)) < 0) {
                n = mul(n, -1);
                idx = idx.reverse();
            }
            faces.push({ idx, n });
            for (let i = 0; i < idx.length; i++) {
                const a = idx[i];
                const b = idx[(i + 1) % idx.length];
                const key = a < b ? a + ',' + b : b + ',' + a;
                if (!edgeMap.has(key)) edgeMap.set(key, [a, b]);
            }
        }
        const edges = Array.from(edgeMap.values());
        const dirs = [];
        const dirEdge = [];
        for (const e of edges) {
            const d = norm(sub(verts[e[1]], verts[e[0]]));
            let dup = false;
            for (const u of dirs) {
                const cr = cross(u, d);
                if (cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2] < 1e-8) { dup = true; break; }
            }
            if (!dup) { dirs.push(d); dirEdge.push(e); }
        }
        return { verts, faces, edges, dirs };
    }

    function boxHull(hx, hy, hz) {
        const v = [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]];
        return makeHull(v, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]);
    }
    function wedgeHull(x, y, z) {
        const v = [[x, y, z], [x, -y, z], [x, -y, -z], [-x, y, z], [-x, -y, z], [-x, -y, -z]];
        return makeHull(v, [[0, 3, 4, 1], [3, 0, 2, 5], [0, 1, 2], [3, 5, 4], [5, 2, 1, 4]]);
    }
    function cornerWedgeHull(x, y, z) {
        const v = [[x, -y, z], [x, -y, -z], [-x, -y, -z], [-x, -y, z], [x, y, -z]];
        return makeHull(v, [[0, 1, 4], [0, 4, 3], [2, 3, 4], [1, 0, 3, 2], [1, 2, 4]]);
    }
    function cylinderHull(hx, ry, rz, segs) {
        const v = [];
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            v.push([-hx, Math.cos(a) * ry, Math.sin(a) * rz]);
        }
        for (let i = 0; i < segs; i++) {
            const a = (i / segs) * Math.PI * 2;
            v.push([hx, Math.cos(a) * ry, Math.sin(a) * rz]);
        }
        const faces = [];
        const cap0 = [];
        const cap1 = [];
        for (let i = 0; i < segs; i++) { cap0.push(i); cap1.push(segs + i); }
        faces.push(cap0, cap1);
        for (let i = 0; i < segs; i++) {
            const j = (i + 1) % segs;
            faces.push([i, j, segs + j, segs + i]);
        }
        return makeHull(v, faces);
    }

    let shapeIdCounter = 1;
    let bodyIdCounter = 1;

    class Shape {
        constructor(def) {
            this.id = shapeIdCounter++;
            this.body = null;
            this.type = def.type;
            this.sensor = !!def.sensor;
            this.friction = def.friction !== undefined ? def.friction : 0.3;
            this.restitution = def.restitution !== undefined ? def.restitution : 0.2;
            this.density = def.density !== undefined ? def.density : 1;
            this.group = def.group !== undefined ? def.group : 0;
            this.userData = def.userData || null;
            this.offset = def.offset || [0, 0, 0];
            this.quat = def.quat || [0, 0, 0, 1];
            this.size = def.size || [1, 1, 1];
            this.minV = [0, 0, 0];
            this.maxV = [0, 0, 0];
            this.huge = false;
            this.cells = null;
            this.build();
        }
        build() {
            const s = this.size;
            this.localHull = null;
            if (this.type === 'sphere') {
                this.radius = Math.min(s[0], s[1], s[2]) / 2;
                this.lc = this.offset.slice();
                this.wc = this.offset.slice();
                this.volume = 4 / 3 * Math.PI * this.radius * this.radius * this.radius;
                this.halfExt = [this.radius, this.radius, this.radius];
                return;
            }
            const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
            let hull;
            if (this.type === 'wedge') {
                hull = wedgeHull(hx, hy, hz);
                this.volume = s[0] * s[1] * s[2] / 2;
            } else if (this.type === 'cornerwedge') {
                hull = cornerWedgeHull(hx, hy, hz);
                this.volume = s[0] * s[1] * s[2] / 3;
            } else if (this.type === 'cylinder') {
                hull = cylinderHull(hx, Math.min(hy, hz), Math.min(hy, hz), 14);
                const r = Math.min(hy, hz);
                this.volume = Math.PI * r * r * s[0];
            } else {
                hull = boxHull(hx, hy, hz);
                this.volume = s[0] * s[1] * s[2];
            }
            this.halfExt = [hx, hy, hz];
            const q = this.quat;
            this.lv = hull.verts.map(v => add(qrot(q, v), this.offset));
            this.lfaces = hull.faces.map(f => ({ idx: f.idx, n: qrot(q, f.n) }));
            this.ledges = hull.edges;
            this.ldirs = hull.dirs.map(d => qrot(q, d));
            this.wv = this.lv.map(v => v.slice());
            this.wn = this.lfaces.map(f => f.n.slice());
            this.wd = new Array(this.lfaces.length).fill(0);
            this.wdirs = this.ldirs.map(d => d.slice());
        }
        updateWorld(origin, R) {
            if (this.type === 'sphere') {
                const c = mulMV(R, this.lc);
                this.wc = [c[0] + origin[0], c[1] + origin[1], c[2] + origin[2]];
                const r = this.radius;
                this.minV = [this.wc[0] - r, this.wc[1] - r, this.wc[2] - r];
                this.maxV = [this.wc[0] + r, this.wc[1] + r, this.wc[2] + r];
                return;
            }
            let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
            for (let i = 0; i < this.lv.length; i++) {
                const l = this.lv[i];
                const w = this.wv[i];
                w[0] = R[0] * l[0] + R[1] * l[1] + R[2] * l[2] + origin[0];
                w[1] = R[3] * l[0] + R[4] * l[1] + R[5] * l[2] + origin[1];
                w[2] = R[6] * l[0] + R[7] * l[1] + R[8] * l[2] + origin[2];
                if (w[0] < x0) x0 = w[0];
                if (w[0] > x1) x1 = w[0];
                if (w[1] < y0) y0 = w[1];
                if (w[1] > y1) y1 = w[1];
                if (w[2] < z0) z0 = w[2];
                if (w[2] > z1) z1 = w[2];
            }
            this.minV = [x0, y0, z0];
            this.maxV = [x1, y1, z1];
            for (let i = 0; i < this.lfaces.length; i++) {
                const n = mulMV(R, this.lfaces[i].n);
                this.wn[i] = n;
                this.wd[i] = dot(n, this.wv[this.lfaces[i].idx[0]]);
            }
            for (let i = 0; i < this.ldirs.length; i++) this.wdirs[i] = mulMV(R, this.ldirs[i]);
        }
        center() {
            if (this.type === 'sphere') return this.wc;
            return [(this.minV[0] + this.maxV[0]) / 2, (this.minV[1] + this.maxV[1]) / 2, (this.minV[2] + this.maxV[2]) / 2];
        }
    }

    function supportMin(shape, axis) {
        let best = Infinity;
        const w = shape.wv;
        for (let i = 0; i < w.length; i++) {
            const d = w[i][0] * axis[0] + w[i][1] * axis[1] + w[i][2] * axis[2];
            if (d < best) best = d;
        }
        return best;
    }
    function supportMax(shape, axis) {
        let best = -Infinity;
        const w = shape.wv;
        for (let i = 0; i < w.length; i++) {
            const d = w[i][0] * axis[0] + w[i][1] * axis[1] + w[i][2] * axis[2];
            if (d > best) best = d;
        }
        return best;
    }

    function faceQuery(A, B) {
        let best = -Infinity;
        let index = -1;
        for (let i = 0; i < A.wn.length; i++) {
            const sep = supportMin(B, A.wn[i]) - A.wd[i];
            if (sep > best) {
                best = sep;
                index = i;
                if (best > 0.5) break;
            }
        }
        return { sep: best, index };
    }

    function edgeQuery(A, B, cA, cB) {
        let best = -Infinity;
        let axisBest = null;
        const d = sub(cB, cA);
        for (let i = 0; i < A.wdirs.length; i++) {
            for (let j = 0; j < B.wdirs.length; j++) {
                let ax = cross(A.wdirs[i], B.wdirs[j]);
                const l = len(ax);
                if (l < 1e-4) continue;
                ax = [ax[0] / l, ax[1] / l, ax[2] / l];
                if (dot(ax, d) < 0) ax = [-ax[0], -ax[1], -ax[2]];
                const sep = supportMin(B, ax) - supportMax(A, ax);
                if (sep > best) {
                    best = sep;
                    axisBest = ax;
                    if (best > 0.5) return { sep: best, axis: axisBest };
                }
            }
        }
        return { sep: best, axis: axisBest };
    }

    function clipPolygon(poly, planeN, planeD) {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % poly.length];
            const da = dot(planeN, a) - planeD;
            const db = dot(planeN, b) - planeD;
            if (da <= 0) out.push(a);
            if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
                const t = da / (da - db);
                out.push(lerp3(a, b, t));
            }
        }
        return out;
    }

    function reducePoints(points) {
        if (points.length <= 4) return points;
        let p0 = points[0];
        for (const p of points) if (p.depth > p0.depth) p0 = p;
        let p1 = p0;
        let bd = -1;
        for (const p of points) {
            const d = len(sub(p.pos, p0.pos));
            if (d > bd) { bd = d; p1 = p; }
        }
        let p2 = p0;
        let ba = -1;
        for (const p of points) {
            const a = len(cross(sub(p1.pos, p0.pos), sub(p.pos, p0.pos)));
            if (a > ba) { ba = a; p2 = p; }
        }
        let p3 = p0;
        let bn = -1;
        for (const p of points) {
            const d0 = Math.min(len(sub(p.pos, p0.pos)), len(sub(p.pos, p1.pos)), len(sub(p.pos, p2.pos)));
            if (d0 > bn && p !== p0 && p !== p1 && p !== p2) { bn = d0; p3 = p; }
        }
        const out = [p0, p1, p2];
        if (p3 !== p0) out.push(p3);
        return out;
    }

    function closestOnSegment(a, b, p) {
        const ab = sub(b, a);
        const l2 = dot(ab, ab);
        const t = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
        return add(a, mul(ab, t));
    }

    function closestSegSeg(p1, q1, p2, q2) {
        const d1 = sub(q1, p1);
        const d2 = sub(q2, p2);
        const r = sub(p1, p2);
        const a = dot(d1, d1);
        const e = dot(d2, d2);
        const f = dot(d2, r);
        let s, t;
        if (a <= EPS && e <= EPS) return [p1, p2];
        if (a <= EPS) {
            s = 0;
            t = Math.max(0, Math.min(1, f / e));
        } else {
            const c = dot(d1, r);
            if (e <= EPS) {
                t = 0;
                s = Math.max(0, Math.min(1, -c / a));
            } else {
                const b = dot(d1, d2);
                const denom = a * e - b * b;
                s = denom > EPS ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
                t = (b * s + f) / e;
                if (t < 0) {
                    t = 0;
                    s = Math.max(0, Math.min(1, -c / a));
                } else if (t > 1) {
                    t = 1;
                    s = Math.max(0, Math.min(1, (b - c) / a));
                }
            }
        }
        return [add(p1, mul(d1, s)), add(p2, mul(d2, t))];
    }

    function hullHull(A, B, margin) {
        const fa = faceQuery(A, B);
        if (fa.sep > margin) return null;
        const fb = faceQuery(B, A);
        if (fb.sep > margin) return null;
        const cA = A.center();
        const cB = B.center();
        const eq = edgeQuery(A, B, cA, cB);
        if (eq.sep > margin) return null;

        const faceSep = Math.max(fa.sep, fb.sep);
        if (eq.axis && eq.sep > faceSep + 0.003 && eq.sep > -1e8) {
            const ax = eq.axis;
            const maxA = supportMax(A, ax);
            const minB = supportMin(B, ax);
            const sa = A.wv.filter(v => dot(v, ax) > maxA - 1e-4);
            const sb = B.wv.filter(v => dot(v, ax) < minB + 1e-4);
            const pick = (set) => {
                if (set.length === 1) return [set[0], set[0]];
                let bi = 0, bj = 1, bd = -1;
                for (let i = 0; i < set.length; i++) {
                    for (let j = i + 1; j < set.length; j++) {
                        const d = len(sub(set[i], set[j]));
                        if (d > bd) { bd = d; bi = i; bj = j; }
                    }
                }
                return [set[bi], set[bj]];
            };
            const ea = pick(sa);
            const eb = pick(sb);
            const cp = closestSegSeg(ea[0], ea[1], eb[0], eb[1]);
            return { normal: ax, points: [{ pos: lerp3(cp[0], cp[1], 0.5), depth: -eq.sep }] };
        }

        let ref = A, inc = B, refIndex = fa.index, flip = false;
        if (fb.sep > fa.sep + 0.003) {
            ref = B;
            inc = A;
            refIndex = fb.index;
            flip = true;
        }
        const n = ref.wn[refIndex];
        let incIndex = 0;
        let minDot = Infinity;
        for (let i = 0; i < inc.wn.length; i++) {
            const d = dot(inc.wn[i], n);
            if (d < minDot) { minDot = d; incIndex = i; }
        }
        let poly = inc.lfaces[incIndex].idx.map(i => inc.wv[i]);
        const refFace = ref.lfaces[refIndex].idx;
        for (let i = 0; i < refFace.length; i++) {
            const v0 = ref.wv[refFace[i]];
            const v1 = ref.wv[refFace[(i + 1) % refFace.length]];
            const side = norm(cross(sub(v1, v0), n));
            poly = clipPolygon(poly, side, dot(side, v0));
            if (poly.length === 0) break;
        }
        const planeD = ref.wd[refIndex];
        const points = [];
        for (const p of poly) {
            const dist = dot(n, p) - planeD;
            if (dist <= margin) points.push({ pos: p, depth: -dist });
        }
        if (points.length === 0) {
            const p = inc.wv[inc.lfaces[incIndex].idx[0]];
            points.push({ pos: p, depth: -(dot(n, p) - planeD) });
        }
        return { normal: flip ? [-n[0], -n[1], -n[2]] : n, points: reducePoints(points) };
    }

    function closestPointOnFace(shape, fi, p) {
        const f = shape.lfaces[fi];
        const n = shape.wn[fi];
        const d = dot(n, p) - shape.wd[fi];
        const proj = sub(p, mul(n, d));
        let inside = true;
        const idx = f.idx;
        for (let i = 0; i < idx.length; i++) {
            const v0 = shape.wv[idx[i]];
            const v1 = shape.wv[idx[(i + 1) % idx.length]];
            const side = cross(sub(v1, v0), n);
            if (dot(side, sub(proj, v0)) > 0) { inside = false; break; }
        }
        if (inside) return proj;
        let best = null;
        let bd = Infinity;
        for (let i = 0; i < idx.length; i++) {
            const c = closestOnSegment(shape.wv[idx[i]], shape.wv[idx[(i + 1) % idx.length]], p);
            const dd = len(sub(c, p));
            if (dd < bd) { bd = dd; best = c; }
        }
        return best;
    }

    function sphereHull(S, H, margin) {
        const c = S.wc;
        const r = S.radius + margin;
        let maxD = -Infinity;
        let maxI = 0;
        for (let i = 0; i < H.wn.length; i++) {
            const d = dot(H.wn[i], c) - H.wd[i];
            if (d > maxD) { maxD = d; maxI = i; }
        }
        if (maxD > r) return null;
        if (maxD <= 0) {
            const n = H.wn[maxI];
            return { normal: mul(n, -1), points: [{ pos: sub(c, mul(n, maxD)), depth: r - maxD - margin }] };
        }
        let bestQ = null;
        let bestD = Infinity;
        for (let i = 0; i < H.wn.length; i++) {
            const d = dot(H.wn[i], c) - H.wd[i];
            if (d <= 0) continue;
            const q = closestPointOnFace(H, i, c);
            const dist = len(sub(c, q));
            if (dist < bestD) { bestD = dist; bestQ = q; }
        }
        if (!bestQ || bestD > r) return null;
        const n = bestD < EPS ? H.wn[maxI] : mul(sub(c, bestQ), 1 / bestD);
        return { normal: mul(n, -1), points: [{ pos: bestQ, depth: r - bestD - margin }] };
    }

    function sphereSphere(A, B, margin) {
        const d = sub(B.wc, A.wc);
        const l = len(d);
        const r = A.radius + B.radius;
        if (l > r + margin) return null;
        const n = l < EPS ? [0, 1, 0] : mul(d, 1 / l);
        return { normal: n, points: [{ pos: add(A.wc, mul(n, A.radius - (r - l) / 2)), depth: r - l }] };
    }

    function collide(A, B, margin) {
        margin = margin || 0;
        if (A.type === 'sphere' && B.type === 'sphere') return sphereSphere(A, B, margin);
        if (A.type === 'sphere') return sphereHull(A, B, margin);
        if (B.type === 'sphere') {
            const m = sphereHull(B, A, margin);
            return m ? { normal: mul(m.normal, -1), points: m.points } : null;
        }
        return hullHull(A, B, margin);
    }

    function polyRaycast(shape, o, d, maxT) {
        let tMin = 0;
        let tMax = maxT;
        let nHit = null;
        for (let i = 0; i < shape.wn.length; i++) {
            const n = shape.wn[i];
            const denom = dot(n, d);
            const dist = shape.wd[i] - dot(n, o);
            if (Math.abs(denom) < 1e-12) {
                if (dist < 0) return null;
            } else {
                const t = dist / denom;
                if (denom < 0) {
                    if (t > tMin) { tMin = t; nHit = n; }
                } else if (t < tMax) {
                    tMax = t;
                }
                if (tMin > tMax) return null;
            }
        }
        if (!nHit) {
            return { t: 0, normal: [0, 1, 0], inside: true };
        }
        return { t: tMin, normal: nHit };
    }

    function sphereRaycast(shape, o, d, maxT) {
        const m = sub(o, shape.wc);
        const b = dot(m, d);
        const c = dot(m, m) - shape.radius * shape.radius;
        if (c > 0 && b > 0) return null;
        const disc = b * b - c;
        if (disc < 0) return null;
        let t = -b - Math.sqrt(disc);
        if (t < 0) t = 0;
        if (t > maxT) return null;
        const p = add(o, mul(d, t));
        return { t, normal: norm(sub(p, shape.wc)) };
    }

    function rayAabb(o, d, mn, mx, maxT) {
        let t0 = 0;
        let t1 = maxT;
        for (let i = 0; i < 3; i++) {
            if (Math.abs(d[i]) < 1e-12) {
                if (o[i] < mn[i] || o[i] > mx[i]) return false;
            } else {
                const inv = 1 / d[i];
                let a = (mn[i] - o[i]) * inv;
                let b = (mx[i] - o[i]) * inv;
                if (a > b) { const t = a; a = b; b = t; }
                if (a > t0) t0 = a;
                if (b < t1) t1 = b;
                if (t0 > t1) return false;
            }
        }
        return true;
    }

    class Body {
        constructor(world, def) {
            this.world = world;
            this.id = bodyIdCounter++;
            this.type = def.type || 'dynamic';
            this.origin = (def.position || [0, 0, 0]).slice();
            this.quat = qnorm(def.quaternion || [0, 0, 0, 1]);
            this.R = qToMat(this.quat);
            this.com = [0, 0, 0];
            this.comW = this.origin.slice();
            this.vel = [0, 0, 0];
            this.angVel = [0, 0, 0];
            this.force = [0, 0, 0];
            this.torque = [0, 0, 0];
            this.mass = 0;
            this.invMass = 0;
            this.invInertiaLocal = [0, 0, 0, 0, 0, 0, 0, 0, 0];
            this.invInertiaWorld = [0, 0, 0, 0, 0, 0, 0, 0, 0];
            this.shapes = [];
            this.sleeping = false;
            this.sleepTimer = 0;
            this.allowSleep = def.allowSleep !== false;
            this.gravityScale = def.gravityScale !== undefined ? def.gravityScale : 1;
            this.linearDamping = def.linearDamping || 0;
            this.angularDamping = def.angularDamping !== undefined ? def.angularDamping : 0.04;
            this.userData = def.userData || null;
            this.maxSpeed = 400;
            this.canRotate = def.canRotate !== false;
            this.kinematicIntegrate = false;
        }
        addShape(def) {
            const s = new Shape(def);
            s.body = this;
            this.shapes.push(s);
            this.finalized = false;
            return s;
        }
        removeShape(shape) {
            const i = this.shapes.indexOf(shape);
            if (i >= 0) {
                this.shapes.splice(i, 1);
                this.world.gridRemove(shape);
                this.finalized = false;
            }
        }
        finalize() {
            let totalMass = 0;
            const com = [0, 0, 0];
            const masses = [];
            for (const s of this.shapes) {
                const m = Math.max(s.volume, 1e-4) * s.density;
                masses.push(m);
                totalMass += m;
                const c = s.type === 'sphere' ? s.lc : s.offset;
                com[0] += c[0] * m;
                com[1] += c[1] * m;
                com[2] += c[2] * m;
            }
            if (this.shapes.length === 0 || totalMass <= 0) {
                this.mass = 0;
                this.invMass = 0;
                this.com = [0, 0, 0];
            } else {
                this.mass = totalMass;
                this.com = [com[0] / totalMass, com[1] / totalMass, com[2] / totalMass];
            }
            if (this.type === 'dynamic' && this.mass > 0) {
                this.invMass = 1 / this.mass;
                let I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
                for (let k = 0; k < this.shapes.length; k++) {
                    const s = this.shapes[k];
                    const m = masses[k];
                    const h = s.halfExt;
                    let d;
                    if (s.type === 'sphere') {
                        const v = 0.4 * m * s.radius * s.radius;
                        d = [v, v, v];
                    } else {
                        d = [m / 3 * (h[1] * h[1] + h[2] * h[2]), m / 3 * (h[0] * h[0] + h[2] * h[2]), m / 3 * (h[0] * h[0] + h[1] * h[1])];
                    }
                    const Rs = s.type === 'sphere' ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : qToMat(s.quat);
                    const Id = [d[0], 0, 0, 0, d[1], 0, 0, 0, d[2]];
                    const Ib = mulMM(mulMM(Rs, Id), transposeM(Rs));
                    const c = s.type === 'sphere' ? s.lc : s.offset;
                    const r = sub(c, this.com);
                    const rr = dot(r, r);
                    const pa = [
                        m * (rr - r[0] * r[0]), -m * r[0] * r[1], -m * r[0] * r[2],
                        -m * r[1] * r[0], m * (rr - r[1] * r[1]), -m * r[1] * r[2],
                        -m * r[2] * r[0], -m * r[2] * r[1], m * (rr - r[2] * r[2])
                    ];
                    for (let i = 0; i < 9; i++) I[i] += Ib[i] + pa[i];
                }
                this.invInertiaLocal = this.canRotate ? invM(I) : [0, 0, 0, 0, 0, 0, 0, 0, 0];
            } else {
                this.invMass = 0;
                this.invInertiaLocal = [0, 0, 0, 0, 0, 0, 0, 0, 0];
            }
            this.finalized = true;
            this.refresh();
        }
        refresh() {
            this.R = qToMat(this.quat);
            const c = mulMV(this.R, this.com);
            this.comW = [this.origin[0] + c[0], this.origin[1] + c[1], this.origin[2] + c[2]];
            if (this.invMass > 0) {
                this.invInertiaWorld = mulMM(mulMM(this.R, this.invInertiaLocal), transposeM(this.R));
            }
            for (const s of this.shapes) s.updateWorld(this.origin, this.R);
        }
        setTransform(origin, quat) {
            this.origin = origin.slice();
            this.quat = qnorm(quat);
            this.refresh();
            if (this.type === 'static') {
                for (const s of this.shapes) this.world.gridUpdate(s);
            }
            this.wake();
        }
        moveKinematic(origin, quat, dt) {
            const old = this.comW.slice();
            this.origin = origin.slice();
            const oq = this.quat;
            this.quat = qnorm(quat);
            this.refresh();
            if (dt > 0) {
                this.vel = mul(sub(this.comW, old), 1 / dt);
                const dq = qmul(this.quat, qconj(oq));
                let ang = 2 * Math.acos(Math.max(-1, Math.min(1, dq[3])));
                if (ang > Math.PI) ang -= Math.PI * 2;
                const s = Math.sqrt(Math.max(0, 1 - dq[3] * dq[3]));
                this.angVel = s < 1e-6 ? [0, 0, 0] : mul([dq[0] / s, dq[1] / s, dq[2] / s], ang / dt);
            }
            for (const s of this.shapes) this.world.gridUpdate(s);
            this.wake();
        }
        applyForce(f, point) {
            this.force = add(this.force, f);
            if (point) this.torque = add(this.torque, cross(sub(point, this.comW), f));
            this.wake();
        }
        applyTorque(t) {
            this.torque = add(this.torque, t);
            this.wake();
        }
        applyImpulse(j, point) {
            if (this.invMass === 0) return;
            this.vel = add(this.vel, mul(j, this.invMass));
            if (point) {
                const r = sub(point, this.comW);
                this.angVel = add(this.angVel, mulMV(this.invInertiaWorld, cross(r, j)));
            }
            this.wake();
        }
        setVelocity(v) {
            this.vel = v.slice();
            this.wake();
        }
        setAngularVelocity(v) {
            this.angVel = v.slice();
            this.wake();
        }
        wake() {
            this.sleeping = false;
            this.sleepTimer = 0;
        }
        velocityAt(p) {
            return add(this.vel, cross(this.angVel, sub(p, this.comW)));
        }
        getOrigin() { return this.origin; }
    }

    class Joint {
        constructor(def) {
            this.type = def.type;
            this.a = def.bodyA;
            this.b = def.bodyB;
            this.localA = def.localA || [0, 0, 0];
            this.localB = def.localB || [0, 0, 0];
            this.axisA = def.axisA || [1, 0, 0];
            this.axisB = def.axisB || [1, 0, 0];
            this.lower = def.lower;
            this.upper = def.upper;
            this.motorSpeed = def.motorSpeed || 0;
            this.motorTorque = def.motorTorque || 0;
            this.motorEnabled = !!def.motorEnabled;
            this.restLength = def.length;
            this.stiffness = def.stiffness || 0;
            this.damping = def.damping || 0;
            this.maxForce = def.maxForce || Infinity;
            this.collide = !!def.collide;
            this.refA = def.refA || [0, 0, 1];
            this.acc = [0, 0, 0];
            this.accAng = [0, 0];
            this.accMotor = 0;
            this.accLimit = 0;
            this.angle = 0;
        }
    }

    class World {
        constructor(opts) {
            opts = opts || {};
            this.gravity = opts.gravity !== undefined ? opts.gravity : [0, -196.2, 0];
            if (typeof this.gravity === 'number') this.gravity = [0, -Math.abs(this.gravity), 0];
            this.bodies = [];
            this.movers = [];
            this.staticShapes = [];
            this.cell = opts.cellSize || 32;
            this.grid = new Map();
            this.bigShapes = [];
            this.joints = [];
            this.iterations = opts.iterations || 14;
            this.beta = 0.2;
            this.posBeta = 0.8;
            this.contactMargin = 0.04;
            this.slop = 0.01;
            this.maxCorrection = 20;
            this.restThreshold = 6;
            this.sleepSpeed = 0.35;
            this.sleepTime = 0.6;
            this.contactsPrev = new Map();
            this.pairsPrev = new Map();
            this.onBegin = null;
            this.onEnd = null;
            this.filter = null;
            this.time = 0;
            this.stats = { contacts: 0, awake: 0 };
        }
        createBody(def) {
            const b = new Body(this, def);
            this.bodies.push(b);
            return b;
        }
        addBody(b) {
            if (this.bodies.indexOf(b) < 0) this.bodies.push(b);
            if (!b.finalized) b.finalize();
            if (b.type === 'static') {
                for (const s of b.shapes) this.gridInsert(s);
            } else {
                this.movers.push(b);
            }
        }
        removeBody(b) {
            const i = this.bodies.indexOf(b);
            if (i >= 0) this.bodies.splice(i, 1);
            const j = this.movers.indexOf(b);
            if (j >= 0) this.movers.splice(j, 1);
            for (const s of b.shapes) this.gridRemove(s);
            this.joints = this.joints.filter(jt => jt.a !== b && jt.b !== b);
            for (const [key, pair] of this.pairsPrev) {
                if (pair.a.body === b || pair.b.body === b) {
                    this.pairsPrev.delete(key);
                    if (this.onEnd) this.onEnd(pair.a, pair.b);
                }
            }
            for (const other of this.movers) other.wake();
        }
        setBodyType(b, type) {
            if (b.type === type) return;
            const wasStatic = b.type === 'static';
            if (wasStatic) for (const s of b.shapes) this.gridRemove(s);
            b.type = type;
            const mi = this.movers.indexOf(b);
            if (type === 'static') {
                if (mi >= 0) this.movers.splice(mi, 1);
                b.vel = [0, 0, 0];
                b.angVel = [0, 0, 0];
                b.finalize();
                for (const s of b.shapes) this.gridInsert(s);
            } else {
                if (mi < 0) this.movers.push(b);
                b.finalize();
            }
            b.wake();
        }
        addJoint(def) {
            const j = new Joint(def);
            this.joints.push(j);
            if (j.a) j.a.wake();
            if (j.b) j.b.wake();
            return j;
        }
        removeJoint(j) {
            const i = this.joints.indexOf(j);
            if (i >= 0) this.joints.splice(i, 1);
        }
        cellRange(shape) {
            const c = this.cell;
            return [Math.floor(shape.minV[0] / c), Math.floor(shape.maxV[0] / c), Math.floor(shape.minV[1] / c), Math.floor(shape.maxV[1] / c), Math.floor(shape.minV[2] / c), Math.floor(shape.maxV[2] / c)];
        }
        gridInsert(shape) {
            const r = this.cellRange(shape);
            const count = (r[1] - r[0] + 1) * (r[3] - r[2] + 1) * (r[5] - r[4] + 1);
            if (count > 512) {
                shape.huge = true;
                shape.cells = null;
                this.bigShapes.push(shape);
                return;
            }
            shape.huge = false;
            const keys = [];
            for (let x = r[0]; x <= r[1]; x++) {
                for (let y = r[2]; y <= r[3]; y++) {
                    for (let z = r[4]; z <= r[5]; z++) {
                        const key = x + ',' + y + ',' + z;
                        let list = this.grid.get(key);
                        if (!list) {
                            list = [];
                            this.grid.set(key, list);
                        }
                        list.push(shape);
                        keys.push(key);
                    }
                }
            }
            shape.cells = keys;
        }
        gridRemove(shape) {
            if (shape.huge) {
                const i = this.bigShapes.indexOf(shape);
                if (i >= 0) this.bigShapes.splice(i, 1);
                shape.huge = false;
                return;
            }
            if (!shape.cells) return;
            for (const key of shape.cells) {
                const list = this.grid.get(key);
                if (!list) continue;
                const i = list.indexOf(shape);
                if (i >= 0) list.splice(i, 1);
                if (list.length === 0) this.grid.delete(key);
            }
            shape.cells = null;
        }
        gridUpdate(shape) {
            if (!shape.body || shape.body.type !== 'static') {
                if (shape.cells || shape.huge) this.gridRemove(shape);
                return;
            }
            this.gridRemove(shape);
            this.gridInsert(shape);
        }
        queryStatic(mn, mx, out, stamp) {
            const c = this.cell;
            const x0 = Math.floor(mn[0] / c), x1 = Math.floor(mx[0] / c);
            const y0 = Math.floor(mn[1] / c), y1 = Math.floor(mx[1] / c);
            const z0 = Math.floor(mn[2] / c), z1 = Math.floor(mx[2] / c);
            if ((x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1) > 4096) {
                for (const list of this.grid.values()) {
                    for (const s of list) {
                        if (s.stamp !== stamp && overlapAabb(s, mn, mx)) {
                            s.stamp = stamp;
                            out.push(s);
                        }
                    }
                }
            } else {
                for (let x = x0; x <= x1; x++) {
                    for (let y = y0; y <= y1; y++) {
                        for (let z = z0; z <= z1; z++) {
                            const list = this.grid.get(x + ',' + y + ',' + z);
                            if (!list) continue;
                            for (const s of list) {
                                if (s.stamp !== stamp && overlapAabb(s, mn, mx)) {
                                    s.stamp = stamp;
                                    out.push(s);
                                }
                            }
                        }
                    }
                }
            }
            for (const s of this.bigShapes) {
                if (s.stamp !== stamp && overlapAabb(s, mn, mx)) {
                    s.stamp = stamp;
                    out.push(s);
                }
            }
        }
        queryBox(mn, mx) {
            const out = [];
            this.stampCounter = (this.stampCounter || 0) + 1;
            const stamp = this.stampCounter;
            this.queryStatic(mn, mx, out, stamp);
            for (const b of this.movers) {
                for (const s of b.shapes) {
                    if (overlapAabb(s, mn, mx)) out.push(s);
                }
            }
            return out;
        }
        raycast(origin, dir, maxDist, filter) {
            const d = norm(dir);
            let best = null;
            const test = (s) => {
                if (filter && !filter(s)) return;
                if (!rayAabb(origin, d, s.minV, s.maxV, maxDist)) return;
                const hit = s.type === 'sphere' ? sphereRaycast(s, origin, d, maxDist) : polyRaycast(s, origin, d, maxDist);
                if (hit && (!best || hit.t < best.t)) {
                    best = { shape: s, body: s.body, t: hit.t, distance: hit.t, point: add(origin, mul(d, hit.t)), normal: hit.normal };
                }
            };
            const far = add(origin, mul(d, maxDist));
            const mn = [Math.min(origin[0], far[0]), Math.min(origin[1], far[1]), Math.min(origin[2], far[2])];
            const mx = [Math.max(origin[0], far[0]), Math.max(origin[1], far[1]), Math.max(origin[2], far[2])];
            const cellsSpanned = ((mx[0] - mn[0]) / this.cell + 1) * ((mx[1] - mn[1]) / this.cell + 1) * ((mx[2] - mn[2]) / this.cell + 1);
            if (cellsSpanned < 3000) {
                const out = [];
                this.stampCounter = (this.stampCounter || 0) + 1;
                this.queryStatic(mn, mx, out, this.stampCounter);
                for (const s of out) test(s);
            } else {
                for (const b of this.bodies) if (b.type === 'static') for (const s of b.shapes) test(s);
            }
            for (const b of this.movers) for (const s of b.shapes) test(s);
            return best;
        }
        shouldCollide(a, b) {
            if (a.body === b.body) return false;
            if (a.body.type !== 'dynamic' && b.body.type !== 'dynamic' && !(a.sensor || b.sensor)) return false;
            if (a.body.type === 'static' && b.body.type === 'static') return false;
            if (this.filter && !this.filter(a, b)) return false;
            for (const j of this.joints) {
                if (!j.collide && ((j.a === a.body && j.b === b.body) || (j.a === b.body && j.b === a.body))) return false;
            }
            return true;
        }
        step(dt) {
            const g = this.gravity;
            const awake = [];
            for (const b of this.movers) {
                if (b.sleeping) continue;
                awake.push(b);
                if (b.type === 'dynamic') {
                    const s = b.gravityScale;
                    b.vel[0] += (g[0] * s + b.force[0] * b.invMass) * dt;
                    b.vel[1] += (g[1] * s + b.force[1] * b.invMass) * dt;
                    b.vel[2] += (g[2] * s + b.force[2] * b.invMass) * dt;
                    const ta = mulMV(b.invInertiaWorld, b.torque);
                    b.angVel[0] += ta[0] * dt;
                    b.angVel[1] += ta[1] * dt;
                    b.angVel[2] += ta[2] * dt;
                    const ld = 1 / (1 + b.linearDamping * dt);
                    const ad = 1 / (1 + b.angularDamping * dt);
                    b.vel[0] *= ld; b.vel[1] *= ld; b.vel[2] *= ld;
                    b.angVel[0] *= ad; b.angVel[1] *= ad; b.angVel[2] *= ad;
                    const sp = len(b.vel);
                    if (sp > b.maxSpeed) b.vel = mul(b.vel, b.maxSpeed / sp);
                    const asp = len(b.angVel);
                    if (asp > 60) b.angVel = mul(b.angVel, 60 / asp);
                }
                b.force = [0, 0, 0];
                b.torque = [0, 0, 0];
            }

            const manifolds = [];
            const pairsNow = new Map();
            const pairShapes = [];
            const margin = 0.02;
            const stamp = (this.stampCounter = (this.stampCounter || 0) + 1);
            const found = [];
            const moverShapes = [];
            for (const b of this.movers) for (const s of b.shapes) moverShapes.push(s);
            moverShapes.sort((a, b) => a.minV[0] - b.minV[0]);
            const seen = new Set();
            const consider = (a, b) => {
                if (a.body.sleeping && b.body.sleeping) return;
                if (!this.shouldCollide(a, b)) return;
                const k = a.id < b.id ? a.id * 4194304 + b.id : b.id * 4194304 + a.id;
                if (seen.has(k)) return;
                seen.add(k);
                pairShapes.push(a.id < b.id ? [a, b] : [b, a]);
            };
            for (const b of awake) {
                for (const s of b.shapes) {
                    found.length = 0;
                    const mn = [s.minV[0] - margin, s.minV[1] - margin, s.minV[2] - margin];
                    const mx = [s.maxV[0] + margin, s.maxV[1] + margin, s.maxV[2] + margin];
                    this.queryStatic(mn, mx, found, ++this.stampCounter);
                    for (const t of found) consider(s, t);
                }
            }
            void stamp;
            for (let i = 0; i < moverShapes.length; i++) {
                const a = moverShapes[i];
                for (let j = i + 1; j < moverShapes.length; j++) {
                    const b = moverShapes[j];
                    if (b.minV[0] > a.maxV[0] + margin) break;
                    if (a.minV[1] > b.maxV[1] + margin || b.minV[1] > a.maxV[1] + margin) continue;
                    if (a.minV[2] > b.maxV[2] + margin || b.minV[2] > a.maxV[2] + margin) continue;
                    consider(a, b);
                }
            }

            for (const pr of pairShapes) {
                let A = pr[0];
                let B = pr[1];
                const m = collide(A, B, (A.sensor || B.sensor) ? 0 : this.contactMargin);
                if (!m) continue;
                const key = A.id * 4194304 + B.id;
                pairsNow.set(key, { a: A, b: B });
                if (A.sensor || B.sensor) continue;
                const sleeperA = A.body.sleeping;
                const sleeperB = B.body.sleeping;
                if (sleeperA !== sleeperB) {
                    const sleeper = sleeperA ? A.body : B.body;
                    const other = sleeperA ? B.body : A.body;
                    const speed = len(other.vel) + len(other.angVel) * 0.5;
                    if (other.type === 'kinematic' ? speed > 0.2 : other.sleepTimer < 0.25 && speed > 0.2) sleeper.wake();
                }
                const prev = this.contactsPrev.get(key);
                const friction = Math.sqrt(Math.max(0, A.friction * B.friction));
                const rest = Math.max(A.restitution, B.restitution);
                const man = { a: A, b: B, key, normal: m.normal, points: m.points, friction, restitution: rest };
                for (const p of man.points) {
                    p.jn = 0; p.jt1 = 0; p.jt2 = 0;
                    if (prev) {
                        for (const q of prev.points) {
                            const dd = sub(q.pos, p.pos);
                            if (dot(dd, dd) < 0.01) {
                                p.jn = q.jn;
                                p.jt1 = q.jt1;
                                p.jt2 = q.jt2;
                                break;
                            }
                        }
                    }
                }
                manifolds.push(man);
            }

            const invDt = 1 / dt;
            for (const man of manifolds) {
                const A = man.a.body;
                const B = man.b.body;
                const n = man.normal;
                let t1 = Math.abs(n[0]) > 0.57 ? cross(n, [0, 1, 0]) : cross(n, [1, 0, 0]);
                t1 = norm(t1);
                const t2 = norm(cross(n, t1));
                man.t1 = t1;
                man.t2 = t2;
                for (const p of man.points) {
                    p.rA = sub(p.pos, A.comW);
                    p.rB = sub(p.pos, B.comW);
                    const k = (axis) => {
                        const ra = cross(p.rA, axis);
                        const rb = cross(p.rB, axis);
                        return A.invMass + B.invMass + dot(cross(mulMV(A.invInertiaWorld, ra), p.rA), axis) + dot(cross(mulMV(B.invInertiaWorld, rb), p.rB), axis);
                    };
                    p.kn = k(n) > EPS ? 1 / k(n) : 0;
                    p.kt1 = k(t1) > EPS ? 1 / k(t1) : 0;
                    p.kt2 = k(t2) > EPS ? 1 / k(t2) : 0;
                    const va = A.velocityAt(p.pos);
                    const vb = B.velocityAt(p.pos);
                    const vn = dot(sub(vb, va), n);
                    p.bias = p.depth < 0 ? p.depth * invDt : (vn < -this.restThreshold ? -man.restitution * vn : 0);
                    applyImpulse(A, B, p, add(add(mul(n, p.jn), mul(t1, p.jt1)), mul(t2, p.jt2)));
                }
            }

            for (const j of this.joints) this.prepareJoint(j, dt);

            for (let it = 0; it < this.iterations; it++) {
                for (const j of this.joints) this.solveJoint(j, dt);
                for (const man of manifolds) {
                    const A = man.a.body;
                    const B = man.b.body;
                    const n = man.normal;
                    for (const p of man.points) {
                        const va = A.velocityAt(p.pos);
                        const vb = B.velocityAt(p.pos);
                        const rv = sub(vb, va);
                        const maxF = man.friction * p.jn;
                        let l1 = -dot(rv, man.t1) * p.kt1;
                        const old1 = p.jt1;
                        p.jt1 = Math.max(-maxF, Math.min(maxF, old1 + l1));
                        l1 = p.jt1 - old1;
                        let l2 = -dot(rv, man.t2) * p.kt2;
                        const old2 = p.jt2;
                        p.jt2 = Math.max(-maxF, Math.min(maxF, old2 + l2));
                        l2 = p.jt2 - old2;
                        if (l1 !== 0 || l2 !== 0) applyImpulse(A, B, p, add(mul(man.t1, l1), mul(man.t2, l2)));
                    }
                    for (const p of man.points) {
                        const va = A.velocityAt(p.pos);
                        const vb = B.velocityAt(p.pos);
                        const vn = dot(sub(vb, va), n);
                        let l = (p.bias - vn) * p.kn;
                        const old = p.jn;
                        p.jn = Math.max(0, old + l);
                        l = p.jn - old;
                        if (l !== 0) applyImpulse(A, B, p, mul(n, l));
                    }
                }
            }

            for (const b of awake) b.comPrev = b.comW.slice();
            this.contactsPrev.clear();
            for (const man of manifolds) this.contactsPrev.set(man.key, man);
            this.stats.contacts = manifolds.length;
            this.stats.awake = awake.length;

            for (const b of awake) {
                if (b.type === 'dynamic' || b.kinematicIntegrate) {
                    b.comW = [b.comW[0] + b.vel[0] * dt, b.comW[1] + b.vel[1] * dt, b.comW[2] + b.vel[2] * dt];
                    const w = b.angVel;
                    if (w[0] !== 0 || w[1] !== 0 || w[2] !== 0) {
                        const dq = qmul([w[0] * dt * 0.5, w[1] * dt * 0.5, w[2] * dt * 0.5, 0], b.quat);
                        b.quat = qnorm([b.quat[0] + dq[0], b.quat[1] + dq[1], b.quat[2] + dq[2], b.quat[3] + dq[3]]);
                    }
                    b.R = qToMat(b.quat);
                    const c = mulMV(b.R, b.com);
                    b.origin = [b.comW[0] - c[0], b.comW[1] - c[1], b.comW[2] - c[2]];
                    if (b.type === 'dynamic') b.invInertiaWorld = mulMM(mulMM(b.R, b.invInertiaLocal), transposeM(b.R));
                    for (const s of b.shapes) s.updateWorld(b.origin, b.R);
                }
                if (b.type === 'dynamic' && b.allowSleep) {
                    const sp = len(b.vel) + len(b.angVel) * 0.5;
                    if (sp < this.sleepSpeed) {
                        b.sleepTimer += dt;
                        if (b.sleepTimer > this.sleepTime) {
                            b.sleeping = true;
                            b.vel = [0, 0, 0];
                            b.angVel = [0, 0, 0];
                        }
                    } else {
                        b.sleepTimer = 0;
                    }
                }
            }

            if (manifolds.length) this.positionCorrect(manifolds, awake);

            for (const [key, pair] of pairsNow) {
                if (!this.pairsPrev.has(key) && this.onBegin) this.onBegin(pair.a, pair.b);
            }
            for (const [key, pair] of this.pairsPrev) {
                if (!pairsNow.has(key) && this.onEnd) this.onEnd(pair.a, pair.b);
            }
            this.pairsPrev = pairsNow;
            this.time += dt;
        }
        positionCorrect(manifolds, awake) {
            for (let it = 0; it < 4; it++) {
                for (const man of manifolds) {
                    const A = man.a.body;
                    const B = man.b.body;
                    const wsum = A.invMass + B.invMass;
                    if (wsum <= 0) continue;
                    const n = man.normal;
                    let worst = 0;
                    for (const p of man.points) {
                        const dA = A.comPrev ? sub(A.comW, A.comPrev) : [0, 0, 0];
                        const dB = B.comPrev ? sub(B.comW, B.comPrev) : [0, 0, 0];
                        const depth = p.depth - dot(n, sub(dB, dA));
                        if (depth > worst) worst = depth;
                    }
                    const corr = Math.min(0.6, this.posBeta * Math.max(0, worst - this.slop));
                    if (corr <= 0) continue;
                    if (A.invMass > 0) { A.comW = sub(A.comW, mul(n, corr * A.invMass / wsum)); }
                    if (B.invMass > 0) { B.comW = add(B.comW, mul(n, corr * B.invMass / wsum)); }
                }
            }
            for (const b of awake) {
                if (b.type !== 'dynamic') continue;
                const c = mulMV(b.R, b.com);
                b.origin = [b.comW[0] - c[0], b.comW[1] - c[1], b.comW[2] - c[2]];
                for (const s of b.shapes) s.updateWorld(b.origin, b.R);
            }
        }
        prepareJoint(j, dt) {
            const A = j.a;
            const B = j.b;
            j.rAw = A ? mulMV(A.R, sub(j.localA, A.com)) : j.localA;
            j.rBw = B ? mulMV(B.R, sub(j.localB, B.com)) : j.localB;
            j.pA = A ? add(A.comW, j.rAw) : j.localA;
            j.pB = B ? add(B.comW, j.rBw) : j.localB;
            if (j.type === 'hinge') {
                j.wAxisA = A ? norm(mulMV(A.R, j.axisA)) : norm(j.axisA);
                j.wAxisB = B ? norm(mulMV(B.R, j.axisB)) : norm(j.axisB);
                const refA = A ? mulMV(A.R, j.refA) : j.refA;
                const refB = B ? mulMV(B.R, j.refA) : j.refA;
                const ax = j.wAxisA;
                const pa = norm(sub(refA, mul(ax, dot(refA, ax))));
                const pb = norm(sub(refB, mul(ax, dot(refB, ax))));
                j.angle = Math.atan2(dot(cross(pa, pb), ax), dot(pa, pb));
            }
            j.invDt = 1 / dt;
        }
        solveJoint(j, dt) {
            const A = j.a;
            const B = j.b;
            const mA = A ? A.invMass : 0;
            const mB = B ? B.invMass : 0;
            const IA = A ? A.invInertiaWorld : [0, 0, 0, 0, 0, 0, 0, 0, 0];
            const IB = B ? B.invInertiaWorld : [0, 0, 0, 0, 0, 0, 0, 0, 0];
            const velAt = (body, r) => body ? add(body.vel, cross(body.angVel, r)) : [0, 0, 0];
            const applyLin = (axis, lambda) => {
                const P = mul(axis, lambda);
                if (A) {
                    A.vel = sub(A.vel, mul(P, mA));
                    A.angVel = sub(A.angVel, mulMV(IA, cross(j.rAw, P)));
                    A.wake();
                }
                if (B) {
                    B.vel = add(B.vel, mul(P, mB));
                    B.angVel = add(B.angVel, mulMV(IB, cross(j.rBw, P)));
                    B.wake();
                }
            };
            const kLin = (axis) => {
                const ra = cross(j.rAw, axis);
                const rb = cross(j.rBw, axis);
                const k = mA + mB + dot(cross(mulMV(IA, ra), j.rAw), axis) + dot(cross(mulMV(IB, rb), j.rBw), axis);
                return k > EPS ? 1 / k : 0;
            };
            const applyAng = (axis, lambda) => {
                const P = mul(axis, lambda);
                if (A) { A.angVel = sub(A.angVel, mulMV(IA, P)); A.wake(); }
                if (B) { B.angVel = add(B.angVel, mulMV(IB, P)); B.wake(); }
            };
            const kAng = (axis) => {
                const k = dot(mulMV(IA, axis), axis) + dot(mulMV(IB, axis), axis);
                return k > EPS ? 1 / k : 0;
            };

            if (j.type === 'spring') {
                const d = sub(j.pB, j.pA);
                const l = len(d);
                if (l < EPS) return;
                const n = mul(d, 1 / l);
                const rel = dot(sub(velAt(B, j.rBw), velAt(A, j.rAw)), n);
                let f = j.stiffness * (l - j.restLength) + j.damping * rel;
                if (j.maxForce < Infinity) f = Math.max(-j.maxForce, Math.min(j.maxForce, f));
                applyLin(n, f * dt);
                return;
            }

            if (j.type === 'distance') {
                const d = sub(j.pB, j.pA);
                const l = len(d);
                if (l < EPS) return;
                const n = mul(d, 1 / l);
                const err = l - j.restLength;
                if (j.rope && err < 0) return;
                const rel = dot(sub(velAt(B, j.rBw), velAt(A, j.rAw)), n);
                const bias = Math.min(this.maxCorrection, this.beta * j.invDt * err);
                applyLin(n, -(rel + bias) * kLin(n));
                return;
            }

            const err = sub(j.pB, j.pA);
            const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
            for (let i = 0; i < 3; i++) {
                const ax = axes[i];
                const rel = dot(sub(velAt(B, j.rBw), velAt(A, j.rAw)), ax);
                const bias = Math.max(-this.maxCorrection, Math.min(this.maxCorrection, this.beta * j.invDt * err[i]));
                applyLin(ax, -(rel + bias) * kLin(ax));
            }

            if (j.type === 'hinge') {
                const ax = j.wAxisA;
                const mis = cross(ax, j.wAxisB);
                const u = Math.abs(ax[0]) > 0.6 ? norm(cross(ax, [0, 1, 0])) : norm(cross(ax, [1, 0, 0]));
                const v = norm(cross(ax, u));
                const wa = A ? A.angVel : [0, 0, 0];
                const wb = B ? B.angVel : [0, 0, 0];
                for (const t of [u, v]) {
                    const rel = dot(sub(wb, wa), t);
                    const bias = this.beta * j.invDt * dot(mis, t);
                    applyAng(t, -(rel - bias) * kAng(t));
                }
                if (j.motorEnabled) {
                    const rel = dot(sub(B ? B.angVel : [0, 0, 0], A ? A.angVel : [0, 0, 0]), ax);
                    let l = (j.motorSpeed - rel) * kAng(ax);
                    const maxI = j.motorTorque * dt;
                    const old = j.accMotor;
                    j.accMotor = Math.max(-maxI, Math.min(maxI, old + l));
                    l = j.accMotor - old;
                    applyAng(ax, l);
                }
                if (j.lower !== undefined && j.upper !== undefined) {
                    const rel = dot(sub(B ? B.angVel : [0, 0, 0], A ? A.angVel : [0, 0, 0]), ax);
                    if (j.angle < j.lower) {
                        const l = (-rel + this.beta * j.invDt * (j.lower - j.angle)) * kAng(ax);
                        if (l > 0) applyAng(ax, l);
                    } else if (j.angle > j.upper) {
                        const l = (-rel - this.beta * j.invDt * (j.angle - j.upper)) * kAng(ax);
                        if (l < 0) applyAng(ax, l);
                    }
                }
            } else if (j.type === 'ball') {
            } else if (j.type === 'fixed') {
                const wa = A ? A.angVel : [0, 0, 0];
                const wb = B ? B.angVel : [0, 0, 0];
                for (const t of [[1, 0, 0], [0, 1, 0], [0, 0, 1]]) {
                    const rel = dot(sub(wb, wa), t);
                    applyAng(t, -rel * kAng(t));
                }
            }
        }
    }

    function overlapAabb(s, mn, mx) {
        return s.minV[0] <= mx[0] && s.maxV[0] >= mn[0] && s.minV[1] <= mx[1] && s.maxV[1] >= mn[1] && s.minV[2] <= mx[2] && s.maxV[2] >= mn[2];
    }

    function applyImpulse(A, B, p, P) {
        if (A.invMass > 0) {
            A.vel = sub(A.vel, mul(P, A.invMass));
            A.angVel = sub(A.angVel, mulMV(A.invInertiaWorld, cross(p.rA, P)));
        }
        if (B.invMass > 0) {
            B.vel = add(B.vel, mul(P, B.invMass));
            B.angVel = add(B.angVel, mulMV(B.invInertiaWorld, cross(p.rB, P)));
        }
    }

    function convexOverlap(a, b) {
        return collide(a, b);
    }

    const api = {
        World, Body, Shape, Joint,
        math: { dot, cross, add, sub, mul, len, norm, qmul, qnorm, qconj, qrot, qToMat, matToQuat, mulMV, mulMM, transposeM, invM, axisAngleQ },
        collide: convexOverlap
    };
    root.RBXPhysics = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
