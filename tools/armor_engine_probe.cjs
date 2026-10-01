// Temporary startup probe; restore exact history bytes after validating every preset in the engine.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),h=require('./hoi4_script.cjs');
const root=path.resolve(__dirname,'..'),history=path.join(root,'history/countries/ALI - Alice.txt');
const backup=path.join(__dirname,'.armor_engine_probe_backup.json'),probe=path.join(root,'common/scripted_effects/touhou_tank_engine_probe.txt');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const mode=process.argv[2];
if(mode==='install'){
  if(fs.existsSync(backup)||fs.existsSync(probe))throw Error('An engine probe already exists; restore it first.');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/幻想乡军事原版化迁移清单.json'))),original=fs.readFileSync(history,'utf8');
  const nativeChassis=manifest.armor.presets.filter(p=>!p.oldModel).map(p=>p.type).map(type=>{const match=type.match(/^(light|medium)_tank_chassis_([123])$/);return ['basic','improved','advanced'][Number(match[2])-1]+'_'+match[1]+'_tank_chassis';});
  const body=[h.node('log','"TOUHOU_ARMOR_PROBE_DESIGNS_56_BEGIN"'),h.node('set_technology',[...new Set(nativeChassis)].map(id=>h.node(id,'1')).concat(h.node('popup','no'))),h.node('set_technology',[...manifest.armor.licenses.map(l=>h.node(l.id,'1')),h.node('popup','no')]),
    ...manifest.armor.presets.map(p=>h.node('create_equipment_variant',p.design.map(n=>n.key==='name'?h.node('name',JSON.stringify('验证_'+p.name)):n))),h.node('log','"TOUHOU_ARMOR_PROBE_DESIGNS_56_END"')];
  const script=h.render([h.node('touhou_validate_all_tank_designs',[h.node('if',[h.node('limit',[h.node('has_dlc','"No Step Back"')]),...body])])]);
  const modified=original+'\n# TEMPORARY ARMOR ENGINE PROBE\ntouhou_validate_all_tank_designs = yes\n';
  fs.writeFileSync(backup,JSON.stringify({original,modifiedHash:hash(modified),scriptHash:hash(script)}));
  fs.writeFileSync(probe,script);fs.writeFileSync(history,modified);console.log('Installed temporary engine probe for '+manifest.armor.presets.length+' presets.');
}else if(mode==='restore'){
  if(!fs.existsSync(backup))throw Error('No engine probe backup to restore.');
  const saved=JSON.parse(fs.readFileSync(backup));
  if(hash(fs.readFileSync(history,'utf8'))!==saved.modifiedHash||hash(fs.readFileSync(probe,'utf8'))!==saved.scriptHash)throw Error('Probe/history changed externally; preserve and reconcile before restoring.');
  fs.writeFileSync(history,saved.original);fs.unlinkSync(probe);fs.unlinkSync(backup);console.log('Restored exact country history and removed temporary engine probe.');
}else throw Error('Use install or restore.');
