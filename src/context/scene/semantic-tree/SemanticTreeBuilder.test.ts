import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {UICard} from '../../../ui/components/UICard';
import {
  bindScrollView,
  UIScrollView,
  updateScrollViewLayout,
} from '../../../ui/components/UIScrollView';
import {UITextInput} from '../../../ui/components/UITextInput';
import {UISlider} from '../../../ui/components/UISlider';
import {SemanticIdRegistry} from '../../shared/SemanticIdRegistry';
import {buildSemanticTree} from './SemanticTreeBuilder';

describe('Spatial form semantics', () => {
  it('exposes text-field state without publishing drafts or changing slider values', () => {
    const field = new UITextInput({
      ariaLabel: 'Message',
      multiline: true,
      value: 'Private draft',
    });
    const slider = new UISlider({ariaLabel: 'Volume', value: 0.5});
    const card = new UICard({
      size: {width: 1, height: 1},
      children: [field, slider],
    });
    const scene = new THREE.Scene();
    scene.add(card);
    const registry = new SemanticIdRegistry();
    const first = buildSemanticTree({scene, registry, capturedAt: 0});
    const input = first.tree.nodes[first.objectNodeIds.get(field)!];
    expect(input).toMatchObject({
      role: 'textbox',
      name: 'Message',
      multiline: true,
    });
    expect(input).not.toHaveProperty('value');
    expect(input).not.toHaveProperty('text');
    expect(first.tree.nodes[first.objectNodeIds.get(slider)!].value).toBe(0.5);
    field.userData.semantic = {text: field.value};
    const disclosed = buildSemanticTree({scene, registry, capturedAt: 1});
    expect(disclosed.tree.nodes[disclosed.objectNodeIds.get(field)!].text).toBe(
      'Private draft'
    );
    expect(disclosed.objectNodeIds.get(field)).toBe(
      first.objectNodeIds.get(field)
    );
  });

  it('describes scroll extents in UI units', () => {
    const view = new UIScrollView({ariaLabel: 'History'});
    bindScrollView(view, {
      projectPoint: () => new THREE.Vector2(),
      reveal: () => {},
      applyOffset: () => {},
    });
    updateScrollViewLayout(view, 100, 350);
    view.scrollTo(40);
    const scene = new THREE.Scene();
    scene.add(new UICard({size: {width: 1, height: 1}, children: [view]}));
    const tree = buildSemanticTree({
      scene,
      registry: new SemanticIdRegistry(),
      capturedAt: 0,
    });
    expect(tree.tree.nodes[tree.objectNodeIds.get(view)!]).toMatchObject({
      role: 'region',
      name: 'History',
      traits: ['scrollable'],
      scroll: {
        offset: 40,
        viewportHeight: 100,
        maximum: 250,
        contentHeight: 350,
      },
    });
  });
});
