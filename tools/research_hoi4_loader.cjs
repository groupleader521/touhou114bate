// Read-only installation inventory and PE metadata/string evidence. Does not load or execute binaries.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),game=path.resolve(process.argv[2]||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV');
const output=path.join(root,'docs/Lua加载器研究');
const hex=x=>'0x'+Number(x).toString(16),sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function inventory(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{
 const p=path.join(dir,e.name);return e.isSymbolicLink()?[]:e.isDirectory()?inventory(p):[p];
});}
function pe(file){
 const b=fs.readFileSync(file),u16=o=>b.readUInt16LE(o),u32=o=>b.readUInt32LE(o);
 if(b.toString('ascii',0,2)!=='MZ')throw Error('Not PE '+file);
 const p=u32(0x3c);if(b.toString('latin1',p,p+4)!=='PE\0\0')throw Error('Bad PE signature');
 const coff=p+4,opt=coff+20,magic=u16(opt),is64=magic===0x20b;
 if(!is64&&magic!==0x10b)throw Error('Unsupported optional header');
 const sec=opt+u16(coff+16),sections=[];
 for(let i=0;i<u16(coff+2);i++){const o=sec+i*40;sections.push({name:b.toString('ascii',o,o+8).replace(/\0.*$/,''),virtualSize:u32(o+8),rva:u32(o+12),rawSize:u32(o+16),rawOffset:u32(o+20),characteristics:hex(u32(o+36)),executable:Boolean(u32(o+36)&0x20000000)});}
 function offset(rva){if(rva<u32(opt+60))return rva;const s=sections.find(s=>rva>=s.rva&&rva<s.rva+Math.max(s.virtualSize,s.rawSize));if(!s||rva-s.rva>=s.rawSize)throw Error('Unmapped file RVA '+hex(rva));return s.rawOffset+rva-s.rva;}
 function cstr(o){const e=b.indexOf(0,o);return b.toString('utf8',o,e<0?Math.min(o+1024,b.length):e);}
 const dir=opt+(is64?112:96),ndirs=u32(opt+(is64?108:92));
 const directory=i=>i<ndirs?{rva:u32(dir+i*8),size:u32(dir+i*8+4)}:{rva:0,size:0};
 const imports=[],imp=directory(1);
 if(imp.rva)for(let o=offset(imp.rva),i=0;i<4096;i++,o+=20){
  if(!u32(o)&&!u32(o+12)&&!u32(o+16))break;
  const functions=[],name=cstr(offset(u32(o+12))),thunk=offset(u32(o)||u32(o+16));
  for(let t=thunk,j=0;j<16384;j++,t+=is64?8:4){
   const v=is64?b.readBigUInt64LE(t):BigInt(u32(t));if(!v)break;
   const ordinal=is64?1n<<63n:1n<<31n;
   functions.push((v&ordinal)?'#'+Number(v&65535n):cstr(offset(Number(v))+2));
  }imports.push({dll:name,functions});
 }
 const exports=[],exportDetails=[],exp=directory(0);
 if(exp.rva){const o=offset(exp.rva),count=u32(o+24),names=offset(u32(o+32)),ordinals=offset(u32(o+36)),functions=offset(u32(o+28));for(let i=0;i<count;i++){
  const name=cstr(offset(u32(names+i*4))),rva=u32(functions+u16(ordinals+i*2)*4);exports.push(name);
  exportDetails.push({name,rva:hex(rva),forwarder:rva>=exp.rva&&rva<exp.rva+exp.size?cstr(offset(rva)):null});
 }}
 const debug=[],dbg=directory(6);
 if(dbg.rva)for(let o=offset(dbg.rva),i=0;i<Math.floor(dbg.size/28);i++,o+=28){const type=u32(o+12),raw=u32(o+24);if(type===2&&b.toString('ascii',raw,raw+4)==='RSDS')debug.push({type:'CodeView RSDS',pdbBasename:path.win32.basename(cstr(raw+24))});else debug.push({type});}
 const strings=[];
 const relevant=/\blua(?:jit|_\w+|\s+[\d.]+|bind)?\b|lua\.cpp|[\\/]lua[\\/]|(?:Lua|Mod|FileSystem|VirtualFile|Localisation|ScriptedGui|ScriptedGUI|EquipmentModule|TechnologyDatabase|DatabaseLoader|Checksum|SpriteType|ScriptEngine|ScriptContext|ScriptManager)|replace_path|autoexec\.lua|\.mod\b|common[/\\]defines/i;
 for(const m of b.toString('latin1').matchAll(/[\x20-\x7e]{5,}/g))if(m[0].length<=400&&relevant.test(m[0])){
  const s=sections.find(s=>m.index>=s.rawOffset&&m.index<s.rawOffset+s.rawSize);
  strings.push({text:m[0],fileOffset:hex(m.index),rva:s?hex(s.rva+m.index-s.rawOffset):null,section:s?.name});
 }
 const unicode=[];for(const m of b.toString('latin1').matchAll(/(?:[\x20-\x7e]\x00){5,}/g)){
  const text=Buffer.from(m[0],'latin1').toString('utf16le');if(text.length<=400&&relevant.test(text))unicode.push({text,fileOffset:hex(m.index)});
 }
 const flags=u16(opt+70);
 return {file:path.relative(game,file).replaceAll('\\','/'),bytes:b.length,sha256:sha(b),machine:hex(u16(coff)),format:is64?'PE32+':'PE32',coffTimestampRaw:u32(coff+4),entryPointRva:hex(u32(opt+16)),imageBase:hex(is64?b.readBigUInt64LE(opt+24):u32(opt+28)),aslr:Boolean(flags&0x40),nxCompatible:Boolean(flags&0x100),sections,imports,exports,exportDetails,debug,delayImportDirectory:directory(13),asciiEvidence:strings,utf16Evidence:unicode,limitations:['Imports may omit statically linked Lua and dynamically resolved symbols.','Strings do not establish reachable callbacks, ABI, registration support or runtime load order.','No disassembly, process-memory reading, injection or executable patching performed.']};
}
const files=inventory(game),extensions={},roots={};
for(const f of files){const rel=path.relative(game,f).replaceAll('\\','/'),ext=path.extname(f).toLowerCase()||'(none)';extensions[ext]=(extensions[ext]||0)+1;const first=rel.includes('/')?rel.split('/')[0]:'(root)';roots[first]=(roots[first]||0)+1;}
const binaries=['hoi4.exe','PDXSDK.dll'].filter(f=>fs.existsSync(path.join(game,f))).map(f=>pe(path.join(game,f)));
const luaFiles=files.filter(f=>path.extname(f).toLowerCase()==='.lua').map(f=>({file:path.relative(game,f).replaceAll('\\','/'),sha256:sha(fs.readFileSync(f)),bytes:fs.statSync(f).size}));
const samples=[],preferred={'.txt':'common/technologies/NSB_armor.txt','.dds':'gfx/interface/technologies/generic_medium_tank_chassis_1.dds','.bmp':'map/provinces.bmp','.gfx':'interface/Technologies.gfx','.gui':'interface/countrytechtreeview.gui'};
for(const ext of ['.txt','.yml','.gui','.gfx','.lua','.dds','.bmp','.tga','.mesh','.anim','.asset','.fnt','.zip','.7z']){
 const wanted=preferred[ext]&&path.join(game,preferred[ext]);
 const file=wanted&&fs.existsSync(wanted)?wanted:files.find(f=>path.extname(f).toLowerCase()===ext);if(!file)continue;
 const fd=fs.openSync(file,'r'),b=Buffer.alloc(Math.min(148,fs.statSync(file).size));try{fs.readSync(fd,b,0,b.length,0);}finally{fs.closeSync(fd);}
 const sample={extension:ext,file:path.relative(game,file).replaceAll('\\','/'),bytes:fs.statSync(file).size,headerHex:b.subarray(0,16).toString('hex')};
 if(b.toString('ascii',0,4)==='DDS ')Object.assign(sample,{format:'DDS',height:b.readUInt32LE(12),width:b.readUInt32LE(16),fourCC:b.toString('ascii',84,88),dxgiFormat:b.toString('ascii',84,88)==='DX10'&&b.length>=132?b.readUInt32LE(128):null});
 else if(b.toString('ascii',0,2)==='BM')Object.assign(sample,{format:'BMP',width:b.readInt32LE(18),height:b.readInt32LE(22),bitsPerPixel:b.readUInt16LE(28)});
 else if(b.subarray(0,4).equals(Buffer.from([0x50,0x4b,3,4])))sample.format='ZIP';
 else if(b.subarray(0,6).equals(Buffer.from([0x37,0x7a,0xbc,0xaf,0x27,0x1c])))sample.format='7z';
 else if(ext==='.tga'&&b.length>=18)Object.assign(sample,{format:'TGA candidate (no universal magic)',width:b.readUInt16LE(12),height:b.readUInt16LE(14),bitsPerPixel:b[16]});
 else if(b.toString('ascii',0,4)==='@@b@')sample.format='PDX binary asset signature (mesh/animation); body not decoded';
 else if(ext==='.fnt'&&b.toString('ascii',0,4)==='info')sample.format='Text font descriptor';
 else sample.format=['.txt','.yml','.gui','.gfx','.lua','.asset'].includes(ext)&&!b.includes(0)?'Text / engine-specific grammar':'Unidentified by this header scan';
 samples.push(sample);
}
const result={date:'2026-10-02',installation:game,totalFiles:files.length,extensions:Object.fromEntries(Object.entries(extensions).sort((a,b)=>b[1]-a[1])),directories:roots,gameRevision:fs.readFileSync(path.join(game,'hoi4_rev.txt'),'utf8').trim(),luaFiles,binaries,samples,readOnlyIntegrity:binaries.map(p=>({file:p.file,unchanged:sha(fs.readFileSync(path.join(game,p.file)))===p.sha256})),scope:'One local installation, static metadata/string/header inspection; official distribution authenticity and runtime behaviour unverified.'};
fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'原版文件与二进制审计.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({totalFiles:result.totalFiles,luaFiles:luaFiles.length,binaries:binaries.map(p=>({file:p.file,bytes:p.bytes,sha256:p.sha256,format:p.format,machine:p.machine,sections:p.sections.length,importDlls:p.imports.map(i=>i.dll),exportCount:p.exports.length,physfsExports:p.exports.filter(s=>s.includes('PHYSFS_')).length,luaApiExports:p.exports.filter(s=>/lua[_L]|luaopen/.test(s)),asciiEvidence:p.asciiEvidence.length,luaEvidence:p.asciiEvidence.filter(s=>/Lua 5\.1|pdx_lua|luabind::open|LUA_PATH|LUA_CPATH/.test(s.text))})),readOnlyIntegrity:result.readOnlyIntegrity},null,2));
