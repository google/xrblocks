import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export function DocsIFrame({template, sample, demo}) {
  const {siteConfig} = useDocusaurusContext();
  let src = siteConfig.customFields.xrblocksBaseUrl;

  if (template) {
    src += `templates/${template}`;
  } else if (sample) {
    src += `samples/${sample}`;
  } else if (demo) {
    src += `demos/${demo}`;
  } else {
    console.warn(
      "DocsIFrame: No 'template', 'sample', or 'demo' prop provided."
    );
  }

  return (
    <iframe
      src={src}
      style={{
        width: '100%',
        minHeight: '30rem',
        border: 'none',
        borderRadius: '8px',
      }}
      allow="xr-spatial-tracking; microphone; camera"
    />
  );
}
