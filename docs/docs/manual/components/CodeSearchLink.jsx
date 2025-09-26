import useDocusaurusContext from '@docusaurus/useDocusaurusContext';

export function CodeSearchLink({ path }) {
    const { siteConfig } = useDocusaurusContext();
    const { codeSearchBaseUrl, codeSearchLinkSuffix } = siteConfig.customFields;
    const url = `${codeSearchBaseUrl}${path}${codeSearchLinkSuffix}`;
    return <a href={url} target='_blank'>{path}</a>;
};
