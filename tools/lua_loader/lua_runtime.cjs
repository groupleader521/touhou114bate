const fs=require('fs');
const {lua,lauxlib,lualib,to_luastring,to_jsstring}=require('fengari');
const bootstrap=`
hoi4 = {}
function hoi4.package(meta)
  assert(type(meta) == "table" and type(meta.id) == "string", "package id is required")
  local p = {id=meta.id, requires=meta.requires or {}, operations={}}
  local methods = {}
  for _, kind in ipairs({"localisation", "append_localisation", "sprite", "asset", "patch", "panel", "emit"}) do
    methods[kind] = function(self, data)
      assert(type(data) == "table", kind .. " expects a table")
      assert(data.kind == nil, "kind is reserved")
      data.kind = kind
      self.operations[#self.operations+1] = data
      return self
    end
  end
  return setmetatable(p, {__index=methods})
end
`;
function runLuaSource(source,name='content.lua'){
 const L=lauxlib.luaL_newstate();if(!L)throw Error('Cannot create Lua VM');
 try{
  lualib.luaL_openlibs(L);
  for(const key of ['io','os','debug','package','require','dofile','loadfile','load','collectgarbage','print']){lua.lua_pushnil(L);lua.lua_setglobal(L,to_luastring(key));}
  lua.lua_getglobal(L,to_luastring('math'));
  for(const key of ['random','randomseed']){lua.lua_pushnil(L);lua.lua_setfield(L,-2,to_luastring(key));}lua.lua_pop(L,1);
  let instructions=0;lua.lua_sethook(L,()=>{instructions+=1000;if(instructions>2000000)lauxlib.luaL_error(L,to_luastring('Lua instruction budget exceeded'));},lua.LUA_MASKCOUNT,1000);
  function execute(code,label,results){
   let status=lauxlib.luaL_loadbuffer(L,to_luastring(code),null,to_luastring('@'+label));
   if(status===lua.LUA_OK)status=lua.lua_pcall(L,0,results,0);
   if(status!==lua.LUA_OK)throw Error(label+': '+to_jsstring(lua.lua_tolstring(L,-1)));
  }
  execute(bootstrap,'builder-api',0);execute(source,name,1);
  let nodes=0;const seen=new Set();
  function decode(index,depth=0){
   if(depth>32||++nodes>100000)throw Error('Lua content table is too large');
   index=lua.lua_absindex(L,index);const type=lua.lua_type(L,index);
   if(type===lua.LUA_TSTRING)return to_jsstring(lua.lua_tolstring(L,index));
   if(type===lua.LUA_TBOOLEAN)return Boolean(lua.lua_toboolean(L,index));
   if(type===lua.LUA_TNUMBER){const v=lua.lua_tonumber(L,index);if(!Number.isFinite(v))throw Error('Non-finite Lua value');return v;}
   if(type!==lua.LUA_TTABLE)throw Error('Content supports strings, numbers, booleans and tables only');
   const identity=lua.lua_topointer(L,index);if(seen.has(identity))throw Error('Cyclic Lua content table');seen.add(identity);
   const entries=[];lua.lua_pushnil(L);
   while(lua.lua_next(L,index)){
    const kt=lua.lua_type(L,-2);let key;
    if(kt===lua.LUA_TSTRING)key=to_jsstring(lua.lua_tolstring(L,-2));
    else if(kt===lua.LUA_TNUMBER&&lua.lua_isinteger(L,-2))key=lua.lua_tointeger(L,-2);
    else throw Error('Content table keys must be strings or integer indexes');
    entries.push([key,decode(-1,depth+1)]);lua.lua_pop(L,1);
   }
   seen.delete(identity);
   if(entries.length&&entries.every(([k])=>typeof k==='number')){
    entries.sort((a,b)=>a[0]-b[0]);if(entries.some(([k],i)=>k!==i+1))throw Error('Lua arrays must use consecutive indexes starting at 1');
    return entries.map(([,v])=>v);
   }
   if(entries.some(([k])=>typeof k!=='string'))throw Error('Mixed array/map content tables are unsupported');
   const out=Object.create(null);for(const [k,v] of entries){if(['__proto__','prototype','constructor'].includes(k))throw Error('Reserved table key '+k);out[k]=v;}return out;
  }
  const result=decode(-1);if(!result||typeof result.id!=='string')throw Error('Lua file must return a hoi4.package');
  // Builder methods are functions on the Lua table; convert only declarative fields.
  return result;
 }finally{lua.lua_close(L);}
}
exports.runLuaSource=runLuaSource;
exports.runLuaFile=file=>runLuaSource(fs.readFileSync(file,'utf8'),file);
