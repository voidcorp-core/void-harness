// tdd-cover: e2e test/cli/cheatsheet.test.ts
// Static enhancement only: catalogue metadata never enters executable JavaScript or CSS.
export const styles = `
:root{color-scheme:light;--ink:#192334;--muted:#4b5565;--line:#c9d0dc;--accent:#5635aa;--paper:#fff;--wash:#f3f4f8}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 system-ui,sans-serif}
header,main,footer{max-width:1160px;margin:auto;padding:24px}header{padding-top:48px;border-bottom:1px solid var(--line)}
h1{font-size:32px;line-height:1.2;letter-spacing:-.025em;max-width:700px;margin:12px 0}h2{font-size:20px;line-height:1.3;margin:0;overflow-wrap:anywhere}
p{margin:12px 0}.eyebrow,.meta,.kind,.facts,.summary,footer{font-size:14px}.eyebrow{color:var(--accent);font-weight:700}.meta,footer{color:var(--muted)}
.installation{padding:12px 16px;background:var(--wash);border-left:3px solid var(--accent)}
.filter-grid{display:grid;grid-template-columns:1.2fr 2fr 1fr 1fr 1fr;gap:12px}label{font-size:14px;font-weight:650;display:block;min-width:0}
input,select,button{font:inherit;min-height:44px;border:1px solid var(--line);border-radius:4px;background:white;color:var(--ink);padding:9px 12px}
input,select{display:block;width:100%;margin-top:6px}input,select,button{border-color:var(--muted)}input::placeholder{color:var(--muted);opacity:1}button{cursor:pointer;font-weight:650}button:hover{background:var(--wash)}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}.filter-footer,.summary{display:flex;align-items:center;justify-content:space-between;gap:16px}.filter-footer p{color:var(--muted);font-size:14px}
.summary{border-top:1px solid var(--line);margin-top:24px}.summary p:last-child{color:var(--muted)}
article{padding:24px 0;border-top:1px solid var(--line);break-inside:avoid}.entry-heading{display:flex;align-items:baseline;gap:16px;justify-content:space-between}.kind{color:var(--accent);flex-shrink:0}
.invocation{display:flex;align-items:center;gap:12px;background:var(--wash);padding:8px 12px;margin:8px 0}.invocation span{font-size:14px;color:var(--muted)}code{font:14px/1.5 ui-monospace,monospace;overflow-wrap:anywhere;flex:1;min-width:0;user-select:all}.invocation button{flex-shrink:0}
.facts{padding-left:20px;color:var(--muted)}li{margin:4px 0}p,li{overflow-wrap:anywhere}#copy-status:empty{display:none}#copy-status,#empty{padding:12px;border-left:3px solid var(--accent);background:var(--wash)}
[hidden]{display:none!important}.skip{position:absolute;left:12px;top:-100px;padding:12px;background:white;color:var(--accent);z-index:1}.skip:focus{top:12px}
@media(max-width:800px){.filter-grid{grid-template-columns:1fr 1fr}.filter-grid label:nth-child(2){grid-column:1/-1;grid-row:1}}
@media(max-width:480px){header,main,footer{padding:20px 16px}h1{font-size:28px}.filter-grid{grid-template-columns:1fr}.filter-grid label:nth-child(2){grid-column:auto}.filter-footer,.summary{align-items:flex-start;flex-direction:column;gap:4px}.entry-heading{align-items:flex-start}.invocation{flex-wrap:wrap}.invocation code{flex-basis:65%}.invocation button{margin-left:auto}}
@media print{body{font-size:11pt}header,main,footer{max-width:none;padding:12px 0}form,button,.skip,.summary,#copy-status,#empty{display:none!important}article[hidden]{display:block!important}article{padding:14px 0}.installation,.invocation{background:white}h1{font-size:24pt}h2{font-size:14pt}}
`;

// Clipboard promise must settle before success is announced:
// https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
export const enhancement = `(() => {
  const form = document.getElementById('filters');
  const fields = Object.fromEntries(['view','search','runtime','pack','kind'].map(id => [id,document.getElementById(id)]));
  const entries = Array.from(document.querySelectorAll('[data-entry]'));
  const search = entries.map(entry => entry.textContent.toLowerCase());
  function update() {
    const terms = fields.search.value.toLowerCase().trim().split(/\\s+/).filter(Boolean);
    let count = 0;
    entries.forEach((entry,index) => {
      const available = entry.dataset.installed.split(' ').filter(Boolean);
      const show = (!fields.kind.value || entry.dataset.kind === fields.kind.value)
        && (!fields.pack.value || entry.dataset.pack === fields.pack.value)
        && (!fields.runtime.value || entry.dataset.runtimes.split(' ').includes(fields.runtime.value))
        && (fields.view.value !== 'here' || (fields.runtime.value ? available.includes(fields.runtime.value) : available.length > 0))
        && terms.every(term => search[index].includes(term));
      entry.hidden = !show;
      if (show) count++;
    });
    document.getElementById('count').textContent = count + ' of ' + entries.length + ' entries';
    document.getElementById('empty').hidden = count !== 0;
    document.getElementById('search-help').textContent = fields.view.value === 'intent'
      ? 'Describe your task in a few words. Matches come from the catalogue descriptions and triggers.'
      : fields.view.value === 'here' ? 'Showing confirmed installed assets. Runtime execution remains unverified.'
      : 'Search names, descriptions, invocations and triggers.';
  }
  form.hidden = false;
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  // The reset event precedes native field restoration; read values before the next paint.
  form.addEventListener('reset', () => { requestAnimationFrame(update); });
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', async () => {
      const code = button.parentElement.querySelector('code');
      const feedback = document.getElementById('copy-status');
      feedback.textContent = 'Copying…';
      try {
        await navigator.clipboard.writeText(code.textContent);
        feedback.textContent = 'Copied to clipboard.';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(code);
        const selection = window.getSelection();
        if (selection) { selection.removeAllRanges(); selection.addRange(range); }
        feedback.textContent = 'Clipboard unavailable. The command is selected; copy it manually.';
      }
    });
  });
  update();
})();`;
