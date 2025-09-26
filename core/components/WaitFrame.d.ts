export declare class WaitFrame {
    private callbacks;
    /**
     * Executes all registered callbacks and clears the list.
     */
    onFrame(): void;
    /**
     * Wait for the next frame.
     */
    waitFrame(): Promise<void>;
}
