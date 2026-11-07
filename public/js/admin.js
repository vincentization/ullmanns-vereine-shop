// Gemeinsame Backend-Helfer (ohne Framework).
// - <form data-confirm="Wirklich löschen?">  oder  <button data-confirm="...">  -> Sicherheitsabfrage
// - <button data-copy="text">  -> kopiert Text in die Zwischenablage
// - <select data-autosubmit> -> sendet das umgebende Formular bei Änderung ab
(function () {
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var submitter = e.submitter;
    var msg = (submitter && submitter.getAttribute('data-confirm')) || form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-copy]');
    if (!btn) return;
    e.preventDefault();
    var text = btn.getAttribute('data-copy');
    if (text.startsWith('/')) text = window.location.origin + text;
    navigator.clipboard.writeText(text).then(function () {
      var old = btn.textContent;
      btn.textContent = 'Kopiert ✓';
      setTimeout(function () { btn.textContent = old; }, 1500);
    });
  });

  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-autosubmit]')) e.target.form.submit();
  });
})();
