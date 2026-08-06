# Direct Touch Lab

This is a small, close-range manual test for the direct-touch interaction path.
Serve the repository and open:

`http://127.0.0.1:8080/demos/direct_touch/`

The three targets are approximately 60 cm in front of the starting camera.
Each target shows live callback counts in this order:

- `TOUCH`: start / touching frames / end
- `GRAB`: start / grabbing frames / end
- `SELECT`: start / end

Use **Touch + Select** to confirm that direct touch starts the unified
selection on contact, keeps it active while touching, and completes it when
contact ends. Use **Prevent Select** to confirm that
`event.preventDefault()` keeps both selection counts at zero. Use
**Touch + Grab** to touch with the index finger and then pinch without leaving
the target.

The simulator starts in Hands mode:

- W/A/S/D: move the active hand
- Q/E: move the hand up/down
- T: change the active hand
- Space: toggle pinch

The white marker shows the `event.touchPosition` value. The final line on each
status panel shows the last callback, hand, and world position.
