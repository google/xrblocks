import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import { useState, useEffect } from 'react';

const API_KEY_STORAGE_KEY = 'gemini-api-key'

export function DocsIFrame({ template, sample, demo, requiresApiKey = false }) {
    const { siteConfig } = useDocusaurusContext();
    const [apiKey, setApiKey] = useState('');
    const [showKeyInput, setShowKeyInput] = useState(requiresApiKey);
    const [keyPresent, setKeyPresent] = useState(!requiresApiKey);

    // Build the base src (without any key) so we can append the key from
    // either the parent page or the user input at runtime (client-side).
    const buildBaseSrc = () => {
        let s = siteConfig.customFields.xrblocksBaseUrl;
        if (template) {
            s = s + 'templates/' + template;
        } else if (sample) {
            s = s + 'samples/' + sample;
        } else if (demo) {
            s = s + 'demos/' + demo;
        } else {
            console.warn("DocsIFrame: No 'template', 'sample', or 'demo' prop provided. IFrame will be empty.");
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

        // If the user typed a key in the overlay, prefer that.
        if (apiKey && requiresApiKey) {
            keyToUse = apiKey;
        } else if (typeof window !== 'undefined') {
            try {
                const parentParams = new URLSearchParams(window.location.search);
                if (parentParams.has('key')) {
                    keyToUse = parentParams.get('key');
                }
                if (parentParams.has('geminiKey64')) {
                    keyToUse = atob(encodedKey);
                }
            } catch (e) {
                // ignore
            }
        }

        if (keyToUse) {
            const separator = base.includes('?') ? '&' : '?';
            setIframeSrc(base + separator + 'key=' + encodeURIComponent(keyToUse));
            setKeyPresent(true);
            window.localStorage.setItem(API_KEY_STORAGE_KEY, keyToUse);
            if (requiresApiKey) setShowKeyInput(false);
        } else {
            setIframeSrc(base);
            setKeyPresent(false);
        }
    }, [apiKey, template, sample, demo, requiresApiKey, siteConfig]);

    return (
        <div style={{ position: 'relative', width: '100%', minHeight: '30rem' }}>
            {showKeyInput && (
                <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <div style={{
                        background: 'rgba(0, 0, 0, 0.9)',
                        padding: '30px',
                        borderRadius: '12px',
                        maxWidth: '400px',
                        width: '90%',
                        border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <input
                                type="password"
                                placeholder="Enter API Key"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                onKeyPress={(e) => {
                                    if (e.key === 'Enter') {
                                        if (apiKey.trim()) {
                                            setShowKeyInput(false);
                                            setKeyPresent(true);
                                        }
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
                                    outline: 'none'
                                }}
                                autoFocus
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Only render the iframe when a key is present if the template requires an API key. */}
            {(!requiresApiKey || keyPresent) && (
                <iframe
                    src={iframeSrc}
                    style={{ width: '100%', minHeight: '30rem', border: 'none', borderRadius: '8px' }}
                    allow="xr-spatial-tracking;microphone;camera"
                />
            )}
        </div>
    );
}
