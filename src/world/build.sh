#!/bin/bash
cd /home/claude/src/world
{
echo '(function (root) {'
echo '"use strict";'
echo 'const R = root.RBXRuntime;'
echo 'const RBXPhysics = root.RBXPhysics;'
echo 'const { Vector3, Color3, CFrame, enumNum, cfVec, cfPoint } = R;'
cat w1-core.js w2-fx.js w3-wire.js
echo 'root.RBXWorld = { RBXWorld, RBXEffects, GuiRenderer };'
echo '})(typeof window !== "undefined" ? window : globalThis);'
} > /home/claude/rbx-world.js
node --check /home/claude/rbx-world.js && echo built
