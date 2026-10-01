// Static audit against an installed vanilla game. Does not edit gameplay files.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const vanillaRoot = process.argv[2] || 'F:/SteamLibrary/steamapps/common/Hearts of Iron IV';
const sourceHashes = new Map();

function files(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(e => e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]);
}

function parse(source, file) {
  const tokens = [...source.matchAll(/"(?:\\.|[^"\\])*"|#[^\r\n]*|[{}]|>=|<=|!=|==|=|>|<|[^\s{}=<>!#"]+/g)]
    .filter(m => !m[0].startsWith('#'))
    .map(m => ({ text: m[0], offset: m.index }));
  let i = 0;
  function block() {
    const nodes = [];
    while (i < tokens.length) {
      const token = tokens[i++];
      if (token.text === '}') break;
      if (token.text === '{') { nodes.push({ value: block() }); continue; }
      const location = { file, line: source.slice(0, token.offset).split('\n').length };
      if (tokens[i] && ['=', '>', '<', '>=', '<=', '!=', '=='].includes(tokens[i].text)) {
        const operator = tokens[i++].text;
        const next = tokens[i++];
        if (!next) throw new Error('Missing value: ' + file + ':' + location.line);
        nodes.push({ key: token.text, operator, value: next.text === '{' ? block() : next.text, ...location });
      } else nodes.push({ value: token.text, ...location });
    }
    return nodes;
  }
  return block();
}

function definitions(base, folder, wrapper) {
  return files(path.join(base, folder)).filter(f => f.endsWith('.txt')).flatMap(file => {
    const source = fs.readFileSync(file, 'utf8');
    const hash = crypto.createHash('sha256').update(source).digest('hex');
    if (sourceHashes.has(file) && sourceHashes.get(file) !== hash) throw new Error('Source changed during audit: ' + file);
    sourceHashes.set(file, hash);
    const nodes = parse(source, file);
    return nodes.filter(n => n.key === wrapper).flatMap(n => n.value)
      .filter(n => n.key && Array.isArray(n.value) && !n.key.startsWith('@'));
  });
}
function scalar(node, key) {
  return node.value.filter(n => n.key === key && typeof n.value === 'string').at(-1)?.value;
}
const equipmentFolder = 'common/units/equipment';
const vanillaEquipment = definitions(vanillaRoot, equipmentFolder, 'equipments');
const duplicates = definitions(vanillaRoot, equipmentFolder, 'duplicate_archetypes');
const modEquipment = definitions(root, equipmentFolder, 'equipments');
const vanillaMap = new Map(vanillaEquipment.map(n => [n.key, n]));
// Resolve numeric defaults of generated role archetypes (not their generated models).
for (const node of duplicates) if (!vanillaMap.has(node.key)) vanillaMap.set(node.key, node);
const modMap = new Map([...vanillaMap, ...modEquipment.map(n => [n.key, n])]);
const metadata = new Set(['year', 'priority', 'visual_level', 'air_map_icon_frame',
  'interface_overview_category_index', 'land_air_wing_size', 'carrier_air_wing_size']);
const numberPattern = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const omissions = [];
function numericProperties(node) {
  const result = {};
  for (const n of node.value) {
    if (!n.key || metadata.has(n.key)) continue;
    if (typeof n.value === 'string' && numberPattern.test(n.value)) {
      result[n.key] = { value: Number(n.value), file: n.file, line: n.line, definition: node.key };
    } else if (n.key === 'resources' && Array.isArray(n.value)) {
      for (const resource of n.value) if (resource.key && numberPattern.test(resource.value)) {
        result['resources.' + resource.key] = {
          value: Number(resource.value), file: resource.file, line: resource.line, definition: node.key
        };
      }
    }
  }
  return result;
}
function resolved(node, map, chain = []) {
  if (chain.includes(node.key)) throw new Error('Archetype cycle: ' + chain.join(' -> '));
  const parentArchetype = scalar(node, 'archetype');
  let inherited = {};
  if (parentArchetype) {
    const parent = map.get(parentArchetype);
    if (!parent) throw new Error('Missing archetype: ' + parentArchetype);
    inherited = resolved(parent, map, [...chain, node.key]);
  }
  const own = numericProperties(node);
  // A declared resources block supplies the model's resource list.
  if (node.value.some(n => n.key === 'resources')) {
    inherited = Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('resources.')));
  }
  return { ...inherited, ...own };
}
const localisation = new Map();
for (const base of [vanillaRoot, root]) for (const file of files(path.join(base, 'localisation/simp_chinese')).filter(f => f.endsWith('.yml'))) {
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([^\s:#]+):\s*\d*\s*"(.*)"\s*(?:#.*)?$/);
    if (m) localisation.set(m[1], m[2]);
  }
}
function display(id, depth = 0) {
  if (depth > 10) return id;
  return (localisation.get(id) || id).replace(/\$([^$]+)\$/g, (_, key) => display(key, depth + 1)).replace(/§./g, '');
}
function group(id) {
  return id.startsWith('touhou_magic_') ? '魔力' : id.startsWith('touhou_wakan_') ? '灵力'
    : id.startsWith('touhou_demonforce_') ? '妖力' : id.startsWith('touhou_support_') ? '幻想支援' : '王牌';
}
function category(id) {
  if (/(?:light|medium|heavy|modern)_tank|super_heavy_tank/.test(id)) return '坦克';
  if (/fighter|CAS|bomber/.test(id)) return '飞机';
  if (/infantry_equipment/.test(id)) return '步枪';
  if (/motorized|mechanized/.test(id)) return '车辆';
  if (/artillery|anti_air|anti_tank/.test(id)) return '火炮';
  return '支援';
}
function compared(customValues, vanillaValues) {
  return [...new Set([...Object.keys(customValues), ...Object.keys(vanillaValues)])].sort().map(key => {
    const custom = customValues[key], original = vanillaValues[key];
    const result = { key, custom, original };
    if (custom && original) {
      result.delta = custom.value - original.value;
      result.relative = original.value !== 0 ? custom.value / original.value - 1 : null;
      result.relation = Math.abs(result.delta) < 1e-9 ? '相同' : result.delta > 0 ? '较高' : '较低';
    } else result.relation = '未完整声明，不能确定差值';
    return result;
  });
}
function makeRecord(node, target) {
  const customValues = resolved(node, modMap);
  return { id: node.key, name: display(node.key), group: group(node.key), category: category(node.key),
    year: scalar(node, 'year'), source: { file: node.file, line: node.line },
    customArchetype: scalar(node, 'archetype'), originalId: target?.key,
    originalYear: target ? scalar(target, 'year') : undefined,
    originalArchetype: target ? scalar(target, 'archetype') : undefined,
    originalSource: target ? { file: target.file, line: target.line } : undefined,
    values: target ? compared(customValues, resolved(target, vanillaMap)) :
      Object.entries(customValues).map(([key, custom]) => ({ key, custom, relation: '无等价原版型号' })) };
}
const models = modEquipment.filter(n => scalar(n, 'is_archetype') !== 'yes');
const regular = [], special = [];
for (const node of models) {
  const targetId = node.key.replace(/^touhou_(magic_|wakan_|demonforce_)?/, '');
  const target = vanillaMap.get(targetId);
  (target ? regular : special).push(makeRecord(node, target));
}
if (modEquipment.length !== 204 || models.length !== 143 || regular.length !== 120 || special.length !== 23) {
  throw new Error('Inventory counts changed: inspect before accepting audit');
}
const unitDefinitions = definitions(root, 'common/units', 'sub_units');
const vanillaUnits = new Map(definitions(vanillaRoot, 'common/units', 'sub_units').map(n => [n.key, n]));
const unitComparisons = [];
const unitNames = new Map();
for (const node of unitDefinitions) {
  const id = node.key.replace(/^touhou_(magic_|wakan_|demonforce_)?/, '');
  const target = vanillaUnits.get(id);
  if (!target) continue;
  unitNames.set(node.key, id);
  unitComparisons.push({ id: node.key, originalId: id, values: compared(numericProperties(node), numericProperties(target)) });
}
const vanillaTechs = new Map(definitions(vanillaRoot, 'common/technologies', 'technologies').map(n => [n.key, n]));
const techMetadata = new Set(['start_year', 'research_cost', 'folder', 'path', 'ai_will_do', 'categories',
  'dependencies', 'xor', 'on_research_complete', 'on_research_complete_limit', 'allow', 'allow_branch',
  'enable_equipments', 'enable_equipment_modules', 'enable_subunits', 'special_project_specialization']);
function numericEffects(node) {
  const values = {};
  function walk(nodes, prefix) {
    for (const n of nodes) {
      if (!n.key || (!prefix && techMetadata.has(n.key))) continue;
      const key = prefix + (unitNames.get(n.key) || n.key);
      if (Array.isArray(n.value)) walk(n.value, key + '.');
      else if (numberPattern.test(n.value)) values[key] = {
        value: Number(n.value), file: n.file, line: n.line, definition: node.key
      };
    }
  }
  walk(node.value, '');
  return values;
}
const techComparisons = definitions(root, 'common/technologies', 'technologies')
  .filter(n => n.key.startsWith('touhou_')).map(node => {
    const id = node.key.replace(/^touhou_(magic_|wakan_|demonforce_)?/, '');
    const target = vanillaTechs.get(id);
    if (!target) throw new Error('Missing ordinary technology: ' + id);
    return { id: node.key, originalId: id, values: compared(numericEffects(node), numericEffects(target)) };
  });
if (techComparisons.length !== 246) throw new Error('Technology comparison count changed');
// Every custom archetype is included separately so placeholder root stats stay visible.
const archetypes = modEquipment.filter(n => scalar(n, 'is_archetype') === 'yes').map(n => makeRecord(n));
const stats = {};
for (const record of regular) {
  const bucket = stats[record.group] ||= { models: 0, categories: {}, fields: {} };
  bucket.models++;
  bucket.categories[record.category] = (bucket.categories[record.category] || 0) + 1;
  for (const entry of record.values) {
    const f = bucket.fields[entry.key] ||= { higher: 0, equal: 0, lower: 0, undefined: 0, relativeChanges: [] };
    f[entry.relation === '较高' ? 'higher' : entry.relation === '较低' ? 'lower' : entry.relation === '相同' ? 'equal' : 'undefined']++;
    if (entry.relative !== null && entry.relative !== undefined) f.relativeChanges.push(entry.relative);
  }
}
const version = JSON.parse(fs.readFileSync(path.join(vanillaRoot, 'launcher-settings.json'), 'utf8')).rawVersion;
const report = { date: '2026-10-01', vanillaRoot, version, methodology: {
  numericDefaults: '型号显式值覆盖 archetype 链；parent 不作为跨代属性继承。',
  undefined: '双方没有完整定义的属性不推定为零；资源缺项也不推定为零。',
  scope: '静态未升级装备定义；不含科技、民族精神、MIO、单位模板、模块设计、事件设计或游戏引擎的默认值。',
  designers: '固定装备与 NSB/BBA 空底盘/空机体不可直接等价比较；本报告的直接基线为原版固定装备型号。'
}, counts: { definitions: modEquipment.length, archetypes: archetypes.length, regularModels: regular.length,
  specialModels: special.length, mappedUnits: unitComparisons.length }, stats, regular, special, archetypes, unitComparisons, omissions };
report.techComparisons = techComparisons;
report.sourceHashes = Object.fromEntries(sourceHashes);
const labels = { soft_attack: '软攻', hard_attack: '硬攻', ap_attack: '穿甲', air_attack: '攻击/防空（按装备类型解释）',
  defense: '防御', breakthrough: '突破', hardness: '硬度', armor_value: '装甲', maximum_speed: '速度',
  reliability: '可靠性', build_cost_ic: '生产成本', fuel_consumption: '燃油消耗', fuel_capacity: '燃油容量',
  air_agility: '机动', air_defence: '空防', air_range: '航程', air_ground_attack: '对地攻击',
  strategic_bombing: '战略轰炸', naval_strike_attack: '对海攻击', manpower: '装备人力',
  supply_consumption: '补给消耗', max_strength: 'HP', max_organisation: '组织度', casualty_trickleback: '伤员归队率' };
function fmt(n) { return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(8))); }
function location(x) {
  if (!x) return '未声明';
  const file = x.file.replaceAll('\\', '/');
  const modPrefix = root.replaceAll('\\', '/') + '/';
  const originalPrefix = path.resolve(vanillaRoot).replaceAll('\\', '/') + '/';
  return (file.startsWith(modPrefix) ? 'Mod/' + file.slice(modPrefix.length)
    : file.startsWith(originalPrefix) ? '原版/' + file.slice(originalPrefix.length) : file) + ':' + x.line;
}
function diff(entry) {
  if (entry.delta === undefined) return entry.relation;
  return entry.relation + (entry.relative === null ? '（原版为0）' : ' ' + (entry.relative > 0 ? '+' : '') + fmt(entry.relative * 100) + '%');
}
function tableValue(record, key, original = false) {
  const entry = record.values.find(e => e.key === key);
  const property = original ? entry?.original : entry?.custom;
  return property ? fmt(property.value) : '未声明';
}
function summaryTable(title, records, keys, includeOriginal = true) {
  const lines = ['', title, ['型号', ...keys.map(k => labels[k] || k)].join(' | ')];
  if (includeOriginal && records.length) lines.push(['原版对应型号', ...keys.map(k => tableValue(records[0], k, true))].join(' | '));
  for (const r of records) lines.push([r.group + '：' + r.name, ...keys.map(k => tableValue(r, k))].join(' | '));
  return lines;
}
const text = ['幻想乡装备实际数值审计', '======================', '',
  '日期：2026-10-01；对照本机原版版本：' + version,
  'Mod 根目录：' + root, '原版根目录：' + vanillaRoot,
  '覆盖：204 项装备定义；120 个普通型号逐项对照；23 个王牌型号列实际值；61 个原型列实际值；69 个普通兵种列直接属性差异。',
  '结论不能预先定为“全强”“全弱”或“统一90%”。本报告不提出新的削弱比例。',
  '继承：型号显式值覆盖其 archetype 原型的值；不把 parent 当成同代或上一代性能继承。',
  '原版 duplicate_archetypes 的角色原型默认值沿其 archetype 链解析；固定型号显式值优先。',
  '未完整声明的字段注明“未声明”，不猜引擎默认值；资源缺项也不猜零。',
  '基线为未升级的固定装备；尚未叠加科技、民族精神、MIO、设计模块、单位模板等。',
  '现有自定义坦克/飞机是成品：不能把攻击或成本与原版空底盘/空机体直接相除判断强弱。',
  '', '结果速览（详细字段来源见后文）',
  ...summaryTable('1936 步枪', ['魔力', '灵力', '妖力'].map(g => regular.find(r => r.group === g && r.originalId === 'infantry_equipment_1')),
    ['soft_attack', 'hard_attack', 'defense', 'breakthrough', 'ap_attack', 'build_cost_ic', 'reliability', 'resources.steel']),
  ...summaryTable('1934 轻坦', regular.filter(r => r.originalId === 'light_tank_equipment_1'),
    ['soft_attack', 'hard_attack', 'armor_value', 'ap_attack', 'maximum_speed', 'build_cost_ic', 'fuel_consumption']),
  ...summaryTable('1934 重坦', regular.filter(r => r.originalId === 'heavy_tank_equipment_1'),
    ['soft_attack', 'hard_attack', 'armor_value', 'ap_attack', 'maximum_speed', 'build_cost_ic', 'fuel_consumption']),
  ...summaryTable('1936 战斗机（原版固定成品，非 BBA 模块设计）', ['魔力', '灵力', '妖力'].map(g => regular.find(r => r.group === g && r.originalId === 'fighter_equipment_1')),
    ['air_attack', 'air_defence', 'air_agility', 'maximum_speed', 'build_cost_ic', 'reliability']),
  '', '明确发现：妖力四代步枪的主要战斗属性、可靠性、成本和钢材均与原版对应型号相同。',
  '明确发现：三种体系均存在高于、低于或等于原版的属性；不存在文件证据支持统一90%。',
  '六个喷气型号的装备年份为1946，而原版同代后期喷气型号为1950；不能称其为同年比较。',
  '原版1.19 support_weapons 解锁 fire_support/mot_fire_support；旧步兵防御/突破修正已被注释，Mod 同类科技仍有旧式单位百分比加成。',
  '', '一、普通型号逐项对照（数值为文件中显式或沿原型继承的值）'];
let index = 0;
for (const r of regular) {
  text.push('', (++index) + '. ' + r.name + ' [' + r.id + ']',
    '体系：' + r.group + '；类别：' + r.category + '；年份：' + r.year + ' / 原版 ' + r.originalYear,
    '原版型号：' + r.originalId, '自定义来源：' + location(r.source), '原版来源：' + location(r.originalSource),
    '字段 | 自定义 | 原版 | 差异 | 自定义值来源 | 原版值来源');
  for (const e of r.values) text.push([labels[e.key] ? labels[e.key] + ' (' + e.key + ')' : e.key,
    e.custom ? fmt(e.custom.value) : '未声明', e.original ? fmt(e.original.value) : '未声明',
    diff(e), location(e.custom), location(e.original)].join(' | '));
}
text.push('', '二、23 个王牌型号的实际值（无等价基线，不人为指定普通型号比较）');
for (const r of special) {
  text.push('', r.name + ' [' + r.id + ']；来源：' + location(r.source));
  for (const e of r.values) text.push((labels[e.key] || e.key) + ' (' + e.key + ') = ' + fmt(e.custom.value) + '；来源：' + location(e.custom));
}
text.push('', '三、61 个自定义原型的实际值（型号会覆盖原型中的占位值，勿当成最终性能）');
for (const r of archetypes) {
  text.push('', r.name + ' [' + r.id + ']；来源：' + location(r.source));
  for (const e of r.values) text.push(e.key + ' = ' + fmt(e.custom.value) + '；来源：' + location(e.custom));
}
text.push('', '四、69 个直接对应原版兵种的数值差异');
for (const r of unitComparisons) {
  text.push('', r.id + ' → ' + r.originalId);
  const changed = r.values.filter(e => e.relation !== '相同');
  if (!changed.length) text.push('双方完整声明的直接数值相同。');
  for (const e of changed) text.push([e.key, e.custom ? fmt(e.custom.value) : '未声明',
    e.original ? fmt(e.original.value) : '未声明', diff(e), location(e.custom), location(e.original)].join(' | '));
}
text.push('', '五、246 项常规科技的数值修正对照',
  '这里展示独立的科技修正，尚未折算到装备/师的最终属性。',
  '自定义单位作用域仅在有直接原版对应项时归一化；不同类别作用域与不同单位作用域不认定等价。',
  '一侧未声明的修正不猜为0；研究条件、解锁内容、事件效果与研究时间不计入此处。');
for (const r of techComparisons) {
  text.push('', r.id + ' → ' + r.originalId);
  if (!r.values.length) text.push('没有纳入比较的数值修正。');
  for (const e of r.values) text.push([e.key, e.custom ? fmt(e.custom.value) : '未声明',
    e.original ? fmt(e.original.value) : '未声明', diff(e), location(e.custom), location(e.original)].join(' | '));
}
text.push('', '六、核对范围与局限',
  '基础装备文件对照不等于最终师属性。自定义科技的单位加成与国家效果应单独核算。',
  'NSB/BBA 最终设计比较还需要指定同代、同角色、同模块方案；尚未生成游戏内设计，故不报告成品百分比。',
  '没有改动任何游戏装备、科技、兵种或历史配置。');
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/幻想乡装备实际数值对照.txt'), '\uFEFF' + text.join('\r\n') + '\r\n');
fs.writeFileSync(path.join(root, 'docs/幻想乡装备实际数值对照.json'), JSON.stringify(report, null, 2));
const chosen = ['infantry_equipment_1', 'artillery_equipment_1', 'light_tank_equipment_1',
  'heavy_tank_equipment_1', 'fighter_equipment_1', 'motorized_equipment_1', 'mechanized_equipment_1'];
const chosenFields = ['soft_attack', 'hard_attack', 'defense', 'breakthrough', 'ap_attack', 'armor_value',
  'air_attack', 'air_defence', 'air_agility', 'maximum_speed', 'build_cost_ic', 'reliability', 'fuel_consumption'];
console.log(JSON.stringify({ version, counts: report.counts, categories: Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, v.categories])),
  samples: regular.filter(r => chosen.includes(r.originalId)).map(r => ({ id: r.id, original: r.originalId,
    values: Object.fromEntries(r.values.filter(e => chosenFields.includes(e.key)).map(e => [e.key,
      { custom: e.custom?.value, original: e.original?.value, percent: e.relative == null ? null : Number((e.relative * 100).toFixed(3)) }])) }))
}, null, 2));
