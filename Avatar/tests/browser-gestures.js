// Playwright CLI callback. Run against the local Avatar page; no Gemini connection.
async (page) => {
  await page.route('**/Avatar/app.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('new App()', '(window.gestureTestApp = new App())');
    await route.fulfill({ response, body });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.waitForFunction(() => window.gestureTestApp?.avatar.loaded);
  await page.evaluate(async () => {
    const app = window.gestureTestApp;
    app.renderLoop = () => {};
    await new Promise(resolve => requestAnimationFrame(resolve));
    window.gestureShots = [];
    window.gestureBounds = [];
    window.gesturePalms = [];
    for (const model of ['SpringSnow', 'mia', 'sha', 'su', 'Purple']) {
      await app.avatar.switchModel('../vrm/' + model + '.vrm');
      if (!app.avatar.loaded) throw new Error('Model failed: ' + model);
      for (const gesture of ['idle', 'nod', 'shake_head', 'wave', 'present', 'tilt_head']) {
        app.avatar.gestures.reset(true);
        if (gesture !== 'idle') app.avatar.gestures.queue(gesture, gesture);
        app.avatar.update(gesture === 'present' ? 1.1 : .6, true);
        if (['wave', 'present'].includes(gesture)) {
          const pos = name => app.avatar.vrm.humanoid.getRawBoneNode(name).getWorldPosition(app.avatar.basePosition.clone());
          const wrist = pos('rightHand');
          const normal = pos('rightIndexProximal').sub(wrist).cross(pos('rightLittleProximal').sub(wrist)).normalize();
          gesturePalms.push({ model, gesture, alignment: gesture === 'wave' ? normal.z : normal.y });
        }
        window.gestureShots.push({ model, gesture, image: app.avatar.canvas.toDataURL() });
        if (['wave', 'present'].includes(gesture)) {
          app.avatar.gestures.reset(true);
          app.avatar.gestures.queue(gesture, gesture);
          let maxX = 0, maxY = -Infinity;
          for (let frame = 0; frame < 200; frame++) {
            app.avatar.update(1 / 60, true);
            for (const side of ['right']) {
              const node = app.avatar.vrm.humanoid.getRawBoneNode(side + 'MiddleDistal');
              if (!node) continue;
              const point = node.getWorldPosition(app.avatar.basePosition.clone()).project(app.avatar.camera);
              if (point.y >= -1) maxX = Math.max(maxX, Math.abs(point.x));
              maxY = Math.max(maxY, point.y);
            }
          }
          gestureBounds.push({ model, gesture, maxX, maxY });
        }
      }
    }
    const grid = document.createElement('div');
    grid.style = 'position:absolute;inset:0;z-index:9999;background:#eee;display:grid;grid-template-columns:repeat(6, 220px);gap:8px;padding:12px;width:1380px;color:#222';
    for (const shot of window.gestureShots) {
      const cell = document.createElement('div');
      cell.innerHTML = '<div>' + shot.model + ' / ' + shot.gesture + '</div><img style="width:220px;height:260px;object-fit:contain;background:#ddd" src="' + shot.image + '">';
      grid.append(cell);
    }
    document.body.replaceChildren(grid);
  });
  await page.setViewportSize({ width: 1400, height: 1500 });
  await page.screenshot({ path: 'output/playwright/avatar-gestures.png', fullPage: true });
  const bounds = await page.evaluate(() => gestureBounds);
  for (const result of bounds) {
    if (result.maxX > 1 || result.maxY > 1) throw new Error('Hand outside frame: ' + JSON.stringify(result));
  }
  for (const result of await page.evaluate(() => gesturePalms)) {
    if (result.alignment < .7) throw new Error('Palm facing wrong direction: ' + JSON.stringify(result));
  }
  console.log('PASS: 5 VRM models, 5 gestures, palm directions, animated hand bounds and pose contact sheet.');
}
