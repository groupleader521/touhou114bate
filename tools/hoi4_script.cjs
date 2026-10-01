const fs = require('fs');
const path = require('path');
function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))
    .flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);
}
function parse(source) {
  const tokens = [...source.matchAll(/"(?:\\.|[^"\\])*"|#[^\r\n]*|[{}]|>=|<=|!=|==|=|>|<|[^\s{}=<>!#"]+/g)]
    .filter(m=>!m[0].startsWith('#')).map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
  let i=0;
  function block(nested=false) {
    const nodes=[];
    while(i<tokens.length) {
      const t=tokens[i++];
      if(t.text==='}') { if(!nested) throw Error('Unexpected }'); return nodes; }
      if(t.text==='{') {nodes.push({key:null,value:block(true),start:t.start,end:tokens[i-1].end});continue;}
      const n={key:null,value:t.text,start:t.start,end:t.end};
      if(tokens[i] && ['=','>','<','>=','<=','!=','=='].includes(tokens[i].text)) {
        n.key=t.text;n.op=tokens[i++].text;
        const v=tokens[i++];if(!v)throw Error('Missing value for '+t.text);
        n.valueStart=v.start;
        n.value=v.text==='{'?block(true):v.text;n.end=tokens[i-1].end;
      }
      nodes.push(n);
    }
    if(nested)throw Error('Unclosed block');return nodes;
  }
  return block();
}
function children(n,key){return (Array.isArray(n.value)?n.value:[]).filter(c=>c.key===key);}
function scalar(n,key){return children(n,key).at(-1)?.value;}
function node(key,value,op='='){return {key,value,op};}
function render(nodes,depth=0) {
  return nodes.map(n=>{
    const prefix='\t'.repeat(depth), key=n.key===null?'':n.key+' '+(n.op||'=')+' ';
    return Array.isArray(n.value)?prefix+key+'{\n'+render(n.value,depth+1)+prefix+'}\n':prefix+key+n.value+'\n';
  }).join('');
}
function definitions(base,folder,wrapper){return files(path.join(base,folder)).filter(f=>f.endsWith('.txt')&&(wrapper!=='sub_units'||path.dirname(f)===path.join(base,folder))).flatMap(file=>{
  const source=fs.readFileSync(file,'utf8');return parse(source).filter(n=>n.key===wrapper).flatMap(n=>n.value)
    .filter(n=>n.key&&Array.isArray(n.value)&&!n.key.startsWith('@')).map(n=>({...n,file}));
});}
module.exports={files,parse,children,scalar,node,render,definitions};
