import {AI} from '../ai/AI';
import {GeminiResponse} from '../ai/AITypes';
import {Gemini} from '../ai/Gemini';

import {Context} from './Context';
import {Memory} from './Memory';
import {Tool} from './Tool';

/**
 * An agent that can use an AI to reason and execute tools.
 */
export class Agent {
  static dependencies = {};
  ai: AI;
  tools: Tool[];
  memory: Memory;
  contextBuilder: Context;

  constructor(ai: AI, tools: Tool[] = [], instruction: string = '') {
    this.ai = ai;
    this.tools = tools;
    this.memory = new Memory();
    this.contextBuilder = new Context(instruction);
  }

  /**
   * Starts the agent's reasoning loop with an initial prompt.
   * @param prompt - The initial prompt from the user.
   * @returns The final text response from the agent.
   */
  async start(prompt: string): Promise<string> {
    this.memory.addShortTerm({role: 'user', content: prompt});

    if (!this.ai.isAvailable()) {
      await this.ai.init({aiOptions: this.ai.options});
    }

    return this.run();
  }

  /**
   * The main reasoning and action loop of the agent for non-live mode.
   * It repeatedly builds context, queries the AI, and executes tools
   * until a final text response is generated.
   */
  private async run(): Promise<string> {
    while (true) {
      const context = this.contextBuilder.build(this.memory, this.tools);

      const response: GeminiResponse|null =
          await (this.ai.model as Gemini)
              .query({type: 'text', text: context}, this.tools);

      this.memory.addShortTerm({role: 'ai', content: JSON.stringify(response)});

      if (response?.toolCall) {
        console.log(`Executing tool: ${response.toolCall.name}`);
        const tool = this.findTool(response.toolCall.name);

        if (tool) {
          const result = await tool.execute(response.toolCall.args);
          this.memory.addShortTerm(
              {role: 'tool', content: JSON.stringify(result)});
        } else {
          const errorMsg = `Error: Tool "${response.toolCall.name}" not found.`;
          console.error(errorMsg);
          this.memory.addShortTerm({role: 'tool', content: errorMsg});
        }
      } else if (response?.text) {
        console.log(`Final Response: ${response.text}`);
        return response.text;
      } else {
        const finalResponse = 'The AI did not provide a valid response.';
        console.error(finalResponse);
        return finalResponse;
      }
    }
  }

  findTool(name: string): Tool|undefined {
    return this.tools.find(tool => tool.name === name);
  }
}
