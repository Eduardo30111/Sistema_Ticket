document.addEventListener('DOMContentLoaded', function () {
  var tipoSelect = document.getElementById('id_tipo');
  var fechaInicioInput = document.getElementById('id_fecha_inicio');
  var fechaFinInput = document.getElementById('id_fecha_fin');

  if (!tipoSelect || !fechaInicioInput || !fechaFinInput) {
    return;
  }

  function rowFor(input) {
    return input.closest('.form-row') || input.closest('.fieldBox') || input.closest('[class*="field-fecha"]');
  }

  var fechaInicioRow = rowFor(fechaInicioInput);
  var fechaFinRow = rowFor(fechaFinInput);
  var contractorFieldset = fechaInicioRow ? fechaInicioRow.closest('fieldset') : null;

  function applyTypeBehavior() {
    var selectedValue = (tipoSelect.value || '').toUpperCase();
    var isContractor = selectedValue === 'CONTRATISTA';

    if (fechaInicioRow) {
      fechaInicioRow.style.display = isContractor ? '' : 'none';
    }
    if (fechaFinRow) {
      fechaFinRow.style.display = isContractor ? '' : 'none';
    }
    if (contractorFieldset) {
      contractorFieldset.style.display = isContractor ? '' : 'none';
    }

    fechaInicioInput.required = isContractor;
    fechaFinInput.required = isContractor;

    if (!isContractor) {
      fechaInicioInput.value = '';
      fechaFinInput.value = '';
      fechaInicioInput.readOnly = false;
      fechaFinInput.readOnly = false;
    }
  }

  function bindTipoRefresh() {
    var trigger = function () {
      applyTypeBehavior();
    };

    tipoSelect.addEventListener('change', trigger);
    tipoSelect.addEventListener('input', trigger);
    tipoSelect.addEventListener('blur', trigger);

    if (window.django && window.django.jQuery) {
      var $ = window.django.jQuery;
      $(tipoSelect).on('change', trigger);
      $(tipoSelect).on('select2:select', trigger);
      $(tipoSelect).on('select2:clear', trigger);
      $(document).on('change', '#id_tipo', trigger);
      $(document).on('select2:select', '#id_tipo', trigger);
      $(document).on('select2:clear', '#id_tipo', trigger);
    } else if (window.jQuery) {
      var jq = window.jQuery;
      jq(tipoSelect).on('change', trigger);
      jq(tipoSelect).on('select2:select', trigger);
      jq(tipoSelect).on('select2:clear', trigger);
      jq(document).on('change', '#id_tipo', trigger);
      jq(document).on('select2:select', '#id_tipo', trigger);
      jq(document).on('select2:clear', '#id_tipo', trigger);
    }

    var lastValue = tipoSelect.value;
    setInterval(function () {
      if (tipoSelect.value !== lastValue) {
        lastValue = tipoSelect.value;
        trigger();
      }
    }, 350);
  }

  bindTipoRefresh();
  applyTypeBehavior();
  setTimeout(applyTypeBehavior, 150);
  setTimeout(applyTypeBehavior, 500);
});
