const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const sandbox={window:{},console,DxfParser:require('../vendor/dxf-parser.js')};vm.createContext(sandbox);
for(const p of ['photometry','calc','cad'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/'+p+'.js'),'utf8'),sandbox);
const LX=sandbox.window.LX,{text}=require('./cad-fixture.cjs');
const model=LX.cad.parse(text),all=LX.cad.contours(model.paths),boundary=all.find(p=>p.layer==='ROOM-BOUNDARY');
assert.equal(model.unitScale,0.001);
const cad=LX.cad.build(model,{boundary:boundary.id,scale:model.unitScale,deskLayers:['DESK'],deskBlocks:['DESK-1400']});
assert.equal(cad.width,12);assert.equal(cad.length,8);assert.equal(cad.area,96);assert.equal(cad.desks.length,3);
const areas=cad.desks.map(d=>LX.cad.area(d.polygon)).sort();assert(Math.abs(areas[0]-.98)<1e-8);assert(Math.abs(areas[2]-1.28)<1e-8);
assert(cad.desks.every(d=>d.height===.75));
assert.throws(()=>LX.cad.build(model,{boundary:boundary.id,scale:1,deskLayers:['DESK']}),/尺寸/);
const project={cad,room:{polygon:cad.polygon,height:3,wp:0,grid:.1,margin:.5,mf:1,rhoC:0,rhoW:0,rhoF:0},library:[{id:'lamp',length:.1,width:.1,gen:{beam:90}}],fixtures:[{id:'f',typeId:'lamp',x:2.7,y:5.65,z:3,lumens:1500,watts:15,dim:100,beam:90}],target:{Em:500,U0:.6},floorTarget:100};
const result=LX.calc.compute(project),sources=LX.calc.buildSources(project);
let deskCount=0,floorCount=0;
for(let j=0;j<result.grid.ny;j++)for(let i=0;i<result.grid.nx;i++) {
 const k=j*result.grid.nx+i;if(!result.grid.mask[k])continue;
 const x=result.grid.x0+(i+.5)*result.grid.dx,y=result.grid.y0+(j+.5)*result.grid.dy,s=LX.cad.surfaceAt(project,x,y);
 assert.equal(result.grid.heights[k],s.kind==='desk'?.75:0);
 const expected=LX.calc.directAt(sources,x,y,s.height);
 assert(Math.abs(result.grid.values[k]-expected)<Math.max(1e-4,expected*1e-6));
 if(s.kind==='desk')deskCount++;else floorCount++;
}
assert(deskCount>0&&floorCount>0);assert.equal(result.surfaceStats.desk.n,deskCount);assert.equal(result.deskStats.length,3);
const low=LX.calc.compute({...project,fixtures:project.fixtures.map(f=>({...f,z:2.5}))});
assert(low.grid.values[56*result.grid.nx+26]>result.grid.values[56*result.grid.nx+26]);
const uniform={...project,cad:null,room:{...project.room,wp:.75}};const old=LX.calc.compute(uniform);assert.equal(old.grid.heights[0],.75);
assert.equal(LX.cad.surfaceAt(project,2.5,5.5).height,.75);assert.equal(LX.cad.surfaceAt(project,1,1).height,0);
const floorOnly=LX.calc.compute({...project,cad:{...cad,desks:[]}});assert.equal(floorOnly.primaryTarget,100);
console.log(JSON.stringify({passed:true,width:cad.width,length:cad.length,area:cad.area,desks:cad.desks.length,deskSamples:deskCount,floorSamples:floorCount,rotatedBlock:true,lineLoop:true,heightNumerics:true,legacyUniform:true}));
