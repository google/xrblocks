import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import {useEffect, useState} from 'react';

export function DocsSource({
  template,
  sample,
  demo,
  filename = 'main.js',
}) {
  const {siteConfig} = useDocusaurusContext();
  const [source, setSource] = useState('');
  const baseUrl = siteConfig.customFields.xrblocksBaseUrl;

  useEffect(() => {
    const collection = template
      ? `templates/${template}`
      : sample
        ? `samples/${sample}`
        : demo
          ? `demos/${demo}`
          : '';

    if (!collection) {
      console.warn(
        "DocsSource: No 'template', 'sample', or 'demo' prop provided."
      );
      setSource('');
      return;
    }

    const controller = new AbortController();
    fetch(`${baseUrl}${collection}/${filename}`, {signal: controller.signal})
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load ${filename}: ${response.status}`);
        }
        return response.text();
      })
      .then(setSource)
      .catch((error) => {
        if (error.name !== 'AbortError') console.error(error);
      });

    return () => controller.abort();
  }, [baseUrl, demo, filename, sample, template]);

  const language = filename.endsWith('.ts') ? 'ts' : 'js';
  return (
    <CodeBlock language={language} title={filename} showLineNumbers>
      {source}
    </CodeBlock>
  );
}
