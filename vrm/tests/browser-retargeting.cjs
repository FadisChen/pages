// Open vtuber.html on a local HTTP server, then run with:
// playwright-cli -s=vrm-retarget run-code --filename vrm/tests/browser-retargeting.cjs
async (page) => {
  await page.route('**/vrm/js/vtuber.js', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, body: await response.text() + '\nglobalThis.__vtuber = { viewer, loadModel, initPoseLandmarker, get poseTask() { return poseLandmarker; }, get solver() { return retargeter; } };' });
  });
  await page.reload();
  await page.waitForFunction(() => window.__vtuber?.solver);
  const results = await page.evaluate(async () => {
    const THREE = await import('three');
    const { viewer, loadModel } = window.__vtuber;
    await window.__vtuber.initPoseLandmarker();
    const input = document.createElement('canvas');
    input.width = 640; input.height = 480;
    const empty = window.__vtuber.poseTask.detectForVideo(input, performance.now());
    if (empty.landmarks.length !== 0) throw Error('blank frame should have no poses');
    viewer.idleBreathing = false;
    viewer.autoBlink = false;
    const results = [];
    for (const file of ['su.vrm', 'mia.vrm', 'sha.vrm', 'SpringSnow.vrm', 'Purple.vrm']) {
      await loadModel(file);
      const solver = window.__vtuber.solver;
      if (!solver) throw Error('failed to load ' + file);
      const at = name => solver.rest.get(name).position.clone();
      const mp = v => { const p = v.clone().applyQuaternion(solver.coordinateFrame.clone().invert()); return { x: p.x, y: -p.y, z: -p.z, visibility: 1 }; };
      const p = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
      for (const [i, name] of [[11, 'leftUpperArm'], [12, 'rightUpperArm'], [13, 'leftLowerArm'], [14, 'rightLowerArm'], [15, 'leftHand'], [16, 'rightHand'], [23, 'leftUpperLeg'], [24, 'rightUpperLeg']]) p[i] = mp(at(name));
      const target = solver.front.clone();
      p[15] = mp(at('leftLowerArm').addScaledVector(target, 0.25));
      for (let i = 0; i < 120; i++) solver.update({ worldLandmarks: [p], landmarks: [p] }, null, { mirror: false, now: i * 1000 / 30, dt: 1 / 30 });
      viewer.vrm.update(0);
      const raw = name => viewer.vrm.humanoid.getRawBoneNode(name).getWorldPosition(new THREE.Vector3());
      const direction = raw('leftHand').sub(raw('leftLowerArm')).normalize();
      const degrees = THREE.MathUtils.radToDeg(direction.angleTo(target));
      if (degrees > 1) throw Error(file + ': raw mesh forearm error ' + degrees);
      results.push({ file, rawForearmErrorDegrees: degrees, thumbCMC: !!viewer.getBone('leftThumbMetacarpal') });
    }
    window.__retargetingResults = results;
    return results;
  });
  console.log(JSON.stringify(results));
}
