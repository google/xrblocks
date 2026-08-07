# Developer surface ownership

Use the smallest affected set. Each fact has one primary owner.

| Surface                       | Owns                                                                | Completion evidence                                                 |
| ----------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Public entry and source TSDoc | Import path, signature, default, return value, lifecycle contract   | Intended symbol appears in the correct entry and declaration output |
| Manual                        | Concept, setup, behavior, units, limits, and current short examples | One canonical page explains the changed concept                     |
| Template                      | Minimum copyable application setup                                  | Template builds with the supported dependency graph                 |
| Sample                        | Focused executable capability pattern                               | Exact sample starts through its intended entry                      |
| Demo                          | Multi-system composition and experimentation                        | Update only when the demo uses the changed seam                     |
| `CONTEXT.md`                  | Compact cross-task agent invariants                                 | Update only for a contract-level change                             |
| Consumer task skill           | Ordered task process and branch selection                           | Update only when agent behavior must change                         |
| Addon README                  | Addon setup, ownership, limits, and executable entry paths          | README matches the addon public entry and samples                   |

Do not copy a complete API catalog into `AGENTS.md`, `CONTEXT.md`, or a skill.
Do not require a new skill or blanket overview updates for an ordinary public
capability.
