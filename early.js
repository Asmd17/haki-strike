/* HAKI Strike: runs before the page's own scripts (document_start). While you type in a field of the panel (Callout, amounts), the
   page never sees those keys: Axiom's own hotkeys only see our panel's box (its fields sit in a closed shadow root), think nobody is
   typing and swallow Space / letters. Stopping the key here, before any page listener, still types the character (only
   preventDefault would block that). Enter, Escape and Tab go on as usual: the panel's fields act on them. */
(() => {
  if (window.top !== window || window.__hakiEarly) return; window.__hakiEarly = true;
  const PASS = new Set(['Enter', 'Escape', 'Tab']);
  const mine = e => { const h = document.getElementById('haki-ax'); return !!h && e.composedPath()[0] === h && typeof window.__hakiField === 'function' && window.__hakiField(); };
  for (const type of ['keydown', 'keypress', 'keyup'])
    addEventListener(type, e => {
      if (!PASS.has(e.key) && !e.ctrlKey && !e.metaKey && mine(e)) { e.stopImmediatePropagation(); return; }
      /* 3.20.5: the panel's hotkeys run here, first of all listeners, so the site's own shortcuts never eat them */
      if (type !== 'keypress' && typeof window.__hakiHot === 'function') { let ours = false; try { ours = window.__hakiHot(e); } catch (_) {} if (ours) { e.preventDefault(); e.stopImmediatePropagation(); } }
    }, true);
})();
