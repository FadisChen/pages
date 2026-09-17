// Playwright CLI callback. Checks configurator motions against real VRM bones.
async (page) => {
  await page.route('**/vrm/js/configurator.js', async route => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      "const viewer = new VRMViewer(canvas, { transparent: false });",
      "const viewer = globalThis.configuratorViewer = new VRMViewer(canvas, { transparent: false });"
    );
    await route.fulfill({ response, body });
  });
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#loading')?.classList.contains('hidden'));
  const result = await page.evaluate(async () => {
    const viewer = globalThis.configuratorViewer;
    const { Vector3 } = await import('three');
    viewer.idleBreathing = false;
    viewer.autoBlink = false;
    const pos = name => viewer.getBone(name).getWorldPosition(new Vector3());
    const actions = {
      wave: ['rightHand'], nod: ['head'], shake_head: ['head'], present: ['rightHand'],
      tilt_head: ['head'], bow: ['spine', 'chest', 'head'],
      shrug: ['leftHand', 'rightHand', 'leftShoulder', 'rightShoulder'],
      hand_on_chest: ['rightHand'], beckon: ['rightHand', 'rightMiddleProximal'],
      salute: ['rightUpperArm', 'rightHand', 'rightMiddleProximal'],
    };
    const buttonIds = Object.fromEntries(Object.keys(actions).map(name => [name, `#motion-${name.replaceAll('_', '-')}`]));
    const modelFiles = ['shamini.vrm', 'su.vrm', 'mia.vrm', 'sha.vrm', 'SpringSnow.vrm', 'Purple.vrm'];
    const failures = [];
    for (const file of modelFiles) {
      const select = document.querySelector('#model-select');
      select.value = file;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(resolve => {
        const check = () => document.querySelector('#loading')?.classList.contains('hidden') ? resolve() : setTimeout(check, 25);
        check();
      });
      for (const [name, bones] of Object.entries(actions)) {
        viewer.resetPose();
        const base = new Map(bones.map(bone => {
          const node = viewer.getBone(bone);
          return [bone, { position: pos(bone), quaternion: node.quaternion.clone() }];
        }));
        document.querySelector(buttonIds[name]).click();
        await new Promise(resolve => setTimeout(resolve, 700));
        const movement = bones.reduce((total, bone) => {
          const node = viewer.getBone(bone);
          return total + base.get(bone).position.distanceTo(pos(bone)) + base.get(bone).quaternion.angleTo(node.quaternion);
        }, 0);
        if (!(movement > .02)) failures.push(`${file} / ${name}: movement=${movement}`);
      }
    }
    if (failures.length) throw new Error(failures.join('\n'));
    return `PASS: ${modelFiles.length} VRM models × ${Object.keys(actions).length} configurator gestures moved the expected bones.`;
  });
  console.log(result);
}
