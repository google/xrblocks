import { AnimationHandler } from "./AnimationHandler.js";

const defaultOptions = {
    oscillationAmplitude: 0.2,
    oscillationFrequencyX: 0.2, // Oscillations per second for X
    oscillationFrequencyZ: 0.3 // Oscillations per second for Z
};

export class BalloonsAnimationHandler extends AnimationHandler {
    constructor(data, isDebug) {
        super(data, isDebug);
        this.animationStartTime = performance.now();
        this.animationDuration = 3000; // Default = 3 seconds
        this.totalVerticalDistance = 0.15;
    }

    init(core, panel, options = {}) {
        super.init(core, panel, {...defaultOptions, ...options});
    }

    onBeforePlay() {
        this.animationStartTime = performance.now();

        for (let i = 0; i < this.data.length; ++i) {
            let original = this.data[i].position;
            if (original) {
                this.animationViews[i].modelView.position.copy({
                    x: original.x + (Math.random() - 0.5),
                    y: original.y + (Math.random() - 0.5),
                    z: original.z + (Math.random() - 0.5),
                });
            }

            // update binded data
            this.animationViews[i].updateOptions({
                oscillationAmplitude : defaultOptions.oscillationAmplitude + (Math.random() - 0.5) * 0.2,
                oscillationFrequencyX : defaultOptions.oscillationFrequencyX + (Math.random() - 0.5) * 0.2,
                oscillationFrequencyZ : defaultOptions.oscillationFrequencyZ + (Math.random() - 0.5) * 0.2
            })
            
        }
    }

    onBeforeUpdate() {
        const currentTime = performance.now();
        const elapsedTime = currentTime - this.animationStartTime;
        const progress = Math.min(1, elapsedTime / this.animationDuration); // Normalized progress (0 to 1)

        this.animationViews.forEach(viewData => {
            const mv = viewData.modelView;
            const startY = mv.position.y || 0; // Use current Y if animation restarts

            const opt = viewData.options;

            // Vertical movement
            mv.position.y = startY + this.totalVerticalDistance * progress;

            // Horizontal oscillation
            const time = currentTime * 0.001; // Convert milliseconds to seconds
            mv.position.x += Math.sin(time * opt.oscillationFrequencyX * Math.PI * 2) * opt.oscillationAmplitude * progress;
            mv.position.z += Math.cos(time * opt.oscillationFrequencyZ * Math.PI * 2) * opt.oscillationAmplitude * progress;
        });
    }
}
