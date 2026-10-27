const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),context=await browser.newContext({viewport:{width:1720,height:1080},acceptDownloads:true}),page=await context.newPage();
 const errors=[],dialogs=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
 try{
  await page.goto('http://127.0.0.1:4190/');await page.waitForFunction(()=>LX.app.result);
  const unknown=fs.readFileSync(path.join(__dirname,'cad-test-mm.dxf'),'utf8').replace('$INSUNITS\n70\n4','$INSUNITS\n70\n0');
  await page.locator('#fileCad').setInputFiles({name:'no-units.dxf',mimeType:'application/dxf',buffer:Buffer.from(unknown)});
  await page.locator('#cadDlg').waitFor({state:'visible'});assert(await page.locator('#cadApply').isDisabled());
  await page.locator('#cadUnit').selectOption('0.001');
  assert(!(await page.locator('#cadApply').isDisabled()));
  await page.locator('#cadDrawBoundary').click();assert(await page.locator('#cadApply').isDisabled());
  const box=await page.locator('#cadPreview').boundingBox(),k=590/40000,ox=(1000-40000*k)/2,oy=(680-40000*k)/2;
  for(const [x,y]of [[10000,20000],[22000,20000],[22000,28000],[10000,28000]])await page.mouse.click(box.x+(ox+x*k)*box.width/1000,box.y+(oy+(40000-y)*k)*box.height/680);
  await page.locator('#cadFinishBoundary').click();assert.match(await page.locator('#cadPreviewInfo').innerText(),/12.00 × 8.00 m.*3 個桌面/);
  await page.locator('#cadApply').click();await page.waitForFunction(()=>LX.app.project.cad?.desks.length===3);
  assert(await page.locator('#polyFields').isHidden());
  // Manual placement honours the common mounting-height entry as well as automatic placement.
  await page.locator('#autoZ').fill('2.7');await page.locator('[data-tool="add"]').click();
  const [x,y]=await page.evaluate(()=>LX.app.plan.toScreen(5,5)),plan=await page.locator('#plan').boundingBox();await page.mouse.click(plan.x+x,plan.y+y);
  await page.waitForFunction(()=>LX.app.project.fixtures.length===1);assert.equal(await page.evaluate(()=>LX.app.project.fixtures[0].z),2.7);
  const pngEvent=page.waitForEvent('download');await page.locator('#btnPng').click();const png=await pngEvent;const file=path.join(__dirname,'cad-export-verified.png');await png.saveAs(file);assert(fs.statSync(file).size>10000);
  await page.locator('#btnCadEdit').click();await page.locator('#cadDlg').waitFor({state:'visible'});
  await page.locator('#cadScale').fill('0.002');await page.locator('#cadScale').dispatchEvent('input');
  await page.locator('#cadApply').click();await page.waitForFunction(()=>LX.app.project.room.L===24&&LX.app.project.fixtures[0].x===10);
  assert.equal(await page.evaluate(()=>LX.app.project.fixtures[0].y),10);
  await page.locator('#btnCadEdit').click();await page.locator('#cadDlg').waitFor({state:'visible'});
  const checked=page.locator('#cadDeskLayers input:checked, #cadDeskBlocks input:checked');
  while(await checked.count())await checked.first().uncheck();
  assert.match(await page.locator('#cadPreviewInfo').innerText(),/0 個桌面/);await page.locator('#cadApply').click();
  await page.waitForFunction(()=>LX.app.project.cad?.desks.length===0&&LX.app.result.primaryTarget===100);
  assert.match(await page.locator('#kpis').innerText(),/地面平均照度 Em/);
  await page.locator('#fileCad').setInputFiles({name:'bad.dwg',mimeType:'application/octet-stream',buffer:Buffer.from('this is not a dwg')});
  await page.waitForFunction(()=>document.querySelector('#busy').classList.contains('hidden'));await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>LX.app.project.cad.desks.length),0);assert(dialogs.some(d=>d.includes('不是可辨識')));assert.deepEqual(errors,[]);
  const result={passed:true,undefinedUnitsRequireChoice:true,manualRoomBoundary:true,manualMountHeight:true,rescalePreservesCadLampLocations:true,floorOnlyTarget:100,cadPngExport:true,invalidDwgPreservesProject:true,pageErrors:errors};
  fs.writeFileSync(path.join(__dirname,'cad-boundary-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
