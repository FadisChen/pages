// Playwright CLI callback. Checks the five added gestures on a real YearEndParty page.
async (page) => {
  const instrument = async route => {
    const response = await route.fetch();
    const body = (await response.text()).replaceAll('new App()', '(window.gestureTestApp = new App())');
    await route.fulfill({ response, body });
  };
  await page.route('**/YearEndParty/app.js', instrument);
  await page.route('**/YearEndParty/stage.js', instrument);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.reload();
  await page.waitForFunction(() => window.gestureTestApp?.avatar.loaded);
  return await page.evaluate(async () => {
    const app = window.gestureTestApp;
    app.renderLoop = () => {};
    await new Promise(resolve => requestAnimationFrame(resolve));
    const avatar = app.avatar;
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
    const failures = [];
    const check = (condition, message) => { if (!condition) failures.push(message); };
    for (const model of ['shamini', 'SpringSnow', 'mia', 'sha', 'su', 'Purple']) {
      await avatar.switchModel('../vrm/' + model + '.vrm');
      sample('idle', 0);
      const chest = pos('chest');
      const width = pos('rightUpperArm').distanceTo(pos('leftUpperArm'));
      for (const gesture of ['bow', 'shrug', 'hand_on_chest', 'salute']) {
        sample(gesture, .8);
        const hand = pos('rightHand');
        const normal = palm('right');
        const label = model + ' / ' + gesture;
        if (gesture === 'shrug') {
          const leftHand = pos('leftHand');
          check(normal.y > .7 && palm('left').y > .7, label + ': palms must face up');
          check(Math.abs(hand.y - leftHand.y) < width * .15, label + ': hands must be level');
          check(Math.abs(hand.x + leftHand.x - 2 * chest.x) < width * .2, label + ': arms must be symmetric');
        }
        if (gesture === 'hand_on_chest') {
          check(Math.abs(hand.x - chest.x) < width * .4, label + ': hand must reach torso center');
          check(hand.z > chest.z + width * .45, label + ': hand must remain in front');
          check(normal.z < -.7, label + ': palm must face chest');
        }
        if (gesture === 'salute') {
          const finger = pos('rightMiddleDistal');
          check(finger.x > pos('head').x - width * .5 && finger.x < pos('head').x + width * .1, label + ': fingertips must reach temple');
          check(finger.y > pos('head').y && finger.y < pos('head').y + width, label + ': fingertips must reach forehead');
          check(normal.y < -.6, label + ': palm must face down');
        }
        avatar.elapsed = 0;
        avatar.gestures.reset(true);
        avatar.gestures.queue(gesture, gesture);
        let maxX = 0;
        for (let frame = 0; frame < 100; frame++) {
          avatar.update(1 / 30, true);
          for (const side of gesture === 'shrug' ? ['left', 'right'] : ['right']) {
            for (const segment of ['LowerArm', 'Hand', 'MiddleDistal']) {
              const point = pos(side + segment).project(avatar.camera);
              maxX = Math.max(maxX, Math.abs(point.x));
            }
          }
        }
        check(maxX < 1, label + ': animated arm must stay in frame (' + maxX.toFixed(2) + ')');
      }
    }
    if (failures.length) throw new Error(failures.join('\n'));
    return 'PASS: YearEndParty gesture semantics verified across five VRM models.';
  });
}
