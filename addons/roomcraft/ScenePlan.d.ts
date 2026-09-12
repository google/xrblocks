import { type SceneAssetDescription, type SceneEnvironment, type SceneLayout, type SceneObject, type ScenePlan, type SceneRequest } from './SceneTypes';
export { MAX_SCENE_DISTANCE, MAX_SCENE_OBJECTS, MAX_SCENE_SCALE, MIN_SCENE_SCALE, } from './SceneTypes';
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
                    description: string;
                    items: {
                        type: string;
                        minimum: number;
                        maximum: number;
                    };
                    minItems: number;
                    maxItems: number;
                    type: string;
                };
                groundColor: {
                    type: string;
                    pattern: string;
                };
                timeOfDay: {
                    type: string;
                    enum: ("moonlight" | "sunrise" | "daylight" | "sunset")[];
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
                                        items: {
                                            type: string;
                                            minimum: number;
                                            maximum: number;
                                        };
                                        type: string;
                                        minItems: number;
                                        maxItems: number;
                                    };
                                    rotation: {
                                        type: string;
                                        minimum: number;
                                        maximum: number;
                                    };
                                    scale: {
                                        items: {
                                            type: string;
                                            minimum: number;
                                            maximum: number;
                                        };
                                        type: string;
                                        minItems: number;
                                        maxItems: number;
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
                                        items: {
                                            type: string;
                                            minimum: number;
                                            maximum: number;
                                        };
                                        type: string;
                                        minItems: number;
                                        maxItems: number;
                                    };
                                    rotation: {
                                        type: string;
                                        minimum: number;
                                        maximum: number;
                                    };
                                    scale: {
                                        items: {
                                            type: string;
                                            minimum: number;
                                            maximum: number;
                                        };
                                        type: string;
                                        minItems: number;
                                        maxItems: number;
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
                                                    enum: ("box" | "sphere" | "cylinder" | "cone" | "capsule" | "torus")[];
                                                };
                                                parent: {
                                                    type: string[];
                                                    description: string;
                                                };
                                                position: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
                                                };
                                                rotation: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
                                                };
                                                size: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
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
                                                            axis: {
                                                                type: string;
                                                                enum: ("x" | "y" | "z")[];
                                                            };
                                                            pivot: {
                                                                description: string;
                                                                items: {
                                                                    type: string;
                                                                    minimum: number;
                                                                    maximum: number;
                                                                };
                                                                type: string;
                                                                minItems: number;
                                                                maxItems: number;
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
                                                        };
                                                    } | {
                                                        type: string;
                                                        additionalProperties: boolean;
                                                        required: string[];
                                                        properties: {
                                                            speed: {
                                                                type: string;
                                                                minimum: number;
                                                                maximum: number;
                                                                description: string;
                                                            };
                                                            axis: {
                                                                type: string;
                                                                enum: ("x" | "y" | "z")[];
                                                            };
                                                            pivot: {
                                                                description: string;
                                                                items: {
                                                                    type: string;
                                                                    minimum: number;
                                                                    maximum: number;
                                                                };
                                                                type: string;
                                                                minItems: number;
                                                                maxItems: number;
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
                                        items: {
                                            type: string;
                                            minimum: number;
                                            maximum: number;
                                        };
                                        type: string;
                                        minItems: number;
                                        maxItems: number;
                                    };
                                    rotation: {
                                        type: string;
                                        minimum: number;
                                        maximum: number;
                                    };
                                    scale: {
                                        items: {
                                            type: string;
                                            minimum: number;
                                            maximum: number;
                                        };
                                        type: string;
                                        minItems: number;
                                        maxItems: number;
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
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    minItems: number;
                                                    maxItems: number;
                                                    type: string;
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
                                                kind: {
                                                    type: string;
                                                    enum: string[];
                                                };
                                                points: {
                                                    type: string;
                                                    items: {
                                                        items: {
                                                            type: string;
                                                            minimum: number;
                                                            maximum: number;
                                                        };
                                                        minItems: number;
                                                        maxItems: number;
                                                        type: string;
                                                    };
                                                };
                                                width: {
                                                    type: string;
                                                    minimum: number;
                                                    maximum: number;
                                                };
                                                size?: undefined;
                                                bankWidth?: undefined;
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
                                                kind: {
                                                    type: string;
                                                    enum: string[];
                                                };
                                                style: {
                                                    type: string;
                                                    enum: ("rock" | "tree" | "shrub" | "grass" | "flower")[];
                                                };
                                                size: {
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    minItems: number;
                                                    maxItems: number;
                                                    type: string;
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
                                                bankWidth?: undefined;
                                                points?: undefined;
                                                width?: undefined;
                                            };
                                        })[];
                                    };
                                };
                            })[];
                        };
                        id?: undefined;
                        changes?: undefined;
                        partEdits?: undefined;
                    };
                } | {
                    type: string;
                    additionalProperties: boolean;
                    required: string[];
                    properties: {
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
                                                enum: ("box" | "sphere" | "cylinder" | "cone" | "capsule" | "torus")[];
                                            };
                                            parent: {
                                                type: string[];
                                                description: string;
                                            };
                                            position: {
                                                description: string;
                                                items: {
                                                    type: string;
                                                    minimum: number;
                                                    maximum: number;
                                                };
                                                type: string;
                                                minItems: number;
                                                maxItems: number;
                                            };
                                            rotation: {
                                                description: string;
                                                items: {
                                                    type: string;
                                                    minimum: number;
                                                    maximum: number;
                                                };
                                                type: string;
                                                minItems: number;
                                                maxItems: number;
                                            };
                                            size: {
                                                description: string;
                                                items: {
                                                    type: string;
                                                    minimum: number;
                                                    maximum: number;
                                                };
                                                type: string;
                                                minItems: number;
                                                maxItems: number;
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
                                                        axis: {
                                                            type: string;
                                                            enum: ("x" | "y" | "z")[];
                                                        };
                                                        pivot: {
                                                            description: string;
                                                            items: {
                                                                type: string;
                                                                minimum: number;
                                                                maximum: number;
                                                            };
                                                            type: string;
                                                            minItems: number;
                                                            maxItems: number;
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
                                                    };
                                                } | {
                                                    type: string;
                                                    additionalProperties: boolean;
                                                    required: string[];
                                                    properties: {
                                                        speed: {
                                                            type: string;
                                                            minimum: number;
                                                            maximum: number;
                                                            description: string;
                                                        };
                                                        axis: {
                                                            type: string;
                                                            enum: ("x" | "y" | "z")[];
                                                        };
                                                        pivot: {
                                                            description: string;
                                                            items: {
                                                                type: string;
                                                                minimum: number;
                                                                maximum: number;
                                                            };
                                                            type: string;
                                                            minItems: number;
                                                            maxItems: number;
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
                                                items: {
                                                    type: string;
                                                    minimum: number;
                                                    maximum: number;
                                                };
                                                minItems: number;
                                                maxItems: number;
                                                type: string;
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
                                            kind: {
                                                type: string;
                                                enum: string[];
                                            };
                                            points: {
                                                type: string;
                                                items: {
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    minItems: number;
                                                    maxItems: number;
                                                    type: string;
                                                };
                                            };
                                            width: {
                                                type: string;
                                                minimum: number;
                                                maximum: number;
                                            };
                                            size?: undefined;
                                            bankWidth?: undefined;
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
                                            kind: {
                                                type: string;
                                                enum: string[];
                                            };
                                            style: {
                                                type: string;
                                                enum: ("rock" | "tree" | "shrub" | "grass" | "flower")[];
                                            };
                                            size: {
                                                items: {
                                                    type: string;
                                                    minimum: number;
                                                    maximum: number;
                                                };
                                                minItems: number;
                                                maxItems: number;
                                                type: string;
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
                                            bankWidth?: undefined;
                                            points?: undefined;
                                            width?: undefined;
                                        };
                                    })[];
                                };
                                name: {
                                    type: string;
                                    minLength: number;
                                    maxLength: number;
                                };
                                position: {
                                    items: {
                                        type: string;
                                        minimum: number;
                                        maximum: number;
                                    };
                                    type: string;
                                    minItems: number;
                                    maxItems: number;
                                };
                                rotation: {
                                    type: string;
                                    minimum: number;
                                    maximum: number;
                                };
                                scale: {
                                    items: {
                                        type: string;
                                        minimum: number;
                                        maximum: number;
                                    };
                                    type: string;
                                    minItems: number;
                                    maxItems: number;
                                };
                                color: {
                                    type: string;
                                    pattern: string;
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
                                                    enum: ("box" | "sphere" | "cylinder" | "cone" | "capsule" | "torus")[];
                                                };
                                                parent: {
                                                    type: string[];
                                                    description: string;
                                                };
                                                position: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
                                                };
                                                rotation: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
                                                };
                                                size: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
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
                                                            axis: {
                                                                type: string;
                                                                enum: ("x" | "y" | "z")[];
                                                            };
                                                            pivot: {
                                                                description: string;
                                                                items: {
                                                                    type: string;
                                                                    minimum: number;
                                                                    maximum: number;
                                                                };
                                                                type: string;
                                                                minItems: number;
                                                                maxItems: number;
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
                                                        };
                                                    } | {
                                                        type: string;
                                                        additionalProperties: boolean;
                                                        required: string[];
                                                        properties: {
                                                            speed: {
                                                                type: string;
                                                                minimum: number;
                                                                maximum: number;
                                                                description: string;
                                                            };
                                                            axis: {
                                                                type: string;
                                                                enum: ("x" | "y" | "z")[];
                                                            };
                                                            pivot: {
                                                                description: string;
                                                                items: {
                                                                    type: string;
                                                                    minimum: number;
                                                                    maximum: number;
                                                                };
                                                                type: string;
                                                                minItems: number;
                                                                maxItems: number;
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
                                                        };
                                                    })[];
                                                };
                                                id: {
                                                    type: string;
                                                    pattern: string;
                                                };
                                            };
                                        };
                                        id?: undefined;
                                        changes?: undefined;
                                    };
                                } | {
                                    type: string;
                                    additionalProperties: boolean;
                                    required: string[];
                                    properties: {
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
                                                    enum: ("box" | "sphere" | "cylinder" | "cone" | "capsule" | "torus")[];
                                                };
                                                parent: {
                                                    type: string[];
                                                    description: string;
                                                };
                                                position: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
                                                };
                                                rotation: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
                                                };
                                                size: {
                                                    description: string;
                                                    items: {
                                                        type: string;
                                                        minimum: number;
                                                        maximum: number;
                                                    };
                                                    type: string;
                                                    minItems: number;
                                                    maxItems: number;
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
                                                            axis: {
                                                                type: string;
                                                                enum: ("x" | "y" | "z")[];
                                                            };
                                                            pivot: {
                                                                description: string;
                                                                items: {
                                                                    type: string;
                                                                    minimum: number;
                                                                    maximum: number;
                                                                };
                                                                type: string;
                                                                minItems: number;
                                                                maxItems: number;
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
                                                        };
                                                    } | {
                                                        type: string;
                                                        additionalProperties: boolean;
                                                        required: string[];
                                                        properties: {
                                                            speed: {
                                                                type: string;
                                                                minimum: number;
                                                                maximum: number;
                                                                description: string;
                                                            };
                                                            axis: {
                                                                type: string;
                                                                enum: ("x" | "y" | "z")[];
                                                            };
                                                            pivot: {
                                                                description: string;
                                                                items: {
                                                                    type: string;
                                                                    minimum: number;
                                                                    maximum: number;
                                                                };
                                                                type: string;
                                                                minItems: number;
                                                                maxItems: number;
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
                                                        };
                                                    })[];
                                                };
                                            };
                                        };
                                        part?: undefined;
                                    };
                                } | {
                                    type: string;
                                    additionalProperties: boolean;
                                    required: string[];
                                    properties: {
                                        op: {
                                            type: string;
                                            enum: string[];
                                        };
                                        id: {
                                            type: string;
                                            pattern: string;
                                        };
                                        part?: undefined;
                                        changes?: undefined;
                                    };
                                })[];
                            };
                        };
                        object?: undefined;
                    };
                } | {
                    type: string;
                    additionalProperties: boolean;
                    required: string[];
                    properties: {
                        op: {
                            type: string;
                            enum: string[];
                        };
                        id: {
                            type: string;
                            pattern: string;
                        };
                        object?: undefined;
                        changes?: undefined;
                        partEdits?: undefined;
                    };
                })[];
            };
        };
    };
};
export declare function readSceneId(value: unknown): string;
export declare function cloneSceneEnvironment(environment: SceneEnvironment): SceneEnvironment;
export declare function cloneSceneObject(object: SceneObject): SceneObject;
export declare function readSceneLayout(value: unknown, catalog: readonly SceneAssetDescription[]): SceneLayout;
export declare function readScenePlan(value: unknown, catalog: readonly SceneAssetDescription[]): ScenePlan;
export declare function applyScenePlan(plan: ScenePlan, current: SceneLayout, catalog: readonly SceneAssetDescription[]): SceneLayout;
/** Reject only overlapping edits made while a planner was reading the scene. */
export declare function assertPlanFresh(plan: ScenePlan, before: SceneLayout, now: SceneLayout): void;
export declare function buildScenePrompt(request: SceneRequest): string;
