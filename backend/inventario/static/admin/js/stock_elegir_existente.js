(function () {
  'use strict';

  function isStockAddPage() {
    var p = window.location.pathname || '';
    return /\/inventario\/stockinventario\/add\/?$/.test(p);
  }

  function jsonOpcionesUrl() {
    var p = window.location.pathname.replace(/\/$/, '');
    var idx = p.indexOf('/inventario/stockinventario');
    if (idx === -1) {
      return null;
    }
    return p.slice(0, idx + '/inventario/stockinventario'.length) + '/json-opciones-stock/';
  }

  function setVal(id, value) {
    var el = document.getElementById(id);
    if (!el) {
      return;
    }
    el.value = value != null ? String(value) : '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function injectSelector(items) {
    var form =
      document.getElementById('stockinventario_form') ||
      document.querySelector('form#stockinventario_form') ||
      document.querySelector('#content-main form');
    if (!form) {
      return;
    }
    var firstField = form.querySelector('.field-producto, .form-row');
    if (!firstField) {
      return;
    }

    var wrap = document.createElement('div');
    wrap.className = 'form-row field-elegir_stock_existente';
    wrap.style.marginBottom = '1rem';
    wrap.style.padding = '0.75rem 1rem';
    wrap.style.background = '#f0f7ff';
    wrap.style.border = '1px solid #c5d9f0';
    wrap.style.borderRadius = '6px';

    var label = document.createElement('label');
    label.setAttribute('for', 'elegir-stock-existente');
    label.textContent = 'Productos ya en stock (opcional)';
    label.style.display = 'block';
    label.style.fontWeight = '600';
    label.style.marginBottom = '0.35rem';

    var hint = document.createElement('p');
    hint.className = 'help';
    hint.textContent =
      'Elige una fila existente: se rellenan nombre, marca, referencia y código de barras. Luego solo escribe la cantidad a sumar y guarda.';
    hint.style.marginTop = '0.25rem';
    hint.style.marginBottom = '0.5rem';

    var sel = document.createElement('select');
    sel.id = 'elegir-stock-existente';
    sel.style.maxWidth = '100%';
    sel.style.width = 'min(100%, 52rem)';

    var opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = '— Nuevo registro (sin elegir de la lista) —';
    sel.appendChild(opt0);

    items.forEach(function (it) {
      var o = document.createElement('option');
      o.value = String(it.id);
      var ref = (it.referencia || '').trim() || (it.codigo || '').trim() || '—';
      var nom = (it.producto || '').trim() || (it.marca || '').trim() || 'Sin nombre';
      o.textContent =
        ref + ' — ' + nom + (it.marca && it.producto ? ' · ' + it.marca : '') + ' · actual: ' + it.cantidad + ' uds.';
      sel.appendChild(o);
    });

    wrap.appendChild(label);
    wrap.appendChild(hint);
    wrap.appendChild(sel);
    form.insertBefore(wrap, firstField);

    sel.addEventListener('change', function () {
      var id = sel.value;
      if (!id) {
        return;
      }
      var it = items.find(function (x) {
        return String(x.id) === id;
      });
      if (!it) {
        return;
      }
      setVal('id_producto', it.producto || '');
      setVal('id_marca', it.marca || '');
      setVal('id_referencia_fabricante', it.referencia || '');
      setVal('id_codigo_barras', it.codigo || '');
      setVal('id_cantidad_actual', '');
      var qty = document.getElementById('id_cantidad_actual');
      if (qty) {
        qty.focus();
      }
    });
  }

  function run() {
    if (!isStockAddPage()) {
      return;
    }
    var url = jsonOpcionesUrl();
    if (!url) {
      return;
    }
    fetch(url, { credentials: 'same-origin' })
      .then(function (r) {
        if (!r.ok) {
          throw new Error('HTTP ' + r.status);
        }
        return r.json();
      })
      .then(function (data) {
        var items = (data && data.items) || [];
        if (!items.length) {
          return;
        }
        injectSelector(items);
      })
      .catch(function () {
        /* silencioso */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
