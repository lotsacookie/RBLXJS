(function () {
"use strict";
const THREE = window.THREE;
const R = window.RBXRuntime;
const W = window.RBXWorld;
const P = window.RBXParser;
const stage = document.getElementById('stage');
const status = document.getElementById('status');
const loading = document.getElementById('loading');
const params = new URLSearchParams(location.search);

const MATERIALS = {
    'materials/wood.png': 'Wood', 'materials/woodplanks.png': 'Wood', 'materials/slate.png': 'Slate', 'materials/concrete.png': 'Concrete',
    'materials/grass.png': 'Grass', 'materials/ice.png': 'Ice', 'materials/metal.png': 'DiamondPlate', 'materials/diamondplate.png': 'DiamondPlate',
    'materials/corrodedmetal.png': 'CorrodedMetal', 'materials/foil.png': 'Foil', 'materials/plastic.png': 'Plastic'
};
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const assets = {
    url(p) {
        const low = String(p).toLowerCase();
        if (low.indexOf('materials/') === 0) return MATERIALS[low] ? 'assets/textures/ui/' + MATERIALS[low] + '.png' : BLANK;
        p = String(p).replace(/^content\//i, '');
        if (!/^(textures|sky|sounds|fonts|particles)\//i.test(p)) p = 'textures/' + p;
        return 'assets/' + p;
    }
};

const CODES = { Space: 32, Enter: 13, Escape: 27, Backspace: 8, Tab: 9, ArrowUp: 273, ArrowDown: 274, ArrowRight: 275, ArrowLeft: 276, ShiftLeft: 304, ShiftRight: 303, ControlLeft: 306, ControlRight: 305, AltLeft: 308, AltRight: 307, Backquote: 96, Slash: 47 };
function robloxKey(e) {
    const c = e.code;
    if (CODES[c] !== undefined) return CODES[c];
    let m = /^Key([A-Z])$/.exec(c);
    if (m) return m[1].toLowerCase().charCodeAt(0);
    m = /^Digit(\d)$/.exec(c);
    if (m) return 48 + Number(m[1]);
    return e.keyCode;
}

function openDb() {
    return new Promise((res, rej) => {
        const r = indexedDB.open('rbxjs', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('places');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    });
}

async function storedPlace() {
    try {
        const db = await openDb();
        return await new Promise((res) => {
            const q = db.transaction('places').objectStore('places').get('current');
            q.onsuccess = () => res(q.result || null);
            q.onerror = () => res(null);
        });
    } catch (e) { return null; }
}

function setStatus(t) { status.textContent = t; }

async function main() {
    setStatus('Starting renderer');
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    stage.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 5000);
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 1; sc.far = 500;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(sun.target);
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const loader = new THREE.TextureLoader();
    const tex = (u) => {
        const t = loader.load(u);
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        if (THREE.sRGBEncoding !== undefined) t.encoding = THREE.sRGBEncoding;
        return t;
    };
    const faces = ['rt', 'lf', 'up', 'dn', 'ft', 'bk'].map(f => 'assets/sky/null_plainsky512_' + f + '.jpg');
    const skyBox = new THREE.CubeTextureLoader().load(faces);
    scene.background = skyBox;

    let lightDir = new THREE.Vector3(0.4, 0.8, 0.4).normalize();
    let audio = null;
    try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }

    const logs = [];
    const dev = document.getElementById('console');
    const log = (kind, text) => {
        logs.push(kind + ': ' + text);
        if (logs.length > 200) logs.shift();
        if (kind === 'error' || kind === 'err') console.error(text); else console.log(text);
        dev.textContent = logs.join('\n');
        dev.scrollTop = dev.scrollHeight;
    };

    let hud = null;
    const game = new R.Game({
        out: (k, t) => log(k, t),
        onError: (m) => log('error', m),
        hooks: { kick: (m) => hud && hud.kick(m) }
    });
    game.playerName = params.get('name') || 'Player1';

    const world = new W.RBXWorld(THREE, game, scene, {
        renderer, camera, assets, sun, ambient, audioContext: audio,
        studTexture: tex('assets/textures/ui/Studs.png'),
        bottomTexture: tex('assets/textures/ui/Inlets.png'),
        anisotropy: renderer.capabilities.getMaxAnisotropy(),
        defaultBackground: skyBox,
        onLightDirection: (d) => { lightDir = d.clone(); }
    });
    world.fx = new W.RBXEffects(THREE, world);
    world.gui = new W.GuiRenderer(game, stage, world);
    world.attach();

    setStatus('Loading character mesh');
    try { world.setHeadMesh(await (await fetch('assets/fonts/head.mesh')).arrayBuffer()); } catch (e) { log('error', 'head mesh: ' + e.message); }

    setStatus('Loading place');
    let place = null;
    const url = params.get('place');
    if (url) place = { name: url, data: await (await fetch(url)).arrayBuffer() };
    else place = await storedPlace();
    if (place && place.data) {
        document.title = (place.name || 'Place') + ' - RBLXJS';
        const parsed = P.parseAsync ? await P.parseAsync(place.data) : P.parse(place.data);
        game.loadParsed(parsed);
    } else {
        game.loadBaseplate();
    }

    hud = new window.RBXHud(game, stage, {
        kill: (h) => { try { R.CLASSES.Humanoid.methods.TakeDamage(h, h.props.MaxHealth); } catch (e) { h.props.Health = 0; } },
        onLeave: () => { location.href = 'launcher.html'; }
    });

    const ctl = new window.RBXControllerLib.RBXController(game);
    setStatus('Starting game');
    game.start();

    let camYaw = 0, camElev = 0.35, camDist = 12.5;
    let rmb = false;
    let w = 1, h = 1;
    const resize = () => {
        w = stage.clientWidth; h = stage.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    resize();

    const canvas = renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    const typing = () => { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA'); };

    window.addEventListener('keydown', (e) => {
        if (audio && audio.state === 'suspended') audio.resume();
        if (typing()) return;
        if (e.code === 'F9') { dev.style.display = dev.style.display === 'block' ? 'none' : 'block'; e.preventDefault(); return; }
        if (hud.handleKey(e)) { return; }
        if (hud.menuOpen) return;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].indexOf(e.code) >= 0) e.preventDefault();
        if (e.repeat) return;
        ctl.keys.add(e.code);
        game.input('keydown', { code: robloxKey(e), processed: false });
    });
    window.addEventListener('keyup', (e) => {
        if (typing()) return;
        ctl.keys.delete(e.code);
        game.input('keyup', { code: robloxKey(e), processed: false });
    });
    window.addEventListener('blur', () => ctl.keys.clear());

    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const aim = (x, y) => {
        const r = canvas.getBoundingClientRect();
        ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const o = ray.ray.origin, d = ray.ray.direction;
        const ch = game.character();
        const hit = game.phys.raycast(o, d, 1000, ch ? [ch] : []);
        const hp = hit ? hit.position : new R.Vector3(o.x + d.x * 1000, o.y + d.y * 1000, o.z + d.z * 1000);
        game.updateMouse(hp, hit ? hit.part : null, x - r.left, y - r.top, new R.Ray(new R.Vector3(o.x, o.y, o.z), new R.Vector3(d.x, d.y, d.z)), r.width, r.height);
        return hit;
    };

    canvas.addEventListener('mousemove', (e) => {
        if (rmb) {
            camYaw -= e.movementX * 0.008;
            camElev = Math.max(-1.35, Math.min(1.35, camElev + e.movementY * 0.008));
        }
        aim(e.clientX, e.clientY);
        game.input('mousemove', { x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('mousedown', (e) => {
        if (audio && audio.state === 'suspended') audio.resume();
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        if (e.button === 2) { rmb = true; return; }
        const hit = aim(e.clientX, e.clientY);
        game.input('mousedown', { button: e.button, x: e.clientX, y: e.clientY });
        if (e.button === 0) {
            if (hit) game.clickPart(hit.part);
            if (game.heldTool) game.activateTool(game.heldTool);
        }
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 2) rmb = false;
        game.input('mouseup', { button: e.button, x: e.clientX, y: e.clientY });
    });
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camDist = Math.max(0.5, Math.min(128, camDist * (e.deltaY > 0 ? 1.15 : 1 / 1.15)));
        game.input('wheel', { delta: -e.deltaY });
    }, { passive: false });

    const tmpM = new THREE.Matrix4();
    const focusV = new THREE.Vector3();
    let last = performance.now();
    loading.style.display = 'none';

    function frame(now) {
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        ctl.camYaw = camYaw;
        ctl.update(dt);
        game.update(dt);
        const f = ctl.focus;
        if (game.cameraScriptable()) {
            const m = game.camera.props.CFrame.m;
            tmpM.set(m[3], m[4], m[5], m[0], m[6], m[7], m[8], m[1], m[9], m[10], m[11], m[2], 0, 0, 0, 1);
            tmpM.decompose(camera.position, camera.quaternion, camera.scale);
            camera.fov = game.camera.props.FieldOfView || 70;
            camera.updateProjectionMatrix();
            focusV.set(m[0], m[1], m[2]);
        } else if (game.character()) {
            const ce = Math.cos(camElev);
            const bx = Math.sin(camYaw) * ce, by = Math.sin(camElev), bz = Math.cos(camYaw) * ce;
            let dist = camDist;
            const ch = game.character();
            const hit = game.phys.raycast({ x: f.x, y: f.y, z: f.z }, { x: bx, y: by, z: bz }, camDist + 0.3, [ch]);
            if (hit) dist = Math.max(0.5, hit.distance - 0.3);
            camera.position.set(f.x + bx * dist, f.y + by * dist, f.z + bz * dist);
            camera.up.set(0, 1, 0);
            camera.lookAt(f.x, f.y, f.z);
            camera.fov = 70;
            camera.updateProjectionMatrix();
            focusV.set(f.x, f.y, f.z);
            camera.updateMatrixWorld(true);
            const cm = camera.matrixWorld.elements;
            const cf = new R.CFrame([camera.position.x, camera.position.y, camera.position.z, cm[0], cm[4], cm[8], cm[1], cm[5], cm[9], cm[2], cm[6], cm[10]]);
            game.syncCamera(cf, 70, w, h);
        }
        sun.position.set(focusV.x + lightDir.x * 150, focusV.y + lightDir.y * 150, focusV.z + lightDir.z * 150);
        sun.target.position.copy(focusV);
        world.update(dt);
        if (world.fx) world.fx.update(dt);
        if (world.gui) world.gui.update(dt);
        hud.update(dt);
        renderer.render(scene, camera);
        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

main().catch((e) => {
    console.error(e);
    status.textContent = 'Failed to start: ' + (e && e.message ? e.message : e);
});
})();
