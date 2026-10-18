import {test, expect, type Page, type CDPSession} from '@playwright/test';

// Both pages must share a BrowserContext: BroadcastChannel is partitioned by it.
test('phone pairs by headset code, points, selects, drags a slider and resumes pointing after native typing', async ({
  page: host,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    testInfo.project.name !== 'sim-webgl',
    'The sample uses the WebGL renderer.'
  );
  const errors: string[] = [];
  host.on('pageerror', (error) => errors.push(error.message));
  host.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('An error occurred in script')
    )
      errors.push(message.text());
  });
  await host.goto(
    `${process.env.E2E_BASE_URL}/samples/phone_companion/index.html?local=1&debug=1`
  );
  await host.waitForFunction(() => {
    const xb = (window as any).xb;
    return (
      xb?.ui.validate().ready &&
      xb.core.input.controllers.some(
        (source: any) => source.name === 'Phone pointer'
      ) &&
      !xb.ui
        .validate()
        .issues.some((issue: any) => issue.code === 'invalid-layout')
    );
  });
  // Like the simulator driver, step the real engine deterministically. Leaving
  // a second software-rendered window spinning can starve phone input in CI.
  await host.evaluate(() => {
    const core = (window as any).xb.core;
    core.pause();
    (window as any).__phoneTestStep = () => {
      core.stepFrame();
      core.stepFrame();
    };
  });
  const popup = context.waitForEvent('page');
  await expect(host.locator('#link')).toHaveText(
    'Open the phone controller in a new tab for testing on this computer'
  );
  await expect(host.locator('#local-test')).toBeVisible();
  await host.evaluate(
    (url) => window.open(url, 'phone-controller', 'popup,width=390,height=844'),
    (await host.locator('#phone-page').getAttribute('href'))!
  );
  const phone = await popup;
  phone.on('pageerror', (error) => errors.push(error.message));
  await phone.setViewportSize({width: 390, height: 844});
  await phone
    .getByRole('textbox', {name: 'Pairing code', exact: true})
    .fill('bad');
  await phone.getByRole('button', {name: 'Connect', exact: true}).click();
  await expect(phone.getByRole('alert')).toContainText(
    '4-character pairing code'
  );
  await phone
    .getByRole('textbox', {name: 'Pairing code', exact: true})
    .fill((await host.locator('#pairing-code').textContent())!);
  await phone.getByRole('button', {name: 'Connect', exact: true}).click();
  await expect(host.locator('#accept-phone')).toBeEnabled();
  const comparison = (await host.locator('#pair-request').textContent())!.match(
    /\d{6}/
  )![0];
  await expect(phone.getByRole('status')).toContainText(comparison);
  // A stale press must stay bound to its original request, not whichever phone
  // arrives next. Reload before approval so this invitation remains unused.
  const oldRequest = await host.evaluate(() => {
    (window as any).__oldAccept = document.querySelector('#accept-phone');
    return (window as any).xb.core.scene.getObjectByName('Phone Companion')
      .pendingPhone.id;
  });
  await phone.reload();
  expect(new URL(phone.url()).hash).toBe('');
  await phone
    .getByRole('textbox', {name: 'Pairing code', exact: true})
    .fill((await host.locator('#pairing-code').textContent())!);
  await phone.getByRole('button', {name: 'Connect', exact: true}).click();
  await expect
    .poll(() =>
      host.evaluate((oldId) => {
        const id = (window as any).xb.core.scene.getObjectByName(
          'Phone Companion'
        ).pendingPhone?.id;
        return id !== undefined && id !== oldId;
      }, oldRequest)
    )
    .toBe(true);
  await expect(host.locator('#accept-phone')).toBeEnabled();
  const currentRequest = await host.evaluate(
    () =>
      (window as any).xb.core.scene.getObjectByName('Phone Companion')
        .pendingPhone.id
  );
  await host.evaluate(() => (window as any).__oldAccept.click());
  expect(
    await host.evaluate(
      () =>
        (window as any).xb.core.scene.getObjectByName('Phone Companion')
          .pendingPhone?.id
    )
  ).toBe(currentRequest);
  await expect(phone.getByRole('status')).toContainText(
    (await host.locator('#pair-request').textContent())!.match(/\d{6}/)![0]
  );
  await host.locator('#accept-phone').click();
  await expect(
    phone.getByText('Connected to headset', {exact: true})
  ).toBeVisible();
  const touch = await context.newCDPSession(phone);

  await pointAt(host, phone, touch, 'button');
  await tapPad(phone, touch);
  await expect
    .poll(() =>
      host.evaluate(() => {
        (window as any).__phoneTestStep();
        let label = '';
        (window as any).xb.core.scene.traverse((o: any) => {
          if (o.label?.startsWith('Tap me:')) label = o.label;
        });
        return label;
      })
    )
    .toBe('Tap me: 1');

  await pointAt(host, phone, touch, 'slider', 0.25);
  const before = await cardPose(host);
  const hold = await phone
    .getByRole('button', {name: 'Hold to move'})
    .boundingBox();
  const held = {
    id: 2,
    x: hold!.x + hold!.width / 2,
    y: hold!.y + hold!.height / 2,
  };
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [held],
  });
  await expect.poll(() => sliderValue(host)).toBeLessThan(40);
  await pointAt(host, phone, touch, 'slider', 0.75, held);
  await expect.poll(() => sliderValue(host)).toBeGreaterThan(60);
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  (await cardPose(host)).forEach((value, index) =>
    expect(value).toBeCloseTo(before[index], 6)
  );

  await host.evaluate(() => {
    (window as any).__phoneInputEvents = 0;
    (window as any).xb.core.scene.traverse((object: any) => {
      if (object.ariaLabel !== 'Message') return;
      object.value = 'Existing value above the limit';
      object.maxLength = 4;
      object.onInput = () => {
        (window as any).__phoneInputEvents++;
      };
    });
  });
  await pointAt(host, phone, touch, 'input');
  await tapPad(phone, touch);
  await expect
    .poll(() =>
      host.evaluate(() => {
        (window as any).__phoneTestStep();
        const companion = (window as any).xb.core.scene.getObjectByName(
          'Phone Companion'
        );
        return (
          !!companion.input?.focused && !companion.controller.userData.selected
        );
      })
    )
    .toBe(true);
  await expect(
    phone.getByRole('button', {name: 'Type: Message'})
  ).toBeVisible();
  await expect(phone.locator('textarea')).toHaveValue('');
  await tapButton(phone, touch, 'Type: Message');
  await expect(phone.getByRole('textbox', {name: 'Message'})).toHaveValue(
    'Existing value above the limit'
  );
  expect(await host.evaluate(() => (window as any).__phoneInputEvents)).toBe(0);
  await host.evaluate(() => {
    (window as any).xb.core.scene.traverse((object: any) => {
      if (object.ariaLabel === 'Message') object.maxLength = undefined;
    });
    (window as any).__phoneTestStep();
  });
  await expect(phone.getByRole('textbox', {name: 'Message'})).toHaveAttribute(
    'maxlength',
    '16000'
  );
  await phone.getByRole('textbox', {name: 'Message'}).fill('Phone says 你好🙂');
  await expect
    .poll(() =>
      host.evaluate(() => {
        (window as any).__phoneTestStep();
        let value = '';
        (window as any).xb.core.scene.traverse((o: any) => {
          if (o.ariaLabel === 'Message') value = o.value;
        });
        return value;
      })
    )
    .toBe('Phone says 你好🙂');
  await tapButton(phone, touch, 'Done');
  await expect(
    phone.getByText('Select a text field in the headset to type.', {
      exact: true,
    })
  ).toBeVisible();
  await expect(phone.getByRole('textbox', {name: 'Message'})).toBeHidden();

  // Regression: pointer input must resume after finishing native text editing.
  await pointAt(host, phone, touch, 'button');
  await tapPad(phone, touch);
  await expect
    .poll(() =>
      host.evaluate(() => {
        (window as any).__phoneTestStep();
        let label = '';
        (window as any).xb.core.scene.traverse((o: any) => {
          if (o.label?.startsWith('Tap me:')) label = o.label;
        });
        return label;
      })
    )
    .toBe('Tap me: 2');
  for (let cycle = 0; cycle < 2; cycle++) {
    const previousPeer = await host.evaluate(
      () =>
        (window as any).xb.core.scene.getObjectByName('Phone Companion').link
          .peer
    );
    await phone.evaluate(() => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect
      .poll(() =>
        host.evaluate((oldPeer) => {
          const link = (window as any).xb.core.scene.getObjectByName(
            'Phone Companion'
          ).link;
          return link.connected && link.peer !== oldPeer;
        }, previousPeer)
      )
      .toBe(true);
    await expect(phone.getByRole('status')).toHaveText('Connected to headset');
    await expect(host.locator('#accept-phone')).toBeDisabled();
  }
  expect(errors).toEqual([]);
  await host.evaluate(() => {
    (window as any).xb.core.scene
      .getObjectByName('Phone Companion')
      .parent.onXRSessionStarted();
  });
  await expect(host.locator('#local-test')).toBeHidden();
  await phone.close();
  await expect(host.locator('#status')).toHaveText('Waiting for phone…');
});

type TouchPoint = {id: number; x: number; y: number};

async function pointAt(
  host: Page,
  phone: Page,
  touch: CDPSession,
  kind: 'button' | 'slider' | 'input',
  ratio = 0.5,
  held?: TouchPoint
) {
  // Read rendered geometry to calculate a touchpad stroke; all input itself goes
  // through real browser touch events, the phone page and BroadcastChannel.
  const offset = await host.evaluate(
    async ({kind, ratio}) => {
      const THREE = await import('three');
      const xb = (window as any).xb;
      const core = xb.core;
      (window as any).__phoneTestStep();
      let target: any;
      core.scene.traverse((o: any) => {
        if (
          (kind === 'button' && o.label?.startsWith('Tap me:')) ||
          (kind === 'slider' && o.ariaLabel === 'Phone slider') ||
          (kind === 'input' && o.ariaLabel === 'Message')
        )
          target = o;
      });
      const physical = core.interaction.registry.find(target).physical;
      const point = physical.localToWorld(new THREE.Vector3(ratio - 0.5, 0, 0));
      const cameraRotation = core.camera.getWorldQuaternion(
        new THREE.Quaternion()
      );
      const direction = point
        .sub(core.camera.getWorldPosition(new THREE.Vector3()))
        .normalize()
        .applyQuaternion(cameraRotation.clone().invert());
      const controller =
        core.scene.getObjectByName('Phone Companion').controller;
      const current = new THREE.Euler().setFromQuaternion(
        cameraRotation
          .invert()
          .multiply(controller.getWorldQuaternion(new THREE.Quaternion())),
        'YXZ'
      );
      return {
        x: (current.y - Math.atan2(-direction.x, -direction.z)) / 1.5,
        y: (current.x - Math.asin(direction.y)) / 1.5,
      };
    },
    {kind, ratio}
  );
  const pad = await phone.getByLabel('Pointer touchpad').boundingBox();
  const start = {
    id: 1,
    x: pad!.x + pad!.width / 2,
    y: pad!.y + pad!.height / 2,
  };
  const others = held ? [held] : [];
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [...others, start],
  });
  // A tiny aiming correction must still be a move, not an accidental tap.
  if (!held)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{...start, y: start.y + 12}],
    });
  for (let i = 1; i <= 8; i++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        ...others,
        {
          ...start,
          x: start.x + (offset.x * pad!.width * i) / 8,
          y: start.y + (offset.y * pad!.height * i) / 8,
        },
      ],
    });
  }
  // CDP touchEnd releases every active contact. Keep both contacts down during
  // a held drag; the caller releases them after observing the slider update.
  if (!held)
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  await expect
    .poll(() =>
      host.evaluate((kind) => {
        (window as any).__phoneTestStep();
        const core = (window as any).xb.core;
        const target = core.interaction.getResolvedRay(
          core.scene.getObjectByName('Phone Companion').controller
        )?.target;
        return kind === 'button'
          ? target?.label?.startsWith('Tap me:')
          : target?.ariaLabel ===
              (kind === 'slider' ? 'Phone slider' : 'Message');
      }, kind)
    )
    .toBe(true);
}

async function tapPad(phone: Page, touch: CDPSession) {
  const pad = await phone.getByLabel('Pointer touchpad').boundingBox();
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {id: 1, x: pad!.x + pad!.width / 2, y: pad!.y + pad!.height / 2},
    ],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function tapButton(phone: Page, touch: CDPSession, name: string) {
  const button = phone.getByRole('button', {name, exact: true});
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      {id: 1, x: box!.x + box!.width / 2, y: box!.y + box!.height / 2},
    ],
  });
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function sliderValue(host: Page) {
  return host.evaluate(() => {
    (window as any).__phoneTestStep();
    let value = 0;
    (window as any).xb.core.scene.traverse((o: any) => {
      if (o.ariaLabel === 'Phone slider') value = o.value;
    });
    return value;
  });
}

async function cardPose(host: Page) {
  return host.evaluate(() => {
    (window as any).__phoneTestStep();
    let pose: number[] = [];
    (window as any).xb.core.scene.traverse((o: any) => {
      if (o.ariaLabel === 'Phone slider')
        pose = [
          ...o.parent.position.toArray(),
          ...o.parent.quaternion.toArray(),
        ];
    });
    return pose;
  });
}
