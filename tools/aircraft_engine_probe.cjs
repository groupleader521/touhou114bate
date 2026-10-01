// Reversible engine check: create every exact aircraft preset with native role/chassis rules.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),h=require('./hoi4_script.cjs');
const root=path.resolve(__dirname,'..'),history=path.join(root,'history/countries/ALI - Alice.txt');
const backup=path.join(__dirname,'.aircraft_engine_probe_backup.json'),probe=path.join(root,'common/scripted_effects/touhou_aircraft_engine_probe.txt');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
if(process.argv[2]==='install'){
  if(fs.existsSync(backup)||fs.existsSync(probe))throw Error('Restore the existing aircraft probe first.');
  const manifest=JSON.parse(fs.readFileSync(path.join(root,'docs/幻想乡军事原版化迁移清单.json'))),original=fs.readFileSync(history,'utf8'),a=manifest.aircraft;
  const body=[h.node('log','"TOUHOU_AIR_PROBE_DESIGNS_43_BEGIN"'),h.node('set_technology',[...a.licenses.map(l=>h.node(l.id,'1')),h.node('popup','no')]),
    ...a.presets.map(p=>h.node('create_equipment_variant',p.design.map(n=>n.key==='name'?h.node('name',JSON.stringify('验证_'+p.name)):n))),h.node('log','"TOUHOU_AIR_PROBE_DESIGNS_43_END"')];
  const script=h.render([h.node('touhou_validate_all_aircraft_designs',[h.node('if',[h.node('limit',[h.node('has_dlc','"By Blood Alone"')]),...body])])]),modified=original+'\n# TEMPORARY AIRCRAFT ENGINE PROBE\ntouhou_validate_all_aircraft_designs = yes\n';
  fs.writeFileSync(backup,JSON.stringify({original,modifiedHash:hash(modified),scriptHash:hash(script)}));fs.writeFileSync(probe,script);fs.writeFileSync(history,modified);console.log('Installed probe for '+a.presets.length+' aircraft presets.');
}else if(process.argv[2]==='restore'){
  if(!fs.existsSync(backup))throw Error('No aircraft probe backup.');const saved=JSON.parse(fs.readFileSync(backup));
  if(hash(fs.readFileSync(history,'utf8'))!==saved.modifiedHash||hash(fs.readFileSync(probe,'utf8'))!==saved.scriptHash)throw Error('Aircraft probe/history was edited; reconcile before restoring.');
  fs.writeFileSync(history,saved.original);fs.unlinkSync(probe);fs.unlinkSync(backup);console.log('Restored exact history and removed aircraft engine probe.');
}else throw Error('Use install or restore.');
