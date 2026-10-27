const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1720,height:1080},acceptDownloads:true});
 const page=await context.newPage(),errors=[],dialogs=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
 try{
  await page.goto('http://127.0.0.1:4190/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.LX?.app?.result);
  await page.locator('#fileCad').setInputFiles(path.join(__dirname,'cad-test-mm.dxf'));
  await page.locator('#cadDlg').waitFor({state:'visible'});
  assert.match(await page.locator('#cadPreviewInfo').innerText(),/12.00 × 8.00 m.*3 個桌面/);
  assert.equal(await page.locator('#cadUnit').inputValue(),'0.001');
  // Calibrate using the two native room corner vertices, 12 metres apart.
  const preview=page.locator('#cadPreview'),box=await preview.boundingBox();
  // Derive fit directly from the known 12,000 x 8,000 CAD unit boundary.
  const k=Math.min(910/12000,590/8000),ox=(1000-12000*k)/2,oy=(680-8000*k)/2;
  await page.locator('#cadMeasure').click();
  for(const [x,y] of [[ox,oy],[ox+12000*k,oy]])await page.mouse.click(box.x+x*box.width/1000,box.y+y*box.height/680);
  await page.locator('#cadKnown').fill('12');assert(Math.abs(+(await page.locator('#cadScale').inputValue())-.001)<1e-9);
  await page.screenshot({path:path.join(__dirname,'cad-import-preview.png')});
  await page.locator('#cadApply').click();
  await page.waitForFunction(()=>LX.app.project.cad?.desks.length===3&&LX.app.result.deskStats.length===3);
  assert.equal(await page.locator('#roomWp').isDisabled(),true);
  await page.locator('#autoType').selectOption('track-20-24');
  await page.locator('#autoMode').selectOption('grid');
  await page.locator('#autoNx').fill('4');await page.locator('#autoNy').fill('3');await page.locator('#autoZ').fill('2.6');
  await page.locator('#btnAuto').click();
  await page.waitForFunction(()=>LX.app.project.fixtures.length===12&&LX.app.project.fixtures.every(f=>f.z===2.6));
  const before=await page.evaluate(()=>LX.app.result.Eavg);
  async function clickFixture(index){const coords=await page.evaluate(i=>{const f=LX.app.project.fixtures[i];return LX.app.plan.toScreen(f.x,f.y);},index);const rect=await page.locator('#plan').boundingBox();await page.mouse.click(rect.x+coords[0],rect.y+coords[1]);await page.locator('#selSection').waitFor({state:'visible'});}
  await clickFixture(0);await page.locator('#sType').selectOption('downlight-15-60');
  await page.locator('#sZ').fill('2.9');await page.locator('#sZ').dispatchEvent('change');
  await clickFixture(1);await page.locator('#sT').fill('35');await page.locator('#sT').dispatchEvent('change');
  await page.locator('#sR').fill('90');await page.locator('#sR').dispatchEvent('change');
  await page.waitForTimeout(700);
  await page.evaluate(()=>{document.querySelector('.panel.left').scrollTop=0;document.querySelector('.panel.right').scrollTop=0;});
  const mixed=await page.evaluate(()=>({fixtures:LX.app.project.fixtures.map(f=>({type:f.typeId,z:f.z,tilt:f.tilt,rot:f.rot})),desks:LX.app.result.deskStats,stats:LX.app.result.surfaceStats,average:LX.app.result.Eavg}));
  assert(mixed.fixtures.some(f=>f.type==='downlight-15-60'&&f.z===2.9));
  assert(mixed.fixtures.some(f=>f.type==='track-20-24'&&f.tilt===35&&f.rot===90));assert.notEqual(mixed.average,before);
  const heights=await page.evaluate(()=>[...new Set(LX.app.result.grid.heights)].sort());assert.deepEqual(heights,[0,.75]);
  await page.screenshot({path:path.join(__dirname,'cad-verified-2d.png')});
  await page.locator('[data-view="3d"]').click();await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>LX.app.v3d.group.children.filter(c=>c.userData.kind==='desk').length),3);
  await page.screenshot({path:path.join(__dirname,'cad-verified-3d.png')});
  await page.locator('[data-view="2d"]').click();
  const downloadEvent=page.waitForEvent('download');await page.locator('#btnSave').click();const download=await downloadEvent;
  const saved=path.join(__dirname,'cad-test-project.json');await download.saveAs(saved);assert.equal(JSON.parse(fs.readFileSync(saved)).cad.desks.length,3);
  const reportEvent=page.waitForEvent('popup');await page.locator('#btnReport').click();const report=await reportEvent;await report.waitForLoadState();
  assert.match(await report.locator('body').innerText(),/桌面高度固定 0.75 m/);await report.pdf({path:path.join(__dirname,'cad-test-report.pdf'),format:'A4',printBackground:true});await report.close();
  await page.locator('#btnCadRemove').click();await page.waitForFunction(()=>!LX.app.project.cad);
  await page.locator('#btnUndo').click();await page.waitForFunction(()=>LX.app.project.cad?.desks.length===3);
  await page.waitForTimeout(800);await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>LX.app.project.cad?.desks.length===3&&LX.app.result.deskStats.length===3);
  await page.locator('#fileProject').setInputFiles(saved);await page.waitForFunction(()=>LX.app.project.cad?.desks.length===3);
  // Exercise the actual native AutoCAD DWG converter through the UI.
  await page.locator('#fileCad').setInputFiles(path.join(__dirname,'cad-test-native.dwg'));
  await page.locator('#cadDlg').waitFor({state:'visible',timeout:130000});
  assert.match(await page.locator('#cadPreviewInfo').innerText(),/12.00 × 8.00 m.*3 個桌面/);
  await page.screenshot({path:path.join(__dirname,'dwg-import-preview.png')});await page.locator('#cadCancel').click();
  assert.deepEqual(errors,[]);assert.deepEqual(dialogs,[]);
  const result={passed:true,dimensions:'12 x 8 m',desks:3,heights,mixedFixtures:mixed.fixtures.length,trackTilt:true,recessedHeight:true,calibration:true,saveReload:true,jsonRoundTrip:true,undoCad:true,dwgNative:true,report:true,pageErrors:errors};
  fs.writeFileSync(path.join(__dirname,'cad-ui-verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
