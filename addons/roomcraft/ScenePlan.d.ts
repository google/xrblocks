import { MAX_SCENE_DISTANCE, MAX_SCENE_OBJECTS, MAX_SCENE_SCALE, MIN_SCENE_SCALE, SceneAssetDescription, SceneEnvironment, SceneLayout, SceneObject, ScenePlan, SceneRequest } from "./SceneTypes.js";
//#region src/addons/roomcraft/ScenePlan.d.ts
/** Optional Gemini `responseJsonSchema`; runtime validation is always applied. */
export declare const SCENE_PLAN_SCHEMA: {
  type: string;
  additionalProperties: boolean;
  required: string[];
  properties: {
    title: {
      type: string;
      minLength: number;
      maxLength: number;
    };
    environment: {
      type: string[];
      additionalProperties: boolean;
      description: string;
      properties: {
        size: {
          type: string;
          minItems: number;
          maxItems: number;
          description: string;
          items: {
            type: string;
            minimum: number;
            maximum: number;
          };
        };
        groundColor: {
          type: string;
          pattern: string;
        };
        timeOfDay: {
          type: string;
          enum: ("daylight" | "moonlight" | "sunrise" | "sunset")[];
        };
      };
    };
    edits: {
      type: string;
      items: {
        anyOf: ({
          type: string;
          additionalProperties: boolean;
          required: string[];
          properties: {
            changes?: undefined;
            id?: undefined;
            op: {
              type: string;
              enum: string[];
            };
            object: {
              anyOf: ({
                type: string;
                additionalProperties: boolean;
                required: string[];
                properties: {
                  name: {
                    type: string;
                    minLength: number;
                    maxLength: number;
                  };
                  position: {
                    type: string;
                    minItems: number;
                    maxItems: number;
                    items: {
                      type: string;
                      minimum: number;
                      maximum: number;
                    };
                  };
                  rotation: {
                    type: string;
                    minimum: number;
                    maximum: number;
                  };
                  scale: {
                    type: string;
                    minItems: number;
                    maxItems: number;
                    items: {
                      type: string;
                      minimum: number;
                      maximum: number;
                    };
                  };
                  color: {
                    type: string;
                    pattern: string;
                  };
                  id: {
                    type: string;
                    pattern: string;
                  };
                  asset: {
                    type: string;
                    pattern: string;
                  };
                };
              } | {
                type: string;
                additionalProperties: boolean;
                required: string[];
                properties: {
                  name: {
                    type: string;
                    minLength: number;
                    maxLength: number;
                  };
                  position: {
                    type: string;
                    minItems: number;
                    maxItems: number;
                    items: {
                      type: string;
                      minimum: number;
                      maximum: number;
                    };
                  };
                  rotation: {
                    type: string;
                    minimum: number;
                    maximum: number;
                  };
                  scale: {
                    type: string;
                    minItems: number;
                    maxItems: number;
                    items: {
                      type: string;
                      minimum: number;
                      maximum: number;
                    };
                  };
                  color: {
                    type: string;
                    pattern: string;
                  };
                  id: {
                    type: string;
                    pattern: string;
                  };
                  parts: {
                    type: string;
                    items: {
                      type: string;
                      additionalProperties: boolean;
                      required: string[];
                      properties: {
                        name: {
                          type: string;
                          minLength: number;
                          maxLength: number;
                        };
                        shape: {
                          type: string;
                          enum: ("box" | "capsule" | "cone" | "cylinder" | "sphere" | "torus")[];
                        };
                        parent: {
                          type: string[];
                          description: string;
                        };
                        position: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        rotation: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        size: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        color: {
                          type: string;
                          pattern: string;
                        };
                        motion: {
                          anyOf: ({
                            type: string;
                            additionalProperties?: undefined;
                            required?: undefined;
                            properties?: undefined;
                          } | {
                            type: string;
                            additionalProperties: boolean;
                            required: string[];
                            properties: {
                              axis: {
                                type: string;
                                enum: ("x" | "y" | "z")[];
                              };
                              pivot: {
                                type: string;
                                minItems: number;
                                maxItems: number;
                                description: string;
                                items: {
                                  type: string;
                                  minimum: number;
                                  maximum: number;
                                };
                              };
                              phase: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              kind: {
                                type: string;
                                enum: string[];
                              };
                              amplitude: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              period: {
                                type: string;
                                minimum: number;
                                maximum: number;
                              };
                            };
                          } | {
                            type: string;
                            additionalProperties: boolean;
                            required: string[];
                            properties: {
                              axis: {
                                type: string;
                                enum: ("x" | "y" | "z")[];
                              };
                              pivot: {
                                type: string;
                                minItems: number;
                                maxItems: number;
                                description: string;
                                items: {
                                  type: string;
                                  minimum: number;
                                  maximum: number;
                                };
                              };
                              phase: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              kind: {
                                type: string;
                                enum: string[];
                              };
                              speed: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                            };
                          })[];
                        };
                        id: {
                          type: string;
                          pattern: string;
                        };
                      };
                    };
                  };
                };
              } | {
                type: string;
                additionalProperties: boolean;
                required: string[];
                properties: {
                  name: {
                    type: string;
                    minLength: number;
                    maxLength: number;
                  };
                  position: {
                    type: string;
                    minItems: number;
                    maxItems: number;
                    items: {
                      type: string;
                      minimum: number;
                      maximum: number;
                    };
                  };
                  rotation: {
                    type: string;
                    minimum: number;
                    maximum: number;
                  };
                  scale: {
                    type: string;
                    minItems: number;
                    maxItems: number;
                    items: {
                      type: string;
                      minimum: number;
                      maximum: number;
                    };
                  };
                  color: {
                    type: string;
                    pattern: string;
                  };
                  id: {
                    type: string;
                    pattern: string;
                  };
                  landscape: {
                    anyOf: ({
                      type: string;
                      additionalProperties: boolean;
                      required: string[];
                      properties: {
                        kind: {
                          type: string;
                          enum: string[];
                        };
                        size: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        bankWidth: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                        points?: undefined;
                        width?: undefined;
                        style?: undefined;
                        count?: undefined;
                        seed?: undefined;
                        height?: undefined;
                      };
                    } | {
                      type: string;
                      additionalProperties: boolean;
                      required: string[];
                      properties: {
                        bankWidth?: undefined;
                        kind: {
                          type: string;
                          enum: string[];
                        };
                        points: {
                          type: string;
                          items: {
                            type: string;
                            minItems: number;
                            maxItems: number;
                            items: {
                              type: string;
                              minimum: number;
                              maximum: number;
                            };
                          };
                        };
                        width: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                        style?: undefined;
                        size?: undefined;
                        count?: undefined;
                        seed?: undefined;
                        height?: undefined;
                      };
                    } | {
                      type: string;
                      additionalProperties: boolean;
                      required: string[];
                      properties: {
                        bankWidth?: undefined;
                        points?: undefined;
                        width?: undefined;
                        kind: {
                          type: string;
                          enum: string[];
                        };
                        style: {
                          type: string;
                          enum: ("flower" | "grass" | "rock" | "shrub" | "tree")[];
                        };
                        size: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        count: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                        seed: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                        height: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                      };
                    })[];
                  };
                };
              })[];
            };
            partEdits?: undefined;
          };
        } | {
          type: string;
          additionalProperties: boolean;
          required: string[];
          properties: {
            object?: undefined;
            op: {
              type: string;
              enum: string[];
            };
            id: {
              type: string;
              pattern: string;
            };
            changes: {
              type: string;
              additionalProperties: boolean;
              properties: {
                name: {
                  type: string;
                  minLength: number;
                  maxLength: number;
                };
                position: {
                  type: string;
                  minItems: number;
                  maxItems: number;
                  items: {
                    type: string;
                    minimum: number;
                    maximum: number;
                  };
                };
                rotation: {
                  type: string;
                  minimum: number;
                  maximum: number;
                };
                scale: {
                  type: string;
                  minItems: number;
                  maxItems: number;
                  items: {
                    type: string;
                    minimum: number;
                    maximum: number;
                  };
                };
                color: {
                  type: string;
                  pattern: string;
                };
                asset: {
                  type: string;
                  pattern: string;
                };
                parts: {
                  type: string;
                  items: {
                    type: string;
                    additionalProperties: boolean;
                    required: string[];
                    properties: {
                      name: {
                        type: string;
                        minLength: number;
                        maxLength: number;
                      };
                      shape: {
                        type: string;
                        enum: ("box" | "capsule" | "cone" | "cylinder" | "sphere" | "torus")[];
                      };
                      parent: {
                        type: string[];
                        description: string;
                      };
                      position: {
                        type: string;
                        minItems: number;
                        maxItems: number;
                        description: string;
                        items: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                      };
                      rotation: {
                        type: string;
                        minItems: number;
                        maxItems: number;
                        description: string;
                        items: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                      };
                      size: {
                        type: string;
                        minItems: number;
                        maxItems: number;
                        description: string;
                        items: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                      };
                      color: {
                        type: string;
                        pattern: string;
                      };
                      motion: {
                        anyOf: ({
                          type: string;
                          additionalProperties?: undefined;
                          required?: undefined;
                          properties?: undefined;
                        } | {
                          type: string;
                          additionalProperties: boolean;
                          required: string[];
                          properties: {
                            axis: {
                              type: string;
                              enum: ("x" | "y" | "z")[];
                            };
                            pivot: {
                              type: string;
                              minItems: number;
                              maxItems: number;
                              description: string;
                              items: {
                                type: string;
                                minimum: number;
                                maximum: number;
                              };
                            };
                            phase: {
                              type: string;
                              minimum: number;
                              maximum: number;
                              description: string;
                            };
                            kind: {
                              type: string;
                              enum: string[];
                            };
                            amplitude: {
                              type: string;
                              minimum: number;
                              maximum: number;
                              description: string;
                            };
                            period: {
                              type: string;
                              minimum: number;
                              maximum: number;
                            };
                          };
                        } | {
                          type: string;
                          additionalProperties: boolean;
                          required: string[];
                          properties: {
                            axis: {
                              type: string;
                              enum: ("x" | "y" | "z")[];
                            };
                            pivot: {
                              type: string;
                              minItems: number;
                              maxItems: number;
                              description: string;
                              items: {
                                type: string;
                                minimum: number;
                                maximum: number;
                              };
                            };
                            phase: {
                              type: string;
                              minimum: number;
                              maximum: number;
                              description: string;
                            };
                            kind: {
                              type: string;
                              enum: string[];
                            };
                            speed: {
                              type: string;
                              minimum: number;
                              maximum: number;
                              description: string;
                            };
                          };
                        })[];
                      };
                      id: {
                        type: string;
                        pattern: string;
                      };
                    };
                  };
                };
                landscape: {
                  anyOf: ({
                    type: string;
                    additionalProperties: boolean;
                    required: string[];
                    properties: {
                      kind: {
                        type: string;
                        enum: string[];
                      };
                      size: {
                        type: string;
                        minItems: number;
                        maxItems: number;
                        items: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                      };
                      bankWidth: {
                        type: string;
                        minimum: number;
                        maximum: number;
                      };
                      points?: undefined;
                      width?: undefined;
                      style?: undefined;
                      count?: undefined;
                      seed?: undefined;
                      height?: undefined;
                    };
                  } | {
                    type: string;
                    additionalProperties: boolean;
                    required: string[];
                    properties: {
                      bankWidth?: undefined;
                      kind: {
                        type: string;
                        enum: string[];
                      };
                      points: {
                        type: string;
                        items: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                      };
                      width: {
                        type: string;
                        minimum: number;
                        maximum: number;
                      };
                      style?: undefined;
                      size?: undefined;
                      count?: undefined;
                      seed?: undefined;
                      height?: undefined;
                    };
                  } | {
                    type: string;
                    additionalProperties: boolean;
                    required: string[];
                    properties: {
                      bankWidth?: undefined;
                      points?: undefined;
                      width?: undefined;
                      kind: {
                        type: string;
                        enum: string[];
                      };
                      style: {
                        type: string;
                        enum: ("flower" | "grass" | "rock" | "shrub" | "tree")[];
                      };
                      size: {
                        type: string;
                        minItems: number;
                        maxItems: number;
                        items: {
                          type: string;
                          minimum: number;
                          maximum: number;
                        };
                      };
                      count: {
                        type: string;
                        minimum: number;
                        maximum: number;
                      };
                      seed: {
                        type: string;
                        minimum: number;
                        maximum: number;
                      };
                      height: {
                        type: string;
                        minimum: number;
                        maximum: number;
                      };
                    };
                  })[];
                };
              };
            };
            partEdits: {
              type: string;
              items: {
                anyOf: ({
                  type: string;
                  additionalProperties: boolean;
                  required: string[];
                  properties: {
                    op: {
                      type: string;
                      enum: string[];
                    };
                    part: {
                      type: string;
                      additionalProperties: boolean;
                      required: string[];
                      properties: {
                        name: {
                          type: string;
                          minLength: number;
                          maxLength: number;
                        };
                        shape: {
                          type: string;
                          enum: ("box" | "capsule" | "cone" | "cylinder" | "sphere" | "torus")[];
                        };
                        parent: {
                          type: string[];
                          description: string;
                        };
                        position: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        rotation: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        size: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        color: {
                          type: string;
                          pattern: string;
                        };
                        motion: {
                          anyOf: ({
                            type: string;
                            additionalProperties?: undefined;
                            required?: undefined;
                            properties?: undefined;
                          } | {
                            type: string;
                            additionalProperties: boolean;
                            required: string[];
                            properties: {
                              axis: {
                                type: string;
                                enum: ("x" | "y" | "z")[];
                              };
                              pivot: {
                                type: string;
                                minItems: number;
                                maxItems: number;
                                description: string;
                                items: {
                                  type: string;
                                  minimum: number;
                                  maximum: number;
                                };
                              };
                              phase: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              kind: {
                                type: string;
                                enum: string[];
                              };
                              amplitude: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              period: {
                                type: string;
                                minimum: number;
                                maximum: number;
                              };
                            };
                          } | {
                            type: string;
                            additionalProperties: boolean;
                            required: string[];
                            properties: {
                              axis: {
                                type: string;
                                enum: ("x" | "y" | "z")[];
                              };
                              pivot: {
                                type: string;
                                minItems: number;
                                maxItems: number;
                                description: string;
                                items: {
                                  type: string;
                                  minimum: number;
                                  maximum: number;
                                };
                              };
                              phase: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              kind: {
                                type: string;
                                enum: string[];
                              };
                              speed: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                            };
                          })[];
                        };
                        id: {
                          type: string;
                          pattern: string;
                        };
                      };
                    };
                    changes?: undefined;
                    id?: undefined;
                  };
                } | {
                  type: string;
                  additionalProperties: boolean;
                  required: string[];
                  properties: {
                    part?: undefined;
                    op: {
                      type: string;
                      enum: string[];
                    };
                    id: {
                      type: string;
                      pattern: string;
                    };
                    changes: {
                      type: string;
                      additionalProperties: boolean;
                      properties: {
                        name: {
                          type: string;
                          minLength: number;
                          maxLength: number;
                        };
                        shape: {
                          type: string;
                          enum: ("box" | "capsule" | "cone" | "cylinder" | "sphere" | "torus")[];
                        };
                        parent: {
                          type: string[];
                          description: string;
                        };
                        position: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        rotation: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        size: {
                          type: string;
                          minItems: number;
                          maxItems: number;
                          description: string;
                          items: {
                            type: string;
                            minimum: number;
                            maximum: number;
                          };
                        };
                        color: {
                          type: string;
                          pattern: string;
                        };
                        motion: {
                          anyOf: ({
                            type: string;
                            additionalProperties?: undefined;
                            required?: undefined;
                            properties?: undefined;
                          } | {
                            type: string;
                            additionalProperties: boolean;
                            required: string[];
                            properties: {
                              axis: {
                                type: string;
                                enum: ("x" | "y" | "z")[];
                              };
                              pivot: {
                                type: string;
                                minItems: number;
                                maxItems: number;
                                description: string;
                                items: {
                                  type: string;
                                  minimum: number;
                                  maximum: number;
                                };
                              };
                              phase: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              kind: {
                                type: string;
                                enum: string[];
                              };
                              amplitude: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              period: {
                                type: string;
                                minimum: number;
                                maximum: number;
                              };
                            };
                          } | {
                            type: string;
                            additionalProperties: boolean;
                            required: string[];
                            properties: {
                              axis: {
                                type: string;
                                enum: ("x" | "y" | "z")[];
                              };
                              pivot: {
                                type: string;
                                minItems: number;
                                maxItems: number;
                                description: string;
                                items: {
                                  type: string;
                                  minimum: number;
                                  maximum: number;
                                };
                              };
                              phase: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                              kind: {
                                type: string;
                                enum: string[];
                              };
                              speed: {
                                type: string;
                                minimum: number;
                                maximum: number;
                                description: string;
                              };
                            };
                          })[];
                        };
                      };
                    };
                  };
                } | {
                  type: string;
                  additionalProperties: boolean;
                  required: string[];
                  properties: {
                    part?: undefined;
                    changes?: undefined;
                    op: {
                      type: string;
                      enum: string[];
                    };
                    id: {
                      type: string;
                      pattern: string;
                    };
                  };
                })[];
              };
            };
          };
        } | {
          type: string;
          additionalProperties: boolean;
          required: string[];
          properties: {
            changes?: undefined;
            object?: undefined;
            partEdits?: undefined;
            op: {
              type: string;
              enum: string[];
            };
            id: {
              type: string;
              pattern: string;
            };
          };
        })[];
      };
    };
  };
};
export declare function readSceneId(value: unknown): string;
export declare function cloneSceneEnvironment(environment: SceneEnvironment): SceneEnvironment;
export declare function cloneSceneObject(object: SceneObject): SceneObject;
/** Saved and shared layouts contain live placements, including below the scene origin. */
export declare function readSceneLayout(value: unknown, catalog: readonly SceneAssetDescription[]): SceneLayout;
export declare function readScenePlan(value: unknown, catalog: readonly SceneAssetDescription[]): ScenePlan;
export declare function applyScenePlan(plan: ScenePlan, current: SceneLayout, catalog: readonly SceneAssetDescription[]): SceneLayout;
/** Reject only overlapping edits made while a planner was reading the scene. */
export declare function assertPlanFresh(plan: ScenePlan, before: SceneLayout, now: SceneLayout): void;
export declare function buildScenePrompt(request: SceneRequest): string;
//#endregion
export { MAX_SCENE_DISTANCE, MAX_SCENE_OBJECTS, MAX_SCENE_SCALE, MIN_SCENE_SCALE };