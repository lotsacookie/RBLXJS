(function (root) {
"use strict";
const UI = 'assets/textures/ui/';
const TOPBAR = 36;
const ICON = 60;
const BUF = 5;
const SLOTS = 10;
const BG = '#1f1f1f';

function el(tag, css, parent, attrs) {
    const e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (attrs) for (const k in attrs) { if (k === 'text') e.textContent = attrs[k]; else e[k] = attrs[k]; }
    if (parent) parent.appendChild(e);
    return e;
}

function img(src, css, parent) {
    const i = el('img', 'position:absolute;pointer-events:none;user-select:none;' + (css || ''), parent);
    i.draggable = false;
    i.src = src;
    return i;
}

function lerp(a, b, t) { return a + (b - a) * t; }

function healthColor(p) {
    const red = [255, 28, 0], yellow = [250, 235, 0], green = [27, 252, 107];
    let c;
    if (p < 0.14) c = red;
    else if (p > 0.5) { const t = (p - 0.5) / 0.5; c = [lerp(yellow[0], green[0], t), lerp(yellow[1], green[1], t), lerp(yellow[2], green[2], t)]; }
    else { const t = (p - 0.14) / 0.36; c = [lerp(red[0], yellow[0], t), lerp(red[1], yellow[1], t), lerp(red[2], yellow[2], t)]; }
    return 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
}

const FONT = '"Source Sans Pro","Segoe UI",Arial,sans-serif';

class RBXHud {
    constructor(game, container, opts) {
        this.game = game;
        this.opts = opts || {};
        this.root = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:40;font-family:' + FONT + ';color:#fff;user-select:none;', container);
        this.lastHealth = null;
        this.timer = 0;
        this.menuOpen = false;
        this.invOpen = false;
        this.chatVisible = true;
        this.listVisible = true;
        this.hotbarKey = '';
        this.listKey = '';
        this.buildHurt();
        this.buildTopbar();
        this.buildPlayerList();
        this.buildChat();
        this.buildHotbar();
        this.buildMenu();
        game.hooks.hotbar = () => this.rebuildHotbar();
    }

    buildHurt() {
        this.hurt = img('assets/textures/HurtOverlay.png', 'left:0;top:0;width:100%;height:100%;display:none;z-index:1;object-fit:fill;transform-origin:50% 50%;', this.root);
    }

    iconButton(parent, w, normal, down, iw, ih, onClick) {
        const b = el('div', 'position:relative;width:' + w + 'px;height:' + TOPBAR + 'px;cursor:pointer;pointer-events:auto;display:inline-block;vertical-align:top;', parent);
        const i = img(normal, 'left:50%;top:50%;width:' + iw + 'px;height:' + ih + 'px;margin-left:' + (-iw / 2) + 'px;margin-top:' + (-ih / 2) + 'px;', b);
        b.addEventListener('mousedown', () => { i.src = down; });
        b.addEventListener('mouseup', () => { i.src = normal; });
        b.addEventListener('mouseleave', () => { i.src = normal; });
        b.addEventListener('click', onClick);
        return b;
    }

    buildTopbar() {
        this.bar = el('div', 'position:absolute;left:0;top:0;width:100%;height:' + TOPBAR + 'px;background:' + BG + ';pointer-events:auto;z-index:2;', this.root);
        img(UI + 'TopBar/dropshadow.png', 'left:0;top:' + TOPBAR + 'px;width:100%;height:3px;', this.bar);
        this.left = el('div', 'position:absolute;left:0;top:0;height:' + TOPBAR + 'px;white-space:nowrap;font-size:0;', this.bar);
        this.iconButton(this.left, 50, UI + 'Menu/Hamburger.png', UI + 'Menu/HamburgerDown.png', 32, 25, () => this.toggleMenu());
        this.chatBtn = this.iconButton(this.left, 50, UI + 'Chat/ToggleChat.png', UI + 'Chat/ToggleChatDown.png', 28, 27, () => this.toggleChat());
        this.bpBtn = this.iconButton(this.left, 50, UI + 'Backpack/Backpack.png', UI + 'Backpack/Backpack_Down.png', 22, 28, () => this.toggleInventory());
        this.right = el('div', 'position:absolute;right:0;top:0;height:' + TOPBAR + 'px;white-space:nowrap;display:flex;flex-direction:row;', this.bar);
        this.nameBox = el('div', 'position:relative;width:170px;height:' + TOPBAR + 'px;flex:none;', this.right);
        this.nameText = el('div', 'position:absolute;left:7px;top:0;width:156px;height:22px;line-height:22px;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;', this.nameBox);
        this.healthBg = el('div', 'position:absolute;left:7px;top:' + (TOPBAR - 9) + 'px;width:156px;height:3px;background:rgb(228,236,246);', this.nameBox);
        this.healthFill = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgb(27,252,107);', this.healthBg);
        this.stats = el('div', 'position:relative;height:' + TOPBAR + 'px;display:flex;flex-direction:row;flex:none;', this.right);
    }

    buildPlayerList() {
        this.list = el('div', 'position:absolute;right:2px;top:' + (TOPBAR + 2) + 'px;width:165px;pointer-events:auto;z-index:1;', this.root);
    }

    buildChat() {
        this.chat = el('div', 'position:absolute;left:0;top:' + (TOPBAR + 2) + 'px;width:38%;max-width:475px;min-width:260px;z-index:1;pointer-events:none;', this.root);
        this.chatLog = el('div', 'width:100%;height:150px;overflow:hidden;background:rgba(0,0,0,0.5);font-size:14px;line-height:18px;padding:3px 6px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;', this.chat);
        this.chatInput = el('input', 'display:block;width:100%;height:24px;box-sizing:border-box;border:0;outline:0;background:rgba(0,0,0,0.5);color:#fff;font:14px ' + FONT + ';padding:0 6px;pointer-events:auto;margin-top:2px;', this.chat, { type: 'text', placeholder: 'To chat click here or press / key', maxLength: 200 });
        this.chatInput.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
                const t = this.chatInput.value.trim();
                this.chatInput.value = '';
                if (t) this.say(t);
                this.chatInput.blur();
            } else if (e.key === 'Escape') {
                this.chatInput.value = '';
                this.chatInput.blur();
            }
        });
        this.chatInput.addEventListener('keyup', (e) => e.stopPropagation());
        this.chatLines = [];
    }

    say(text) {
        const p = this.game.localPlayer;
        if (!p) return;
        try { p.fireSignal('Chatted', text); } catch (e) { }
        this.addChat(p.props.Name, text);
    }

    addChat(name, text) {
        const row = el('div', 'word-wrap:break-word;text-shadow:0 0 2px #000;', this.chatLog);
        if (name) el('span', 'font-weight:700;color:#d7c59a;', row, { text: '[' + name + ']: ' });
        el('span', '', row, { text: text });
        this.chatLines.push({ row, t: performance.now() });
        while (this.chatLog.childNodes.length > 60) this.chatLog.removeChild(this.chatLog.firstChild);
    }

    toggleChat() {
        this.chatVisible = !this.chatVisible;
        this.chat.style.display = this.chatVisible ? 'block' : 'none';
    }

    buildHotbar() {
        const w = BUF + SLOTS * (ICON + BUF);
        this.hot = el('div', 'position:absolute;left:50%;bottom:0;width:' + w + 'px;height:' + (ICON + BUF * 2) + 'px;margin-left:' + (-w / 2) + 'px;pointer-events:none;z-index:1;', this.root);
        this.inv = el('div', 'position:absolute;left:50%;width:' + w + 'px;margin-left:' + (-w / 2) + 'px;bottom:' + (ICON + BUF * 2) + 'px;height:' + ((ICON + BUF * 2) * 4 + 40) + 'px;background:rgba(31,31,31,0.5);display:none;pointer-events:auto;z-index:1;', this.root);
        this.invHead = el('div', 'height:40px;line-height:40px;padding-left:12px;font-size:18px;font-weight:700;', this.inv, { text: 'Backpack' });
        this.invGrid = el('div', 'position:absolute;left:0;top:40px;right:0;bottom:0;overflow-y:auto;', this.inv);
        this.arrow = el('div', 'position:absolute;left:50%;bottom:' + (ICON + BUF * 2 + 2) + 'px;width:14px;height:9px;margin-left:-7px;cursor:pointer;pointer-events:auto;z-index:2;display:none;', this.root);
        this.arrowImg = img(UI + 'Backpack_Open.png', 'left:0;top:0;width:14px;height:9px;', this.arrow);
        this.arrow.addEventListener('click', () => this.toggleInventory());
    }

    makeSlot(tool, index, left, top, parent) {
        const game = this.game;
        const held = game.heldTool === tool;
        const s = el('div', 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + ICON + 'px;height:' + ICON + 'px;background:rgb(49,49,49);cursor:pointer;pointer-events:auto;box-sizing:border-box;' + (held ? 'border:6px solid rgb(90,142,233);' : ''), parent);
        const tex = tool.props.TextureId;
        if (tex && !/^rbxassetid|^https?:|^rbxasset:\/\/\d/i.test(tex)) {
            img(tex.replace(/^rbxasset:\/\//i, 'assets/'), 'left:10%;top:10%;width:80%;height:80%;', s);
        } else {
            el('div', 'position:absolute;left:1px;top:1px;right:1px;bottom:1px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:14px;font-weight:700;overflow:hidden;word-break:break-word;', s, { text: tool.props.Name });
        }
        if (index !== null) el('div', 'position:absolute;left:2px;top:1px;font-size:11px;font-weight:700;', s, { text: String(index === 9 ? 0 : index + 1) });
        s.addEventListener('click', () => this.toggleTool(tool));
        return s;
    }

    toggleTool(tool) {
        const game = this.game;
        if (game.heldTool === tool) game.unequipTool(); else game.equipTool(tool);
        this.rebuildHotbar();
    }

    slotKey(n) {
        const tools = this.game.hotbarTools();
        const t = tools[n];
        if (t) this.toggleTool(t);
    }

    rebuildHotbar() {
        const game = this.game;
        const tools = game.hotbarTools().slice(0, SLOTS);
        const key = tools.map(t => t.props.Name + (game.heldTool === t ? '*' : '')).join('|') + (this.invOpen ? 'o' : '');
        if (key === this.hotbarKey) return;
        this.hotbarKey = key;
        this.hot.textContent = '';
        const sizePlus = ICON + BUF;
        const centered = this.hot.clientWidth / 2;
        const n = tools.length;
        for (let i = 0; i < n; i++) {
            const factor = i - (n - 1) / 2;
            this.makeSlot(tools[i], i, centered - ICON / 2 + sizePlus * factor, BUF, this.hot);
        }
        this.arrow.style.display = game.hotbarTools().length > 0 ? 'block' : 'none';
        this.invGrid.textContent = '';
        const all = game.hotbarTools();
        const cols = SLOTS;
        all.forEach((t, i) => this.makeSlot(t, null, BUF + (i % cols) * sizePlus, BUF + Math.floor(i / cols) * sizePlus, this.invGrid));
    }

    toggleInventory() {
        this.invOpen = !this.invOpen;
        this.inv.style.display = this.invOpen ? 'block' : 'none';
        this.arrowImg.src = UI + (this.invOpen ? 'Backpack_Close.png' : 'Backpack_Open.png');
        this.arrow.style.bottom = (this.invOpen ? ICON + BUF * 2 + (ICON + BUF * 2) * 4 + 40 + 2 : ICON + BUF * 2 + 2) + 'px';
        this.hotbarKey = '';
        this.rebuildHotbar();
    }

    buildMenu() {
        this.menu = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:none;pointer-events:auto;z-index:5;', this.root);
        const panel = el('div', 'position:absolute;left:50%;top:50%;width:420px;margin-left:-210px;margin-top:-170px;background:rgba(31,31,31,0.95);padding:18px;box-sizing:border-box;border-radius:4px;', this.menu);
        const tabs = el('div', 'display:flex;border-bottom:1px solid #555;margin-bottom:16px;', panel);
        const pages = {};
        const names = ['Home', 'Players', 'Help'];
        const show = (n) => {
            for (const k of names) { pages[k].style.display = k === n ? 'block' : 'none'; tabEls[k].style.background = k === n ? 'rgba(255,255,255,0.15)' : 'transparent'; }
            if (n === 'Players') this.fillMenuPlayers(pages.Players);
        };
        const tabEls = {};
        const icons = { Home: 'HomeTab.png', Players: 'PlayersTabIcon.png', Help: 'HelpTab.png' };
        for (const n of names) {
            const t = el('div', 'flex:1;height:44px;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;font-size:18px;font-weight:700;', tabs);
            img(UI + 'Settings/MenuBarIcons/' + icons[n], 'position:static;width:28px;height:28px;', t);
            el('span', '', t, { text: n });
            t.addEventListener('click', () => show(n));
            tabEls[n] = t;
            pages[n] = el('div', 'display:none;', panel);
        }
        const btn = (parent, text, src, fn) => {
            const b = el('div', 'height:50px;line-height:50px;text-align:center;font-size:24px;font-weight:700;cursor:pointer;margin-bottom:12px;background:url(' + UI + src + ') center/100% 100% no-repeat;', parent, { text });
            b.addEventListener('click', fn);
            return b;
        };
        btn(pages.Home, 'Resume Game', 'btn_newBlue.png', () => this.toggleMenu(false));
        btn(pages.Home, 'Reset Character', 'btn_newGrey.png', () => { const h = this.game.humanoid(); if (h) this.opts.kill && this.opts.kill(h); this.toggleMenu(false); });
        btn(pages.Home, 'Leave Game', 'btn_newGrey.png', () => { if (this.opts.onLeave) this.opts.onLeave(); });
        const help = [['Move', 'W A S D / Arrow keys'], ['Jump', 'Space'], ['Camera', 'Hold right mouse button, mouse wheel to zoom'], ['Chat', '/'], ['Tools', '1-0, click to use'], ['Backpack', '`'], ['Player list', 'Tab'], ['Menu', 'Esc']];
        for (const h of help) {
            const r = el('div', 'display:flex;justify-content:space-between;font-size:16px;padding:6px 0;border-bottom:1px solid #333;', pages.Help);
            el('span', 'font-weight:700;', r, { text: h[0] });
            el('span', '', r, { text: h[1] });
        }
        this.showTab = show;
        show('Home');
        this.kickBox = el('div', 'position:absolute;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:none;pointer-events:auto;z-index:9;', this.root);
        this.kickText = el('div', 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:24px;font-weight:700;text-align:center;max-width:80%;', this.kickBox);
    }

    fillMenuPlayers(page) {
        page.textContent = '';
        for (const p of this.players()) {
            el('div', 'font-size:18px;padding:8px 4px;border-bottom:1px solid #333;', page, { text: p.props.Name });
        }
    }

    toggleMenu(force) {
        this.menuOpen = force === undefined ? !this.menuOpen : force;
        this.menu.style.display = this.menuOpen ? 'block' : 'none';
        if (this.menuOpen) this.showTab('Home');
    }

    kick(msg) {
        this.kickText.textContent = msg || 'You were kicked';
        this.kickBox.style.display = 'block';
    }

    players() {
        return this.game.getService('Players').children.filter(c => c.className === 'Player');
    }

    handleKey(e) {
        if (e.type !== 'keydown') return false;
        if (e.code === 'Escape') { this.toggleMenu(); return true; }
        if (this.menuOpen) return true;
        if (e.key === '/') { this.chat.style.display = 'block'; this.chatVisible = true; this.chatInput.focus(); e.preventDefault(); return true; }
        if (e.code === 'Tab') { this.listVisible = !this.listVisible; this.list.style.display = this.listVisible ? 'block' : 'none'; e.preventDefault(); return true; }
        if (e.code === 'Backquote') { this.toggleInventory(); return true; }
        if (e.code === 'Backspace') { this.game.dropTool(); this.rebuildHotbar(); return true; }
        const m = /^Digit(\d)$/.exec(e.code);
        if (m) { const n = Number(m[1]); this.slotKey(n === 0 ? 9 : n - 1); return true; }
        return false;
    }

    animateHurt() {
        const h = this.hurt;
        h.style.transition = 'none';
        h.style.display = 'block';
        h.style.opacity = '1';
        h.style.transform = 'scale(20)';
        void h.offsetWidth;
        h.style.transition = 'transform 0.2s linear';
        h.style.transform = 'scale(1)';
        clearTimeout(this.hurtTimer);
        this.hurtTimer = setTimeout(() => {
            h.style.transition = 'opacity 0.35s linear';
            h.style.opacity = '0';
            this.hurtTimer = setTimeout(() => { h.style.display = 'none'; }, 380);
        }, 220);
    }

    updateStats() {
        const p = this.game.localPlayer;
        const ls = p && p.findChild('leaderstats');
        const items = ls ? ls.children.filter(c => c.props.Value !== undefined).slice(0, 4) : [];
        const key = items.map(c => c.props.Name + '=' + c.props.Value).join('|');
        if (key === this.statKey) return;
        this.statKey = key;
        this.stats.textContent = '';
        items.forEach((c, i) => {
            const col = el('div', 'position:relative;width:' + (75 + (i === items.length - 1 ? 0 : 2)) + 'px;height:' + TOPBAR + 'px;flex:none;', this.stats);
            el('div', 'position:absolute;left:2px;top:4px;width:73px;height:10px;font-size:12px;line-height:10px;white-space:nowrap;overflow:hidden;', col, { text: c.props.Name });
            el('div', 'position:absolute;left:2px;top:15px;width:73px;height:16px;font-size:14px;font-weight:700;line-height:16px;white-space:nowrap;overflow:hidden;', col, { text: String(c.props.Value) });
        });
    }

    updateList() {
        const ps = this.players();
        const me = this.game.localPlayer;
        const key = ps.map(p => p.props.Name + (p === me ? '!' : '')).join('|');
        if (key === this.listKey) return;
        this.listKey = key;
        this.list.textContent = '';
        for (const p of ps) {
            const row = el('div', 'height:24px;line-height:24px;margin-bottom:2px;padding-left:6px;box-sizing:border-box;background:' + (p === me ? 'rgba(106,106,106,0.5)' : 'rgba(31,31,31,0.5)') + ';color:rgb(255,255,243);font-size:14px;font-weight:700;text-shadow:0 0 1px rgba(34,34,34,0.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;', this.list, { text: p.props.Name });
            row.title = p.props.Name;
        }
    }

    update(dt) {
        const game = this.game;
        const hum = game.humanoid();
        const p = game.localPlayer;
        if (p) this.nameText.textContent = p.props.Name;
        if (hum) {
            const max = hum.props.MaxHealth;
            let pct = max > 0 ? hum.props.Health / max : 0;
            pct = Math.max(0, Math.min(1, pct));
            this.healthFill.style.width = (pct * 100) + '%';
            this.healthFill.style.background = healthColor(pct);
            const h = hum.props.Health;
            if (this.lastHealth !== null && this.lastHealth - h >= max * 0.05 && h !== max) this.animateHurt();
            this.lastHealth = h;
        }
        const now = performance.now();
        for (const l of this.chatLines) {
            const age = (now - l.t) / 1000;
            l.row.style.opacity = age > 30 ? Math.max(0, 1 - (age - 30) / 2) : 1;
        }
        this.timer += dt;
        if (this.timer > 0.4) {
            this.timer = 0;
            this.updateStats();
            this.updateList();
            this.rebuildHotbar();
        }
    }
}

root.RBXHud = RBXHud;
})(typeof window !== "undefined" ? window : globalThis);
