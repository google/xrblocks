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

      this.shadowRoot!.innerHTML = `
        <style>${BrowserApiKeyPromptElement.styles}</style>
        <dialog aria-label="${modelName} API key">
          <form method="dialog" class="card">
            <p class="copy">
              Enter a ${displayName} key for this local prototype.
              <a href="${keyUrl}" target="_blank" rel="noopener">Get an API key</a>
            </p>
            <label>
              API key
              <input name="apiKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your key" />
            </label>
            <p class="note">Kept only until this page reloads or closes. Use a server-managed key in production.</p>
            <p class="status" data-status>${configuredKey ? 'A key is ready to use.' : ''}</p>
            <menu class="actions">
              <button class="button primary ${configuredKey ? '' : 'wide'}" value="session">Use for this session</button>
              ${configuredKey ? '<button class="button" value="configured">Use available key</button>' : ''}
              <button class="button wide" value="skip">Continue without AI</button>
            </menu>
            ${configuredKey ? '<button class="clear" value="clear">Clear key</button>' : ''}
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
        width: min(430px, calc(100vw - 32px));
        max-width: none;
        padding: 0;
        border: 0;
        border-radius: 24px;
        overflow: hidden;
        color: #f7f8fc;
        background: transparent;
        box-shadow: 0 28px 90px rgba(0, 0, 0, 0.55);
      }
      dialog::backdrop {
        background: rgba(3, 6, 12, 0.72);
        -webkit-backdrop-filter: blur(14px);
        backdrop-filter: blur(14px);
      }
      .card {
        display: grid;
        gap: 20px;
        box-sizing: border-box;
        padding: 28px;
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 24px;
        background:
          radial-gradient(circle at 90% 0%, rgba(150, 126, 255, 0.2), transparent 42%),
          linear-gradient(145deg, rgba(24, 30, 42, 0.98), rgba(12, 16, 24, 0.98));
        color: #f7f8fc;
        font: 14px/1.45 'Google Sans', 'Segoe UI', system-ui, sans-serif;
      }
      .copy {
        margin: -4px 0 0;
        color: #bcc5d5;
      }
      .copy a {
        color: #d4e8ff;
        text-decoration: none;
      }
      .copy a:hover { text-decoration: underline; }
      label {
        display: grid;
        gap: 8px;
        color: #eef1f7;
        font-size: 13px;
        font-weight: 550;
      }
      input {
        width: 100%;
        box-sizing: border-box;
        padding: 13px 14px;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 12px;
        outline: none;
        background: rgba(2, 5, 10, 0.54);
        color: #fff;
        font: 14px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
        transition: border-color 140ms ease, box-shadow 140ms ease;
      }
      input::placeholder { color: #697489; }
      input:focus {
        border-color: #b9c9ff;
        box-shadow: 0 0 0 3px rgba(185, 201, 255, 0.14);
      }
      .note {
        margin: -10px 0 0;
        color: #8792a6;
        font-size: 12px;
      }
      .status {
        min-height: 20px;
        margin: -8px 0 0;
        color: #aeb9cd;
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
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.06);
        color: #eef1f7;
        font: 550 14px/1 'Google Sans', 'Segoe UI', system-ui, sans-serif;
        text-transform: none;
        cursor: pointer;
      }
      .button:hover { background: rgba(255, 255, 255, 0.11); }
      .primary {
        border-color: transparent;
        background: linear-gradient(135deg, #d4e8ff, #d0a8e3);
        color: #11141b;
      }
      .primary:hover {
        background: linear-gradient(135deg, #e2f0ff, #dbb9ea);
      }
      .wide { grid-column: 1 / -1; }
      .clear {
        justify-self: center;
        padding: 0;
        border: 0;
        background: none;
        color: #8792a6;
        font: 12px/1.4 'Google Sans', 'Segoe UI', system-ui, sans-serif;
        text-transform: none;
        cursor: pointer;
      }
      .clear:hover {
        color: #d6dce8;
        text-decoration: underline;
      }
      @media (max-width: 480px) {
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
