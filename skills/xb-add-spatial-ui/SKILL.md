---
name: xb-add-spatial-ui
description: >-
  Add a spatial interface to an XR Blocks app. Use for menus, HUDs, cards,
  dashboards, dialogs, labels, buttons, controls, and object-attached UI.
---

# Add spatial UI

Build one usable surface whose content, controls, spatial pose, and result are
clear on desktop and in XR.

## 1. Define the surface

Record the values and actions, whether the surface is a world-space card or a
view-space overlay, and the input paths that must operate it.

## 2. Use the built-in UI

Read [`../xb-ui/SKILL.md`](../xb-ui/SKILL.md). Use one `UICard` per world-space
pivot or one `UIOverlay` per view-space surface. Compose content with `UIPanel`,
`UIText`, `UIImage`, `UIIcon`, `UIButton`, and `UISlider`.

The UI is exported from `xrblocks` and its renderer starts automatically. Do
not register a separate renderer or addon.

## 3. Verify the result

Build or type-check the app. Confirm that the initial surface loads, every
control has visible hover and active feedback, and every action has an
observable result. Hand off the exact simulator or XR URL and input steps.
