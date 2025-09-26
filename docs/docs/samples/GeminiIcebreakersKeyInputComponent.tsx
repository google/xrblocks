import {
  GeminiKeyInputComponentProps,
  GeminiKeyInputComponent,
} from "./GeminiKeyInputComponent";

const apiSetupInstructions = (
  <div>
    <h3>Set Up Your API Key</h3>
    <p>
      To view this sample with Gemini Live on desktop, you'll need a Gemini API
      key. You can create one for free at{" "}
      <a href="https://aistudio.google.com/app/apikey" target="blank">
        Google AI Studio
      </a>
      .
    </p>

    <h3>How to Use Your Key</h3>
    <p>
      To use the demo, you can add your API key to the input below.
      Alternatively, you can Skip to just view the UIs on desktops or manually
      trigger Gemini Live on an Android XR device with screen sharing.
    </p>
  </div>
);

export function GeminiIcebreakersKeyInputComponent(
  props: GeminiKeyInputComponentProps
) {
  return (
    <GeminiKeyInputComponent
      {...props}
      apiSetupInstructions={apiSetupInstructions}
    ></GeminiKeyInputComponent>
  );
}
