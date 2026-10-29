const { chromium } = require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

(async () => {
  console.log('Testing 3D False Color Projection on 照度系統測試.dwg (217 walls, 30 desks)...');
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
  await page.waitForTimeout(800);

  // Switch to 3D view
  console.log('Switching to 3D view with 217 walls...');
  await page.click('button[data-view="3d"]');
  await page.waitForTimeout(800);

  // Probe in 3D
  const canvas = await page.$('#wrap3d canvas');
  const box = await canvas.boundingBox();

  // Move to office desk area
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.52);
  await page.waitForTimeout(400);

  const probeCoord = await page.$eval('#probeCoord', el => el.textContent);
  const probeLux = await page.$eval('#probeLux', el => el.textContent);
  const probeStatus = await page.$eval('#probeStatus', el => el.textContent);
  console.log('3D Desk Probe:', probeLux, 'lx |', probeCoord, '|', probeStatus);

  // Click to drop 3D pin on desk
  await page.mouse.click(box.x + box.width * 0.52, box.y + box.height * 0.52);
  await page.waitForTimeout(300);

  // Click second pin on another area
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.60);
  await page.waitForTimeout(300);

  const shotPath = path.join(__dirname, 'cad-walls-3d-false-color-verified.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved 3D CAD Walls False Color screenshot to', shotPath);

  console.log('CAD 3D False Color test completed successfully!');
  await browser.close();
})();
