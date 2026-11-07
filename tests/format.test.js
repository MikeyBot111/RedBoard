const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const F=require('../format');
const example=()=>F.parse(fs.readFileSync(path.join(__dirname,'../examples/architecture.redboard.json'),'utf8'));
let count=0;
function test(name,fn){fn();count++;console.log('PASS',name);}
test('Example opens in the unified format',()=>{const d=example();assert.equal(d.elements.length,8);assert.equal(d.format,'redboard');});
test('Roundtrip preserves every element and stable ID',()=>{const d=example();d.elements.push({id:'pen',type:'draw',x:10,y:20,w:50,h:40,text:'',points:[[0,0],[50,40]],style:{...F.defaults}});assert.deepEqual(F.parse(F.exportText(d)),d);});
test('Partial styles normalize',()=>{const d=example();d.elements[0].style={fill:'#ffccaa'};assert.equal(F.validate(d).elements[0].style.strokeWidth,2);});
test('Malformed documents fail explicitly',()=>{assert.throws(()=>F.parse('broken'));assert.throws(()=>F.parse('{}'),/Expected a RedBoard/);const d=example();d.elements[1].id=d.elements[0].id;assert.throws(()=>F.validate(d),/unique ID/);});
test('Dangling references are rejected',()=>{const d=example();d.elements.find(e=>e.from).from='missing';assert.throws(()=>F.validate(d),/missing/);});
test('Invalid colors and coordinates are rejected',()=>{const d=example();d.elements[0].style.fill='#abcde';assert.throws(()=>F.validate(d),/colors/);d.elements[0].style.fill='#fff';d.elements[0].x=Infinity;assert.throws(()=>F.validate(d),/finite/);});
test('Layout preserves connections and handles cycles',()=>{const d=example();const edge=d.elements.find(e=>e.from);d.elements.push({...edge,id:'return',from:edge.to,to:edge.from});const refs=d.elements.filter(e=>e.from).map(e=>[e.from,e.to]);F.layout(d);assert.deepEqual(d.elements.filter(e=>e.from).map(e=>[e.from,e.to]),refs);assert.ok(d.elements.every(e=>Number.isFinite(e.x)&&Number.isFinite(e.y)));});
console.log(count+' tests passed.');
