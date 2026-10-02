const path=require('path'),fs=require('fs'),{compile,writeBuild}=require('./builder.cjs');
const {resolveProfile}=require('./profile.cjs');
try{
 const [command='build',...args]=process.argv.slice(2);if(!['build','inspect'].includes(command))throw Error('Usage: node cli.cjs build|inspect [--game PATH] [--out PATH] [--config PATH] [--profile active|BACKUP_JSON] [--user-data PATH] [--dlc none|installed]');
 const options={};for(let i=0;i<args.length;i+=2){if(!['--game','--out','--config','--profile','--user-data','--dlc'].includes(args[i])||!args[i+1])throw Error('Invalid option '+args[i]);if(options[args[i].slice(2)]!==undefined)throw Error('Repeated option '+args[i]);options[args[i].slice(2)]=args[i+1];}
 const configFile=path.resolve(options.config||path.join(__dirname,'demo/config.json')),config=JSON.parse(fs.readFileSync(configFile,'utf8')),dir=path.dirname(configFile);
 const project=path.resolve(__dirname,'../..'),game=path.resolve(options.game||'F:/SteamLibrary/steamapps/common/Hearts of Iron IV');
 const profile=options.profile||((command==='inspect')?'active':null);
 if(!profile&&(options['user-data']||options.dlc))throw Error('--user-data and --dlc require --profile');
 const resolved=profile?resolveProfile({game,userData:path.resolve(options['user-data']||path.join(project,'../..')),profile,dlc:options.dlc||'none',project}):null;
 if(command==='inspect'){
  const build=compile({sources:[{id:'vanilla',root:game}],packages:[{id:'profile.inspection',requires:[],operations:[{kind:'emit',file:'input-profile.json',content:JSON.stringify(resolved.report,null,2)+'\n'}]}],name:'Touhou Lua Input Inspection',inputProfile:resolved.report});
  console.log(JSON.stringify({...writeBuild(build,options.out||path.join(__dirname,'build/input-profile')),canBuild:resolved.report.canBuild,mods:resolved.report.mods.length,dlcs:resolved.report.dlcs.length,warnings:resolved.report.warnings,errors:resolved.report.errors},null,2));
 }else{
  if(resolved&&!resolved.report.canBuild)throw Error('Invalid profile: '+JSON.stringify(resolved.report.errors));
  const build=compile({sources:resolved?resolved.sources:[{id:'vanilla',root:game},{id:'touhou114',root:project}],packageFiles:config.packages.map(p=>path.resolve(dir,p)),name:config.name,baseDependency:config.baseDependency,inputProfile:resolved?.report});
  console.log(JSON.stringify({...writeBuild(build,options.out||path.join(__dirname,'build',profile?'active-preview':'preview')),...(resolved?{warnings:resolved.report.warnings}: {})},null,2));
 }
}catch(error){console.error(error.message);process.exitCode=1;}
