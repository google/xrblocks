import * as THREE from 'three';
import {expect, it} from 'vitest';
import {getSemanticControl} from '../../../interaction/SemanticControl';
import {UICard} from '../../../ui/components/UICard';
import {UIDropdown} from '../../../ui/components/UIDropdown';
import {UIProgress} from '../../../ui/components/UIProgress';
import {UITextInput} from '../../../ui/components/UITextInput';
import {UISlider} from '../../../ui/components/UISlider';
import {UIToggle} from '../../../ui/components/UIToggle';
import {SemanticIdRegistry} from '../../shared/SemanticIdRegistry';
import {buildSemanticTree} from './SemanticTreeBuilder';

it('describes current control state without exposing private text drafts', () => {
  const text = new UITextInput({ariaLabel: 'Message', value: 'Private draft'}),
    toggle = new UIToggle({ariaLabel: 'Wi-Fi', checked: true}),
    slider = new UISlider({ariaLabel: 'Volume', value: 0.7}),
    progress = new UIProgress({ariaLabel: 'Upload', max: 200, value: 50});
  const dropdown = new UIDropdown({
    ariaLabel: 'Size',
    options: [
      {value: 's', label: 'Small'},
      {value: 'm', label: 'Medium', disabled: true},
    ],
    value: 's',
  });
  const scene = new THREE.Scene();
  scene.add(
    new UICard({
      size: {width: 1, height: 1},
      children: [text, toggle, slider, progress, dropdown],
    })
  );
  const registry = new SemanticIdRegistry();
  let result = buildSemanticTree({scene, registry, capturedAt: 0});
  const node = (object: THREE.Object3D) =>
    result.tree.nodes[result.objectNodeIds.get(object)!];
  expect(node(text)).toMatchObject({role: 'textbox', name: 'Message'});
  expect(node(text)).not.toHaveProperty('value');
  expect(node(text)).not.toHaveProperty('text');
  expect(node(toggle)).toMatchObject({
    role: 'switch',
    checked: true,
    disabled: false,
  });
  expect(node(slider).value).toBe(0.7);
  expect(node(progress)).toMatchObject({
    role: 'progressbar',
    value: 50,
    max: 200,
  });
  getSemanticControl(dropdown)!.activate();
  toggle.checked = false;
  toggle.disabled = true;
  progress.value = 120;
  const previousId = result.objectNodeIds.get(text);
  result = buildSemanticTree({scene, registry, capturedAt: 1});
  expect(result.objectNodeIds.get(text)).toBe(previousId);
  expect(node(toggle)).toMatchObject({checked: false, disabled: true});
  expect(node(progress).value).toBe(120);
  const list = result.tree.nodes[node(dropdown).children[0]],
    options = list.children.map((id) => result.tree.nodes[id]);
  expect(node(dropdown).expanded).toBe(true);
  expect(options.map(({name, disabled}) => ({name, disabled}))).toEqual([
    {name: 'Small', disabled: false},
    {name: 'Medium', disabled: true},
  ]);
  text.userData.semantic = {text: text.value};
  result = buildSemanticTree({scene, registry, capturedAt: 2});
  expect(node(text).text).toBe('Private draft');
});
it('updates world positions and bounds under transformed parents', () => {
  const scene = new THREE.Scene(),
    parent = new THREE.Group(),
    child = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  child.userData.semantic = {name: 'Child'};
  parent.add(child);
  scene.add(parent);
  const registry = new SemanticIdRegistry();
  buildSemanticTree({scene, registry, capturedAt: 0});
  parent.position.set(4, 5, 6);
  parent.scale.setScalar(2);
  child.position.x = 1;
  const result = buildSemanticTree({scene, registry, capturedAt: 1}),
    node = result.tree.nodes[result.objectNodeIds.get(child)!];
  expect(node.position).toEqual([6, 5, 6]);
  expect(node.bounds).toEqual({center: [6, 5, 6], size: [4, 4, 4]});
  child.geometry.dispose();
});
