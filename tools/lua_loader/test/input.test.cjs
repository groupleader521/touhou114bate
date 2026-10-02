const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),zlib=require('zlib');
const {createInputView,zipIndex,crc32,hash}=require('../input_view.cjs');
const {descriptor,resolveProfile}=require('../profile.cjs');
const {compile}=require('../builder.cjs');
const root=path.resolve(__dirname,'../.test-output');fs.mkdirSync(root,{recursive:true});
const fixture=fs.mkdtempSync(path.join(root,'inputs-'));
const put=(base,rel,data)=>{const file=path.join(base,rel);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,data);return file;};
const game=path.join(fixture,'game'),user=path.join(fixture,'user');fs.mkdirSync(game,{recursive:true});fs.mkdirSync(path.join(user,'mod'),{recursive:true});
put(game,'common/test.txt','native=yes');
put(user,'dlc_load.json',JSON.stringify({enabled_mods:['mod/child.mod','mod/base.mod'],disabled_dlcs:['dlc/disabled/disabled.dlc']}));
put(user,'mod/child.mod','name="Child"\npath="mod/child"\ndependencies={ "Base" "Absent" }\nreplace_path="common/removed"\nreplace_path="gfx/loadingscreens"\nremote_file_id="200"');
put(user,'mod/base.mod','name="Base"\npath="mod/base"\nremote_file_id="100"');
put(user,'mod/unused.mod','name="Absent"\npath="mod/unused"\nremote_file_id="300"');
for(const id of ['base','child','unused'])fs.mkdirSync(path.join(user,'mod',id),{recursive:true});
put(game,'dlc/plain/plain.dlc','name="Plain"\npath="dlc/plain"');
put(game,'dlc/plain/common/test.txt','from_dlc=yes');
put(game,'dlc/disabled/disabled.dlc','name="Disabled"\npath="dlc/disabled"');
put(game,'dlc/disabled/common/disabled.txt','disabled=yes');
test.after(()=>{const resolved=fs.realpathSync(fixture),realRoot=fs.realpathSync(root);assert.ok(resolved.startsWith(realRoot+path.sep)&&path.basename(resolved).startsWith('inputs-'));fs.rmSync(resolved,{recursive:true,force:true});});

// Minimal fixture producer for Stored/Deflate ZIP entries, independent of the reader.
function zipFixture(items){const locals=[],centrals=[];let offset=0;
 for(const item of items){const name=Buffer.from(item.name),data=Buffer.from(item.data||''),method=item.method??0,compressed=method===8?zlib.deflateRawSync(data):data,flags=item.flags??0x800;
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(flags,6);local.writeUInt16LE(method,8);local.writeUInt32LE(crc32(data),14);local.writeUInt32LE(compressed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(flags,8);central.writeUInt16LE(method,10);central.writeUInt32LE(crc32(data),16);central.writeUInt32LE(compressed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
  const payload=Buffer.concat([local,name,compressed]);locals.push(payload);centrals.push(Buffer.concat([central,name]));offset+=payload.length;
 }
 const directory=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(items.length,8);end.writeUInt16LE(items.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...locals,directory,end]);
}
test('Descriptor parsing preserves repeated replace_path and escaped Windows roots',()=>{
 const text='name="Example"\npath='+JSON.stringify(path.join(user,'mod/base'))+'\nreplace_path="common/units"\nreplace_path="events/"\ndependencies={ "Other Name" }';
 const d=descriptor(text);assert.equal(d.path,path.join(user,'mod/base'));assert.deepEqual(d.replacePaths,['common/units','events']);assert.deepEqual(d.dependencies,['Other Name']);
 assert.throws(()=>descriptor('name="A" name="B"'),/Repeated descriptor/);
});
test('Active profile orders only active dependencies and never enables absent declarations',()=>{
 const r=resolveProfile({game,userData:user});assert.equal(r.report.canBuild,true);
 assert.deepEqual(r.report.proposedOrder,['mod/base.mod','mod/child.mod']);assert.equal(r.sources.length,3);
 const missing=r.report.warnings.find(w=>w.code==='declared-dependency-not-active');assert.equal(missing.dependency,'Absent');assert.deepEqual(missing.registeredCandidates,['mod/unused.mod']);
 assert.ok(!r.sources.some(s=>s.root===path.join(user,'mod/unused')));assert.equal(r.report.engineOrderVerified,false);
});
test('Backup profiles honor enabled flags and position rather than filename order',()=>{
 const file=put(fixture,'backup.json',JSON.stringify({game:'hoi4',name:'Chosen backup',mods:[{steamId:'200',enabled:false,position:0},{steamId:'100',enabled:true,position:4}]}));
 const r=resolveProfile({game,userData:user,profile:file});assert.equal(r.report.profileName,'Chosen backup');assert.deepEqual(r.report.requestedOrder,['mod/base.mod']);
 const invalid=put(fixture,'invalid-backup.json',JSON.stringify({game:'hoi4',mods:[{steamId:'100',enabled:true,position:0},{steamId:'200',enabled:true,position:0}]}));assert.throws(()=>resolveProfile({game,userData:user,profile:invalid}),/positions/);
});
test('Missing or ambiguous backup registrations make the profile unbuildable',()=>{
 const file=put(fixture,'missing-backup.json',JSON.stringify({game:'hoi4',mods:[{steamId:'404',enabled:true,position:0}]}));
 const r=resolveProfile({game,userData:user,profile:file});assert.equal(r.report.canBuild,false);assert.equal(r.report.errors[0].code,'unresolved-playset-mod');
});
test('DLC inclusion is explicit, disabled payloads are excluded, ownership is not inferred',()=>{
 const none=resolveProfile({game,userData:user});assert.ok(!none.sources.some(s=>s.id.startsWith('dlc_')));
 const installed=resolveProfile({game,userData:user,dlc:'installed'});assert.ok(installed.sources.some(s=>s.id==='dlc_plain'));assert.ok(!installed.sources.some(s=>s.id==='dlc_disabled'));
 assert.ok(installed.report.dlcs.every(d=>d.ownershipVerified===false));assert.equal(createInputView(installed.sources).effective('common/test.txt').bytes.toString(),'from_dlc=yes');
});
test('replace_path hides absent lower files while allowing same-layer replacements',()=>{
 const lower=path.join(fixture,'lower'),upper=path.join(fixture,'upper');put(lower,'common/units/removed.txt','lower=yes');put(lower,'common/units/kept.txt','old=yes');put(lower,'common/unrelated.txt','stay=yes');put(upper,'common/units/kept.txt','new=yes');
 const view=createInputView([{id:'lower',root:lower},{id:'upper',root:upper,replacePaths:['common/units']}]);
 assert.throws(()=>view.effective('common/units/removed.txt'),/hidden by replace_path/);
 assert.equal(view.effective('common/units/kept.txt').bytes.toString(),'new=yes');assert.equal(view.effective('common/unrelated.txt').bytes.toString(),'stay=yes');
 assert.deepEqual(view.visibleFiles('common').map(f=>f.rel),['common/units/kept.txt','common/unrelated.txt']);
});
test('Localisation file shadowing does not resurrect keys from an overwritten lower file',()=>{
 const lower=path.join(fixture,'loc-lower'),upper=path.join(fixture,'loc-upper');
 put(lower,'localisation/base_l_english.yml','l_english:\n old_key:0 "Original"\n shared:0 "Old"');
 put(upper,'localisation/base_l_english.yml','l_english:\n shared:0 "Current"');
 const sources=[{id:'lower',root:lower},{id:'upper',root:upper}],op=key=>({kind:'append_localisation',language:'english',key,value:' plus'});
 assert.throws(()=>compile({sources,packages:[{id:'a',requires:[],operations:[op('old_key')]}]}),/missing localisation/);
 const result=compile({sources,packages:[{id:'a',requires:[],operations:[op('shared')]}]});assert.match(result.outputs.get('localisation/replace/touhou_lua_overlay_l_english.yml').toString(),/Current plus/);assert.equal(result.report.localisationOrigins[0].source,'upper');
});
test('Stored and Deflate ZIP payloads are read without writing extracted files',()=>{
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
 const archive=put(fixture,'payload.zip',zipFixture([{name:'common/one.txt',data:'one=yes'},{name:'localisation/中文_l_english.yml',data:'l_english:\n key:0 "Zip"',method:8}]));
 const before=fs.readdirSync(fixture),view=createInputView([{id:'archive',archive}]);assert.equal(view.effective('common/one.txt').bytes.toString(),'one=yes');assert.equal(view.visibleFiles('localisation').length,1);assert.deepEqual(fs.readdirSync(fixture),before);
 assert.equal([...view.reads.values()][0].sha256,hash(fs.readFileSync(archive)));assert.equal([...view.selected.values()][0].archiveEntry,'common/one.txt');
 const result=compile({sources:[{id:'archive',archive}],packages:[{id:'zip.loc',requires:[],operations:[{kind:'append_localisation',language:'english',key:'key',value:' plus'}]}]});assert.match(result.outputs.get('localisation/replace/touhou_lua_overlay_l_english.yml').toString(),/Zip plus/);
});
test('ZIP CRC corruption, truncated directories and local header mismatches fail',()=>{
 const bytes=zipFixture([{name:'common/one.txt',data:'one=yes'}]),bad=Buffer.from(bytes);bad[30+Buffer.byteLength('common/one.txt')]=0;
 assert.throws(()=>zipIndex(bad).read('common/one.txt'),/CRC\/size/);assert.throws(()=>zipIndex(bytes.subarray(0,bytes.length-5)),/end record/);
 const mismatch=Buffer.from(bytes);mismatch[30]='x'.charCodeAt(0);assert.throws(()=>zipIndex(mismatch),/local\/central/);
});
test('ZIP path traversal, aliases, encryption and unsupported compression are rejected',()=>{
 assert.throws(()=>zipIndex(zipFixture([{name:'../escape.txt',data:'x'}])),/Unsafe/);
 assert.throws(()=>zipIndex(zipFixture([{name:'common/A.txt'},{name:'common/a.txt'}])),/aliased ZIP/);
 assert.throws(()=>zipIndex(zipFixture([{name:'a.txt',flags:1}])),/Encrypted/);
 assert.throws(()=>zipIndex(zipFixture([{name:'a.txt',method:99}])),/compression/);
 const zip64=zipFixture([]);zip64.writeUInt16LE(65535,8);zip64.writeUInt16LE(65535,10);assert.throws(()=>zipIndex(zip64),/ZIP64/);
});
test('Declared ZIP DLC can supply effective files beneath later directory Mods',()=>{
 const archivedGame=path.join(fixture,'archived-game'),archivedUser=path.join(fixture,'archived-user');
 put(archivedGame,'base.txt','base');put(archivedGame,'dlc/zip/zip.dlc','name="Archive DLC"\narchive="dlc/zip/data.zip"');put(archivedGame,'dlc/zip/data.zip',zipFixture([{name:'common/one.txt',data:'zip=yes'}]));
 fs.mkdirSync(path.join(archivedUser,'mod'),{recursive:true});put(archivedUser,'dlc_load.json','{"enabled_mods":[],"disabled_dlcs":[]}');
 const profile=resolveProfile({game:archivedGame,userData:archivedUser,dlc:'installed'});assert.equal(profile.report.canBuild,true);assert.equal(createInputView(profile.sources).effective('common/one.txt').root,'dlc_zip');
});
test('Input integrity detects changed directory files and archives after a read',()=>{
 const dir=path.join(fixture,'changed-dir');const file=put(dir,'a.txt','one');const view=createInputView([{id:'dir',root:dir}]);view.effective('a.txt');fs.writeFileSync(file,'two');assert.throws(()=>view.assertUnchanged(),/input changed/);
 const fileZip=put(fixture,'changed.zip',zipFixture([{name:'a.txt',data:'one'}])),zipView=createInputView([{id:'zip',archive:fileZip}]);fs.appendFileSync(fileZip,'edit');assert.throws(()=>zipView.assertUnchanged(),/input changed/);
});
const actualGame=process.env.HOI4_GAME_ROOT||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const actualZip=path.join(actualGame,'dlc/dlc003_rocket_launcher_unit_pack/dlc003.zip');
test('Real installation: declared Rocket Launcher ZIP entry passes size and CRC verification',{skip:!fs.existsSync(actualZip)},()=>{
 const before=hash(fs.readFileSync(actualZip)),view=createInputView([{id:'rocket',archive:actualZip}]),entry=[...view.sources[0].zip.entries.keys()][0];assert.ok(entry);assert.ok(view.readFrom('rocket',entry).length>0);view.assertUnchanged();assert.equal(hash(fs.readFileSync(actualZip)),before);
});
const project=path.resolve(__dirname,'../../..'),actualUser=process.env.HOI4_USER_DATA||path.resolve(project,'../..');
test('Real installation: active configuration and descriptors remain unchanged after resolution',{skip:!fs.existsSync(path.join(actualUser,'dlc_load.json'))||!fs.existsSync(actualGame)},()=>{
 const result=resolveProfile({game:actualGame,userData:actualUser,project,dlc:'installed'});assert.equal(result.report.canBuild,true);assert.ok(result.sources.some(s=>s.id==='touhou114'));assert.ok(result.report.inputs.every(r=>hash(fs.readFileSync(r.file))===r.sha256));assert.equal(result.report.engineOrderVerified,false);
});
