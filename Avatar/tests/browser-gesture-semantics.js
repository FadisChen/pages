// Playwright CLI callback. Checks rendered bones, palm directions and finger motion.
async (page) => {
  await page.route('**/Avatar/app.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('new App()', '(window.gestureTestApp = new App())');
    await route.fulfill({ response, body });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.waitForFunction(() => window.gestureTestApp?.avatar.loaded);
  const result = await page.evaluate(async () => {
    const app = window.gestureTestApp;
    app.renderLoop = () => {};
    await new Promise(resolve => requestAnimationFrame(resolve));
    const avatar = app.avatar, failures = [], shots = [];
    const check = (condition, label) => { if (!condition) failures.push(label); };
    const pos = name => avatar.vrm.humanoid.getRawBoneNode(name).getWorldPosition(avatar.basePosition.clone());
    const palm = side => {
      const wrist = pos(side + 'Hand');
      return pos(side + 'IndexProximal').sub(wrist).cross(pos(side + 'LittleProximal').sub(wrist)).normalize().multiplyScalar(side === 'right' ? 1 : -1);
    };
    const sample = (gesture, time) => {
      avatar.elapsed = 0;
      avatar.blinkTimer = 10;
      avatar.blinkProgress = avatar.blinkDirection = 0;
      avatar.gestures.reset(true);
      avatar.gestures.queue(gesture, gesture);
      avatar.update(time, true);
    };
    for (const model of ['shamini', 'SpringSnow', 'mia', 'sha', 'su', 'Purple']) {
      await avatar.switchModel('../vrm/' + model + '.vrm');
      if (!avatar.loaded) throw new Error('Model failed: ' + model);
      sample('idle', 0);
      const baseShoulder = pos('rightUpperArm');
      const width = baseShoulder.distanceTo(pos('leftUpperArm'));
      for (const gesture of ['bow', 'shrug', 'hand_on_chest', 'beckon', 'salute']) {
        sample(gesture, gesture === 'beckon' ? .4 : .8);
        const hand = pos('rightHand'), chest = pos('chest'), head = pos('head');
        const normal = palm('right');
        const label = model + ' / ' + gesture;
        if (gesture === 'shrug') {
          const leftHand = pos('leftHand');
          check(normal.y > .7 && palm('left').y > .7, label + ': both palms must face up');
          check(Math.abs(hand.y - leftHand.y) < width * .15, label + ': hands must be level');
          check(Math.abs(hand.x + leftHand.x - 2 * chest.x) < width * .2, label + ': arms must be symmetric');
          check(pos('rightUpperArm').y > baseShoulder.y + width * .04, label + ': shoulder must rise');
        }
        if (gesture === 'hand_on_chest') {
          check(Math.abs(hand.x - chest.x) < width * .4, label + ': hand must reach torso center');
          check(hand.y > chest.y && hand.y < baseShoulder.y + width * .1, label + ': hand must sit at chest height');
          check(hand.z > chest.z + width * .45, label + ': hand must remain in front of torso');
          check(normal.z < -.7, label + ': palm must face chest');
        }
        if (gesture === 'beckon') {
          check(hand.x < chest.x - width * .4 && hand.y < head.y - width * .4, label + ': hand must stay beside chest, away from face');
          check(normal.y > .7, label + ': palm must face up');
          const openReach = pos('rightMiddleDistal').distanceTo(hand);
          sample(gesture, .4 + 1 / 3);
          const curledReach = pos('rightMiddleDistal').distanceTo(pos('rightHand'));
          check(curledReach < openReach * .8, label + ': fingers must curl inward');
        }
        if (gesture === 'salute') {
          const finger = pos('rightMiddleDistal'), direction = finger.clone().sub(hand).normalize();
          check(finger.x > head.x - width * .5 && finger.x < head.x + width * .1, label + ': fingertips must reach temple');
          check(finger.y > head.y && finger.y < head.y + width, label + ': fingertips must reach forehead height');
          check(direction.x > .7 && normal.y < -.6, label + ': fingers inward and palm down');
        }
        for (const yaw of [0, .75]) {
          avatar.vrm.scene.rotation.y = Math.PI + yaw;
          avatar.renderer.render(avatar.scene, avatar.camera);
          shots.push({ label: label + (yaw ? ' / side' : ''), image: avatar.canvas.toDataURL() });
        }
        avatar.vrm.scene.rotation.y = Math.PI;
        avatar.elapsed = 0;
        avatar.gestures.reset(true);
        avatar.gestures.queue(gesture, gesture);
        let maxX = 0, maxY = -Infinity;
        for (let frame = 0; frame < 100; frame++) {
          avatar.update(1 / 30, true);
          for (const side of gesture === 'shrug' ? ['left', 'right'] : ['right']) {
            for (const segment of ['LowerArm', 'Hand', 'MiddleDistal']) {
              const point = pos(side + segment).project(avatar.camera);
              if (point.y >= -1) maxX = Math.max(maxX, Math.abs(point.x));
              maxY = Math.max(maxY, point.y);
            }
          }
        }
        check(maxX < 1 && maxY < 1, label + ': animated arm must stay in frame (' + maxX.toFixed(2) + ', ' + maxY.toFixed(2) + ')');
        for (const [bone, rest] of avatar.restPose) {
          if (bone === avatar.bones.rightMiddleProximal) check(bone.quaternion.angleTo(rest) < 1e-6, label + ': fingers must return to rest');
        }
      }
    }
    window.refinedGestureShots = shots;
    if (failures.length) throw new Error(failures.join('\n'));
    return 'PASS: chest contact, shrug symmetry, beckon finger curl and salute direction across five VRM models.';
  });
  for (const side of [false, true]) {
    await page.evaluate(side => {
      document.getElementById('gesture-contact-sheet')?.remove();
      const grid = document.createElement('div');
      grid.id = 'gesture-contact-sheet';
      grid.style = 'position:absolute;top:0;left:0;z-index:9999;background:#ddd;display:grid;grid-template-columns:repeat(5,220px);gap:8px;padding:12px;width:1156px;color:#222';
      for (const shot of window.refinedGestureShots.filter(shot => shot.label.endsWith(' / side') === side)) {
        const cell = document.createElement('div');
        cell.innerHTML = '<div>' + shot.label + '</div><img style="width:220px;height:280px;object-fit:contain" src="' + shot.image + '">';
        grid.append(cell);
      }
      document.body.append(grid);
    }, side);
    await page.locator('#gesture-contact-sheet').screenshot({ path: 'output/playwright/avatar-refined-' + (side ? 'side' : 'front') + '.png' });
  }
  return result;
}
