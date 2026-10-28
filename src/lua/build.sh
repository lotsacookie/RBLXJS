#!/bin/bash
cd /home/claude/src/lua
{
echo '(function (root, factory) {'
echo '    if (typeof module === "object" && module.exports) module.exports = factory();'
echo '    else root.RBXLua = factory();'
echo '})(typeof self !== "undefined" ? self : this, function () {'
echo '"use strict";'
cat 01-lexer.js 02-parser.js 03-codegen.js 04-runtime.js 05-stdlib.js 06-state.js
cat <<'EOT'
return {
    createState, syntaxCheck, compileToJs, LuaTable, LuaFunction, LuaError, LuaSyntaxError, Thread,
    tostr, tonum, typeName, typeofName, index, setindex, callSync, call, ret, first, fmtNumber, eq, lt, le, S, errorValue, objectId
};
});
EOT
} > /home/claude/rbx-lua.js
node --check /home/claude/rbx-lua.js && echo built
