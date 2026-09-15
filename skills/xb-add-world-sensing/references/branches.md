# World-sensing branches

Read the selection table, then load only the manual and executable evidence for
the selected branch.

| Signal                                    | Enable before initialization                                          | Primary reference                                | Executable evidence                                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Floors, walls, and tables                 | `options.enablePlaneDetection()`                                      | [World](../../../docs/docs/manual/World.mdx)     | [`templates/03_spatial_placement`](../../../templates/03_spatial_placement/)                                                     |
| Platform room geometry                    | `options.world.enableMeshDetection()`                                 | [World](../../../docs/docs/manual/World.mdx)     | [`samples/xr_realism/depthmesh`](../../../samples/xr_realism/depthmesh/)                                                         |
| Per-pixel distance or live room mesh      | `options.enableDepth()`                                               | [Depth](../../../docs/docs/manual/Depth.md)      | [`samples/xr_realism/depthmap`](../../../samples/xr_realism/depthmap/) and [`depthmesh`](../../../samples/xr_realism/depthmesh/) |
| Occlusion                                 | depth plus the documented consumer                                    | [Depth](../../../docs/docs/manual/Depth.md)      | [`samples/xr_realism/occlusion`](../../../samples/xr_realism/occlusion/)                                                         |
| Named physical objects                    | `options.enableObjectDetection()` plus selected backend prerequisites | [World](../../../docs/docs/manual/World.mdx)     | [`templates/08_scene_understanding`](../../../templates/08_scene_understanding/)                                                 |
| Human body joints                         | `options.enableHumanDetection()`                                      | [World](../../../docs/docs/manual/World.mdx)     | nearest current human-detection sample                                                                                           |
| Face landmarks and expressions            | `options.enableFaceDetection()`                                       | [World](../../../docs/docs/manual/World.mdx)     | [`samples/avatar_lab/face_mirror`](../../../samples/avatar_lab/face_mirror/)                                                     |
| Person segmentation mask                  | `options.enableSegmentation()`                                        | [World](../../../docs/docs/manual/World.mdx)     | [`samples/avatar_lab/person_segmentation`](../../../samples/avatar_lab/person_segmentation/)                                     |
| Semantic tree, visibility, or Set-of-Mark | one of the `enable*Context()` methods                                 | [Context](../../../docs/docs/manual/Context.mdx) | [`templates/11_agent_context`](../../../templates/11_agent_context/)                                                             |

## Branch rules

### Planes and scene meshes

Planes are coarse semantic surfaces. Scene meshes are platform-provided room
geometry. Both are optional WebXR evidence and can remain empty on unsupported
devices. Use one-time horizontal placement only when placement is the desired
reaction.

### Depth, reticles, occlusion, and collision

`enableDepth()` enables the default live depth mesh. Configure reticle
projection through `options.reticles.projectOnDepthMesh`; read current hits from
the interaction event or `xb.user.getRayIntersection()`. Rapier configuration
is the physics switch; a depth preset alone does not enable physics.

### Objects, humans, and faces

These branches can return empty arrays during warm-up or when nothing is
detected. Top-level enable helpers declare their documented camera/depth
prerequisites. Use `start(client)` and `stop(client)` for continuous ownership.
For object detection, select Gemini only when off-device image processing and
credentials are acceptable; use the current on-device backend when required.

### Segmentation

Segmentation provides a 2D category mask and does not require depth. Treat
`latestMask === null` as a normal not-ready or unavailable state.

### Agent context

Context describes the XR Blocks scene for agents and automation. It does not
discover unknown physical objects. Request outputs from one context snapshot
when the semantic tree, visible objects, and Set-of-Mark image must agree.

## Permission and dependency proof

Before implementation, identify camera permission timing, optional peer
dependencies, device support, and simulator fidelity from the chosen manual and
source. Browser import-map applications must map every selected branch's bare
dependencies through one aligned dependency graph.
