# Selection and direct hands

Read this reference for global actions, ray-targeted objects, direct touch, or
grab. Source declarations are in
[`../../../src/core/Script.ts`](../../../src/core/Script.ts).

## Event ownership

| Intent             | Public family                                                |
| ------------------ | ------------------------------------------------------------ |
| Scene command      | `onSelect*`, `onSqueeze*`, or `onKey*`                       |
| Ray target         | `onObjectSelect*` and `onHover*`                             |
| Index-tip contact  | `onObjectTouchStart`, `onObjectTouching`, `onObjectTouchEnd` |
| Contact plus pinch | `onObjectGrabStart`, `onObjectGrabbing`, `onObjectGrabEnd`   |

Targeted callbacks bubble through ancestor scripts. Call
`event.stopPropagation()` to stop later ancestors. Keep one domain transition
in either the global or targeted family so one source action cannot apply it
twice.

## Resolved fields

- `source` identifies the interaction source and controller.
- `target` is the logical object selected by the resolver.
- `surface` is the public hit surface. Private renderer meshes are normalized
  to their public owner.
- `currentTarget` is the script currently receiving the bubbled callback.
- `intersection` is the current cloned ray hit when the source still hits the
  captured surface. It can be absent on an end event.
- `touchPosition` is the world-space contact point for direct touch and grab.

Use these event values inside the callback. Use
`xb.user.getRayIntersection(controllerId)` only when code outside an event needs
the current resolved ray hit.

## Direct-contact lifecycle

Enable hands before initialization. Touch starts selection by default:

```text
touch start -> select start -> selecting while contact continues
grab start -> manipulation start/update/end while pinch continues
touch end -> select end
```

Call `event.preventDefault()` during `onObjectTouchStart` when contact must not
start selection or automatic manipulation. Releasing a grab can end
manipulation while touch contact and selection continue.

Guard live hand data:

```js
const tip = xb.user.hands?.getIndexTip(xb.Handedness.LEFT);
if (tip) tip.getWorldPosition(this.worldPoint);
```

Use the simulator hand controls from
[`../../../templates/02_object_interaction/`](../../../templates/02_object_interaction/)
and read the [Hands manual](../../../docs/docs/manual/Hands.mdx) for joint access.
