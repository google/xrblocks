import {test, expect, type Page, type CDPSession} from '@playwright/test';

test.use({hasTouch: true});

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
  // These windows stand in for two independently foregrounded devices. CI
  // switching focus between them must not suspend/re-pair the phone. The
  // background-recovery checks below still dispatch explicit hidden states.
  await context.addInitScript(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    window.addEventListener(
      'blur',
      (event) => {
        // Focusing the headset window is not a phone interruption on two real
        // devices. Explicit hidden-state transitions below still cancel input.
        if (event.target === window && !document.hidden)
          event.stopImmediatePropagation();
      },
      true
    );
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
    // This checks interaction geometry, not headset render resolution. A full
    // room rendered at 1280x720 in Linux SwiftShader can block a manual step
    // for seconds and starve the independent phone's heartbeat. Keep the CSS
    // viewport/camera unchanged while reducing only the GPU drawing buffer.
    core.renderer.setPixelRatio(0.25);
    (window as any).__phoneTestStep = () => {
      core.stepFrame();
      core.stepFrame();
    };
  });
  const popup = context.waitForEvent('page');
  await expect(host.locator('#pairing-code')).toHaveText(/^[A-HJ-NP-Z2-9]{4}$/);
  await host.evaluate(() => {
    const link = (window as any).xb.core.scene.getObjectByName(
      'Phone Companion'
    ).link;
    link.transport.dispatchEvent(
      new CustomEvent('error', {
        detail: {
          error: new Error(
            'Malformed SDP: compare 269 838 with your phone then tap Numbers match'
          ),
        },
      })
    );
  });
  await expect(host.locator('#status')).toHaveText(
    'Connection problem. Keep both pages open and try again.'
  );
  await expect(host.locator('#pair-request')).not.toContainText('269 838');
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
  await host.bringToFront();
  for (const id of ['accept-phone', 'reject-phone']) {
    const button = host.locator(`#${id}`);
    for (const hover of [false, true]) {
      if (hover) await button.hover();
      const contrast = await button.evaluate((element) => {
        const luminance = (color: string) => {
          const rgb = color
            .match(/[\d.]+/g)!
            .slice(0, 3)
            .map(Number)
            .map((value) => {
              const s = value / 255;
              return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const ratio = (a: string, b: string) => {
          const x = luminance(a),
            y = luminance(b);
          return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
        };
        const style = getComputedStyle(element);
        return {
          text: ratio(style.color, style.backgroundColor),
          border: ratio(
            style.borderTopColor,
            getComputedStyle(element.parentElement!).backgroundColor
          ),
        };
      });
      expect(contrast.text).toBeGreaterThanOrEqual(4.5);
      expect(contrast.border).toBeGreaterThanOrEqual(3);
    }
  }
  const comparison = (await host.locator('#pair-request').textContent())!.match(
    /\d{6}/
  )![0];
  await expect(phone.getByLabel('Verification number')).toHaveText(
    `${comparison.slice(0, 3)} ${comparison.slice(3)}`
  );
  await expect(phone.getByLabel('Pointer touchpad')).toBeHidden();
  await expect(
    phone.getByText('Check the number', {exact: true})
  ).toBeVisible();
  // A stale press must stay bound to its original request, not whichever phone
  // arrives next. Reload before approval so this invitation remains unused.
  const oldRequest = await host.evaluate(() => {
    (window as any).__oldAccept = document.querySelector('#accept-phone');
    return (window as any).xb.core.scene.getObjectByName('Phone Companion')
      .pendingPhone.id;
  });
  await phone.bringToFront();
  await phone.reload();
  await phone.evaluate(async () => {
    const {PhoneControllerPage} = await import(
      '/build/addons/phone-companion/PhoneControllerPage.js'
    );
    const connect = PhoneControllerPage.prototype.connect;
    PhoneControllerPage.prototype.connect = function () {
      (window as any).__phoneTestLink = this.link;
      const events: unknown[] = [];
      for (const type of [
        'pointerdown',
        'pointerup',
        'pointercancel',
        'lostpointercapture',
        'click',
      ]) {
        this.shadow.addEventListener(type, (event: PointerEvent) => {
          events.push({
            type,
            pointer: event.pointerId,
            target: (event.composedPath()[0] as HTMLElement).id,
          });
          if (events.length > 20) events.shift();
        });
      }
      (window as any).__phoneDiagnostics = () => ({
        motion: {...this.link.motion},
        generation: this.link.generation,
        connected: this.link.connected,
        foreground: this.link.foreground,
        dragMode: this.dragMode,
        hidden: document.hidden,
        pointers: [...this.pointers.keys()],
        multiTouch: this.multiTouch,
        events,
      });
      return connect.call(this);
    };
  });
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
  const nextComparison = (await host
    .locator('#pair-request')
    .textContent())!.match(/\d{6}/)![0];
  await expect(phone.getByLabel('Verification number')).toHaveText(
    `${nextComparison.slice(0, 3)} ${nextComparison.slice(3)}`
  );
  await host.bringToFront();
  await host.locator('#accept-phone').click();
  await phone.bringToFront();
  await expect(phone.getByLabel('Pointer touchpad')).toBeHidden();
  await phone.getByRole('button', {name: 'Numbers match', exact: true}).click();
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
  await tapButton(phone, 'Drag');
  await expect
    .poll(() => phone.evaluate(() => (window as any).__phoneDiagnostics()))
    .toMatchObject({dragMode: 'toggle', multiTouch: false});
  await expect(
    phone.getByRole('button', {name: 'Drop', exact: true})
  ).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => sliderValue(host)).toBeLessThan(40);
  await pointAt(host, phone, touch, 'slider', 0.75);
  await expect.poll(() => sliderValue(host)).toBeGreaterThan(60);
  await tapButton(phone, 'Drop');
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
    phone.getByRole('button', {name: 'Open keyboard: Message'})
  ).toBeVisible();
  await expect(phone.locator('textarea')).toHaveValue('');
  await tapButton(phone, 'Open keyboard: Message');
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
  await tapButton(phone, 'Done');
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
    await phone.evaluate((cycle) => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
      if (cycle === 1) (window as any).__phoneTestLink.transport.close();
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }, cycle);
    await expect
      .poll(() =>
        host.evaluate(
          ({oldPeer, cycle}) => {
            const link = (window as any).xb.core.scene.getObjectByName(
              'Phone Companion'
            ).link;
            return (
              link.connected &&
              (cycle === 0 ? link.peer === oldPeer : link.peer !== oldPeer)
            );
          },
          {oldPeer: previousPeer, cycle}
        )
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
  await phone.getByRole('button', {name: 'Disconnect', exact: true}).click();
  await expect(phone.getByRole('dialog')).toBeVisible();
  await phone.getByRole('button', {name: 'Cancel', exact: true}).click();
  await expect(phone.getByLabel('Pointer touchpad')).toBeVisible();
  await phone.getByRole('button', {name: 'Disconnect', exact: true}).click();
  await phone
    .getByRole('dialog')
    .getByRole('button', {name: 'Disconnect', exact: true})
    .click();
  await expect(
    phone.getByRole('textbox', {name: 'Pairing code', exact: true})
  ).toHaveValue('');
  await phone.close();
  await expect(host.locator('#status')).toHaveText('Waiting for phone…');
});

async function pointAt(
  host: Page,
  phone: Page,
  touch: CDPSession,
  kind: 'button' | 'slider' | 'input',
  ratio = 0.5
) {
  await phone.bringToFront();
  const pad = (await phone.getByLabel('Pointer touchpad').boundingBox())!;
  const start = {id: 1, x: pad.x + pad.width / 2, y: pad.y + pad.height / 2};
  const previousSample = await host.evaluate(
    () =>
      (window as any).xb.core.scene.getObjectByName('Phone Companion').motion
        .sample
  );
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [start],
  });
  // Cross Chromium's native touch slop before measuring the remaining aim.
  // The old 12px nudge and tiny first correction could be swallowed entirely.
  const moving = {...start, y: start.y + 32};
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [moving],
  });
  await expect
    .poll(() =>
      host.evaluate((sample) => {
        (window as any).__phoneTestStep();
        return (
          (window as any).xb.core.scene.getObjectByName('Phone Companion')
            .motion.sample > sample
        );
      }, previousSample)
    )
    .toBe(true);
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
      (window as any).__phoneExpectedAim = {
        kind,
        point: point.toArray(),
        physical: physical.matrixWorld.toArray(),
      };
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
  for (let i = 1; i <= 8; i++) {
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        {
          ...moving,
          x: moving.x + (offset.x * pad.width * i) / 8,
          y: moving.y + (offset.y * pad.height * i) / 8,
        },
      ],
    });
  }
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
  await expect
    .poll(() => phone.evaluate(() => (window as any).__phoneDiagnostics()))
    .toMatchObject({pointers: [], multiTouch: false});
  try {
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
  } catch (error) {
    const actual = await host.evaluate(() => {
      const core = (window as any).xb.core;
      const companion = core.scene.getObjectByName('Phone Companion');
      const resolved = core.interaction.getResolvedRay(companion.controller);
      return {
        expected: (window as any).__phoneExpectedAim,
        motion: companion.motion,
        yaw: companion.yaw,
        pitch: companion.pitch,
        connected: companion.connected,
        generation: companion.link.generation,
        quaternion: companion.controller
          .getWorldQuaternion(companion.controller.quaternion.clone())
          .toArray(),
        target: resolved?.target?.name,
        label: resolved?.target?.label,
        rays: core.input.getFrame().raySources.map((source: any) => ({
          origin: source.ray?.origin?.toArray(),
          direction: source.ray?.direction?.toArray(),
        })),
        ui: (window as any).xb.ui.validate(),
      };
    });
    const phoneState = await phone.evaluate(() =>
      (window as any).__phoneDiagnostics?.()
    );
    throw new Error(
      `${error}\nPhone aim diagnostics: ${JSON.stringify({actual, phoneState})}`
    );
  }
}

async function tapPad(phone: Page, touch: CDPSession) {
  await phone.bringToFront();
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
  await expect
    .poll(() => phone.evaluate(() => (window as any).__phoneDiagnostics()))
    .toMatchObject({pointers: [], multiTouch: false});
}

async function tapButton(phone: Page, name: string) {
  await phone.bringToFront();
  const button = phone.getByRole('button', {name, exact: true});
  // Chromium can omit the compatibility click after mixing raw CDP swipes
  // with Touchscreen.tap(). Use the browser's normal button activation here;
  // the DOM UI matrix separately exercises native touch taps on these buttons.
  await button.click();
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
