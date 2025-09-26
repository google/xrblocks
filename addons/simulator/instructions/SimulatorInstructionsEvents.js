class SimulatorInstructionsNextEvent extends Event {
    static { this.type = 'simulatorInstructionsNextEvent'; }
    constructor() {
        super(SimulatorInstructionsNextEvent.type, { bubbles: true, composed: true });
    }
}
class SimulatorInstructionsCloseEvent extends Event {
    static { this.type = 'simulatorInstructionsCloseEvent'; }
    constructor() {
        super(SimulatorInstructionsCloseEvent.type, { bubbles: true, composed: true });
    }
}

export { SimulatorInstructionsCloseEvent, SimulatorInstructionsNextEvent };
