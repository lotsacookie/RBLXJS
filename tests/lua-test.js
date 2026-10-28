const R = require('/home/claude/rbx-lua.js');
const out = [];
const st = R.createState({ out: (k, t) => out.push(t), onError: (m) => out.push('ERR ' + m) });
function run(src, name) {
    out.length = 0;
    const env = st.makeEnv();
    try {
        const f = st.load(src, name || 't', env);
        st.spawn(f, []);
        for (let i = 0; i < 400; i++) st.step(1 / 30);
    } catch (e) { out.push('THROW ' + e.message); }
    return out.join('\n');
}
function check(name, src, expect) {
    const got = run(src, name);
    const ok = got === expect;
    console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '\n  expected: ' + JSON.stringify(expect) + '\n  got:      ' + JSON.stringify(got)));
}
check('basic', 'print(1+2, "a".."b", 10/4, 7%3, -7%3, 2^10, #"abc")', '3\tab\t2.5\t1\t2\t1024\t3');
check('closure', 'local function mk() local n=0 return function() n=n+1 return n end end local a=mk() a() a() print(a())', '3');
check('vararg', 'local function f(...) return select("#",...), ... end print(f(1,nil,3))', '3\t1\tnil\t3');
check('meta', 'local V={} V.__index=V V.__add=function(a,b) return setmetatable({x=a.x+b.x},V) end V.__tostring=function(s) return "V("..s.x..")" end local a=setmetatable({x=1},V) print(tostring(a+a))', 'V(2)');
check('pcall', 'local ok,e=pcall(function() error("boom") end) print(ok,e) print(pcall(error,{1}))', 'false\tt:1: boom\nfalse\ttable: 0x5a000018');
check('co', 'local c=coroutine.create(function(a,b) local x=coroutine.yield(a+b) local y=coroutine.yield(x*2) return "done" end) print(coroutine.resume(c,1,2)) print(coroutine.resume(c,10)) print(coroutine.resume(c)) print(coroutine.resume(c)) print(coroutine.status(c))', 'true\t3\ntrue\t20\ntrue\tdone\nfalse\tcannot resume dead coroutine\ndead');
check('wrap', 'local g=coroutine.wrap(function() for i=1,3 do coroutine.yield(i) end end) print(g(),g(),g())', '1\t2\t3');
check('wait', 'local t=0 for i=1,3 do wait(0.1) t=t+1 end print(t)', '3');
check('wait-in-co', 'local c=coroutine.wrap(function() wait(0.2) coroutine.yield(1) wait(0.2) return 2 end) print(c()) print(c())', '1\n2');
check('patterns', 'print(("hello world"):find("o w")) print(("key=val"):match("(%w+)=(%w+)")) print(("a,b,,c"):gsub(",", ";")) for w in ("one two"):gmatch("%a+") do print(w) end print(("x"):rep(3), ("abc"):upper(), ("%d"):format(5.7))', '5\t7\nkey\tval\na;b;;c\t3\none\ntwo\nxxx\tABC\t5');
check('format', 'print(string.format("%5.2f|%-4d|%04d|%s|%x|%q", 3.14159, 7, 42, true, 255, "hi"))', ' 3.14|7   |0042|true|ff|"hi"');
check('table', 'local t={5,2,8,1} table.sort(t) print(table.concat(t,",")) table.insert(t,1,0) table.insert(t,9) print(table.concat(t,","), table.remove(t), #t) table.sort(t,function(a,b) return a>b end) print(t[1])', '1,2,5,8\n0,1,2,5,8,9\t9\t5\n8');
check('pairs', 'local t={a=1,b=2,10,20} local n=0 for k,v in pairs(t) do n=n+1 end print(n) for i,v in ipairs(t) do print(i,v) end', '4\n1\t10\n2\t20');
check('continue', 'for i=1,5 do if i%2==0 then continue end print(i) end', '1\n3\n5');
check('compound', 'local x=1 x+=2 x*=3 local t={n=1} t.n+=5 print(x,t.n)', '9\t6');
check('ifexp', 'local x=5 print(if x>3 then "big" else "small")', 'big');
check('goto-less repeat', 'local i=0 repeat i+=1 local d=i>=3 until d print(i)', '3');
check('multi-assign', 'local a,b=1,2 a,b=b,a print(a,b) local function f() return 1,2,3 end local x,y,z,w=f() print(x,y,z,w)', '2\t1\n1\t2\t3\tnil');
check('timeout', 'while true do end', 'ERR t:1: Script timeout: exhausted allowed execution time');
check('interp', 'local n=4 print(`v={n}!`)', 'v=4!');
check('spawn', 'spawn(function() wait(0.1) print("later") end) print("now")', 'now\nlater');
check('typeof', 'print(type(print), type(nil), type({}), typeof("x"), tostring(nil), tonumber("0x10"), tonumber("z",36))', 'function\tnil\ttable\tstring\tnil\t16\t35');
check('stackoverflow', 'local function f() return 1+f() end print(pcall(f))', 'false\tt:1: stack overflow');
check('bit32', 'print(bit32.band(12,10), bit32.bor(12,10), bit32.lshift(1,4))', '8\t14\t16');
check('numfor-float', 'for i=1,2,0.5 do print(i) end for i=3,1,-1 do print(i) end', '1\n1.5\n2\n3\n2\n1');
check('nested method', 'local s="a b c" local p=s:split(" ") print(#p, p[3])', '3\tc');
check('syntaxerr', 'local x = = 1', 'THROW t:1: unexpected symbol near \'=\'');
