(function (root) {
"use strict";
const R = root.RBXRuntime;
const RBXPhysics = root.RBXPhysics;
const { Vector3, Color3, CFrame, enumNum, cfVec, cfPoint } = R;
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
            case 'ball': case 'head': geom = this.sphereGeometry(); scaleVec = [sx, sy, sz2]; kind = 'other'; break;
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
            const pl = planes[f];
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
(function () {
    const orig = RBXWorld.prototype.attach;
    RBXWorld.prototype.attach = function () {
        orig.call(this);
        const g = this.game;
        const prevChanged = g.hooks.instanceChanged;
        g.hooks.instanceChanged = (i, k, v) => {
            if (prevChanged) prevChanged(i, k, v);
            if (this.gui && (i.isA('GuiBase') || i.className === 'UIListLayout' || i.className === 'UICorner')) this.gui.changed(i, k);
        };
    };
})();
root.RBXWorld = { RBXWorld, RBXEffects, GuiRenderer };
})(typeof window !== "undefined" ? window : globalThis);
