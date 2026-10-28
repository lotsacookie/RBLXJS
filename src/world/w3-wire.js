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
