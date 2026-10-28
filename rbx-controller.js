(function (root) {
"use strict";
const R = root.RBXRuntime || (typeof require !== "undefined" ? require("./rbx-runtime.js") : null);
const GRAVITY = 196.2;
const HIP = 3;
const RADIUS = 1.0;
const V3 = (x, y, z) => new R.Vector3(x, y, z);

function trans(x, y, z) { return [x, y, z, 1, 0, 0, 0, 1, 0, 0, 0, 1]; }
function rotX(t) { const c = Math.cos(t), s = Math.sin(t); return [0, 0, 0, 1, 0, 0, 0, c, -s, 0, s, c]; }
function rotY(t) { const c = Math.cos(t), s = Math.sin(t); return [0, 0, 0, c, 0, s, 0, 1, 0, -s, 0, c]; }
function mul(a, b) {
    const o = new Array(12);
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            o[3 + i * 3 + j] = a[3 + i * 3] * b[3 + j] + a[4 + i * 3] * b[6 + j] + a[5 + i * 3] * b[9 + j];
        }
        o[i] = a[3 + i * 3] * b[0] + a[4 + i * 3] * b[1] + a[5 + i * 3] * b[2] + a[i];
    }
    return o;
}

const KEY_FORWARD = ['KeyW', 'ArrowUp'];
const KEY_BACK = ['KeyS', 'ArrowDown'];
const KEY_LEFT = ['KeyA', 'ArrowLeft'];
const KEY_RIGHT = ['KeyD', 'ArrowRight'];

class RBXController {
    constructor(game) {
        this.game = game;
        this.keys = new Set();
        this.camYaw = 0;
        this.ch = null;
        this.px = 0; this.py = 0; this.pz = 0;
        this.vy = 0;
        this.yaw = 0;
        this.phase = 0;
        this.onGround = false;
        this.deadT = 0;
        this.focus = { x: 0, y: 0, z: 0 };
        this.enabled = true;
        this.speed = 0;
    }

    any(list) {
        for (const k of list) if (this.keys.has(k)) return true;
        return false;
    }

    ray(ox, oy, oz, dx, dy, dz, dist) {
        return this.game.phys.raycast({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }, dist, [this.ch]);
    }

    slide(mx, mz) {
        for (let pass = 0; pass < 2; pass++) {
            const len = Math.hypot(mx, mz);
            if (len < 1e-6) return [0, 0];
            const nx = mx / len, nz = mz / len;
            const qx = -nz, qz = nx;
            let ax = mx, az = mz;
            let hit = false;
            for (const h of [-2.2, -0.8, 0.8, 2.0]) {
                for (const off of [-0.7, 0, 0.7]) {
                    const r = this.ray(this.px + qx * off, this.py + h, this.pz + qz * off, nx, 0, nz, RADIUS + len + 0.05);
                    if (!r || Math.abs(r.normal.y) > 0.6) continue;
                    const hl = Math.hypot(r.normal.x, r.normal.z) || 1;
                    const wx = r.normal.x / hl, wz = r.normal.z / hl;
                    const into = ax * wx + az * wz;
                    if (into < 0) { ax -= into * wx; az -= into * wz; hit = true; }
                    const pen = RADIUS - r.distance;
                    if (pen > 0) { ax += wx * pen; az += wz * pen; hit = true; }
                }
            }
            if (!hit) return [ax, az];
            mx = ax; mz = az;
        }
        return [mx, mz];
    }

    groundProbe(len) {
        let best = null;
        for (const o of [[0, 0], [0.7, 0], [-0.7, 0], [0, 0.4], [0, -0.4]]) {
            const r = this.ray(this.px + o[0], this.py, this.pz + o[1], 0, -1, 0, len);
            if (r && (!best || r.distance < best.distance)) best = r;
        }
        return best;
    }

    kill(hum) {
        try { R.CLASSES.Humanoid.methods.TakeDamage(hum, Math.max(1, hum.props.Health)); } catch (e) { hum.props.Health = 0; }
    }

    update(dt) {
        const game = this.game;
        if (!game.running || !this.enabled) return;
        const ch = game.character();
        if (!ch) return;
        const hum = ch.findChild('Humanoid');
        const hrp = ch.findChild('HumanoidRootPart');
        if (!hum || !hrp) return;
        dt = Math.min(dt, 0.05);
        if (ch !== this.ch) {
            const m = hrp.props.CFrame.m;
            this.px = m[0]; this.py = m[1]; this.pz = m[2];
            this.vy = 0; this.yaw = 0; this.phase = 0; this.deadT = 0; this.onGround = false;
            this.ch = ch;
        }
        const dead = !!hum.ext_dead || hum.props.Health <= 0;
        if (!dead && this.py < game.fallenHeight()) this.kill(hum);
        let moving = false;
        if (!dead) {
            const f = (this.any(KEY_FORWARD) ? 1 : 0) - (this.any(KEY_BACK) ? 1 : 0);
            const s = (this.any(KEY_RIGHT) ? 1 : 0) - (this.any(KEY_LEFT) ? 1 : 0);
            const ly = -Math.cos(this.camYaw), lx = -Math.sin(this.camYaw);
            let dx = lx * f + (-ly) * s, dz = ly * f + lx * s;
            if (!f && !s) {
                const mr = hum.moveRequest;
                const wt = hum.walkTo;
                if (mr && mr.dir && (mr.dir.x || mr.dir.z)) { dx = mr.dir.x; dz = mr.dir.z; }
                else if (wt && wt.pos) {
                    const tx = wt.pos.x - this.px, tz = wt.pos.z - this.pz;
                    const d = Math.hypot(tx, tz);
                    if (d > 1) { dx = tx / d; dz = tz / d; } else hum.walkTo = null;
                }
            }
            const dl = Math.hypot(dx, dz);
            if (dl > 1) { dx /= dl; dz /= dl; }
            const ws = typeof hum.props.WalkSpeed === 'number' ? hum.props.WalkSpeed : 16;
            const jp = typeof hum.props.JumpPower === 'number' ? hum.props.JumpPower : 50;
            const sit = !!hum.props.Sit || !!hum.props.PlatformStand;
            hum.props.MoveDirection = V3(dx, 0, dz);
            if (!sit) {
                const [mx, mz] = this.slide(dx * ws * dt, dz * ws * dt);
                this.px += mx; this.pz += mz;
                this.speed = Math.hypot(mx, mz) / Math.max(dt, 1e-4);
                moving = this.speed > 0.5;
                if (dl > 0.05 && hum.props.AutoRotate !== false) {
                    const target = Math.atan2(-dx, -dz);
                    let diff = target - this.yaw;
                    while (diff > Math.PI) diff -= 2 * Math.PI;
                    while (diff < -Math.PI) diff += 2 * Math.PI;
                    this.yaw += diff * Math.min(1, 14 * dt);
                }
                const wantJump = this.keys.has('Space') || hum.props.Jump;
                if (wantJump && this.onGround) { this.vy = jp; this.onGround = false; hum.props.Jump = false; }
            }
        }
        if (!this.onGround || this.vy > 0) this.vy -= GRAVITY * dt;
        this.py += this.vy * dt;
        if (this.vy > 0) {
            const c = this.ray(this.px, this.py, this.pz, 0, 1, 0, 2.1);
            if (c) { this.vy = 0; this.py = c.position.y - 2.1; }
        }
        const probeLen = HIP + (this.onGround ? 1.0 : Math.max(0.05, -this.vy * dt));
        const g = this.vy <= 0 ? this.groundProbe(probeLen) : null;
        if (g) {
            this.py = this.py - g.distance + HIP;
            this.vy = 0;
            this.onGround = true;
        } else {
            this.onGround = false;
        }
        const T0 = trans(this.px, this.py, this.pz);
        let T;
        let aL = 0, aR = 0, lL = 0, lR = 0;
        if (dead) {
            this.deadT += dt;
            const tilt = Math.min(1.5708, this.deadT * 4);
            T = mul(mul(mul(trans(this.px, this.py - HIP, this.pz), rotY(this.yaw)), rotX(-tilt)), trans(0, HIP, 0));
            if (this.deadT > 5) { game.loadCharacter(); this.ch = null; }
        } else {
            T = mul(T0, rotY(this.yaw));
            if (!this.onGround) {
                aL = 2.9; aR = -2.9; lL = 0.2; lR = -0.2;
            } else if (moving) {
                this.phase += dt * (this.speed / 16) * 9;
                const s = Math.sin(this.phase);
                aL = s; aR = -s; lL = -s; lR = s;
            } else {
                this.phase = 0;
            }
            if (game.heldTool && !game.heldTool.destroyed) aR = 1.5708;
        }
        const cfs = {};
        cfs.HumanoidRootPart = T;
        cfs.Torso = T;
        cfs.Head = mul(T, trans(0, 1.5, 0));
        cfs['Left Arm'] = mul(mul(mul(T, trans(-1, 0.5, 0)), rotX(aL)), trans(-0.5, -0.5, 0));
        cfs['Right Arm'] = mul(mul(mul(T, trans(1, 0.5, 0)), rotX(aR)), trans(0.5, -0.5, 0));
        cfs['Left Leg'] = mul(mul(mul(T, trans(-1, -1, 0)), rotX(lL)), trans(0.5, -1, 0));
        cfs['Right Leg'] = mul(mul(mul(T, trans(1, -1, 0)), rotX(lR)), trans(-0.5, -1, 0));
        game.setCharacterTransforms(cfs, dt);
        this.focus.x = T[0]; this.focus.y = T[1] + 1.5; this.focus.z = T[2];
    }
}

const api = { RBXController, mul, trans, rotX, rotY };
if (typeof module === 'object' && module.exports) module.exports = api;
root.RBXControllerLib = api;
})(typeof window !== "undefined" ? window : globalThis);
