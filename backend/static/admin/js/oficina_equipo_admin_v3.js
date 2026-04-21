;(function () {
  function getJQ() {
    if (window.django && window.django.jQuery) return window.django.jQuery
    if (window.jQuery) return window.jQuery
    return null
  }

  function getOfficeSelect() {
    return document.getElementById('id_oficina')
  }

  function getPersonaSelect() {
    return document.getElementById('id_persona')
  }

  function getEndpoint(personaSelect) {
    return personaSelect.getAttribute('data-personas-url') || ''
  }

  function syncSelect2(select) {
    var $ = getJQ()
    if (!$) return
    var $select = $(select)
    $select.trigger('change')
    $select.trigger('change.select2')
  }

  function ensureRefreshButton() {
    var personaSelect = getPersonaSelect()
    if (!personaSelect) return

    if (document.getElementById('id_persona_refresh_btn')) return

    var button = document.createElement('button')
    button.type = 'button'
    button.id = 'id_persona_refresh_btn'
    button.className = 'button'
    button.title = 'Refrescar personas'
    button.setAttribute('aria-label', 'Refrescar personas')
    button.innerHTML =
      '<span style="display:inline-flex;align-items:center;gap:6px;">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M20 4v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
      '<span>Refrescar</span>' +
      '</span>'
    button.style.marginLeft = '8px'
    button.style.borderRadius = '8px'
    button.style.border = '1px solid #1f9d4b'
    button.style.background = 'linear-gradient(180deg, #2dbd5f 0%, #1f9d4b 100%)'
    button.style.color = '#ffffff'
    button.style.padding = '6px 10px'
    button.style.fontWeight = '700'
    button.style.fontSize = '12px'
    button.style.lineHeight = '1'
    button.style.boxShadow = '0 2px 8px rgba(20, 120, 58, 0.25)'
    button.style.cursor = 'pointer'

    button.addEventListener('mouseenter', function () {
      button.style.filter = 'brightness(0.95)'
    })
    button.addEventListener('mouseleave', function () {
      button.style.filter = 'none'
    })

    button.addEventListener('click', function () {
      void refreshByOffice()
    })

    var container = personaSelect.parentElement
    if (!container) return
    container.appendChild(button)
  }

  function setOptions(personaSelect, items) {
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

  async function refreshByOffice() {
    var officeSelect = getOfficeSelect()
    var personaSelect = getPersonaSelect()
    if (!officeSelect || !personaSelect) return

    var officeId = (officeSelect.value || '').trim()
    var endpoint = getEndpoint(personaSelect)

    if (!officeId || !endpoint) {
      setOptions(personaSelect, [])
      return
    }

    try {
      var resp = await fetch(endpoint + '?oficina=' + encodeURIComponent(officeId), {
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      })
      if (!resp.ok) {
        setOptions(personaSelect, [])
        return
      }

      var data = await resp.json()
      var results = Array.isArray(data.results) ? data.results : []
      setOptions(personaSelect, results)
    } catch (_error) {
      setOptions(personaSelect, [])
    }
  }

  function bindOfficeAutoRefresh() {
    var officeSelect = getOfficeSelect()
    if (!officeSelect) return

    var triggerRefresh = function () {
      void refreshByOffice()
    }

    // Native select events.
    officeSelect.addEventListener('change', triggerRefresh)
    officeSelect.addEventListener('input', triggerRefresh)
    officeSelect.addEventListener('blur', triggerRefresh)

    // Select2/Jazzmin events.
    var $ = getJQ()
    if ($) {
      var $office = $(officeSelect)
      $office.on('change', triggerRefresh)
      $office.on('select2:select', triggerRefresh)
      $office.on('select2:clear', triggerRefresh)

      // Delegated binding in case Jazzmin rebuilds the widget.
      $(document).on('change', '#id_oficina', triggerRefresh)
      $(document).on('select2:select', '#id_oficina', triggerRefresh)
      $(document).on('select2:clear', '#id_oficina', triggerRefresh)
    }

    // Extra safety: detect programmatic value changes without events.
    var lastValue = officeSelect.value
    setInterval(function () {
      var current = officeSelect.value
      if (current !== lastValue) {
        lastValue = current
        triggerRefresh()
      }
    }, 400)
  }

  function init() {
    var officeSelect = getOfficeSelect()
    if (!officeSelect) return

    ensureRefreshButton()
    bindOfficeAutoRefresh()

    void refreshByOffice()
    setTimeout(function () {
      void refreshByOffice()
    }, 250)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
