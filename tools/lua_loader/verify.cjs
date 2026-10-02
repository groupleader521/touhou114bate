const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
const {compile,writeBuild,hash}=require('./builder.cjs');
const {resolveProfile}=require('./profile.cjs');
const project=path.resolve(__dirname,'../..');
const game=process.env.HOI4_GAME_ROOT||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
try{
 const tests=spawnSync(process.execPath,['--test','--test-reporter=tap',...fs.readdirSync(path.join(__dirname,'test')).filter(f=>f.endsWith('.test.cjs')).map(f=>path.join(__dirname,'test',f))],{encoding:'utf8',maxBuffer:4*1024*1024});
 if(tests.status!==0)throw Error(tests.stdout+'\n'+tests.stderr);
 const counts={};for(const key of ['tests','pass','fail','skipped']){const m=tests.stdout.match(new RegExp('^# '+key+' (\\d+)$','m'));if(!m)throw Error('Missing test summary '+key);counts[key]=Number(m[1]);}
 if(counts.skipped)throw Error('Real installation tests were skipped; a full verification report cannot be produced');
 const modes=[];
 function recordBuild(build,output){
  const destination=path.join(__dirname,'build',output);writeBuild(build,destination);
  const repeat=writeBuild(build,destination);if(repeat.written!==0)throw Error('Rebuild unexpectedly rewrote generated files');
  modes.push({mode:output,buildId:build.report.buildId,outputDirectory:destination,files:build.report.files,packageOrder:build.report.packageOrder,sourceReadCount:build.report.inputs.length,unchangedRebuildWrites:repeat.written,technologyReplacement:build.outputs.has('common/technologies/NSB_armor.txt'),localisationOrigins:build.report.localisationOrigins});
 }
 for(const [configName,output] of [['config.json','preview'],['merge.json','merge-proof']]){
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'demo',configName),'utf8'));
  const build=compile({sources:[{id:'vanilla',root:game},{id:'touhou114',root:project}],packageFiles:config.packages.map(p=>path.join(__dirname,'demo',p)),name:config.name,baseDependency:config.baseDependency});
  recordBuild(build,output);
 }
 const resolved=resolveProfile({game,userData:process.env.HOI4_USER_DATA||path.resolve(project,'../..'),profile:'active',dlc:'installed',project});
 if(!resolved.report.canBuild)throw Error('Active input profile is invalid: '+JSON.stringify(resolved.report.errors));
 const core=JSON.parse(fs.readFileSync(path.join(__dirname,'demo/config.json'),'utf8'));
 recordBuild(compile({sources:resolved.sources,packageFiles:core.packages.map(p=>path.join(__dirname,'demo',p)),name:core.name,baseDependency:core.baseDependency,inputProfile:resolved.report}),'active-preview');
 const profileReport=compile({sources:[{id:'vanilla',root:game}],packages:[{id:'profile.inspection',requires:[],operations:[{kind:'emit',file:'input-profile.json',content:JSON.stringify(resolved.report,null,2)+'\n'}]}],name:'Touhou Lua Input Inspection',inputProfile:resolved.report});
 writeBuild(profileReport,path.join(__dirname,'build/input-profile'));
 const input=path.join(game,'common/technologies/NSB_armor.txt');
 const inputProfile={file:path.join(__dirname,'build/input-profile/input-profile.json'),mods:resolved.report.mods.length,dlcs:resolved.report.dlcs.length,mountedDLCs:resolved.report.dlcs.filter(d=>d.mounted).length,sources:resolved.sources.length,archives:resolved.sources.filter(s=>s.archive).length,warnings:resolved.report.warnings,errors:resolved.report.errors,engineOrderVerified:false,settingsAndDescriptorHashesUnchanged:resolved.report.inputs.every(r=>hash(fs.readFileSync(r.file))===r.sha256)};
 const report={schema:1,date:new Date().toISOString(),tests:counts,gameRoot:path.resolve(game),nativeTechnology:{file:input,sha256:hash(fs.readFileSync(input)),preservation:'Test compared all parsed native fields, unlocks and conditions after removing exactly the two declared description additions.'},modes,inputProfile,installationWrites:0,engineVerified:false,launcherRegistered:false,runtimeHookImplemented:false};
 const target=path.join(project,'docs/Lua加载器研究/原型验证结果.json');fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({tests:counts,modes:modes.map(m=>({mode:m.mode,files:m.files.length,technologyReplacement:m.technologyReplacement,unchangedRebuildWrites:m.unchangedRebuildWrites})),inputProfile,report:target,engineVerified:false},null,2));
}catch(error){console.error(error.message);process.exitCode=1;}
