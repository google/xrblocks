import {test, expect, type Page, type Locator} from '@playwright/test';

test.use({hasTouch: true});

// Use the real approved/encrypted link without starting a renderer. This keeps
// the phone layout matrix fast and isolates it from simulator frame timing.
async function pairingPage(page: Page) {
  await page.goto(
    `${process.env.E2E_BASE_URL}/samples/phone_companion/phone.html?local=1`
  );
  return page.evaluate(async () => {
    const {PhoneLink, createPhonePairing} = await import(
      '/build/addons/phone-companion/PhoneLink.js'
    );
    const {BroadcastChannelTransport} = await import(
      '/build/addons/netblocks/src/core/transport/BroadcastChannelTransport.js'
    );
    const pairing = createPhonePairing();
    (window as any).__uiMessages = [];
    const {PhoneControllerPage} = await import(
      '/build/addons/phone-companion/PhoneControllerPage.js'
    );
    const connect = PhoneControllerPage.prototype.connect;
    PhoneControllerPage.prototype.connect = function () {
      (window as any).__uiPhone = this;
      return connect.call(this);
    };
    const host = new PhoneLink(
      'host',
      pairing,
      {transportFactory: () => new BroadcastChannelTransport()},
      (message: any) => {
        (window as any).__uiMessages.push(message);
        if (message.type === 'open-keyboard')
          host.send({
            type: 'text',
            state: {
              revision: 1,
              value: 'Notes from the headset',
              start: 22,
              end: 22,
              label: 'Notes',
              multiline: true,
              maxLength: 16000,
            },
          });
        if (message.type === 'done') host.send({type: 'field', field: null});
      },
      () => {}
    );
    (window as any).__uiHost = host;
    await host.connect();
    return pairing.code;
  });
}

async function withinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

const screens = [
  {name: 'cover-344', width: 344, height: 882, split: false},
  {name: 'small-360', width: 360, height: 640, split: false},
  {name: 'phone-393', width: 393, height: 852, split: false},
  {name: 'cover-412', width: 412, height: 915, split: false},
  {name: 'landscape-640', width: 640, height: 360, split: false},
  {name: 'landscape-852', width: 852, height: 393, split: false},
  {name: 'inner-673', width: 673, height: 841, split: true},
  {name: 'inner-768', width: 768, height: 900, split: true},
  {name: 'inner-841', width: 841, height: 673, split: true},
  {name: 'inner-900', width: 900, height: 768, split: true},
];

for (const screen of screens) {
  test(`phone UI fits ${screen.name} through pairing, verification, connected and typing`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'sim-webgl', 'DOM-only matrix runs once.');
    await page.setViewportSize({width: screen.width, height: screen.height});
    const code = await pairingPage(page);
    const capture = async (state: string) => {
      const path = info.outputPath(`${screen.name}-${state}.png`);
      await page.screenshot({path});
      await info.attach(`${screen.name}-${state}`, {
        path,
        contentType: 'image/png',
      });
    };
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Connect', exact: true})
    );
    await capture('pair');
    await page.getByLabel('Pairing code', {exact: true}).fill('bad');
    await page.getByRole('button', {name: 'Connect', exact: true}).click();
    await withinViewport(page, page.getByRole('alert'));
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Connect', exact: true})
    );
    expect((await page.getByRole('alert').boundingBox())!.y).toBeGreaterThan(
      (await page.getByLabel('Pairing code', {exact: true}).boundingBox())!.y
    );
    await capture('invalid');
    await page.getByLabel('Pairing code', {exact: true}).fill(code);
    await page.getByRole('button', {name: 'Connect', exact: true}).click();
    await expect(page.getByLabel('Verification number')).toHaveText(
      /^\d{3} \d{3}$/
    );
    await expect(page.getByLabel('Pointer touchpad')).toBeHidden();
    await withinViewport(page, page.getByLabel('Verification number'));
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Disconnect', exact: true})
    );
    await capture('verification');
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Numbers match', exact: true})
    );
    await page.getByRole('button', {name: 'Numbers match', exact: true}).tap();
    await expect(page.getByLabel('Pointer touchpad')).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => !!(window as any).__uiHost.pendingPhone))
      .toBe(true);
    await page.evaluate(() => {
      const host = (window as any).__uiHost;
      return host.accept(host.pendingPhone.id);
    });
    await expect(page.getByRole('status')).toHaveText('Connected to headset');
    const pad = page.getByLabel('Pointer touchpad');
    await withinViewport(page, pad);
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Drag', exact: true})
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1
      )
    ).toBe(true);
    if (screen.split)
      expect(
        (await page.locator('#controller').locator('main').boundingBox())!.width
      ).toBeLessThanOrEqual(620);
    await capture('connected');
    const gestureHint = page.getByText(
      'Hold, then slide to drag · Two fingers to scroll or pinch',
      {exact: true}
    );
    const keyboardHint = page.getByText(
      'Select a text field in the headset to type.',
      {exact: true}
    );
    await expect(gestureHint).toBeVisible();
    await expect(keyboardHint).toBeVisible();
    // Inject presentation states for geometry/screenshots. Protocol-driven
    // loss, timeout and resume are covered by the companion unit regressions.
    for (const state of [
      {type: 'reconnecting'},
      {type: 'failed', reason: 'connection'},
      {type: 'connected'},
    ]) {
      await page.evaluate(
        (value) => (window as any).__uiPhone.showState(value),
        state
      );
      await withinViewport(page, page.getByRole('status'));
      await withinViewport(
        page,
        page.getByRole('button', {name: 'Disconnect', exact: true})
      );
      await withinViewport(page, pad);
      if (state.type === 'connected') {
        await expect(gestureHint).toBeVisible();
        await expect(keyboardHint).toBeVisible();
        await expect(page.locator('#recovery-disconnect')).toBeHidden();
      } else {
        await expect(gestureHint).toBeHidden();
        await expect(keyboardHint).toBeHidden();
        await expect(
          page.getByRole('button', {name: 'Drag', exact: true})
        ).toBeDisabled();
        if (state.type === 'failed') {
          const instructions = page.locator('#recovery-help');
          const disconnect = page.getByRole('button', {
            name: 'Disconnect',
            exact: true,
          });
          await expect(instructions).toContainText('Pair a different phone');
          await withinViewport(page, instructions);
          expect(
            await instructions.evaluate((element) =>
              parseFloat(getComputedStyle(element).fontSize)
            )
          ).toBeGreaterThanOrEqual(16);
          const statusBox = (await page.getByRole('status').boundingBox())!;
          const helpBox = (await instructions.boundingBox())!;
          const actionBox = (await disconnect.boundingBox())!;
          const padBox = (await pad.boundingBox())!;
          expect(helpBox.y).toBeGreaterThanOrEqual(
            statusBox.y + statusBox.height
          );
          expect(actionBox.y).toBeGreaterThanOrEqual(
            helpBox.y + helpBox.height
          );
          expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(padBox.y);
          await expect(disconnect).toHaveCSS(
            'background-color',
            'rgb(167, 199, 255)'
          );
          await expect(page.locator('#change-code')).toBeHidden();
          await disconnect.click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await page.getByRole('button', {name: 'Cancel', exact: true}).click();
          await expect(page.getByRole('status')).toHaveText(
            'Couldn’t reconnect'
          );
        }
      }
      await capture(state.type === 'connected' ? 'reconnected' : state.type);
    }
    await page.getByRole('button', {name: 'Drag', exact: true}).tap();
    await expect(
      page.getByRole('button', {name: 'Drop', exact: true})
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByText('Dragging · Tap Drop to release')
    ).toBeVisible();
    await capture('drag');
    await page.getByRole('button', {name: 'Drop', exact: true}).tap();
    await page.evaluate(() =>
      (window as any).__uiHost.send({
        type: 'field',
        field: {id: 1, revision: 1, label: 'Notes'},
      })
    );
    await page.getByRole('button', {name: 'Open keyboard: Notes'}).tap();
    const editor = page.getByRole('textbox', {name: 'Notes', exact: true});
    await expect(editor).toHaveValue('Notes from the headset');
    await withinViewport(page, editor);
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Submit', exact: true})
    );
    await withinViewport(
      page,
      page.getByRole('button', {name: 'Done', exact: true})
    );
    if (screen.split) {
      await expect(pad).toBeVisible();
      const left = (await pad.boundingBox())!;
      const right = (await editor.boundingBox())!;
      expect(left.x + left.width).toBeLessThan(right.x);
    } else await expect(pad).toBeHidden();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= window.innerHeight + 1
      )
    ).toBe(true);
    await capture('typing');
    await page.getByRole('button', {name: 'Done', exact: true}).tap();
    await expect(pad).toBeVisible();
    await page.getByRole('button', {name: 'Disconnect', exact: true}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await withinViewport(page, page.getByRole('dialog'));
    await capture('disconnect-confirmation');
    await page.getByRole('button', {name: 'Cancel', exact: true}).click();
    expect(await page.evaluate(() => (window as any).__uiHost.connected)).toBe(
      true
    );
    await page.getByRole('button', {name: 'Disconnect', exact: true}).click();
    await page
      .getByRole('dialog')
      .getByRole('button', {name: 'Disconnect', exact: true})
      .click();
    await expect(page.getByLabel('Pairing code', {exact: true})).toHaveValue(
      ''
    );
    await page.evaluate(() => (window as any).__uiHost.close());
  });
}

test('fold and unfold keep the approved session and pointer offset', async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== 'sim-webgl',
    'DOM-only regression runs once.'
  );
  await page.setViewportSize({width: 344, height: 882});
  const code = await pairingPage(page);
  await page.getByLabel('Pairing code', {exact: true}).fill(code);
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await expect(page.getByLabel('Verification number')).toBeVisible();
  await page.getByRole('button', {name: 'Numbers match', exact: true}).tap();
  await expect
    .poll(() => page.evaluate(() => !!(window as any).__uiHost.pendingPhone))
    .toBe(true);
  await page.evaluate(() => {
    const host = (window as any).__uiHost;
    return host.accept(host.pendingPhone.id);
  });
  await expect(page.getByRole('status')).toHaveText('Connected to headset');
  const pad = (await page.getByLabel('Pointer touchpad').boundingBox())!;
  await page.mouse.move(pad.x + 30, pad.y + 30);
  await page.mouse.down();
  await page.mouse.move(pad.x + 60, pad.y + 30);
  await page.mouse.up();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (window as any).__uiMessages.some(
          (message: any) => message.type === 'motion' && message.state.x !== 0
        )
      )
    )
    .toBe(true);
  const motion = await page.evaluate(
    () =>
      (window as any).__uiMessages
        .filter((message: any) => message.type === 'motion')
        .at(-1).state
  );
  const id = await page.evaluate(
    () => (window as any).__uiHost.session.crypto.id
  );
  for (const size of [
    {width: 768, height: 900},
    {width: 344, height: 882},
  ]) {
    await page.setViewportSize(size);
    await expect(page.getByLabel('Pointer touchpad')).toBeVisible();
    expect(
      await page.evaluate(() => (window as any).__uiHost.session.crypto.id)
    ).toBe(id);
    expect(await page.evaluate(() => (window as any).__uiHost.connected)).toBe(
      true
    );
    expect(
      await page.evaluate(
        () =>
          (window as any).__uiMessages
            .filter((message: any) => message.type === 'motion')
            .at(-1).state
      )
    ).toEqual(motion);
  }
  await page.evaluate(() => (window as any).__uiHost.close());
});
