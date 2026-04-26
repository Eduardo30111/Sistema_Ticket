(function () {
  function syncPasswordVisibility() {
    var toggle = document.getElementById('id_change_password');
    var row = document.querySelector('.form-row.field-new_password');
    if (!toggle || !row) return;
    row.style.display = toggle.checked ? '' : 'none';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var toggle = document.getElementById('id_change_password');
    if (!toggle) return;
    toggle.addEventListener('change', syncPasswordVisibility);
    syncPasswordVisibility();
  });
})();
