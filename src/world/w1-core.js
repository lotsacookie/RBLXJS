const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 36, 48, 60, 72, 96];
const ROBLOX_FONTS = ['Arial, Helvetica, sans-serif', 'Arial, Helvetica, sans-serif', 'Arial, Helvetica, sans-serif', '"Source Sans Pro", "Segoe UI", Arial, sans-serif', '"Source Sans Pro", "Segoe UI", Arial, sans-serif', '"Source Sans Pro", "Segoe UI", Arial, sans-serif', '"Source Sans Pro", "Segoe UI", Arial, sans-serif'];

const MATERIAL_INFO = {
    256: { name: 'Plastic', studs: true, shininess: 30, spec: 0x222222 },
    272: { name: 'SmoothPlastic', studs: false, shininess: 40, spec: 0x2a2a2a },
    288: { name: 'Neon', studs: false, emissive: true, shininess: 10, spec: 0x000000 },
    512: { name: 'Wood', studs: false, shininess: 12, spec: 0x0c0c0c, texture: 'materials/wood.png' },
    528: { name: 'WoodPlanks', studs: false, shininess: 12, spec: 0x0c0c0c, texture: 'materials/woodplanks.png' },
    784: { name: 'Marble', studs: false, shininess: 60, spec: 0x333333, texture: 'materials/marble.png' },
    800: { name: 'Slate', studs: false, shininess: 8, spec: 0x0a0a0a, texture: 'materials/slate.png' },
    816: { name: 'Concrete', studs: false, shininess: 6, spec: 0x060606, texture: 'materials/concrete.png' },
    832: { name: 'Granite', studs: false, shininess: 40, spec: 0x222222, texture: 'materials/granite.png' },
    848: { name: 'Brick', studs: false, shininess: 8, spec: 0x080808, texture: 'materials/brick.png' },
    880: { name: 'Pebble', studs: false, shininess: 10, spec: 0x0c0c0c, texture: 'materials/pebble.png' },
    1040: { name: 'CorrodedMetal', studs: false, shininess: 50, spec: 0x444444, texture: 'materials/corrodedmetal.png' },
    1056: { name: 'DiamondPlate', studs: false, shininess: 90, spec: 0x777777, texture: 'materials/diamondplate.png' },
    1072: { name: 'Foil', studs: false, shininess: 120, spec: 0xaaaaaa, texture: 'materials/foil.png' },
    1280: { name: 'Grass', studs: false, shininess: 4, spec: 0x040404, texture: 'materials/grass.png' },
    1296: { name: 'Sand', studs: false, shininess: 4, spec: 0x040404, texture: 'materials/sand.png' },
    1312: { name: 'Fabric', studs: false, shininess: 4, spec: 0x040404, texture: 'materials/fabric.png' },
    1536: { name: 'Ice', studs: false, shininess: 100, spec: 0x888888, transparent: 0.25 },
    1568: { name: 'Glass', studs: false, shininess: 100, spec: 0xaaaaaa, transparent: 0.35 },
    1584: { name: 'ForceField', studs: false, shininess: 10, spec: 0x000000, emissive: true, transparent: 0.4 }
};

function mkMatrix(THREE, cf, out) {
    const m = cf.m;
    out.set(m[3], m[4], m[5], m[0], m[6], m[7], m[8], m[1], m[9], m[10], m[11], m[2], 0, 0, 0, 1);
    return out;
}

class RBXWorld {
    constructor(THREE, game, scene, opts) {
        opts = opts || {};
        this.THREE = THREE;
        this.game = game;
        this.scene = scene;
        this.opts = opts;
        this.renderer = opts.renderer || null;
        this.camera = opts.camera || null;
        this.assets = opts.assets || null;
        this.studTexture = opts.studTexture || null;
        this.bottomTexture = opts.bottomTexture || null;
        this.anisotropy = opts.anisotropy || 1;
        this.parts = new Map();
        this.group = new THREE.Group();
        this.group.name = 'rbxParts';
        scene.add(this.group);
        this.geomCache = new Map();
        this.matCache = new Map();
        this.texCache = new Map();
        this.tmpMat = new THREE.Matrix4();
        this.sun = opts.sun || null;
        this.ambient = opts.ambient || null;
        this.sunSprite = opts.sunSprite || null;
        this.lightDir = new THREE.Vector3(100, 200, 100).normalize();
        this.lightPool = [];
        this.lightSources = new Set();
        this.sounds = new Map();
        this.warned = new Set();
        this.skyTextures = null;
        this.shadowDistance = opts.shadowDistance || 200;
        this.defaultBackground = opts.defaultBackground || null;
        this.fx = null;
        this.gui = null;
        this.onLightDirection = opts.onLightDirection || null;
        this.explosions = [];
        this.audioContext = opts.audioContext || null;
        this.focus = new THREE.Vector3();
        this.initLights();
    }

    warnOnce(key, msg) {
        if (this.warned.has(key)) return;
        this.warned.add(key);
        if (this.game) this.game.output('warn', msg);
    }

    initLights() {
        const THREE = this.THREE;
        for (let i = 0; i < 6; i++) {
            const l = new THREE.PointLight(0xffffff, 0, 10, 2);
            l.visible = true;
            this.scene.add(l);
            this.lightPool.push(l);
        }
    }

    attach() {
        const g = this.game;
        const self = this;
        g.hooks.partAdded = (p) => self.addPart(p);
        g.hooks.partRemoved = (p) => self.removePart(p);
        g.hooks.partChanged = (p, k) => self.partChanged(p, k);
        g.hooks.moved = (set) => self.partsMoved(set);
        g.hooks.instanceAdded = (i) => self.instanceAdded(i);
        g.hooks.instanceRemoved = (i) => self.instanceRemoved(i);
        g.hooks.instanceChanged = (i, k, v) => self.instanceChanged(i, k, v);
        g.hooks.lighting = (i, k) => self.applyLighting(i, k);
        g.hooks.sound = (s, a) => self.soundAction(s, a);
        g.hooks.explosion = (e, pos) => self.explosionVisual(e, pos);
        g.hooks.emit = (inst, n) => self.fx && self.fx.burst(inst, n);
        if (this.gui) {
            g.hooks.guiAdded = (i) => self.gui.add(i);
            g.hooks.guiRemoved = (i) => self.gui.remove(i);
            g.hooks.guiMoved = (i) => self.gui.move(i);
        }
    }

    resolve(id) {
        if (!id || typeof id !== 'string') return null;
        let p = id.trim();
        if (p === '') return null;
        if (/^rbxassetid:\/\/|^https?:\/\/[^/]*roblox\.com|^http:\/\/www\.roblox\.com\/asset/i.test(p)) {
            this.warnOnce('asset:' + p, 'Asset ' + p + ' is not available offline');
            return null;
        }
        p = p.replace(/^rbxasset:\/\//i, 'content/').replace(/^rbxasset:/i, 'content/');
        return p;
    }

    textureUrl(id) {
        const p = this.resolve(id);
        if (!p) return null;
        if (this.assets) {
            const u = this.assets.url(p) || this.assets.url(p.replace(/^content\//i, ''));
            if (u) return u;
        }
        return p.replace(/^content\//i, '');
    }

    getTexture(path, repeatX, repeatY) {
        const THREE = this.THREE;
        const key = path + '|' + repeatX + '|' + repeatY;
        let t = this.texCache.get(key);
        if (t) return t;
        const url = this.textureUrl(path);
        if (!url) return null;
        t = new THREE.TextureLoader().load(url);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.set(repeatX || 1, repeatY || 1);
        t.anisotropy = this.anisotropy;
        if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        this.texCache.set(key, t);
        return t;
    }

    partKind(part) {
        const cn = part.className;
        let mesh = null;
        for (const c of part.children) if (c.isA('DataModelMesh')) { mesh = c; break; }
        if (mesh) {
            if (mesh.className === 'BlockMesh') return { kind: 'box', scale: mesh.props.Scale, offset: mesh.props.Offset };
            if (mesh.className === 'CylinderMesh') return { kind: 'cylY', scale: mesh.props.Scale, offset: mesh.props.Offset };
            const mt = enumNum(mesh.props.MeshType);
            const sc = mesh.props.Scale;
            const off = mesh.props.Offset;
            if (mesh.className === 'FileMesh' || mt === 11 || (mesh.props.MeshId && mesh.props.MeshId !== '')) return { kind: 'hidden', scale: sc, offset: off };
            switch (mt) {
                case 0: return { kind: 'head', scale: sc, offset: off };
                case 1: case 8: return { kind: 'box', scale: sc, offset: off };
                case 2: return { kind: 'wedge', scale: sc, offset: off };
                case 7: return { kind: 'cornerwedge', scale: sc, offset: off };
                case 9: return { kind: 'ball', scale: sc, offset: off };
                case 10: return { kind: 'cylY', scale: sc, offset: off };
                default: return { kind: 'box', scale: sc, offset: off };
            }
        }
        if (cn === 'WedgePart') return { kind: 'wedge' };
        if (cn === 'CornerWedgePart') return { kind: 'cornerwedge' };
        if (cn === 'MeshPart' || cn === 'UnionOperation') return { kind: 'box' };
        const shape = enumNum(part.props.Shape);
        if (shape === 0) return { kind: 'ball' };
        if (shape === 2) return { kind: 'cylX' };
        return { kind: 'box' };
    }

    hullGeometry(type, sx, sy, sz) {
        const THREE = this.THREE;
        const key = 'hull|' + type + '|' + sx + '|' + sy + '|' + sz;
        let g = this.geomCache.get(key);
        if (g) return g;
        const shape = new RBXPhysics.Shape({ type, size: [sx, sy, sz] });
        const pos = [], nor = [], uv = [];
        for (let fi = 0; fi < shape.lfaces.length; fi++) {
            const f = shape.lfaces[fi];
            const idx = f.idx;
            const n = f.n;
            const an = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
            const ax = an[0] >= an[1] && an[0] >= an[2] ? 0 : (an[1] >= an[2] ? 1 : 2);
            const uvOf = (v) => (ax === 0 ? [v[2], v[1]] : (ax === 1 ? [v[0], v[2]] : [v[0], v[1]]));
            for (let t = 1; t < idx.length - 1; t++) {
                let a = shape.lv[idx[0]], b = shape.lv[idx[t]], c = shape.lv[idx[t + 1]];
                const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] < 0) { const tmp = b; b = c; c = tmp; }
                for (const v of [a, b, c]) {
                    pos.push(v[0], v[1], v[2]);
                    nor.push(n[0], n[1], n[2]);
                    const u = uvOf(v);
                    uv.push(u[0], u[1]);
                }
            }
        }
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        this.geomCache.set(key, g);
        return g;
    }

    boxGeometry(sx, sy, sz) {
        const THREE = this.THREE;
        const key = 'box|' + sx + '|' + sy + '|' + sz;
        let g = this.geomCache.get(key);
        if (g) return g;
        g = new THREE.BoxGeometry(sx, sy, sz);
        const uv = g.attributes.uv;
        const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
        for (let f = 0; f < 6; f++) {
            for (let i = 0; i < 4; i++) {
                const k = f * 4 + i;
                uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
            }
        }
        uv.needsUpdate = true;
        this.geomCache.set(key, g);
        return g;
    }

    setHeadMesh(buf) {
        const dv = new DataView(buf);
        let i = 0;
        while (i < 32 && dv.getUint8(i) !== 10) i++;
        i++;
        const hs = dv.getUint16(i, true), vs = dv.getUint8(i + 2), nv = dv.getUint32(i + 4, true), nf = dv.getUint32(i + 8, true);
        const o = i + hs;
        const verts = new Float32Array(nv * 8);
        for (let k = 0; k < nv; k++) for (let j = 0; j < 8; j++) verts[k * 8 + j] = dv.getFloat32(o + k * vs + j * 4, true);
        const fo = o + nv * vs;
        const idx = new Uint32Array(nf * 3);
        for (let k = 0; k < nf * 3; k++) idx[k] = dv.getUint32(fo + k * 4, true);
        let dot = 0;
        for (let k = 0; k < nf; k++) {
            const a = idx[k * 3] * 8, b = idx[k * 3 + 1] * 8, c = idx[k * 3 + 2] * 8;
            const e1 = [verts[b] - verts[a], verts[b + 1] - verts[a + 1], verts[b + 2] - verts[a + 2]];
            const e2 = [verts[c] - verts[a], verts[c + 1] - verts[a + 1], verts[c + 2] - verts[a + 2]];
            const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
            dot += cr[0] * verts[a + 3] + cr[1] * verts[a + 4] + cr[2] * verts[a + 5];
        }
        if (dot < 0) for (let k = 0; k < nf; k++) { const t = idx[k * 3 + 1]; idx[k * 3 + 1] = idx[k * 3 + 2]; idx[k * 3 + 2] = t; }
        this.headData = { verts, idx, nv, nf };
    }

    headScaleOf(part) {
        const info = this.partKind(part);
        const s = part.props.Size, sc = info.scale || { x: 1, y: 1, z: 1 };
        return Math.min(s.x * sc.x, s.z * sc.z) / 1.25;
    }

    headGeometry(sx, sy, sz) {
        const THREE = this.THREE;
        const key = 'head|' + sx + '|' + sy + '|' + sz;
        let g = this.geomCache.get(key);
        if (g) return g;
        const d = this.headData;
        const sXZ = Math.min(sx, sz) / 1.25, sY = sy / 1.25;
        const ext = 0.625 * (sY - sXZ);
        const pos = new Float32Array(d.nv * 3), nor = new Float32Array(d.nv * 3), uv = new Float32Array(d.nv * 2);
        for (let k = 0; k < d.nv; k++) {
            const v = d.verts, o = k * 8;
            pos[k * 3] = v[o] * sXZ;
            pos[k * 3 + 1] = v[o + 1] > 0 ? v[o + 1] * sXZ + ext : v[o + 1] * sXZ - ext;
            pos[k * 3 + 2] = v[o + 2] * sXZ;
            nor[k * 3] = v[o + 3]; nor[k * 3 + 1] = v[o + 4]; nor[k * 3 + 2] = v[o + 5];
            uv[k * 2] = v[o + 6]; uv[k * 2 + 1] = 1 - v[o + 7];
        }
        g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(new THREE.BufferAttribute(d.idx, 1));
        this.geomCache.set(key, g);
        return g;
    }

    sphereGeometry() {
        const THREE = this.THREE;
        let g = this.geomCache.get('sphere');
        if (!g) { g = new THREE.SphereGeometry(0.5, 28, 18); this.geomCache.set('sphere', g); }
        return g;
    }

    cylinderGeometry(axis) {
        const THREE = this.THREE;
        const key = 'cyl' + axis;
        let g = this.geomCache.get(key);
        if (!g) {
            g = new THREE.CylinderGeometry(0.5, 0.5, 1, 28, 1);
            if (axis === 'x') g.rotateZ(Math.PI / 2);
            this.geomCache.set(key, g);
        }
        return g;
    }

    surfaceOf(part, prop) {
        return enumNum(part.props[prop]);
    }

    partMaterials(part, kind) {
        const THREE = this.THREE;
        const p = part.props;
        const col = p.Color instanceof Color3 ? p.Color : new Color3(0.64, 0.64, 0.64);
        const hex = col.hex();
        const matId = enumNum(p.Material) || 256;
        const info = MATERIAL_INFO[matId] || MATERIAL_INFO[256];
        const faces = kind === 'box' ? ['RightSurface', 'LeftSurface', 'TopSurface', 'BottomSurface', 'BackSurface', 'FrontSurface'].map(k => this.surfaceOf(part, k)) : [0];
        const tr = Math.max(0, Math.min(1, p.Transparency || 0));
        const refl = p.Reflectance || 0;
        const key = hex + '|' + matId + '|' + faces.join(',') + '|' + tr + '|' + refl;
        let m = this.matCache.get(key);
        if (m) return m;
        const make = (tex) => {
            const opts = { color: hex, specular: info.spec, shininess: info.shininess };
            if (info.emissive) { opts.emissive = hex; }
            const totalTr = Math.max(tr, info.transparent ? Math.max(tr, info.transparent) : 0);
            if (totalTr > 0) { opts.transparent = true; opts.opacity = 1 - totalTr; opts.depthWrite = totalTr < 0.5; }
            const mat = new THREE.MeshPhongMaterial(opts);
            if (tex) mat.map = tex;
            if (refl > 0) { mat.specular = new THREE.Color(0xffffff).multiplyScalar(Math.min(1, 0.2 + refl)); mat.shininess = 80; }
            return mat;
        };
        let baseTex = null;
        if (info.texture) baseTex = this.getTexture(info.texture, 0.25, 0.25);
        const plain = make(baseTex);
        let studM = null, inletM = null;
        if (info.studs && this.studTexture) { studM = make(this.studTexture); }
        if (info.studs && this.bottomTexture) { inletM = make(this.bottomTexture); }
        if (kind === 'box') {
            m = faces.map(s => (s === 3 && studM ? studM : (s === 4 && inletM ? inletM : plain)));
        } else {
            m = plain;
        }
        this.matCache.set(key, m);
        return m;
    }

    buildMesh(part) {
        const THREE = this.THREE;
        const sz = part.props.Size;
        const info = this.partKind(part);
        if (info.kind === 'hidden') return null;
        let sx = sz.x, sy = sz.y, sz2 = sz.z;
        if (info.scale) { sx *= info.scale.x; sy *= info.scale.y; sz2 *= info.scale.z; }
        let geom, kind = info.kind;
        let scaleVec = null;
        switch (kind) {
            case 'box': geom = this.boxGeometry(sx, sy, sz2); break;
            case 'wedge': geom = this.hullGeometry('wedge', sx, sy, sz2); break;
            case 'cornerwedge': geom = this.hullGeometry('cornerwedge', sx, sy, sz2); break;
            case 'head': if (this.headData) { geom = this.headGeometry(sx, sy, sz2); kind = 'other'; break; }
            case 'ball': geom = this.sphereGeometry(); scaleVec = [sx, sy, sz2]; kind = 'other'; break;
            case 'cylX': geom = this.cylinderGeometry('x'); scaleVec = [sx, sy, sz2]; kind = 'other'; break;
            case 'cylY': geom = this.cylinderGeometry('y'); scaleVec = [sx, sy, sz2]; kind = 'other'; break;
            default: geom = this.boxGeometry(sx, sy, sz2);
        }
        const mats = this.partMaterials(part, kind === 'box' ? 'box' : 'other');
        const mesh = new THREE.Mesh(geom, mats);
        if (scaleVec) mesh.userData.scaleVec = scaleVec;
        if (info.offset && (info.offset.x || info.offset.y || info.offset.z)) mesh.userData.offset = info.offset;
        mesh.castShadow = (part.props.Transparency || 0) < 0.9 && part.props.CastShadow !== false;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.userData.part = part;
        return mesh;
    }

    applyTransform(part, mesh) {
        const THREE = this.THREE;
        const m = this.tmpMat;
        mkMatrix(THREE, part.props.CFrame, m);
        const sv = mesh.userData.scaleVec;
        const off = mesh.userData.offset;
        if (off) {
            const e = m.elements;
            const ox = off.x, oy = off.y, oz = off.z;
            e[12] += e[0] * ox + e[4] * oy + e[8] * oz;
            e[13] += e[1] * ox + e[5] * oy + e[9] * oz;
            e[14] += e[2] * ox + e[6] * oy + e[10] * oz;
        }
        mesh.matrix.copy(m);
        if (sv) {
            const e = mesh.matrix.elements;
            for (let i = 0; i < 3; i++) { e[i] *= sv[0]; e[4 + i] *= sv[1]; e[8 + i] *= sv[2]; }
        }
        mesh.matrixWorldNeedsUpdate = true;
        mesh.updateMatrixWorld(true);
    }

    addPart(part) {
        if (this.parts.has(part)) return;
        if (part.ext && part.ext.character) return;
        const entry = { part, mesh: null, decals: [] };
        this.parts.set(part, entry);
        this.rebuild(part);
    }

    rebuild(part) {
        const entry = this.parts.get(part);
        if (!entry) return;
        if (entry.mesh) { this.group.remove(entry.mesh); for (const d of entry.decals) this.group.remove(d); entry.decals = []; }
        const mesh = this.buildMesh(part);
        entry.mesh = mesh;
        if (!mesh) return;
        this.applyTransform(part, mesh);
        this.group.add(mesh);
        this.buildDecals(entry);
        if (this.opts.onMesh) this.opts.onMesh(part, mesh);
    }

    buildDecals(entry) {
        const THREE = this.THREE;
        const part = entry.part;
        for (const c of part.children) {
            if (c.className !== 'Decal' && c.className !== 'Texture') continue;
            const url = this.textureUrl(c.props.Texture);
            if (!url) continue;
            const f = enumNum(c.props.Face);
            const sz = part.props.Size;
            const tex = new THREE.TextureLoader().load(url);
            if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
            const tile = c.className === 'Texture';
            let w, h;
            const planes = [
                { w: sz.z, h: sz.y, pos: [sz.x / 2 + 0.01, 0, 0], rot: [0, Math.PI / 2, 0] },
                { w: sz.x, h: sz.z, pos: [0, sz.y / 2 + 0.01, 0], rot: [-Math.PI / 2, 0, 0] },
                { w: sz.x, h: sz.y, pos: [0, 0, sz.z / 2 + 0.01], rot: [0, 0, 0] },
                { w: sz.z, h: sz.y, pos: [-sz.x / 2 - 0.01, 0, 0], rot: [0, -Math.PI / 2, 0] },
                { w: sz.x, h: sz.z, pos: [0, -sz.y / 2 - 0.01, 0], rot: [Math.PI / 2, 0, 0] },
                { w: sz.x, h: sz.y, pos: [0, 0, -sz.z / 2 - 0.01], rot: [0, Math.PI, 0] }
            ];
            let pl = planes[f];
            if (this.headData && f === 5 && this.partKind(part).kind === 'head') { const hs = this.headScaleOf(part); pl = { w: 1.2 * hs, h: 1.2 * hs, pos: [0, 0, -(0.6 * hs + 0.01)], rot: [0, Math.PI, 0] }; }
            if (!pl) continue;
            if (tile) {
                tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
                tex.repeat.set(pl.w / (c.props.StudsPerTileU || 2), pl.h / (c.props.StudsPerTileV || 2));
            }
            const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 1 - (c.props.Transparency || 0), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pl.w, pl.h), mat);
            const local = new THREE.Matrix4().compose(new THREE.Vector3(pl.pos[0], pl.pos[1], pl.pos[2]), new THREE.Quaternion().setFromEuler(new THREE.Euler(pl.rot[0], pl.rot[1], pl.rot[2])), new THREE.Vector3(1, 1, 1));
            mesh.userData.local = local;
            mesh.matrixAutoUpdate = false;
            mkMatrix(THREE, part.props.CFrame, mesh.matrix).multiply(local);
            mesh.matrixWorldNeedsUpdate = true;
            mesh.updateMatrixWorld(true);
            mesh.userData.decal = c;
            this.group.add(mesh);
            entry.decals.push(mesh);
        }
    }

    removePart(part) {
        const entry = this.parts.get(part);
        if (!entry) return;
        if (entry.mesh) this.group.remove(entry.mesh);
        for (const d of entry.decals) this.group.remove(d);
        this.parts.delete(part);
        if (this.opts.onRemoveMesh) this.opts.onRemoveMesh(part, entry.mesh);
    }

    partChanged(part, k) {
        if (!this.parts.has(part)) return;
        if (k === 'CFrame') return;
        this.rebuild(part);
    }

    partsMoved(set) {
        for (const part of set) {
            const entry = this.parts.get(part);
            if (!entry || !entry.mesh) continue;
            this.applyTransform(part, entry.mesh);
            for (const d of entry.decals) {
                mkMatrix(this.THREE, part.props.CFrame, d.matrix).multiply(d.userData.local);
                d.matrixWorldNeedsUpdate = true;
                d.updateMatrixWorld(true);
            }
        }
    }

    instanceAdded(inst) {
        if (this.fx) this.fx.instanceAdded(inst);
        const cn = inst.className;
        if (cn === 'PointLight' || cn === 'SpotLight' || cn === 'SurfaceLight') this.lightSources.add(inst);
        else if (cn === 'Sky') this.applyLighting(inst, null);
        else if (cn === 'Decal' || cn === 'Texture' || inst.isA('DataModelMesh')) { if (inst._parent && this.parts.has(inst._parent)) this.rebuild(inst._parent); }
        else if (cn === 'Message' || cn === 'Hint') { if (this.gui) this.gui.showMessage(inst); }
        else if (cn === 'BillboardGui') { if (this.gui) this.gui.addBillboard(inst); }
    }

    instanceRemoved(inst) {
        if (this.fx) this.fx.instanceRemoved(inst);
        const cn = inst.className;
        if (cn === 'PointLight' || cn === 'SpotLight' || cn === 'SurfaceLight') this.lightSources.delete(inst);
        else if (cn === 'Sky') this.applyLighting(inst, null);
        else if (cn === 'Sound') this.soundAction(inst, 'stop');
        else if (cn === 'Decal' || cn === 'Texture' || inst.isA('DataModelMesh')) { const p = inst._parent; if (p && this.parts.has(p)) this.rebuild(p); }
        else if (cn === 'Message' || cn === 'Hint') { if (this.gui) this.gui.hideMessage(inst); }
        else if (cn === 'BillboardGui') { if (this.gui) this.gui.removeBillboard(inst); }
    }

    instanceChanged(inst, k, v) {
        if (this.fx) this.fx.instanceChanged(inst, k);
        const cn = inst.className;
        if (cn === 'Decal' || cn === 'Texture' || inst.isA('DataModelMesh')) { const p = inst._parent; if (p && this.parts.has(p)) this.rebuild(p); }
        else if (cn === 'Sound') this.soundAction(inst, k === 'Volume' ? 'volume' : (k === 'Looped' ? 'loop' : 'change'));
        else if (cn === 'Message' || cn === 'Hint') { if (this.gui) this.gui.showMessage(inst); }
    }

    updateLights() {
        const cam = this.camera;
        const pool = this.lightPool;
        if (!cam) return;
        const active = [];
        for (const l of this.lightSources) {
            if (l.props.Enabled === false) continue;
            const p = l._parent;
            if (!p || !p.isA('BasePart')) continue;
            const m = p.props.CFrame.m;
            const dx = m[0] - cam.position.x, dy = m[1] - cam.position.y, dz = m[2] - cam.position.z;
            active.push({ l, d: dx * dx + dy * dy + dz * dz, x: m[0], y: m[1], z: m[2] });
        }
        active.sort((a, b) => a.d - b.d);
        for (let i = 0; i < pool.length; i++) {
            const pl = pool[i];
            const a = active[i];
            if (!a) { pl.intensity = 0; continue; }
            const col = a.l.props.Color;
            pl.color.setRGB(col.r, col.g, col.b);
            pl.intensity = (a.l.props.Brightness || 1) * 1.2;
            pl.distance = Math.max(a.l.props.Range || 8, 1) * 1.5;
            pl.position.set(a.x, a.y, a.z);
        }
    }

    sunDirectionFor(clock, lat) {
        const THREE = this.THREE;
        const h = (clock - 12) / 12 * Math.PI;
        const tilt = (lat === undefined ? 41.7 : lat) * Math.PI / 180;
        const x = Math.sin(h);
        const y = Math.cos(h) * Math.cos(tilt) + 0.15;
        const z = -Math.cos(h) * Math.sin(tilt) * 0.5;
        const v = new THREE.Vector3(-x, y, z);
        return v.normalize();
    }

    applyLighting(inst, k) {
        const THREE = this.THREE;
        const lighting = this.game.getService('Lighting');
        const p = lighting.props;
        const clock = p.ClockTime === undefined ? 14 : p.ClockTime;
        const dir = this.sunDirectionFor(clock, p.GeographicLatitude);
        const up = dir.y;
        const dayF = Math.max(0, Math.min(1, (up + 0.1) / 0.35));
        this.lightDir.copy(dir);
        if (!(up > 0.02)) this.lightDir.set(dir.x, Math.max(0.05, -dir.y * 0.5 + 0.1), dir.z).normalize();
        const out = p.OutdoorAmbient || new Color3(0.5, 0.5, 0.5);
        const amb = p.Ambient || new Color3(0, 0, 0);
        const night = 1 - dayF;
        if (this.ambient) {
            const f = 1 - night * 0.65;
            this.ambient.color.setRGB(Math.min(1, out.r * f + amb.r), Math.min(1, out.g * f + amb.g), Math.min(1, out.b * f + amb.b));
            const base = this.opts.ambientBase === undefined ? 1.15 : this.opts.ambientBase;
            this.ambient.intensity = base;
        }
        if (this.sun) {
            const b = p.Brightness === undefined ? 1 : p.Brightness;
            this.sun.intensity = Math.max(0, 0.9 * b * dayF);
            const cs = p.ColorShift_Top || new Color3(0, 0, 0);
            this.sun.color.setRGB(Math.min(1, 1 + cs.r), Math.min(1, 1 + cs.g), Math.min(1, 1 + cs.b));
            this.sun.castShadow = p.GlobalShadows !== false && dayF > 0.05;
        }
        if (this.onLightDirection) this.onLightDirection(this.lightDir, dayF);
        const fogEnd = p.FogEnd === undefined ? 100000 : p.FogEnd;
        if (fogEnd < 90000) {
            const fc = p.FogColor || new Color3(0.75, 0.75, 0.75);
            this.scene.fog = new THREE.Fog(new THREE.Color(fc.r, fc.g, fc.b), p.FogStart || 0, fogEnd);
        } else {
            this.scene.fog = null;
        }
        this.applySky(lighting, dayF);
    }

    applySky(lighting, dayF) {
        const THREE = this.THREE;
        const sky = lighting.children.find(c => c.className === 'Sky');
        if (sky) {
            const faces = ['SkyboxRt', 'SkyboxLf', 'SkyboxUp', 'SkyboxDn', 'SkyboxFt', 'SkyboxBk'];
            const urls = faces.map(f => this.textureUrl(sky.props[f]));
            if (urls.every(Boolean)) {
                const key = urls.join('|');
                if (this.skyKey !== key) {
                    this.skyKey = key;
                    const loader = new THREE.CubeTextureLoader();
                    this.scene.background = loader.load(urls);
                }
                return;
            }
        }
        if (this.skyKey) { this.skyKey = null; this.scene.background = this.defaultBackground; }
        if (this.opts.onSkyDim) this.opts.onSkyDim(dayF);
    }

    update(dt) {
        this.updateLights();
        if (this.fx) this.fx.update(dt);
        if (this.gui) this.gui.update(dt);
        this.updateExplosions(dt);
    }

    explosionVisual(e, pos) {
        const THREE = this.THREE;
        if (e.props.Visible === false) return;
        const r = e.props.BlastRadius;
        const mat = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(this.sphereGeometry(), mat);
        mesh.position.set(pos.x, pos.y, pos.z);
        mesh.scale.setScalar(0.1);
        this.scene.add(mesh);
        this.explosions.push({ mesh, mat, t: 0, r });
        if (this.fx) this.fx.explosionBurst(pos, r);
    }

    updateExplosions(dt) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const x = this.explosions[i];
            x.t += dt;
            const k = Math.min(1, x.t / 0.55);
            x.mesh.scale.setScalar(Math.max(0.1, x.r * 2 * (1 - Math.pow(1 - k, 2))));
            x.mat.opacity = 0.85 * (1 - k);
            if (k >= 1) {
                this.scene.remove(x.mesh);
                x.mat.dispose();
                this.explosions.splice(i, 1);
            }
        }
    }

    soundAction(s, action) {
        const url = this.textureUrl(s.props.SoundId);
        let rec = this.sounds.get(s);
        if (action === 'stop' || action === 'pause') {
            if (rec) { rec.audio.pause(); if (action === 'stop') { try { rec.audio.currentTime = 0; } catch (e) {} } }
            return;
        }
        if (!url) return;
        if (!rec || rec.url !== url) {
            const audio = new Audio();
            audio.crossOrigin = 'anonymous';
            audio.src = url;
            audio.addEventListener('ended', () => { s.props.Playing = false; s.fireSignal('Ended'); });
            rec = { audio, url };
            this.sounds.set(s, rec);
        }
        rec.audio.volume = Math.max(0, Math.min(1, s.props.Volume === undefined ? 0.5 : s.props.Volume));
        rec.audio.loop = !!s.props.Looped;
        rec.audio.playbackRate = Math.max(0.25, Math.min(4, s.props.PlaybackSpeed || s.props.Pitch || 1));
        if (action === 'seek') { try { rec.audio.currentTime = s.props.TimePosition || 0; } catch (e) {} return; }
        if (action === 'play') {
            const pr = rec.audio.play();
            if (pr && pr.catch) pr.catch(() => {});
        }
    }
}
