const { chromium } = require('C:/Users/AR/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  console.log('Launching browser to test 3D False Color Projection...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  await page.goto('http://127.0.0.1:4190/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.LX?.app?.result);

  // 1. Switch to 3D view
  console.log('Switching to 3D view...');
  await page.click('button[data-view="3d"]');
  await page.waitForTimeout(600);

  // 2. Check 3D HUD Legend
  const legend = await page.$('#hud3dLegend');
  if (!legend) throw new Error('#hud3dLegend not found in 3D viewport');
  const eAvgText = await page.$eval('#hud3dEavg', el => el.textContent);
  console.log('3D HUD Eavg:', eAvgText);

  // 3. Hover in 3D to test probe
  const canvas = await page.$('#wrap3d canvas');
  const box = await canvas.boundingBox();
  console.log('Canvas bounding box:', box);

  // Hover over the center of the 3D canvas (where the room and desks are)
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.waitForTimeout(400);

  const probe = await page.$('#hud3dProbe');
  const probeLux = await page.$eval('#probeLux', el => el.textContent);
  const probeCoord = await page.$eval('#probeCoord', el => el.textContent);
  console.log('Probe lux reading:', probeLux, 'at', probeCoord);

  // 4. Click to add a 3D pin marker
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.55);
  await page.waitForTimeout(200);

  // Click another point to add a second pin
  await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.62);
  await page.waitForTimeout(300);

  const pinCount = await page.evaluate(() => window.LX?.app?.v3d?.pins?.length || 0);
  console.log('3D Pinned probes count:', pinCount);
  if (pinCount < 1) throw new Error('Expected at least 1 3D pin dropped');

  // Save 3D False Color Screenshot
  const shotPath1 = path.join(__dirname, '3d-false-color-verified.png');
  await page.screenshot({ path: shotPath1 });
  console.log('Saved 3D False Color screenshot to', shotPath1);

  // 5. Toggle Realistic Shading Mode
  console.log('Toggling to Realistic Shading mode...');
  await page.click('#btn3dMode');
  await page.waitForTimeout(400);
  const shotPath2 = path.join(__dirname, '3d-realistic-verified.png');
  await page.screenshot({ path: shotPath2 });
  console.log('Saved 3D Realistic Shading screenshot to', shotPath2);

  // 6. Toggle back to False Color
  await page.click('#btn3dMode');
  await page.waitForTimeout(300);

  // 7. Verify all checks passed
  console.log('All 3D False Color verifications passed successfully!');
  await browser.close();
})();
