import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {useState, useEffect} from 'react';
import styles from './SamplesIFrame.module.css';
import {
  GeminiKeyInputComponent,
  type GeminiKeyInputComponentProps,
} from './GeminiKeyInputComponent';

const API_KEY_STORAGE_KEY = 'gemini-api-key';

export function SamplesIFrame({
  sample,
  demo,
  link,
  requiresApiKey = false,
  couldSkip = false,
  KeyInputComponent = GeminiKeyInputComponent,
}: {
  sample?: string;
  demo?: string;
  link: string;
  requiresApiKey?: boolean;
  couldSkip?: boolean;
  KeyInputComponent?: React.ComponentType<GeminiKeyInputComponentProps>;
}) {
  const {siteConfig} = useDocusaurusContext();
  const [apiKey, setApiKey] = useState<string>('');
  const [submittedApiKey, setSubmittedApiKey] = useState<string | null>(null);
  const [skipRequested, setSkipRequested] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState<boolean>(requiresApiKey);
  const [keyPresent, setKeyPresent] = useState<boolean>(!requiresApiKey);

  const buildBaseSrc = () => {
    let s = siteConfig.customFields.xrblocksBaseUrl as string;
    if (sample) {
      s = s + 'samples/' + sample;
    } else if (demo) {
      s = s + 'demos/' + demo;
    } else {
      console.warn(
        "DocsIFrame: No 'template', 'sample', or 'demo' prop provided. IFrame will be empty."
      );
    }
    return s;
  };

  const [iframeSrc, setIframeSrc] = useState(() => buildBaseSrc());

  useEffect(() => {
    const base = buildBaseSrc();
    let keyToUse = null;

    if (typeof window !== 'undefined') {
      const storedKey = window.localStorage.getItem(API_KEY_STORAGE_KEY);
      if (storedKey) {
        keyToUse = storedKey;
      }
    }

    if (typeof window !== 'undefined') {
      try {
        const parentParams = new URLSearchParams(window.location.search);
        if (parentParams.has('key')) {
          keyToUse = parentParams.get('key');
        }
        if (parentParams.has('geminiKey64')) {
          keyToUse = atob(parentParams.get('geminiKey64'));
        }
      } catch (e) {
        // ignore
      }
    }

    // A submitted key takes priority. Draft input must not start the iframe.
    if (submittedApiKey && requiresApiKey) {
      keyToUse = submittedApiKey;
    }

    if (keyToUse) {
      const separator = base.includes('?') ? '&' : '?';
      setIframeSrc(base + separator + 'key=' + encodeURIComponent(keyToUse));
      setKeyPresent(true);
      window.localStorage.setItem(API_KEY_STORAGE_KEY, keyToUse);
      if (requiresApiKey) setShowKeyInput(false);
    } else if (skipRequested) {
      setIframeSrc(base);
      setKeyPresent(true);
      setShowKeyInput(false);
    } else {
      setIframeSrc(base);
      setKeyPresent(false);
    }
  }, [
    submittedApiKey,
    skipRequested,
    sample,
    demo,
    requiresApiKey,
    siteConfig,
  ]);

  return (
    <div className={styles.iframeOuterContainer}>
      {showKeyInput && (
        <KeyInputComponent
          apiKey={apiKey}
          setApiKey={setApiKey}
          submitApiKey={setSubmittedApiKey}
          skip={() => setSkipRequested(true)}
          couldSkip={couldSkip}
        />
      )}

      {/* Only render the iframe when a key is present if the template requires an API key. */}
      {(!requiresApiKey || keyPresent) && (
        <div className={styles.iframeContainer}>
          <iframe
            src={iframeSrc}
            className={styles.samplesIframe}
            allow="xr-spatial-tracking;microphone;camera;display-capture"
          ></iframe>

          <div className={styles.codeButtonContainer}>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.codeButton}
              title="View Code on GitHub"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={styles.codeIcon}
              >
                <polyline points="16 18 22 12 16 6"></polyline>
                <polyline points="8 6 2 12 8 18"></polyline>
              </svg>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
