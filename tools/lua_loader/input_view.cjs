const fs=require('fs'),path=require('path'),zlib=require('zlib'),crypto=require('crypto');
const {files}=require('../hoi4_script.cjs');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const inside=(root,file)=>file===root||file.startsWith(root+path.sep);
function virtual(s){if(typeof s!=='string'||!s||/[\\:\x00-\x1f<>"|?*]/.test(s)||s.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)))throw Error('Unsafe virtual path '+s);return s;}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
// ZIP32, Stored/Deflate only. Reads in memory; never extracts entries into a directory.
function zipIndex(bytes){
 function range(offset,size){if(!Number.isSafeInteger(offset)||offset<0||size<0||offset+size>bytes.length)throw Error('Truncated ZIP structure');}
 if(bytes.length<22)throw Error('Missing ZIP end record');
 let end=-1;for(let o=bytes.length-22;o>=Math.max(0,bytes.length-65557);o--)if(bytes.readUInt32LE(o)===0x06054b50&&o+22+bytes.readUInt16LE(o+20)===bytes.length){end=o;break;}
 if(end<0)throw Error('Missing ZIP end record');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12),offset=bytes.readUInt32LE(end+16);
 if(bytes.readUInt16LE(end+4)||bytes.readUInt16LE(end+6)||bytes.readUInt16LE(end+8)!==count)throw Error('Split ZIP is unsupported');
 if(count===65535||size===0xffffffff||offset===0xffffffff)throw Error('ZIP64 is unsupported');
 range(offset,size);if(offset+size!==end)throw Error('ZIP directory bounds are unsupported');
 const entries=new Map(),spellings=new Map();let o=offset;
 for(let i=0;i<count;i++){
  range(o,46);if(bytes.readUInt32LE(o)!==0x02014b50)throw Error('Bad ZIP central directory');
  const flags=bytes.readUInt16LE(o+8),method=bytes.readUInt16LE(o+10),crc=bytes.readUInt32LE(o+16),compressed=bytes.readUInt32LE(o+20),uncompressed=bytes.readUInt32LE(o+24);
  const nameSize=bytes.readUInt16LE(o+28),extraSize=bytes.readUInt16LE(o+30),commentSize=bytes.readUInt16LE(o+32),local=bytes.readUInt32LE(o+42);
  range(o+46,nameSize+extraSize+commentSize);
  const rawName=bytes.subarray(o+46,o+46+nameSize);
  if(!(flags&0x800)&&rawName.some(b=>b>127))throw Error('ZIP filename requires explicit UTF-8 encoding');
  const name=new TextDecoder('utf-8',{fatal:true}).decode(rawName),directory=name.endsWith('/'),rel=virtual(directory?name.slice(0,-1):name);
  if(flags&0x2041)throw Error('Encrypted ZIP is unsupported');
  if(![0,8].includes(method))throw Error('Unsupported ZIP compression '+method);
  if(compressed===0xffffffff||uncompressed===0xffffffff||local===0xffffffff)throw Error('ZIP64 entry is unsupported');
  if(bytes.readUInt16LE(o+34))throw Error('Split ZIP entry is unsupported');
  if(((bytes.readUInt32LE(o+38)>>>16)&0xf000)===0xa000)throw Error('ZIP symlink is unsupported');
  if(uncompressed>64*1024*1024)throw Error('ZIP entry exceeds 64 MiB limit');
  const folded=rel.toLowerCase();if(spellings.has(folded))throw Error('Duplicate or aliased ZIP path '+rel);spellings.set(folded,rel);
  range(local,30);if(bytes.readUInt32LE(local)!==0x04034b50)throw Error('Bad ZIP local header');
  const localNameSize=bytes.readUInt16LE(local+26),localExtraSize=bytes.readUInt16LE(local+28);range(local+30,localNameSize+localExtraSize);
  if(!bytes.subarray(local+30,local+30+localNameSize).equals(rawName)||bytes.readUInt16LE(local+6)!==flags||bytes.readUInt16LE(local+8)!==method)throw Error('ZIP local/central header mismatch');
  const start=local+30+localNameSize+localExtraSize;range(start,compressed);if(start+compressed>offset)throw Error('ZIP payload overlaps directory');
  if(!directory)entries.set(rel,{start,compressed,uncompressed,method,crc});
  o+=46+nameSize+extraSize+commentSize;
 }
 if(o!==offset+size)throw Error('ZIP directory size mismatch');
 return {entries,read(rel){const e=entries.get(rel);if(!e)throw Error('ZIP entry missing '+rel);const data=bytes.subarray(e.start,e.start+e.compressed),out=e.method===0?Buffer.from(data):zlib.inflateRawSync(data,{maxOutputLength:Math.max(1,e.uncompressed)});if(out.length!==e.uncompressed||crc32(out)!==e.crc)throw Error('ZIP entry CRC/size mismatch '+rel);return out;}};
}
function createInputView(inputSources){
 const reads=new Map(),selected=new Map();
 function track(file,bytes,source,rel){const sha256=hash(bytes),old=reads.get(file);if(old&&old.sha256!==sha256)throw Error('Input changed while building '+file);reads.set(file,{file,virtualPath:rel??null,sha256,source});}
 const sources=inputSources.map(s=>{
  const replacePaths=(s.replacePaths||[]).map(p=>virtual(p.replace(/\/+$/,''))),source={...s,replacePaths};
  if(s.archive){source.archive=fs.realpathSync(s.archive);if(fs.statSync(source.archive).size>256*1024*1024)throw Error('ZIP archive exceeds 256 MiB limit');const bytes=fs.readFileSync(source.archive);track(source.archive,bytes,s.id,null);source.zip=zipIndex(bytes);}
  else {source.root=fs.realpathSync(s.root);if(!fs.statSync(source.root).isDirectory())throw Error('Input root is not a directory '+s.root);}
  return source;
 });
 if(new Set(sources.map(s=>s.id)).size!==sources.length)throw Error('Duplicate source root');
 function location(source,rel){if(source.zip)return source.zip.entries.has(rel)?rel:null;const file=path.join(source.root,rel);if(!fs.existsSync(file))return null;const real=fs.realpathSync(file);if(!inside(source.root,real))throw Error('Source symlink escapes root '+rel);return fs.statSync(real).isFile()?real:null;}
 const masks=(source,rel)=>source.replacePaths.some(p=>rel.toLowerCase()===p.toLowerCase()||rel.toLowerCase().startsWith(p.toLowerCase()+'/'));
 function resolve(rel){virtual(rel);for(const source of [...sources].reverse()){const file=location(source,rel);if(file)return {source,file};if(masks(source,rel))return null;}return null;}
 function readFrom(id,rel){virtual(rel);const source=sources.find(s=>s.id===id);if(!source)throw Error('Unknown asset source root '+id);const file=location(source,rel);if(!file)throw Error('Source file missing '+id+':'+rel);const bytes=source.zip?source.zip.read(rel):fs.readFileSync(file);if(!source.zip)track(file,bytes,id,rel);selected.set(id+':'+rel,{source:id,virtualPath:rel,file:source.archive||file,archiveEntry:source.zip?rel:null,sha256:hash(bytes)});return bytes;}
 function effective(rel){const winner=resolve(rel);if(!winner)throw Error('Effective source missing or hidden by replace_path '+rel);return {bytes:readFrom(winner.source.id,rel),root:winner.source.id};}
 function visibleFiles(prefix){virtual(prefix);const found=new Set();for(const source of sources){const names=source.zip?[...source.zip.entries.keys()].filter(p=>p.startsWith(prefix+'/')):files(path.join(source.root,prefix)).map(file=>path.relative(source.root,file).replaceAll('\\','/'));for(const rel of names){virtual(rel);found.add(rel);}}
  return [...found].sort((a,b)=>a.localeCompare(b,'en')).flatMap(rel=>{const winner=resolve(rel);return winner?[{source:winner.source.id,rel}]:[];});
 }
 function assertUnchanged(){for(const r of reads.values())if(hash(fs.readFileSync(r.file))!==r.sha256)throw Error('Build input changed '+r.file);}
 return {sources,readFrom,effective,visibleFiles,assertUnchanged,reads,selected};
}
module.exports={createInputView,zipIndex,crc32,virtual,hash};
