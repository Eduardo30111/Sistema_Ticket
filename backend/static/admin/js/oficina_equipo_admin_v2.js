;(function () {
  function normalize(value) {
    return (value || '').toString().trim().toUpperCase()
  }

  function getJQ() {
    if (window.django && window.django.jQuery) return window.django.jQuery
    if (window.jQuery) return window.jQuery
    return null
  }

  function getTipoSelect() {
    return document.getElementById('id_tipo_persona')
  }

  function getPersonaSelect() {
    return document.getElementById('id_persona')
  }

  function getPersonasUrl(personaSelect) {
    var fromAttr = personaSelect.getAttribute('data-personas-url')
    if (fromAttr) return fromAttr

    var m = window.location.pathname.match(/^\/admin\/([^/]+)\/([^/]+)\//)
    if (!m) return ''
    return '/admin/' + m[1] + '/' + m[2] + '/personas-por-tipo/'
  }

  function syncSelect2(select) {
    var $ = getJQ()
    if (!$) return
    var $select = $(select)
    $select.trigger('change')
    $select.trigger('change.select2')
  }

  function renderOptions(personaSelect, items) {
    personaSelect.innerHTML = ''

    var blank = document.createElement('option')
    blank.value = ''
    blank.text = '---------'
    personaSelect.appendChild(blank)

    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      var opt = document.createElement('option')
      opt.value = String(item.id)
      opt.text = item.label
      personaSelect.appendChild(opt)
    }

    personaSelect.value = ''
    syncSelect2(personaSelect)
  }

  async function refreshPersonas() {
    var tipoSelect = getTipoSelect()
    var personaSelect = getPersonaSelect()
    if (!tipoSelect || !personaSelect) return

    var tipo = normalize(tipoSelect.value)
    if (tipo !== 'FUNCIONARIO' && tipo !== 'CONTRATISTA') {
      renderOptions(personaSelect, [])
      return
    }

    var url = getPersonasUrl(personaSelect)
    if (!url) {
      renderOptions(personaSelect, [])
      return
    }

    try {
      var resp = await fetch(url + '?tipo=' + encodeURIComponent(tipo), {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })

      if (!resp.ok) {
        renderOptions(personaSelect, [])
        return
      }

      var data = await resp.json()
      var results = Array.isArray(data.results) ? data.results : []
      renderOptions(personaSelect, results)
    } catch (_error) {
      renderOptions(personaSelect, [])
    }
  }

  function bindEvents() {
    var tipoSelect = getTipoSelect()
    if (!tipoSelect) return

    tipoSelect.addEventListener('change', function () {
      void refreshPersonas()
    })

    tipoSelect.addEventListener('input', function () {
      void refreshPersonas()
    })
  }

  function init() {
    bindEvents()
    void refreshPersonas()

    // Jazzmin may initialize widgets later; retry once.
    setTimeout(function () {
      void refreshPersonas()
    }, 250)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
