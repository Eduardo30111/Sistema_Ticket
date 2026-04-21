;(function () {
  function normalize(value) {
    return (value || '').toString().trim().toUpperCase()
  }

  function disableSelect2(select) {
    if (!window.jQuery) return
    var $ = window.jQuery
    var $select = $(select)
    if ($select.data('select2') && typeof $select.select2 === 'function') {
      try {
        $select.select2('destroy')
      } catch (_e) {
        // Ignore if widget was already destroyed.
      }
    }
    select.classList.remove('select2-hidden-accessible')
    select.style.display = ''
  }

  function renderBlankOption(select) {
    var opt = document.createElement('option')
    opt.value = ''
    opt.text = '---------'
    select.appendChild(opt)
  }

  function renderPersonOptions(select, items) {
    select.innerHTML = ''
    renderBlankOption(select)
    for (var i = 0; i < items.length; i++) {
      var item = items[i]
      var opt = document.createElement('option')
      opt.value = String(item.id)
      opt.text = item.label
      select.appendChild(opt)
    }
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  async function filterPersonaOptions(forceClearSelection) {
    var tipoSelect = document.getElementById('id_tipo_persona')
    var personaSelect = document.getElementById('id_persona')
    if (!tipoSelect || !personaSelect) return
    var selectedTipo = normalize(tipoSelect.value)
    var dataUrl = personaSelect.getAttribute('data-personas-url')

    if (forceClearSelection) {
      personaSelect.value = ''
    }

    if (selectedTipo !== 'FUNCIONARIO' && selectedTipo !== 'CONTRATISTA') {
      renderPersonOptions(personaSelect, [])
      return
    }

    if (!dataUrl) {
      renderPersonOptions(personaSelect, [])
      return
    }

    try {
      var response = await fetch(dataUrl + '?tipo=' + encodeURIComponent(selectedTipo), {
        credentials: 'same-origin',
      })
      if (!response.ok) {
        renderPersonOptions(personaSelect, [])
        return
      }

      var payload = await response.json()
      var results = Array.isArray(payload.results) ? payload.results : []
      renderPersonOptions(personaSelect, results)
    } catch (_error) {
      renderPersonOptions(personaSelect, [])
    }
  }

  function init() {
    var tipoSelect = document.getElementById('id_tipo_persona')
    var personaSelect = document.getElementById('id_persona')
    if (!tipoSelect || !personaSelect) return

    // Keep persona as native select to avoid Select2 async refresh races.
    disableSelect2(personaSelect)

    tipoSelect.addEventListener('change', function () {
      filterPersonaOptions(true)
    })
    tipoSelect.addEventListener('input', function () {
      filterPersonaOptions(true)
    })
    document.addEventListener('change', function (event) {
      if (event && event.target && event.target.id === 'id_tipo_persona') {
        filterPersonaOptions(true)
      }
    })

    // Run after Jazzmin finishes bootstrapping the form widgets.
    setTimeout(function () {
      disableSelect2(personaSelect)
      filterPersonaOptions(false)
    }, 0)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
