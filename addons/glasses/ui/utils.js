function isSignal(value) {
    return (value != null &&
        typeof value === 'object' &&
        'value' in value &&
        value.brand === Symbol.for('preact-signals'));
}
function extractValue(value) {
    const valueOrInitial = isSignal(value) ? value.value : value;
    return valueOrInitial !== 'initial' ? valueOrInitial : undefined;
}

export { extractValue, isSignal };
