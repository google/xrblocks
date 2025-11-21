import { useState, useEffect } from 'react';

export const CDNUrls = () => {
  // 1. Single state object for all data
  const [state, setState] = useState({
    githubSha: null,
    npmVersion: null,
    loading: true,
    errors: { github: null, npm: null },
  });

  useEffect(() => {
    const loadData = async () => {
      // 2. Run both requests in parallel
      const [githubResult, npmResult] = await Promise.allSettled([
        fetch('https://api.github.com/repos/google/xrblocks/commits/build').then(res => {
          if (!res.ok) throw new Error('GitHub API failed');
          return res.json();
        }),
        fetch('https://registry.npmjs.org/xrblocks').then(res => {
          if (!res.ok) throw new Error('NPM Registry failed');
          return res.json();
        })
      ]);

      // 3. Process results safely (checking 'fulfilled' vs 'rejected')
      setState({
        githubSha: githubResult.status === 'fulfilled' ? githubResult.value.sha : null,
        npmVersion: npmResult.status === 'fulfilled' ? npmResult.value['dist-tags']?.latest : null,
        loading: false,
        errors: {
          github: githubResult.status === 'rejected' ? githubResult.reason.message : null,
          npm: npmResult.status === 'rejected' ? npmResult.reason.message : null,
        },
      });
    };

    loadData();
  }, []);

  // --- RENDER LOGIC ---

  const githubUrl = state.githubSha
    ? `https://cdn.jsdelivr.net/gh/google/xrblocks@${state.githubSha}/xrblocks.js`
    : null;

  const npmUrl = state.npmVersion
    ? `https://cdn.jsdelivr.net/npm/xrblocks@${state.npmVersion}/build/xrblocks.js`
    : null;

  const hasAtLeastOneUrl = githubUrl || npmUrl;

  // 1. Still loading? Show spinner/text
  if (state.loading) {
    return <p>Checking versions...</p>;
  }

  // 2. Finished loading, but both failed?
  if (!hasAtLeastOneUrl) {
    return (
      <div style={{ color: 'red' }}>
        <p>Unable to load CDN URLs.</p>
        <small>GitHub: {state.errors.github}</small><br/>
        <small>NPM: {state.errors.npm}</small>
      </div>
    );
  }

  // 3. Success (Partial or Full)
  return (
    <>
      Pinned URLs for the latest versions are:
      <ul>
        {githubUrl && (
          <li>GitHub Build: <a href={githubUrl}>{githubUrl}</a></li>
        )}
        {npmUrl && (
          <li>NPM Release: <a href={npmUrl}>{npmUrl}</a></li>
        )}
      </ul>
    </>
  );
};