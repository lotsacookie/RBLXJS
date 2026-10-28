#!/bin/bash
cd /home/claude/src/rt
{
echo '(function (root, factory) {'
echo '    if (typeof module === "object" && module.exports) module.exports = factory(require("./rbx-lua.js"), require("./rbx-physics.js"));'
echo '    else root.RBXRuntime = factory(root.RBXLua, root.RBXPhysics);'
echo '})(typeof self !== "undefined" ? self : this, function (L, RBXPhysics) {'
echo '"use strict";'
cat r1-types.js r2-instance.js r3-physics.js r4-classes.js r5-game.js
cat <<'EOT'
return {
    Game, Instance, CLASSES, ENUMS, Vector3, Vector2, CFrame, Color3, BrickColor, UDim2, UDim, Ray, Signal, PhysicsSync, cfToQuat, cfFromQuat, cfMul, cfInverse, cfPoint, cfVec, cfAngles, cfLookAt, enumNum, nearestBrickColor, BC_PALETTE, gripOf, Tween, HostObject
};
});
EOT
} > /home/claude/rbx-runtime.js
node --check /home/claude/rbx-runtime.js && echo built
