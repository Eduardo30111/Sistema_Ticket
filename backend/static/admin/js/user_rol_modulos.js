(function () {
  'use strict';

  function isSupervisorSelected() {
    var el = document.querySelector('input[name="rol"]:checked');
    return el && el.value === 'supervisor';
  }

  function syncModulosRow() {
    var row = document.querySelector('.form-row.field-modulos');
    if (!row) {
      return;
    }
    var show = isSupervisorSelected();
    row.style.display = show ? '' : 'none';
    row.querySelectorAll('input, select, textarea').forEach(function (inp) {
      if (inp.name === 'rol') {
        return;
      }
      inp.disabled = !show;
    });
  }

  function bind() {
    syncModulosRow();
    document.querySelectorAll('input[name="rol"]').forEach(function (radio) {
      radio.addEventListener('change', syncModulosRow);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
