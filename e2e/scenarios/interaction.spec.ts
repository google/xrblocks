import {test, expect} from '../fixtures/boot';

test('hand ray hover is detected on the grabbable', async ({driver}) => {
  await driver.pointTo('rightHand', 'grabbable');
  await driver.step(100);
  const hovered = await driver.getState();
  expect(hovered.hovered).toBe(true);

  await driver.pointTo('rightHand', 'probe');
  await driver.step(100);
  const unhovered = await driver.getState();
  expect(unhovered.hovered).toBe(false);
});

test('select gesture grabs and releases the object', async ({driver}) => {
  await driver.pointTo('rightHand', 'grabbable');
  await driver.step(100);
  await driver.select('rightHand', true);

  const grabbed = await driver.getState();
  expect(grabbed.grabbedByHand).toBe(1);

  await driver.select('rightHand', false);
  const released = await driver.getState();
  expect(released.grabbedByHand).toBeNull();
});

test('grabbing moves the object with the hand', async ({driver}) => {
  await driver.pointTo('rightHand', 'grabbable');
  await driver.step(100);
  await driver.select('rightHand', true);

  await driver.step(300, {rightHand: {move: [0, 0.1, 0]}});

  await driver.select('rightHand', false);
  const after = await driver.getState();
  expect(after.grabbedByHand).toBeNull();
});
