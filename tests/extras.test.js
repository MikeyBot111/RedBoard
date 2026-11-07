const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const F=require('../format');
const sample={format:'redboard',version:1,name:'Groups and charts',elements:[
 {id:'frame',type:'group',x:50,y:50,w:1050,h:440,text:'Project overview',style:{fill:'transparent',dash:'dashed'}},
 {id:'allocation',groupId:'frame',type:'pie',x:80,y:110,w:440,h:320,text:'Time allocation',data:[{label:'Design',value:45,color:'#7e829b'},{label:'Build',value:35,color:'#db594f'},{label:'Review',value:20,color:'#438c78'}],style:{fill:'#ffffff'}},
 {id:'progress',groupId:'frame',type:'chart',x:550,y:110,w:500,h:320,text:'Weekly progress',xLabel:'Week',yLabel:'Completed tasks',data:[{label:'Planned',color:'#7e829b',points:[[1,10],[2,20],[3,30],[4,40]]},{label:'Actual',color:'#db594f',points:[[1,8],[2,18],[3,27],[4,42]]}],style:{fill:'#ffffff'}}
]};
const doc=F.validate(sample);assert.deepEqual(F.parse(F.exportText(doc)),doc);
for(const mutate of [d=>d.elements[1].data[0].value=-1,d=>d.elements[1].data.forEach(s=>s.value=0),d=>d.elements[2].data[0].points=[[1,'bad']],d=>d.elements[1].groupId='missing',d=>d.elements[0].groupId='frame']){const d=structuredClone(doc);mutate(d);assert.throws(()=>F.validate(d));}
fs.writeFileSync(path.join(__dirname,'../examples/charts.redboard.json'),F.exportText(doc)+'\n');
(async()=>{
 const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const browser=await chromium.launch({channel:'msedge',headless:true});
 try{const page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(path.resolve(__dirname,'../index.html')).href);
 await page.locator('#fileInput').setInputFiles(path.resolve(__dirname,'../examples/charts.redboard.json'));await page.waitForSelector('[data-id="frame"]');await page.click('#fit');
 assert.ok(await page.locator('[data-id="allocation"] path').count()>0);assert.equal(await page.locator('[data-id="progress"] polyline').count(),2);
 const read=async()=>{await page.click('#toggleSource');const d=JSON.parse(await page.inputValue('#source'));await page.click('#closeSource');return d;};
 const title=await page.locator('[data-id="frame"] > text').boundingBox();await page.mouse.move(title.x+20,title.y+10);await page.mouse.down();await page.mouse.move(title.x+70,title.y+45,{steps:6});await page.mouse.up();
 let moved=await read();const delta=moved.elements[0].x-doc.elements[0].x;assert.ok(delta>0);assert.equal(moved.elements[1].x-doc.elements[1].x,delta);
 await page.click('#duplicate');let doubled=await read();assert.equal(doubled.elements.length,6);F.validate(doubled);assert.equal(doubled.elements[4].groupId,doubled.elements[3].id);
 await page.click('#undo');await page.locator('[data-id="allocation"]').click();await page.fill('#chartData',JSON.stringify([{label:'Only slice',value:100,color:'#db594f'}]));await page.click('#applyChart');assert.equal(await page.locator('[data-id="allocation"] circle').count(),1);
 await page.fill('#chartData','[]');await page.click('#applyChart');assert.match(await page.textContent('#chartError'),/1–100/);
 await page.locator('[data-id="frame"] > text').click();await page.click('#ungroup');const ungrouped=await read();assert.equal(ungrouped.elements.length,2);assert.ok(ungrouped.elements.every(e=>!e.groupId));
 await page.locator('#canvas').focus();await page.keyboard.press('Control+a');await page.click('#groupSelection');const regrouped=await read();assert.equal(regrouped.elements.length,3);F.validate(regrouped);
 await page.click('#addPie');await page.click('#addChart');const added=await read();assert.equal(added.elements.length,5);
 const promise=page.waitForEvent('download');await page.click('#exportSvg');const svg=fs.readFileSync(await (await promise).path(),'utf8');assert.match(svg,/<polyline/);assert.match(svg,/Project overview|Group/);
 await page.locator('#fileInput').setInputFiles(path.resolve(__dirname,'../examples/charts.redboard.json'));await page.click('#fit');await page.screenshot({path:path.resolve(__dirname,'../charts-preview.png')});assert.deepEqual(errors,[]);console.log('PASS chart validation, roundtrip, rendering, data edits, grouping, group movement/duplicate/ungroup, chart creation, SVG export');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
