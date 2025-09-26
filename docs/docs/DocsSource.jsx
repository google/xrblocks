import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import { useState, useEffect } from 'react';

export function DocsSource({
  template,
  sample,
  demo,
  filename = "main.js",
}) {
  const { siteConfig } = useDocusaurusContext();
  const [source, setSource] = useState("");
  useEffect(() => {
    let src = siteConfig.customFields.xrblocksBaseUrl
    if (template) {
      src = src + "templates/" + template + "/" + filename;
    } else if (sample) {
      src = src + "samples/" + sample + "/" + filename;
    } else if (demo) {
      src = src + "demos/" + demo + "/" + filename;
    } else {
      console.warn("DocsSource: No 'template', 'sample', or 'demo' prop provided. Source will be empty.");
    }

    fetch(src).then(code => code.text()).then(text => setSource(text)).catch(err => console.error(err));
  });
  return <CodeBlock language="js" title={filename} showLineNumbers>{source}</CodeBlock>;
}
