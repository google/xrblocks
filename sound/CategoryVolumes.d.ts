export declare enum VolumeCategory {
    music = "music",
    sfx = "sfx",
    speech = "speech",
    ui = "ui"
}
export declare class CategoryVolumes {
    isMuted: boolean;
    masterVolume: number;
    volumes: Record<VolumeCategory, number>;
    getCategoryVolume(category: string): number;
    getEffectiveVolume(category: string, specificVolume?: number): number;
}
