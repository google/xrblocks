const PROMPT_TAG = 'xb-ai-key-prompt';
const sessionApiKeys = new Map<string, string>();

type ApiKeyPromptElement = HTMLElement & {
  open(modelName: string, configuredKey: string | null): Promise<string | null>;
};

export function getSessionApiKey(modelName: string): string | null {
  return sessionApiKeys.get(modelName) ?? null;
}

export function setSessionApiKey(modelName: string, apiKey: string) {
  sessionApiKeys.set(modelName, apiKey);
}

export function clearSessionApiKey(modelName: string) {
  sessionApiKeys.delete(modelName);
}

function defineApiKeyPromptElement() {
  if (customElements.get(PROMPT_TAG)) return;

  class BrowserApiKeyPromptElement extends HTMLElement {
    private dialog?: HTMLDialogElement;
    private resolveResult?: (key: string | null) => void;
    private selectedConfiguredKey: string | null = null;

    constructor() {
      super();
      this.attachShadow({mode: 'open'});
    }

    open(
      modelName: string,
      configuredKey: string | null
    ): Promise<string | null> {
      this.selectedConfiguredKey = configuredKey;
      this.render(modelName, configuredKey);
      this.bindEvents(modelName);
      this.dialog!.showModal?.();
      if (!this.dialog!.open) this.dialog!.setAttribute('open', '');
      this.input.focus();

      return new Promise((resolve) => {
        this.resolveResult = resolve;
      });
    }

    private render(modelName: string, configuredKey: string | null) {
      const displayName = modelName === 'openai' ? 'OpenAI' : 'Gemini';
      const keyUrl =
        modelName === 'openai'
          ? 'https://platform.openai.com/api-keys'
          : 'https://aistudio.google.com/app/apikey';
      const keySourceName =
        modelName === 'openai' ? 'the OpenAI platform' : 'Google AI Studio';

      this.shadowRoot!.innerHTML = `
        <style>${BrowserApiKeyPromptElement.styles}</style>
        <dialog aria-label="${modelName} API key">
          <form method="dialog" class="prompt">
            <header>
              <h2>Set Up Your API Key</h2>
              <p>
                To use AI in this prototype, enter a ${displayName} API key.
                You can create one at
                <a href="${keyUrl}" target="_blank" rel="noopener">${keySourceName}</a>.
              </p>
            </header>
            <div class="card">
              <label>
                API key
                <input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Enter API Key" />
              </label>
              <p class="note">The key stays in this page session only. Use a server-managed key in production.</p>
              <p class="status" data-status>${configuredKey ? 'An available key is ready to use.' : ''}</p>
              <menu class="actions">
                <button class="button primary ${configuredKey ? '' : 'wide'}" value="session">Use for this session</button>
                ${configuredKey ? '<button class="button" value="configured">Use available key</button>' : ''}
                <button class="button wide" value="skip">Continue without AI</button>
              </menu>
              ${configuredKey ? '<button class="clear" value="clear">Clear available key</button>' : ''}
            </div>
          </form>
        </dialog>`;
      this.dialog = this.shadowRoot!.querySelector('dialog')!;
    }

    private bindEvents(modelName: string) {
      const form = this.shadowRoot!.querySelector('form')!;
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const action = (event.submitter as HTMLButtonElement | null)?.value;
        if (action === 'session') {
          const apiKey = this.input.value.trim();
          if (!apiKey) {
            this.status.textContent =
              'Enter an API key or continue without one.';
            this.input.focus();
            return;
          }
          setSessionApiKey(modelName, apiKey);
          this.finish(apiKey);
          return;
        }
        if (action === 'clear') {
          clearSessionApiKey(modelName);
          this.selectedConfiguredKey = null;
          this.input.value = '';
          this.status.textContent = 'The session key was cleared.';
          this.button('configured')?.remove();
          this.button('clear')?.remove();
          this.button('session')?.classList.add('wide');
          return;
        }
        this.finish(
          action === 'configured' ? this.selectedConfiguredKey : null
        );
      });
      this.dialog!.addEventListener('cancel', (event) => {
        event.preventDefault();
        this.finish(null);
      });
    }

    private get input() {
      return this.shadowRoot!.querySelector<HTMLInputElement>(
        'input[name="apiKey"]'
      )!;
    }

    private get status() {
      return this.shadowRoot!.querySelector<HTMLElement>('[data-status]')!;
    }

    private button(value: string) {
      return this.shadowRoot!.querySelector<HTMLButtonElement>(
        `button[value="${value}"]`
      );
    }

    private finish(key: string | null) {
      this.dialog?.close?.();
      this.remove();
      this.resolveResult?.(key);
      this.resolveResult = undefined;
    }

    private static readonly styles = `
      dialog {
        width: min(560px, calc(100vw - 32px));
        max-width: none;
        padding: 0;
        border: 0;
        overflow: visible;
        color: #fff;
        background: transparent;
      }
      dialog::backdrop {
        background: #111;
      }
      .prompt {
        display: grid;
        gap: 24px;
        box-sizing: border-box;
        color: #fff;
        font: 16px/1.5 'Google Sans', 'Segoe UI', system-ui, sans-serif;
      }
      header {
        text-align: center;
      }
      h2 {
        margin: 0 0 12px;
        color: #fff;
        font-size: 28px;
        line-height: 1.2;
      }
      header p {
        margin: 0;
        color: rgba(255, 255, 255, 0.78);
      }
      a {
        color: #fff;
        text-decoration: underline;
        text-underline-offset: 3px;
      }
      .card {
        display: grid;
        gap: 18px;
        box-sizing: border-box;
        width: 100%;
        padding: 30px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        background: rgba(0, 0, 0, 0.9);
      }
      label {
        display: grid;
        gap: 8px;
        color: #fff;
        font-size: 14px;
        font-weight: 600;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: 12px 16px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        outline: none;
        background: rgba(255, 255, 255, 0.1);
        color: #fff;
        font: 16px/1.2 'Google Sans', 'Segoe UI', system-ui, sans-serif;
        transition: border-color 140ms ease, box-shadow 140ms ease;
      }
      input::placeholder { color: rgba(255, 255, 255, 0.5); }
      input:focus {
        border-color: #fff;
        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
      }
      .note {
        margin: -10px 0 0;
        color: rgba(255, 255, 255, 0.58);
        font-size: 12px;
      }
      .status {
        min-height: 20px;
        margin: -8px 0 0;
        color: rgba(255, 255, 255, 0.72);
        font-size: 12px;
      }
      .actions {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
        margin: 0;
        padding: 0;
      }
      .button {
        min-height: 44px;
        padding: 10px 14px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.12);
        color: #fff;
        font: 600 14px/1 'Google Sans', 'Segoe UI', system-ui, sans-serif;
        text-transform: none;
        cursor: pointer;
      }
      .button:hover { background: rgba(255, 255, 255, 0.2); }
      .primary {
        border-color: #fff;
        background: #fff;
        color: #11141b;
      }
      .primary:hover {
        background: #e8e8e8;
      }
      .wide { grid-column: 1 / -1; }
      .clear {
        justify-self: center;
        padding: 0;
        border: 0;
        background: none;
        color: rgba(255, 255, 255, 0.58);
        font: 12px/1.4 'Google Sans', 'Segoe UI', system-ui, sans-serif;
        text-transform: none;
        cursor: pointer;
      }
      .clear:hover {
        color: #fff;
        text-decoration: underline;
      }
      @media (max-width: 480px) {
        h2 { font-size: 24px; }
        .card { padding: 22px; }
        .actions { grid-template-columns: 1fr; }
        .wide { grid-column: auto; }
      }`;
  }

  customElements.define(PROMPT_TAG, BrowserApiKeyPromptElement);
}

/** Shows a dependency-free browser dialog for local AI prototypes. */
export function promptForApiKey(
  modelName: string,
  configuredKey: string | null
): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(configuredKey);

  defineApiKeyPromptElement();
  const prompt = document.createElement(PROMPT_TAG) as ApiKeyPromptElement;
  document.body.append(prompt);
  return prompt.open(modelName, configuredKey);
}
