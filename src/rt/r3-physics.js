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
