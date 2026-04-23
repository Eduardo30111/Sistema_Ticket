/**
 * Burbuja flotante en el admin (Jazzmin): chat interno en modal + badge de no leídos
 * (WebSocket + bandeja API). Estilos críticos en línea.
 */
(function () {
  'use strict'

  if (window.parent !== window) return
  var path = window.location.pathname || ''
  if (path.indexOf('/admin/login') !== -1 || document.body.classList.contains('login-page')) return
  if (path.indexOf('/admin/') === -1) return
  if (document.getElementById('tic-admin-chat-wrap')) return

  var embedUrl = '/admin/chat/embed/'
  var sessionUrl = '/admin/chat/session/'
  var inboxUrl = '/api/internal-messages/inbox/'
  var lastOpenKey = 'tic_admin_chat_last_open_ts'

  function getLastOpenTs() {
    var v = localStorage.getItem(lastOpenKey)
    return v ? parseInt(v, 10) || 0 : 0
  }

  function setLastOpenNow() {
    localStorage.setItem(lastOpenKey, String(Date.now()))
  }

  function ensureBaseline() {
    if (localStorage.getItem(lastOpenKey) == null) {
      setLastOpenNow()
    }
  }

  var session = null
  var modalOpen = false
  var badgeCount = 0
  var badgeEl = null
  var wrap = null
  var socket = null
  var wsReconnectTimer = null

  function setBadge(n) {
    badgeCount = Math.max(0, n)
    if (!badgeEl) return
    if (badgeCount < 1) {
      badgeEl.style.display = 'none'
      badgeEl.textContent = ''
      if (wrap) wrap.classList.remove('tic-admin-chat-pulse')
      return
    }
    badgeEl.style.display = 'flex'
    badgeEl.textContent = badgeCount > 99 ? '99+' : String(badgeCount)
    if (wrap) wrap.classList.add('tic-admin-chat-pulse')
  }

  function bumpBadge() {
    setBadge(badgeCount + 1)
  }

  function syncBadgeFromInbox() {
    if (!session || !session.user_id) return
    var ts = getLastOpenTs()
    fetch(inboxUrl, { credentials: 'same-origin' })
      .then(function (r) {
        return r.ok ? r.json() : []
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) return
        if (ts < 1) return
        var n = 0
        for (var i = 0; i < rows.length; i++) {
          var t = new Date(rows[i].created_at).getTime()
          if (t > ts) n += 1
        }
        setBadge(n)
      })
      .catch(function () {})
  }

  function connectWs() {
    if (!session || !session.user_id) return
    try {
      if (wsReconnectTimer) {
        clearTimeout(wsReconnectTimer)
        wsReconnectTimer = null
      }
      if (socket) {
        try {
          socket.close()
        } catch (e2) {}
        socket = null
      }
      var proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      var url = proto + '://' + window.location.host + '/ws/notifications/' + session.user_id + '/'
      socket = new WebSocket(url)
      socket.onopen = function () {
        if (wsReconnectTimer) {
          clearTimeout(wsReconnectTimer)
          wsReconnectTimer = null
        }
      }
      socket.onmessage = function (event) {
        try {
          var data = JSON.parse(event.data)
          if (data.type !== 'internal_message') return
          var p = data.payload || {}
          var me = Number(session.user_id)
          var recipientId = Number(p.recipient)
          var senderId = Number(p.sender)
          if (!me || recipientId !== me || senderId === me) return
          if (modalOpen) return
          bumpBadge()
        } catch (e) {}
      }
      socket.onerror = function () {
        try {
          socket.close()
        } catch (e3) {}
      }
      socket.onclose = function () {
        socket = null
        if (!session || !session.user_id) return
        if (wsReconnectTimer) return
        wsReconnectTimer = window.setTimeout(function () {
          wsReconnectTimer = null
          connectWs()
        }, 3000)
      }
    } catch (e) {}
  }

  function injectPulseCss() {
    if (document.getElementById('tic-admin-chat-bubble-styles')) return
    var s = document.createElement('style')
    s.id = 'tic-admin-chat-bubble-styles'
    s.textContent =
      '@keyframes tic-admin-chat-ring{0%{box-shadow:0 0 0 0 rgba(31,155,99,0.55)}70%{box-shadow:0 0 0 14px rgba(31,155,99,0)}100%{box-shadow:0 0 0 0 rgba(31,155,99,0)}}' +
      '.tic-admin-chat-pulse #tic-admin-chat-fab{animation:tic-admin-chat-ring 2.2s ease-out infinite}'
    document.head.appendChild(s)
  }

  function applyBackdropStyle(el) {
    el.style.cssText = [
      'display:none',
      'position:fixed',
      'inset:0',
      'z-index:10830',
      'background:rgba(12,32,36,0.52)',
      'backdrop-filter:blur(4px)',
    ].join(';')
  }

  function applyModalStyle(el) {
    el.style.cssText = [
      'display:none',
      'position:fixed',
      'left:50%',
      'top:50%',
      'transform:translate(-50%,-50%)',
      'z-index:10835',
      'width:min(96vw,1000px)',
      'height:min(90vh,760px)',
      'max-height:94vh',
      'background:linear-gradient(180deg,#faffff 0%,#eefcfb 100%)',
      'border-radius:20px',
      'box-shadow:0 24px 64px rgba(6,52,56,0.38),0 0 0 1px rgba(15,109,114,0.12)',
      'overflow:hidden',
      'flex-direction:column',
    ].join(';')
  }

  function applyHeaderStyle(el) {
    el.style.cssText = [
      'display:flex',
      'align-items:center',
      'justify-content:space-between',
      'flex-shrink:0',
      'padding:14px 18px',
      'background:linear-gradient(118deg,#0a5a5e 0%,#0f6d72 42%,#178a72 78%,#1f9b63 100%)',
      'color:#fff',
      'font-weight:700',
      'font-size:16px',
      'letter-spacing:0.02em',
      'font-family:system-ui,-apple-system,Segoe UI,sans-serif',
      'box-shadow:inset 0 -1px 0 rgba(255,255,255,0.12)',
    ].join(';')
  }

  function applyHeaderButtonStyle(el) {
    el.style.cssText = [
      'background:rgba(255,255,255,0.14)',
      'border:1px solid rgba(255,255,255,0.38)',
      'color:#fff',
      'border-radius:10px',
      'padding:8px 14px',
      'cursor:pointer',
      'font-size:13px',
      'font-weight:600',
      'font-family:inherit',
      'transition:background 0.15s ease',
    ].join(';')
  }

  function applyIframeStyle(el) {
    el.style.cssText = [
      'flex:1',
      'width:100%',
      'min-height:0',
      'border:0',
      'background:#eefcfb',
    ].join(';')
  }

  injectPulseCss()

  var backdrop = document.createElement('div')
  backdrop.id = 'tic-admin-chat-backdrop'
  backdrop.setAttribute('aria-hidden', 'true')
  applyBackdropStyle(backdrop)

  var modal = document.createElement('div')
  modal.id = 'tic-admin-chat-modal'
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  modal.setAttribute('aria-labelledby', 'tic-admin-chat-title')
  applyModalStyle(modal)

  var header = document.createElement('header')
  applyHeaderStyle(header)

  var titleBlock = document.createElement('div')
  titleBlock.style.cssText = 'display:flex;flex-direction:column;gap:2px;min-width:0;'
  var title = document.createElement('span')
  title.id = 'tic-admin-chat-title'
  title.textContent = 'Mensajes internos'
  title.style.cssText = 'font-size:16px;font-weight:800;line-height:1.2;'
  var subtitle = document.createElement('span')
  subtitle.textContent = 'Equipo TIC · conversaciones en vivo'
  subtitle.style.cssText = 'font-size:11px;font-weight:500;opacity:0.88;'
  titleBlock.appendChild(title)
  titleBlock.appendChild(subtitle)

  var actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:10px;align-items:center;flex-shrink:0;'

  function hoverHeaderBtn(btn) {
    btn.addEventListener('mouseenter', function () {
      btn.style.background = 'rgba(255,255,255,0.28)'
    })
    btn.addEventListener('mouseleave', function () {
      btn.style.background = 'rgba(255,255,255,0.14)'
    })
  }

  var openFull = document.createElement('button')
  openFull.type = 'button'
  openFull.textContent = 'Pantalla completa'
  applyHeaderButtonStyle(openFull)
  hoverHeaderBtn(openFull)
  openFull.addEventListener('click', function () {
    window.location.href = '/admin/chat/'
  })

  var closeBtn = document.createElement('button')
  closeBtn.type = 'button'
  closeBtn.textContent = 'Cerrar'
  applyHeaderButtonStyle(closeBtn)
  hoverHeaderBtn(closeBtn)
  closeBtn.addEventListener('click', closeModal)

  actions.appendChild(openFull)
  actions.appendChild(closeBtn)
  header.appendChild(titleBlock)
  header.appendChild(actions)

  var iframe = document.createElement('iframe')
  iframe.title = 'Chat interno'
  iframe.setAttribute('loading', 'lazy')
  applyIframeStyle(iframe)

  modal.style.display = 'none'
  modal.appendChild(header)
  modal.appendChild(iframe)

  wrap = document.createElement('div')
  wrap.id = 'tic-admin-chat-wrap'
  wrap.style.cssText = [
    'position:fixed',
    'right:24px',
    'bottom:24px',
    'z-index:10840',
    'width:60px',
    'height:60px',
  ].join(';')

  var fab = document.createElement('button')
  fab.id = 'tic-admin-chat-fab'
  fab.type = 'button'
  fab.setAttribute('aria-label', 'Abrir chat interno')
  fab.setAttribute('title', 'Chat interno')
  fab.style.cssText = [
    'position:absolute',
    'inset:0',
    'width:60px',
    'height:60px',
    'border-radius:50%',
    'border:none',
    'cursor:pointer',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'color:#fff',
    'background:radial-gradient(circle at 30% 25%,#3ad4a4 0%,#0f6d72 45%,#084248 100%)',
    'box-shadow:0 8px 28px rgba(6,60,64,0.45),inset 0 1px 0 rgba(255,255,255,0.25)',
    'transition:transform 0.18s ease,box-shadow 0.18s ease',
  ].join(';')
  fab.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    '<path d="M7.2 20.4l.8-2.4H6c-1.1 0-2-.9-2-2V7c0-1.1.9-2 2-2h12c1.1 0 2 .9 2 2v9c0 1.1-.9 2-2 2h-7.2l-1.6 4.4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
    '</svg>'

  badgeEl = document.createElement('span')
  badgeEl.id = 'tic-admin-chat-badge'
  badgeEl.setAttribute('aria-live', 'polite')
  badgeEl.style.cssText = [
    'display:none',
    'position:absolute',
    'top:-2px',
    'right:-2px',
    'min-width:22px',
    'height:22px',
    'padding:0 6px',
    'align-items:center',
    'justify-content:center',
    'border-radius:999px',
    'background:linear-gradient(180deg,#ff5f52 0%,#d32f2f 100%)',
    'color:#fff',
    'font-size:11px',
    'font-weight:800',
    'line-height:1',
    'box-shadow:0 0 0 3px #f6feff',
    'font-family:system-ui,-apple-system,sans-serif',
    'z-index:2',
  ].join(';')

  wrap.appendChild(fab)
  wrap.appendChild(badgeEl)

  function openModal() {
    modalOpen = true
    setLastOpenNow()
    setBadge(0)
    backdrop.style.display = 'block'
    modal.style.display = 'flex'
    fab.setAttribute('aria-expanded', 'true')
    var sep = embedUrl.indexOf('?') === -1 ? '?' : '&'
    iframe.src = embedUrl + sep + 't=' + Date.now()
    document.body.style.overflow = 'hidden'
  }

  function closeModal() {
    modalOpen = false
    backdrop.style.display = 'none'
    modal.style.display = 'none'
    fab.setAttribute('aria-expanded', 'false')
    iframe.src = 'about:blank'
    document.body.style.overflow = ''
  }

  fab.addEventListener('click', function () {
    if (modal.style.display === 'flex') closeModal()
    else openModal()
  })
  fab.setAttribute('aria-expanded', 'false')

  fab.addEventListener('mouseenter', function () {
    fab.style.transform = 'scale(1.07)'
    fab.style.boxShadow = '0 12px 36px rgba(6,60,64,0.5),inset 0 1px 0 rgba(255,255,255,0.28)'
  })
  fab.addEventListener('mouseleave', function () {
    fab.style.transform = ''
    fab.style.boxShadow = '0 8px 28px rgba(6,60,64,0.45),inset 0 1px 0 rgba(255,255,255,0.25)'
  })

  backdrop.addEventListener('click', closeModal)

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.style.display === 'flex') closeModal()
  })

  document.body.appendChild(backdrop)
  document.body.appendChild(modal)
  document.body.appendChild(wrap)

  fetch(sessionUrl, { credentials: 'same-origin' })
    .then(function (r) {
      return r.ok ? r.json() : null
    })
    .then(function (data) {
      session = data
      if (!session || !session.user_id) return
      ensureBaseline()
      syncBadgeFromInbox()
      connectWs()
      if (window.__ticAdminChatInboxTimer) {
        clearInterval(window.__ticAdminChatInboxTimer)
      }
      window.__ticAdminChatInboxTimer = window.setInterval(syncBadgeFromInbox, 10000)
    })
    .catch(function () {})
})()
