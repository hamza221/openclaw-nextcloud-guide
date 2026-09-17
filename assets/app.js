const statusBox = document.getElementById('copy-status');
let statusTimer;
document.querySelectorAll('.copy').forEach(button => {
  button.addEventListener('click', async () => {
    const text = button.closest('.codebox').querySelector('code').textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = 'Copied';
      statusBox.textContent = 'Copied to clipboard';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(button.closest('.codebox').querySelector('code'));
      const selection = window.getSelection();
      selection.removeAllRanges(); selection.addRange(range);
      statusBox.textContent = 'Text selected. Press Command+C or Ctrl+C.';
    }
    statusBox.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {statusBox.classList.remove('show'); button.textContent = 'Copy';}, 2500);
  });
});
document.getElementById('print').addEventListener('click', () => window.print());
window.addEventListener('beforeprint', () => document.querySelectorAll('details').forEach(d => { d.dataset.wasOpen = String(d.open); d.open = true; }));
window.addEventListener('afterprint', () => document.querySelectorAll('details').forEach(d => { d.open = d.dataset.wasOpen === 'true'; }));
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.hash === '#' + entry.target.id));
    });
  }, {rootMargin:'-10% 0px -65% 0px'});
  document.querySelectorAll('main section').forEach(s => observer.observe(s));
}
