// Build-time labels: never infer production/test from a user's browser hostname.
export function stampEnvironment(html, manifest, environment) {
  if (!['pre', 'dev', ''].includes(environment)) throw new Error('Unknown app environment');
  const suffix = environment ? ` ${environment}` : '';
  const badge = environment
    ? `<span id="app-environment" aria-label="${environment === 'pre' ? 'preview' : 'test'} 환경" style="color:#f9a8d4;font-size:0.875rem;font-weight:800;white-space:nowrap">${environment}</span>`
    : '';
  // Also works on the main snapshot, which does not yet have an environment slot.
  const gradeButton = /(<button\b[^>]*data-action="open-grade-modal"[^>]*>[\s\S]*?<\/button>)/;
  if (!gradeButton.test(html)) throw new Error('Grade selection button not found');
  html = html.replace(gradeButton, `$1${badge ? `\n                    ${badge}` : ''}`);
  html = html.replace(/(<meta\s+name="apple-mobile-web-app-title"\s+content=")([^"]*)(")/, (_, before, name, after) => `${before}${name}${suffix}${after}`);
  return {
    html,
    manifest: {...manifest, name: '바른한자' + suffix, short_name: '바른한자' + suffix}
  };
}
