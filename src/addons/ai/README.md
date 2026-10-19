# AI addon

`GeminiManager` manages Gemini Live audio and camera input. `SkyboxAgent` uses Gemini Live for conversation and a separately supplied AI SDK image model for skyboxes.

```js
import * as xb from 'xrblocks';
import {SkyboxAgent} from 'xrblocks/addons/ai/index.js';

const options = new xb.Options();
options.enableAI();
options.ai.promptForApiKey = true;
await xb.init(options);

const google = await xb.createGoogle({promptForApiKey: true});
const agent = new SkyboxAgent(
  xb.core.ai,
  xb.core.scene,
  google.image('gemini-3.1-flash-image-preview')
);
await xb.core.sound.enableAudio();
await agent.startLiveSession({
  onmessage: async (message) => {
    for (const call of message.toolCall?.functionCalls ?? []) {
      const tool = agent.findTool(call.name);
      if (!tool) continue;
      const result = await tool.execute(call.args);
      await agent.sendToolResponse({
        functionResponses: [
          SkyboxAgent.createToolResponse(call.id, call.name, result),
        ],
      });
    }
  },
});
```

Stop the agent with `await agent.stopLiveSession()`.
