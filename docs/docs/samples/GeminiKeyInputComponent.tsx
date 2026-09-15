import styles from './SamplesIFrame.module.css';

const defaultApiKeySetupInstructions = (
  <div>
    <h3>Set Up Your API Key</h3>
    <p>
      To view this sample, you'll need a Gemini API key. You can create one for
      free at{' '}
      <a href="https://aistudio.google.com/app/apikey" target="blank">
        Google AI Studio
      </a>
      .
    </p>

    <h3>How to Use Your Key</h3>
    <p>To use the demo, you can add your API key to the input below.</p>
  </div>
);

export interface GeminiKeyInputComponentProps {
  apiKey: string;
  setApiKey: (_: string) => void;
  submitApiKey: (_: string) => void;
  skip: () => void;
  couldSkip?: boolean;
  apiSetupInstructions?: React.ReactNode;
}

export function GeminiKeyInputComponent({
  apiKey,
  setApiKey,
  submitApiKey,
  skip,
  couldSkip,
  apiSetupInstructions = defaultApiKeySetupInstructions,
}: GeminiKeyInputComponentProps) {
  return (
    <div className={styles.keyContainer}>
      {apiSetupInstructions}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.9)',
          padding: '30px',
          borderRadius: '12px',
          maxWidth: '400px',
          width: '90%',
          border: '1px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
          <input
            type="password"
            placeholder="Enter API Key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const key = apiKey.trim();
                if (key) submitApiKey(key);
              }
            }}
            style={{
              flex: 1,
              padding: '12px 16px',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '16px',
              outline: 'none',
            }}
            autoFocus
          />
          {couldSkip && (
            <button
              onClick={skip}
              style={{
                padding: '12px 16px',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              Skip
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
