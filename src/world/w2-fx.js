const PARTICLE_VS = `
attribute float aAlpha;
attribute float aSize;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
uniform float uScale;
void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
}`;
const PARTICLE_FS = `
varying float vAlpha;
varying vec3 vColor;
void main() {
    float d = length(gl_PointCoord - vec2(0.5));
    float a = vAlpha * smoothstep(0.5, 0.12, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
}`;

class RBXEffects {
    constructor(THREE, world) {
        this.THREE = THREE;
        this.world = world;
        this.emitters = new Map();
        this.bursts = [];
        this.scale = 600;
    }

    makeSystem(max, additive) {
        const THREE = this.THREE;
        const geom = new THREE.BufferGeometry();
        const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), alpha = new Float32Array(max), size = new Float32Array(max);
        geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geom.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
        geom.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
        geom.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
        geom.setDrawRange(0, 0);
        const mat = new THREE.ShaderMaterial({
            vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: this.scale } }
        });
        const pts = new THREE.Points(geom, mat);
        pts.frustumCulled = false;
        this.world.scene.add(pts);
        return { pts, geom, mat, max, pos, col, alpha, size, p: [], count: 0 };
    }

    kindOf(inst) {
        switch (inst.className) {
            case 'Fire': return 'fire';
            case 'Smoke': return 'smoke';
            case 'Sparkles': return 'sparkles';
            case 'ParticleEmitter': return 'emitter';
        }
        return null;
    }

    instanceAdded(inst) {
        const kind = this.kindOf(inst);
        if (!kind || this.emitters.has(inst)) return;
        const additive = kind === 'fire' || kind === 'sparkles' || (kind === 'emitter' && (inst.props.LightEmission || 0) > 0.5);
        const sys = this.makeSystem(kind === 'emitter' ? 600 : 300, additive);
        this.emitters.set(inst, { inst, kind, sys, acc: 0, t: 0 });
    }

    instanceRemoved(inst) {
        const e = this.emitters.get(inst);
        if (!e) return;
        this.world.scene.remove(e.sys.pts);
        e.sys.geom.dispose();
        e.sys.mat.dispose();
        this.emitters.delete(inst);
    }

    instanceChanged(inst, k) {
        if (inst.className === 'ParticleEmitter' && k === 'LightEmission') {
            const e = this.emitters.get(inst);
            if (e) e.sys.mat.blending = (inst.props.LightEmission || 0) > 0.5 ? this.THREE.AdditiveBlending : this.THREE.NormalBlending;
        }
    }

    partInfo(inst) {
        const p = inst._parent;
        if (!p || !p.isA('BasePart')) return null;
        return p;
    }

    spawn(e, part) {
        const inst = e.inst;
        const pr = inst.props;
        const sz = part.props.Size;
        const cf = part.props.CFrame;
        const rnd = () => Math.random() - 0.5;
        let lx = rnd() * sz.x, ly = rnd() * sz.y, lz = rnd() * sz.z;
        let vx = 0, vy = 0, vz = 0, life = 1, size0 = 1, size1 = 1;
        const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, s0: 1, s1: 1, a0: 1, a1: 0, c0: [1, 1, 1], c1: [1, 1, 1], seed: Math.random() };
        if (e.kind === 'fire') {
            const size = pr.Size || 5, heat = pr.Heat === undefined ? 9 : pr.Heat;
            const c0 = pr.Color, c1 = pr.SecondaryColor;
            lx *= 0.6; lz *= 0.6; ly = -sz.y / 2 + 0.2;
            p.life = 0.45 + Math.random() * 0.5;
            p.vx = rnd() * 1.2; p.vz = rnd() * 1.2; p.vy = heat * 0.55 + Math.random() * 1.5;
            p.s0 = size * 0.28; p.s1 = size * 0.06;
            p.a0 = 0.9; p.a1 = 0;
            p.c0 = [c0.r, c0.g, c0.b]; p.c1 = [c1.r, c1.g, c1.b];
        } else if (e.kind === 'smoke') {
            const size = pr.Size || 1, c = pr.Color;
            lx *= 0.5; lz *= 0.5; ly = 0;
            p.life = 2.2 + Math.random() * 1.2;
            p.vx = rnd() * 0.8; p.vz = rnd() * 0.8; p.vy = (pr.RiseVelocity === undefined ? 1 : pr.RiseVelocity) * 1.2 + Math.random() * 0.5;
            p.s0 = size * 0.7; p.s1 = size * 2.6;
            p.a0 = pr.Opacity === undefined ? 0.5 : pr.Opacity; p.a1 = 0;
            p.c0 = [c.r, c.g, c.b]; p.c1 = [c.r, c.g, c.b];
        } else if (e.kind === 'sparkles') {
            const c = pr.SparkleColor;
            lx *= 1.4; ly *= 1.4; lz *= 1.4;
            p.life = 0.9 + Math.random() * 0.8;
            p.vx = rnd() * 1.2; p.vy = rnd() * 1.2 + 0.4; p.vz = rnd() * 1.2;
            p.s0 = 0.5; p.s1 = 0.1; p.a0 = 1; p.a1 = 0;
            const cc = [Math.min(1, c.r + 0.3), Math.min(1, c.g + 0.3), Math.min(1, c.b + 0.3)];
            p.c0 = cc; p.c1 = [c.r, c.g, c.b];
        } else {
            const lt = pr.Lifetime, sp = pr.Speed, sa = pr.SpreadAngle;
            p.life = lt.Min + Math.random() * (lt.Max - lt.Min);
            const dirIdx = enumNum(pr.EmissionDirection);
            const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
            const dd = dirs[dirIdx] || [0, 1, 0];
            const speed = sp.Min + Math.random() * (sp.Max - sp.Min);
            const sx = (sa ? sa.x : 0) * Math.PI / 180, sy = (sa ? sa.y : 0) * Math.PI / 180;
            let d = [dd[0] + rnd() * 2 * Math.tan(sx), dd[1] + rnd() * 2 * Math.tan(sy), dd[2] + rnd() * 2 * Math.tan(sx)];
            if (dd[0] !== 0) d = [dd[0], rnd() * 2 * Math.tan(sx), rnd() * 2 * Math.tan(sy)];
            if (dd[2] !== 0) d = [rnd() * 2 * Math.tan(sx), rnd() * 2 * Math.tan(sy), dd[2]];
            const l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
            const wv = cfVec(cf, new Vector3(d[0] / l * speed, d[1] / l * speed, d[2] / l * speed));
            p.vx = wv.x; p.vy = wv.y; p.vz = wv.z;
            p.emitter = true;
            p.sizeSeq = pr.Size; p.colSeq = pr.Color; p.trSeq = pr.Transparency;
        }
        if (!p.emitter) {
            const wv = cfVec(cf, new Vector3(p.vx, p.vy, p.vz));
            p.vx = e.kind === 'fire' || e.kind === 'smoke' ? p.vx : wv.x;
            p.vy = e.kind === 'fire' || e.kind === 'smoke' ? p.vy : wv.y;
            p.vz = e.kind === 'fire' || e.kind === 'smoke' ? p.vz : wv.z;
        }
        const w = cfPoint(cf, new Vector3(lx, ly, lz));
        p.x = w.x; p.y = w.y; p.z = w.z;
        return p;
    }

    burst(inst, n) {
        const e = this.emitters.get(inst);
        const part = this.partInfo(inst);
        if (!e || !part) return;
        for (let i = 0; i < n && e.sys.p.length < e.sys.max; i++) e.sys.p.push(this.spawn(e, part));
    }

    explosionBurst(pos, r) {
        const THREE = this.THREE;
        const sys = this.makeSystem(80, true);
        const list = [];
        for (let i = 0; i < 80; i++) {
            const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), sp = (0.6 + Math.random()) * r * 2.2;
            list.push({ x: pos.x, y: pos.y, z: pos.z, vx: Math.sin(ph) * Math.cos(th) * sp, vy: Math.cos(ph) * sp, vz: Math.sin(ph) * Math.sin(th) * sp, age: 0, life: 0.5 + Math.random() * 0.5, s0: r * 0.5, s1: r * 0.1, a0: 1, a1: 0, c0: [1, 0.8, 0.3], c1: [1, 0.2, 0], seed: Math.random() });
        }
        sys.p = list;
        this.bursts.push(sys);
    }

    stepSystem(sys, dt, e) {
        const p = sys.p;
        let w = 0;
        const inst = e && e.inst;
        for (let i = 0; i < p.length; i++) {
            const q = p[i];
            q.age += dt;
            if (q.age >= q.life) continue;
            if (q.emitter && inst) {
                const a = inst.props.Acceleration;
                if (a) { q.vx += a.x * dt; q.vy += a.y * dt; q.vz += a.z * dt; }
                const drag = inst.props.Drag || 0;
                if (drag > 0) { const k = Math.max(0, 1 - drag * dt); q.vx *= k; q.vy *= k; q.vz *= k; }
            } else if (!q.emitter && e && e.kind === 'smoke') {
                q.vx *= 0.99; q.vz *= 0.99;
            }
            q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
            p[w++] = q;
        }
        p.length = w;
        for (let i = 0; i < w; i++) {
            const q = p[i];
            const t = q.age / q.life;
            let size, a, c0, c1, k;
            if (q.emitter) {
                size = q.sizeSeq.sample(t);
                const tr = q.trSeq.sample(t);
                a = 1 - tr;
                const col = q.colSeq.sample(t);
                sys.col[i * 3] = col.r; sys.col[i * 3 + 1] = col.g; sys.col[i * 3 + 2] = col.b;
            } else {
                size = q.s0 + (q.s1 - q.s0) * t;
                a = q.a0 + (q.a1 - q.a0) * t;
                if (e && e.kind === 'sparkles') a *= 0.5 + 0.5 * Math.sin((q.age + q.seed * 6) * 18);
                sys.col[i * 3] = q.c0[0] + (q.c1[0] - q.c0[0]) * t;
                sys.col[i * 3 + 1] = q.c0[1] + (q.c1[1] - q.c0[1]) * t;
                sys.col[i * 3 + 2] = q.c0[2] + (q.c1[2] - q.c0[2]) * t;
            }
            sys.pos[i * 3] = q.x; sys.pos[i * 3 + 1] = q.y; sys.pos[i * 3 + 2] = q.z;
            sys.alpha[i] = Math.max(0, a);
            sys.size[i] = Math.max(0.02, size);
        }
        sys.geom.setDrawRange(0, w);
        sys.geom.attributes.position.needsUpdate = true;
        sys.geom.attributes.aColor.needsUpdate = true;
        sys.geom.attributes.aAlpha.needsUpdate = true;
        sys.geom.attributes.aSize.needsUpdate = true;
        sys.count = w;
    }

    update(dt) {
        const cam = this.world.camera;
        const renderer = this.world.renderer;
        if (cam && renderer) {
            const size = renderer.getSize(new this.THREE.Vector2());
            const pr = renderer.getPixelRatio();
            this.scale = size.y * pr / (2 * Math.tan(cam.fov * Math.PI / 360));
        }
        for (const e of this.emitters.values()) {
            e.sys.mat.uniforms.uScale.value = this.scale;
            const part = this.partInfo(e.inst);
            const enabled = e.inst.props.Enabled !== false && part && this.world.parts.has(part) !== undefined;
            if (enabled && part) {
                let rate;
                switch (e.kind) {
                    case 'fire': rate = 28 * Math.max(0.3, (e.inst.props.Size || 5) / 5); break;
                    case 'smoke': rate = 9; break;
                    case 'sparkles': rate = 8; break;
                    default: rate = e.inst.props.Rate === undefined ? 20 : e.inst.props.Rate;
                }
                e.acc += rate * dt;
                let n = Math.floor(e.acc);
                e.acc -= n;
                n = Math.min(n, 40);
                for (let i = 0; i < n && e.sys.p.length < e.sys.max; i++) e.sys.p.push(this.spawn(e, part));
            }
            this.stepSystem(e.sys, dt, e);
        }
        for (let i = this.bursts.length - 1; i >= 0; i--) {
            const b = this.bursts[i];
            this.stepSystem(b, dt, null);
            if (b.p.length === 0) {
                this.world.scene.remove(b.pts);
                b.geom.dispose();
                b.mat.dispose();
                this.bursts.splice(i, 1);
            }
        }
    }
}

class GuiRenderer {
    constructor(game, container, world) {
        this.game = game;
        this.container = container;
        this.world = world;
        this.els = new Map();
        this.root = document.createElement('div');
        this.root.className = 'rbx-gui-root';
        this.root.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:30;';
        container.appendChild(this.root);
        this.billboards = new Map();
        this.messages = new Map();
        this.msgLayer = document.createElement('div');
        this.msgLayer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:60;';
        container.appendChild(this.msgLayer);
        this.vec = null;
    }

    hexOf(c) {
        return 'rgb(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ')';
    }

    rgba(c, tr) {
        return 'rgba(' + Math.round(c.r * 255) + ',' + Math.round(c.g * 255) + ',' + Math.round(c.b * 255) + ',' + (1 - (tr || 0)) + ')';
    }

    create(inst) {
        const cn = inst.className;
        let el;
        if (cn === 'ScreenGui') {
            el = document.createElement('div');
            el.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;';
        } else if (cn === 'TextBox') {
            el = inst.props.MultiLine ? document.createElement('textarea') : document.createElement('input');
            if (!inst.props.MultiLine) el.type = 'text';
        } else if (inst.isA('GuiButton')) {
            el = document.createElement('div');
            el.style.cursor = 'pointer';
        } else if (inst.isA('GuiObject')) {
            el = document.createElement('div');
        } else {
            return null;
        }
        el.dataset.rbx = cn;
        return el;
    }

    add(inst) {
        if (this.els.has(inst)) return;
        if (inst.className === 'BillboardGui' || inst.className === 'SurfaceGui') return;
        if (inst.isA('GuiObject') === false && inst.className !== 'ScreenGui') {
            if (inst.className === 'UIListLayout' || inst.className === 'UICorner') { this.applyLayout(inst._parent); }
            return;
        }
        const el = this.create(inst);
        if (!el) return;
        this.els.set(inst, el);
        this.styleBase(inst, el);
        this.apply(inst, el);
        this.bind(inst, el);
        this.attach(inst, el);
    }

    attach(inst, el) {
        const p = inst._parent;
        const pe = p ? this.els.get(p) : null;
        if (pe) pe.appendChild(el);
        else if (p && p.className === 'PlayerGui') this.root.appendChild(el);
        else if (p && (p.className === 'BillboardGui')) { const b = this.billboards.get(p); if (b) b.el.appendChild(el); }
        else if (!el.parentNode) this.root.appendChild(el);
        if (p) this.applyLayout(p);
    }

    styleBase(inst, el) {
        el.style.position = 'absolute';
        el.style.boxSizing = 'border-box';
        el.style.margin = '0';
        el.style.padding = '0';
        el.style.userSelect = 'none';
        el.style.overflow = 'hidden';
        el.style.pointerEvents = 'none';
    }

    bind(inst, el) {
        const g = this.game;
        if (inst.isA('GuiButton')) {
            el.style.pointerEvents = 'auto';
            el.addEventListener('mousedown', (e) => { inst.fireSignal(e.button === 2 ? 'MouseButton2Down' : 'MouseButton1Down', e.clientX, e.clientY); e.stopPropagation(); });
            el.addEventListener('mouseup', (e) => { inst.fireSignal(e.button === 2 ? 'MouseButton2Up' : 'MouseButton1Up', e.clientX, e.clientY); });
            el.addEventListener('click', (e) => { inst.fireSignal('MouseButton1Click'); inst.fireSignal('Activated'); e.stopPropagation(); });
            el.addEventListener('contextmenu', (e) => { inst.fireSignal('MouseButton2Click'); e.preventDefault(); });
            el.addEventListener('touchend', (e) => { inst.fireSignal('MouseButton1Click'); inst.fireSignal('Activated'); });
        }
        if (inst.isA('GuiObject')) {
            if (inst.props.Active || inst.isA('GuiButton') || inst.className === 'TextBox' || inst.className === 'ScrollingFrame') el.style.pointerEvents = 'auto';
            el.addEventListener('mouseenter', (e) => inst.fireSignal('MouseEnter', e.clientX, e.clientY));
            el.addEventListener('mouseleave', (e) => inst.fireSignal('MouseLeave', e.clientX, e.clientY));
        }
        if (inst.className === 'TextBox') {
            el.addEventListener('input', () => { inst.props.Text = el.value; inst.fireSignal('Changed', 'Text'); });
            el.addEventListener('focus', () => inst.fireSignal('Focused'));
            el.addEventListener('blur', () => inst.fireSignal('FocusLost', false));
            el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter' && !inst.props.MultiLine) { inst.fireSignal('FocusLost', true); el.blur(); } });
            el.addEventListener('keyup', (e) => e.stopPropagation());
        }
    }

    udim(scale, offset) {
        if (!scale) return offset + 'px';
        if (!offset) return (scale * 100) + '%';
        return 'calc(' + (scale * 100) + '% + ' + offset + 'px)';
    }

    apply(inst, el) {
        const p = inst.props;
        const s = el.style;
        const cn = inst.className;
        if (cn === 'ScreenGui') {
            s.display = p.Enabled === false ? 'none' : 'block';
            s.zIndex = String(p.DisplayOrder || 0);
            return;
        }
        const pos = p.Position, size = p.Size, ap = p.AnchorPoint;
        s.left = this.udim(pos.xs, pos.xo);
        s.top = this.udim(pos.ys, pos.yo);
        s.width = this.udim(size.xs, size.xo);
        s.height = this.udim(size.ys, size.yo);
        const tf = [];
        if (ap && (ap.x || ap.y)) tf.push('translate(' + (-ap.x * 100) + '%,' + (-ap.y * 100) + '%)');
        if (p.Rotation) tf.push('rotate(' + p.Rotation + 'deg)');
        s.transform = tf.join(' ');
        s.display = p.Visible === false ? 'none' : (el.dataset.flex ? 'flex' : 'block');
        s.zIndex = String(p.ZIndex || 1);
        s.backgroundColor = this.rgba(p.BackgroundColor3, p.BackgroundTransparency);
        if (p.BorderSizePixel > 0) s.border = p.BorderSizePixel + 'px solid ' + this.hexOf(p.BorderColor3);
        else s.border = 'none';
        s.overflow = p.ClipsDescendants || cn === 'ScrollingFrame' ? (cn === 'ScrollingFrame' ? 'auto' : 'hidden') : 'visible';
        s.order = String(p.LayoutOrder || 0);
        if (p.Active || inst.isA('GuiButton') || cn === 'TextBox' || cn === 'ScrollingFrame') s.pointerEvents = 'auto';
        else s.pointerEvents = 'none';
        if (p.Text !== undefined) {
            const ts = p.TextSize !== undefined && p.TextSize !== 14 ? p.TextSize : (FONT_SIZES[p.FontSize] || 14);
            const fnt = enumNum(p.Font);
            s.fontFamily = ROBLOX_FONTS[fnt] || ROBLOX_FONTS[0];
            if (fnt === 2 || fnt === 4) s.fontWeight = 'bold'; else s.fontWeight = 'normal';
            s.fontSize = (p.TextScaled ? 0 : ts) + 'px';
            if (p.TextScaled) s.fontSize = 'min(' + (size.yo || 24) + 'px, 3vw)';
            s.color = this.rgba(p.TextColor3, p.TextTransparency);
            s.whiteSpace = p.TextWrapped ? 'pre-wrap' : 'pre';
            s.wordBreak = 'break-word';
            if (p.TextStrokeTransparency < 1) {
                const sc = this.rgba(p.TextStrokeColor3, p.TextStrokeTransparency);
                s.textShadow = '-1px -1px 0 ' + sc + ',1px -1px 0 ' + sc + ',-1px 1px 0 ' + sc + ',1px 1px 0 ' + sc;
            } else s.textShadow = 'none';
            const xa = enumNum(p.TextXAlignment), ya = enumNum(p.TextYAlignment);
            if (cn === 'TextBox') {
                el.value = p.Text;
                el.placeholder = p.PlaceholderText || '';
                s.textAlign = xa === 0 ? 'left' : (xa === 2 ? 'right' : 'center');
                s.outline = 'none';
            } else {
                el.textContent = p.Text;
                s.display = p.Visible === false ? 'none' : 'flex';
                s.alignItems = ya === 0 ? 'flex-start' : (ya === 2 ? 'flex-end' : 'center');
                s.justifyContent = xa === 0 ? 'flex-start' : (xa === 2 ? 'flex-end' : 'center');
                s.textAlign = xa === 0 ? 'left' : (xa === 2 ? 'right' : 'center');
            }
        }
        if (p.Image !== undefined) {
            const url = this.world ? this.world.textureUrl(p.Image) : null;
            s.backgroundImage = url ? 'url("' + url + '")' : 'none';
            s.backgroundSize = enumNum(p.ScaleType) === 2 ? 'auto' : '100% 100%';
            s.opacity = String(1 - (p.ImageTransparency || 0));
        }
        if (cn === 'ScrollingFrame') {
            s.scrollbarWidth = 'thin';
        }
    }

    applyLayout(parent) {
        if (!parent) return;
        const pe = this.els.get(parent);
        if (!pe) return;
        const list = parent.children.find(c => c.className === 'UIListLayout');
        const corner = parent.children.find(c => c.className === 'UICorner');
        pe.style.borderRadius = corner ? (corner.props.CornerRadius.Scale * 100 + '%') : '';
        if (corner && corner.props.CornerRadius.Offset) pe.style.borderRadius = corner.props.CornerRadius.Offset + 'px';
        if (list) {
            pe.dataset.flex = '1';
            pe.style.display = parent.props.Visible === false ? 'none' : 'flex';
            pe.style.flexDirection = enumNum(list.props.FillDirection) === 0 ? 'row' : 'column';
            pe.style.gap = (list.props.Padding.Offset || 0) + 'px';
            for (const c of parent.children) {
                const ce = this.els.get(c);
                if (ce) { ce.style.position = 'relative'; ce.style.left = ''; ce.style.top = ''; ce.style.flex = '0 0 auto'; }
            }
        }
    }

    remove(inst) {
        const el = this.els.get(inst);
        if (!el) return;
        if (el.parentNode) el.parentNode.removeChild(el);
        this.els.delete(inst);
    }

    move(inst) {
        const el = this.els.get(inst);
        if (!el) return;
        this.attach(inst, el);
    }

    changed(inst, k) {
        const el = this.els.get(inst);
        if (el) this.apply(inst, el);
        if (inst.className === 'UIListLayout' || inst.className === 'UICorner') this.applyLayout(inst._parent);
    }

    addBillboard(inst) {
        if (this.billboards.has(inst)) return;
        const el = document.createElement('div');
        el.style.cssText = 'position:absolute;pointer-events:none;transform:translate(-50%,-50%);';
        const s = inst.props.Size;
        el.style.width = s.xo + 'px';
        el.style.height = s.yo + 'px';
        this.root.appendChild(el);
        this.billboards.set(inst, { el });
        const walk = (n) => { for (const c of n.children) { this.add(c); walk(c); } };
        walk(inst);
    }

    removeBillboard(inst) {
        const b = this.billboards.get(inst);
        if (!b) return;
        b.el.remove();
        this.billboards.delete(inst);
    }

    showMessage(inst) {
        let el = this.messages.get(inst);
        if (!el) {
            el = document.createElement('div');
            this.msgLayer.appendChild(el);
            this.messages.set(inst, el);
        }
        const hint = inst.className === 'Hint';
        el.style.cssText = hint
            ? 'position:absolute;left:0;top:0;width:100%;padding:6px 12px;background:rgba(0,0,0,0.5);color:#fff;font:bold 16px Arial,sans-serif;text-align:center;box-sizing:border-box;'
            : 'position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.5);color:#fff;font:bold 28px Arial,sans-serif;text-align:center;';
        el.textContent = inst.props.Text;
    }

    hideMessage(inst) {
        const el = this.messages.get(inst);
        if (el) el.remove();
        this.messages.delete(inst);
    }

    update(dt) {
        const world = this.world;
        if (this.billboards.size && world && world.camera) {
            const cam = world.camera;
            const THREE = world.THREE;
            const w = this.root.clientWidth, h = this.root.clientHeight;
            if (!this.vec) this.vec = new THREE.Vector3();
            for (const [inst, b] of this.billboards) {
                let part = inst.props.Adornee;
                if (!part) part = inst._parent;
                if (!part || !part.isA('BasePart')) { b.el.style.display = 'none'; continue; }
                const m = part.props.CFrame.m;
                const off = inst.props.StudsOffset;
                this.vec.set(m[0] + off.x, m[1] + off.y, m[2] + off.z).project(cam);
                if (this.vec.z > 1) { b.el.style.display = 'none'; continue; }
                b.el.style.display = 'block';
                b.el.style.left = ((this.vec.x * 0.5 + 0.5) * w) + 'px';
                b.el.style.top = ((-this.vec.y * 0.5 + 0.5) * h) + 'px';
            }
        }
    }
}
