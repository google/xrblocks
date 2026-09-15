export class TranscriptionManager {
  constructor(responseDisplay) {
    this.responseDisplay = responseDisplay;
    this.currentInputText = '';
    this.currentOutputText = '';
    this.conversationHistory = [];
  }

  handleInputTranscription(text) {
    if (!text) return;
    this.currentInputText += text;
    this.updateLiveDisplay();
  }

  handleOutputTranscription(text) {
    if (!text) return;
    this.currentOutputText += text;
    this.updateLiveDisplay();
  }

  finalizeTurn() {
    if (this.currentInputText.trim()) {
      this.conversationHistory.push({
        speaker: 'You',
        text: this.currentInputText.trim(),
      });
    }
    if (this.currentOutputText.trim()) {
      this.conversationHistory.push({
        speaker: 'AI',
        text: this.currentOutputText.trim(),
      });
    }
    this.currentInputText = '';
    this.currentOutputText = '';
    this.updateFinalDisplay();
  }

  updateLiveDisplay() {
    let displayText = '';
    for (const entry of this.conversationHistory.slice(-2)) {
      displayText += `${entry.speaker}: ${entry.text}\n\n`;
    }
    if (this.currentInputText.trim()) {
      displayText += `You: ${this.currentInputText}`;
    }
    if (this.currentOutputText.trim()) {
      if (this.currentInputText.trim()) displayText += '\n\n';
      displayText += `AI: ${this.currentOutputText}`;
    }
    this.responseDisplay?.setText(displayText);
  }

  updateFinalDisplay() {
    let displayText = '';
    for (const entry of this.conversationHistory) {
      displayText += `${entry.speaker}: ${entry.text}\n\n`;
    }
    this.responseDisplay?.setText(displayText);
  }

  clear() {
    this.currentInputText = '';
    this.currentOutputText = '';
    this.conversationHistory = [];
  }

  addText(text) {
    this.responseDisplay?.addText(text + '\n\n');
  }

  setText(text) {
    this.responseDisplay?.setText(text);
  }
}
