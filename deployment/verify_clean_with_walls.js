const { chromium } = require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

(async () => {
  console.log('Launching browser to test 照度系統測試.dwg with partition walls...');
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

  // Wait for computation with walls
  await page.waitForFunction(() => window.LX?.app?.result && window.LX?.app?.project?.walls?.length > 0);
  await page.waitForTimeout(1000);

  const status = await page.evaluate(() => {
    const pr = window.LX.app.project;
    const r = window.LX.app.result;
    return {
      name: pr.name,
      wallsCount: pr.walls?.length,
      fixturesCount: pr.fixtures?.length,
      desksCount: pr.cad?.desks?.length,
      roomDimensions: `${pr.room.L.toFixed(2)} x ${pr.room.W.toFixed(2)} m`,
      Eavg: Math.round(r.Eavg),
      U0: r.U0.toFixed(2),
      deskStatsCount: r.deskStats?.length,
      firstDesk: r.deskStats?.[0]
    };
  });

  console.log('IMPORT SUCCESSFUL WITH WALLS:', JSON.stringify(status, null, 2));

  // Screenshot 2D with walls
  await page.screenshot({ path: 'D:/codex/APP開發/LuxCheck/deployment/walls-2d-verified.png' });
  console.log('2D plan with partition walls saved to deployment/walls-2d-verified.png');

  // Switch to 3D and screenshot
  await page.locator('button[data-view="3d"]').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'D:/codex/APP開發/LuxCheck/deployment/walls-3d-verified.png' });
  console.log('3D view with partition walls saved to deployment/walls-3d-verified.png');

  await browser.close();
  console.log('Verification finished successfully!');
})();
