const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const {compile,writeBuild,patchText,virtual,hash}=require('../builder.cjs');
const {runLuaSource}=require('../lua_runtime.cjs');
const {parse}=require('../../hoi4_script.cjs');
const testRoot=path.resolve(__dirname,'../.test-output');
fs.mkdirSync(testRoot,{recursive:true});
const fixture=fs.mkdtempSync(path.join(testRoot,'suite-'));
const vanilla=path.join(fixture,'vanilla'),mod=path.join(fixture,'mod');
const put=(root,rel,data)=>{const file=path.join(root,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);return file;};
fs.mkdirSync(mod,{recursive:true});
const armor='common/technologies/NSB_armor.txt';
const original='# preserve this comment\r\ntechnologies = {\r\n\tbase = {\r\n\t\tlabel = "a } # \\\"quote\\\"" # inline\r\n\t\tdesc = native_desc\r\n\t\tenable_equipments = { tank_0 tank_1 }\r\n\t\tif = { limit = { tag = AAA } a = yes }\r\n\t\tif = { limit = { tag = BBB } b = yes }\r\n\t}\r\n\tadvanced = { enable_equipments = { tank_2 } }\r\n}\r\n';
put(vanilla,armor,original);
put(vanilla,'localisation/english/base_l_english.yml','\uFEFFl_english:\n desc:0 "Original \\\"quote\\\"\\nLine"\n');
put(mod,'localisation/replace/override_l_english.yml','\uFEFFl_english:\n desc:0 "Mod \\\"quote\\\"\\nLine"\n');
put(vanilla,'gfx/icon.dds',Buffer.from([68,68,83,32,0,255,128]));
const sources=[{id:'vanilla',root:vanilla},{id:'mod',root:mod}];
const pkg=(id,operations=[],requires=[])=>({id,operations,requires});
const patch=(key,value='custom_desc',extra={})=>({kind:'patch',file:armor,path:['technologies','base'],action:'set',key,value,...extra});
const build=(packages)=>compile({sources,packages});
const plain=nodes=>nodes.map(n=>({key:n.key,op:n.op||null,value:Array.isArray(n.value)?plain(n.value):n.value}));
test.after(()=>{
 // Only remove this suite's verified, owned directory; never follow a computed external path.
 const resolved=fs.realpathSync(fixture),root=fs.realpathSync(testRoot);
 assert.ok(resolved.startsWith(root+path.sep)&&path.basename(resolved).startsWith('suite-'));
 fs.rmSync(resolved,{recursive:true,force:true});
});

test('Actual Lua loops emit Unicode entries without host filesystem globals',()=>{
 const p=runLuaSource('assert(io == nil and os == nil and require == nil)\nlocal p=hoi4.package{id="lua.loop"}\nfor i=1,3 do p:localisation{language="english",key="item_"..i,value="中文 "..i} end\nreturn p');
 assert.equal(p.operations.length,3);assert.equal(p.operations[2].value,'中文 3');
 assert.match(build([p]).outputs.get('localisation/replace/touhou_lua_overlay_l_english.yml').toString(),/item_3:0 "中文 3"/);
});
test('Nonterminating Lua is stopped by the instruction budget',()=>{
 assert.throws(()=>runLuaSource('while true do end'),/instruction budget/);
});
test('Cyclic and non-finite Lua data are rejected',()=>{
 assert.throws(()=>runLuaSource('local p=hoi4.package{id="cycle"}; p.extra=p; return p'),/Cyclic Lua/);
 assert.throws(()=>runLuaSource('local p=hoi4.package{id="number"}; p.extra=0\/0; return p'),/Non-finite/);
});
test('Out-of-order packages are sorted by dependencies; distinct patches coexist',()=>{
 const a=pkg('base',[patch('desc')]),b=pkg('advanced',[patch('desc','advanced_desc',{path:['technologies','advanced']})],['base']);
 const result=build([b,a]);assert.deepEqual(result.report.packageOrder,['base','advanced']);
 const text=result.outputs.get(armor).toString();assert.match(text,/desc = custom_desc/);assert.match(text,/desc = advanced_desc/);
 assert.deepEqual(plain(parse(text)).at(0).value.at(0).value.filter(n=>n.key!=='desc'),plain(parse(original)).at(0).value.at(0).value.filter(n=>n.key!=='desc'));
});
test('Missing dependencies, cycles and duplicate packages fail',()=>{
 assert.throws(()=>build([pkg('a',[],['absent'])]),/Missing dependency/);
 assert.throws(()=>build([pkg('a',[],['b']),pkg('b',[],['a'])]),/Cyclic dependency/);
 assert.throws(()=>build([pkg('a'),pkg('a')]),/Duplicate package/);
});
test('Conflicting edits to the same field fail even with a dependency',()=>{
 assert.throws(()=>build([pkg('a',[patch('desc','one')]),pkg('b',[patch('desc','two')],['a'])]),/Conflict/);
 const one=build([pkg('a',[patch('desc','same')]),pkg('b',[patch('desc','same')])]);assert.match(one.outputs.get(armor).toString(),/desc = same/);
});
test('Set/remove action names cannot accidentally collide as identical signatures',()=>{
 assert.throws(()=>build([pkg('a',[patch('desc','remove')]),pkg('b',[patch('desc',undefined,{action:'remove'})])]),/Conflict/);
});
test('Replacing an ancestor block cannot silently erase a child patch',()=>{
 assert.throws(()=>build([pkg('a',[patch('desc')]),pkg('b',[patch('base','{ desc = other }',{path:['technologies']})])]),/Overlapping parent\/child/);
});
test('Changed scalar leaves comments, CRLF and repeated conditions byte-identical',()=>{
 const actual=patchText(original,patch('desc'));
 assert.equal(actual,original.replace('desc = native_desc','desc = custom_desc'));
});
test('Selectors and repeated fields fail when ambiguous or absent',()=>{
 assert.throws(()=>patchText('technologies={base={} base={}}',patch('desc')),/exactly once/);
 assert.throws(()=>patchText('technologies={base={desc=a desc=b}}',patch('desc')),/Ambiguous/);
 assert.throws(()=>patchText(original,patch('desc','x',{path:['technologies','absent']})),/exactly once/);
 assert.throws(()=>patchText(original,patch('absent',undefined,{action:'remove'})),/absent/);
});
test('Appending identifiers preserves all native equipment and deduplicates additions',()=>{
 const result=build([pkg('a',[patch('enable_equipments',undefined,{action:'append_unique',items:['tank_1','tank_3','tank_3']})]),pkg('b',[patch('enable_equipments',undefined,{action:'append_unique',items:['tank_4']})],['a'])]);
 const list=parse(result.outputs.get(armor).toString())[0].value[0].value.find(n=>n.key==='enable_equipments').value.map(n=>n.value);
 assert.deepEqual(list,['tank_0','tank_1','tank_3','tank_4']);
});
test('Text append captures the higher-priority source and keeps escaped native text',()=>{
 const result=build([pkg('a',[{kind:'append_localisation',language:'english',key:'desc',value:'\nExtra "text"'}])]);
 const text=result.outputs.get('localisation/replace/touhou_lua_overlay_l_english.yml');
 assert.deepEqual([...text.subarray(0,3)],[239,187,191]);
 assert.equal(text.toString(),'\uFEFFl_english:\n desc:0 "Mod \\\"quote\\\"\\nLine\\nExtra \\\"text\\\""\n');
});
test('Append ordering accepts transitive dependencies and rejects independent packages',()=>{
 const op=value=>({kind:'append_localisation',language:'english',key:'desc',value});
 const result=build([pkg('c',[op(' C')],['b']),pkg('b',[],['a']),pkg('a',[op(' A')])]);
 assert.match(result.outputs.get('localisation/replace/touhou_lua_overlay_l_english.yml').toString(),/ A C/);
 assert.throws(()=>build([pkg('a',[op(' A')]),pkg('b',[op(' B')])]),/requires dependency/);
 assert.throws(()=>build([pkg('a',[op(' X')]),pkg('b',[{...op(' X'),kind:'localisation'}])]),/Conflict/);
});
test('Append to a missing key fails instead of inventing a native value',()=>{
 assert.throws(()=>build([pkg('a',[{kind:'append_localisation',language:'english',key:'absent',value:'extra'}])]),/missing localisation/);
});
test('Assets are copied without binary transformation and sprite texture references are checked',()=>{
 const result=build([pkg('a',[{kind:'asset',source_root:'vanilla',source:'gfx/icon.dds',target:'gfx/new.dds'},{kind:'sprite',name:'GFX_new',texture:'gfx/new.dds'}])]);
 assert.deepEqual(result.outputs.get('gfx/new.dds'),fs.readFileSync(path.join(vanilla,'gfx/icon.dds')));
 assert.throws(()=>build([pkg('a',[{kind:'sprite',name:'GFX_missing',texture:'gfx/absent.dds'}])]),/Effective source missing/);
});
test('Raw emission and patches cannot overwrite each other in either order',()=>{
 const raw={kind:'emit',file:armor,content:original};
 assert.throws(()=>build([pkg('a',[raw,patch('desc')])]),/collides/);
 assert.throws(()=>build([pkg('a',[patch('desc'),raw])]),/collides/);
 const asset={kind:'asset',source_root:'vanilla',source:armor,target:armor};
 assert.throws(()=>build([pkg('a',[patch('desc'),asset])]),/collides/);
});
test('Windows aliases, traversal and case collisions are rejected',()=>{
 for(const unsafe of ['../out','a/../b','a\\b','C:/out','a/NUL.dds','a/end.','a/end ','a:x','a/*.txt'])assert.throws(()=>virtual(unsafe),/Unsafe/);
 assert.throws(()=>build([pkg('a',[{kind:'emit',file:'common/A.txt',content:'a=yes'},{kind:'emit',file:'common/a.txt',content:'a=yes'}])]),/Case-insensitive/);
});
test('Identical rebuild does not rewrite files; manually changed generated files are protected',()=>{
 const result=build([pkg('a',[patch('desc')])]),out=path.join(fixture,'generated');
 const first=writeBuild(result,out),file=path.join(out,armor),mtime=fs.statSync(file).mtimeMs;
 assert.ok(first.written>0);assert.equal(writeBuild(result,out).written,0);assert.equal(fs.statSync(file).mtimeMs,mtime);
 fs.appendFileSync(file,'\n# user edit');assert.throws(()=>writeBuild(result,out),/externally modified/);
});
test('Unmanaged directories, forged markers and external output locations are refused',()=>{
 const result=build([pkg('a')]),out=path.join(fixture,'unmanaged');
 put(out,'manual.txt','user data');assert.throws(()=>writeBuild(result,out),/unmanaged directory/);
 put(out,'build-report.json','{}');assert.throws(()=>writeBuild(result,out),/Unsupported existing/);
 assert.throws(()=>writeBuild(result,vanilla),/unmanaged directory/);
 assert.throws(()=>writeBuild(result,'F:/SteamLibrary/steamapps/common/Hearts of Iron IV'),/Output must/);
});
test('Rebuild only removes stale files owned by its previous manifest',()=>{
 const out=path.join(fixture,'stale');writeBuild(build([pkg('a',[{kind:'emit',file:'common/old.txt',content:'a=yes'}])]),out);
 put(out,'manual.txt','keep');writeBuild(build([pkg('a')]),out);
 assert.equal(fs.existsSync(path.join(out,'common/old.txt')),false);assert.equal(fs.readFileSync(path.join(out,'manual.txt'),'utf8'),'keep');
});

const game=process.env.HOI4_GAME_ROOT||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const project=path.resolve(__dirname,'../../..');
const realAvailable=fs.existsSync(path.join(game,armor));
function realBuild(configName){const file=path.join(__dirname,'../demo',configName),config=JSON.parse(fs.readFileSync(file,'utf8'));return compile({sources:[{id:'vanilla',root:game},{id:'touhou114',root:project}],packageFiles:config.packages.map(p=>path.resolve(path.dirname(file),p)),name:config.name,baseDependency:config.baseDependency});}
test('Real installation: presentation mode emits no native technology or shared sprite replacement',{skip:!realAvailable},()=>{
 const result=realBuild('config.json');assert.equal(result.outputs.has(armor),false);assert.equal(result.outputs.size,6);
 assert.ok(![...result.outputs].some(([rel])=>rel==='interface/Technologies.gfx'||rel==='common/script_enums.txt'));
 const gui=parse(result.outputs.get('common/scripted_guis/touhou_lua_research_panel.txt').toString())[0].value[0].value;
 assert.equal(gui.find(n=>n.key==='parent_window_token').value,'tech_armor_folder');
 const tags=gui.find(n=>n.key==='visible').value.find(n=>n.key==='OR').value.map(n=>n.value);
 assert.equal(tags.length,16);assert.ok(tags.includes('ALI')&&tags.includes('EVI')&&!tags.includes('CHI')&&!tags.includes('GER'));
 assert.equal(result.report.engineVerified,false);
});
test('Real installation: two Lua patch packages preserve every native field except their two explicit descriptions',{skip:!realAvailable},()=>{
 const before=fs.readFileSync(path.join(game,armor)),beforeHash=hash(before),result=realBuild('merge.json'),after=result.outputs.get(armor);
 const clean=nodes=>nodes.map(n=>({key:n.key,op:n.op||null,value:Array.isArray(n.value)?clean(n.value):n.value}));
 const native=clean(parse(before.toString())),generated=clean(parse(after.toString()));
 const ownKeys=new Map([['basic_medium_tank_chassis','touhou_lua_basic_medium_hint'],['improved_medium_tank_chassis','touhou_lua_improved_medium_hint']]);
 const root=generated.find(n=>n.key==='technologies');
 for(const [key,value] of ownKeys){const tech=root.value.find(n=>n.key===key),desc=tech.value.filter(n=>n.key==='desc');assert.equal(desc.length,1);assert.equal(desc[0].value,value);tech.value=tech.value.filter(n=>n.key!=='desc');}
 for(const key of ownKeys.keys()){const tech=native.find(n=>n.key==='technologies').value.find(n=>n.key===key);assert.ok(!tech.value.some(n=>n.key==='desc'),'Native fixture unexpectedly has explicit desc; adjust comparison');}
 assert.deepEqual(generated,native,'A native effect, unlock list, condition or technology was changed');
 assert.equal(hash(fs.readFileSync(path.join(game,armor))),beforeHash);
 assert.deepEqual(result.report.packageOrder,['touhou.research.core','touhou.research.basic','touhou.research.advanced']);
 assert.equal(result.outputs.size,7);assert.ok([...result.report.inputs,...result.report.authoringInputs].every(r=>hash(fs.readFileSync(r.file))===r.sha256));
 const again=realBuild('merge.json');assert.equal(again.report.buildId,result.report.buildId);
});
