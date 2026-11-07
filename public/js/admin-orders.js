// Bestellverwaltung: Auswahl-Checkboxen mit Sammelaktionen, Klick auf Tabellenzeile, ein-/ausklappbare Aktionsfelder.
(function () {
  var form = document.getElementById('bulk-form');
  if (form) {
    var bar = document.getElementById('bulk-bar');
    var count = document.getElementById('bulk-count');
    var all = document.getElementById('check-all');
    var boxes = function () { return Array.prototype.slice.call(form.querySelectorAll('input[name="ids"]')); };
    var update = function () {
      var n = boxes().filter(function (b) { return b.checked; }).length;
      bar.hidden = n === 0;
      count.textContent = n;
      if (all) all.checked = n > 0 && n === boxes().length;
    };
    form.addEventListener('change', function (e) {
      if (e.target === all) boxes().forEach(function (b) { b.checked = all.checked; });
      update();
    });
    // Klick auf Zeile öffnet die Bestellung (außer bei Checkbox/Link)
    form.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-href]');
      if (!tr || e.target.closest('a, input, button, label, .col-check')) return;
      window.location.href = tr.getAttribute('data-href');
    });
    update();
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    var panel = document.getElementById(btn.getAttribute('data-toggle'));
    if (!panel) return;
    var open = panel.hidden;
    document.querySelectorAll('.action-panel').forEach(function (p) { p.hidden = true; });
    panel.hidden = !open;
    if (open) {
      var ta = panel.querySelector('textarea');
      if (ta) ta.focus();
    }
  });
})();
