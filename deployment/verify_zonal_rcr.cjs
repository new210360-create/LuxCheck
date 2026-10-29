const { chromium } = require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

(async () => {
  console.log('Testing Multi-Room Zonal RCR Inter-reflection...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1720, height: 1000 } });

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://127.0.0.1:4190/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.LX?.app?.result);

  // Upload test_clean.dxf
  console.log('Uploading test_clean.dxf...');
  await page.locator('#fileCad').setInputFiles('D:/codex/test_clean.dxf');
  await page.locator('#cadDlg').waitFor({ state: 'visible' });

  // Click 一鍵智慧帶入
  console.log('Clicking 一鍵智慧帶入全配...');
  await page.locator('#cadAutoAll').click();

  // Wait for computation with walls and zonal RCR
  await page.waitForFunction(() => window.LX?.app?.result?.zones?.length > 0);
  await page.waitForTimeout(1000);

  const res = await page.evaluate(() => {
    const r = window.LX.app.result;
    return {
      zonesCount: r.zones?.length || 0,
      zones: r.zones,
      zonalRcr: r.zonalRcr,
      Eavg: r.Eavg,
      Eind: r.Eind
    };
  });

  console.log('Multi-Room Zonal RCR Result:');
  console.log('Detected Zones Count:', res.zonesCount);
  console.log('Zonal RCR Active:', res.zonalRcr);
  console.log('Global Eind:', res.Eind);
  console.log('Top Zones:', res.zones.slice(0, 5));

  if (res.zonesCount < 1) {
    throw new Error('Expected at least 1 zonal room detected');
  }

  // Check if UI table rendered
  const surfaceContent = await page.$eval('#surfaceResults', el => el.innerHTML);
  if (!surfaceContent.includes('多房間隔間獨立漫射（分區 RCR 反射）')) {
    throw new Error('Expected Multi-Room Zonal RCR table in #surfaceResults');
  }
  console.log('UI Zonal RCR Table verified in #surfaceResults!');

  // Test toggling vRcr checkbox
  console.log('Toggling vRcr off...');
  await page.click('#vRcr');
  await page.waitForTimeout(500);

  const resLegacy = await page.evaluate(() => window.LX.app.result.zonalRcr);
  console.log('Zonal RCR after toggle off:', resLegacy);
  if (resLegacy !== false) throw new Error('Expected zonalRcr to be false after toggle');

  console.log('Toggling vRcr back on...');
  await page.click('#vRcr');
  await page.waitForTimeout(500);

  const resBackOn = await page.evaluate(() => window.LX.app.result.zonalRcr);
  console.log('Zonal RCR after toggle on:', resBackOn);
  if (resBackOn !== true) throw new Error('Expected zonalRcr to be true after toggle');

  // Save screenshot
  const shotPath = path.join(__dirname, 'zonal-rcr-verified.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved screenshot to', shotPath);

  console.log('All Multi-Room Zonal RCR tests passed successfully!');
  await browser.close();
})();
