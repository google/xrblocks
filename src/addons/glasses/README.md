# glasses ui

This is an experimental implementation of Glasses UI inspired by Jetpack Compose Glimmer.
It uses raw `@pmndrs/uikit` components and is separate from the supported XR Blocks
`UICard` and `UIOverlay` API.

## Features

- System UI with functional clock and weather widgets.
- Card component.
- Card stack component.
- Google Sans Flex font.

## Usage

See `demos/glasses_ui/` for its current composition. Treat this add-on as experimental
demo code, not as the standard way to build XR Blocks UI. New applications should use the
public components exported from `xrblocks`; see `templates/01_spatial_ui`.
