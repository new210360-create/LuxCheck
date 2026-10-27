const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
 const page=await context.newPage();
 const errors=[]; const requests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>requests.push(r.url()));
 try {
  const response=await page.goto('http://127.0.0.1:4190/',{waitUntil:'networkidle'});
  if(response.status()!==200) throw Error('Homepage failed');
  await page.waitForFunction(()=>document.querySelector('#kpis').textContent.includes('lx'));
  await page.screenshot({path:path.join(__dirname,'verified-2d.png')});
  const kpis=await page.locator('#kpis').innerText();
  await page.locator('[data-view="3d"]').click();
  await page.waitForTimeout(1200);
  if(await page.locator('#wrap3d canvas').count()!==1) throw Error('3D canvas missing');
  const webgl=await page.locator('#wrap3d canvas').evaluate(c=>{const gl=c.getContext('webgl2')||c.getContext('webgl');return {width:c.width,height:c.height,available:!!gl};});
  if(!webgl.available||!webgl.width||!webgl.height)throw Error('WebGL not initialized');
  await page.screenshot({path:path.join(__dirname,'verified-3d.png')});
  await page.locator('[data-view="2d"]').click();
  const exports=[];
  for(const [id,extension] of [['btnSave','.json'],['btnBom','.csv'],['btnPng','.png']]) {
   const pending=page.waitForEvent('download');await page.locator('#'+id).click();const d=await pending;
   const target=path.join(__dirname,'test-export'+extension);await d.saveAs(target);
   const size=fs.statSync(target).size;if(!size)throw Error('Empty '+extension);exports.push({extension,bytes:size});
  }
  const popupEvent=page.waitForEvent('popup');await page.locator('#btnReport').click();const report=await popupEvent;await report.waitForLoadState();
  if(!await report.locator('body').innerText().then(t=>t.includes('計算方法與聲明')))throw Error('Report missing');
  await report.pdf({path:path.join(__dirname,'test-report.pdf'),format:'A4',printBackground:true});
  const remote=requests.filter(u=>!u.startsWith('http://127.0.0.1:4190/')&&!u.startsWith('data:')&&!u.startsWith('blob:'));
  if(errors.length||remote.length)throw Error(JSON.stringify({errors,remote}));
  const result={passed:true,kpis,webgl,exports,report:true,pageErrors:errors,externalRequests:remote};
  fs.writeFileSync(path.join(__dirname,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
