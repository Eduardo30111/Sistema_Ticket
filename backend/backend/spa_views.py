"""
Sirve el build estático del frontend (Vite) desde el mismo dominio que Django.

Solo se enlaza desde urls.py cuando DEBUG es False y existe SPA_DIST_DIR/index.html
(p. ej. tras `npm run build` en el deploy).
"""
from __future__ import annotations

import mimetypes
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404
from django.views.decorators.http import require_GET


def _dist_dir() -> Path:
    return Path(settings.SPA_DIST_DIR)


def _safe_file_under(parent: Path, relative: str) -> Path:
    """Evita path traversal (..) en rutas de assets."""
    base = parent.resolve()
    candidate = (base / relative).resolve()
    try:
        candidate.relative_to(base)
    except ValueError as exc:
        raise Http404() from exc
    if not candidate.is_file():
        raise Http404()
    return candidate


@require_GET
def serve_spa_index(request):
    index = _dist_dir() / 'index.html'
    if not index.is_file():
        raise Http404()
    return FileResponse(index.open('rb'), content_type='text/html; charset=utf-8')


@require_GET
def serve_spa_asset(request, asset_path: str):
    path = _safe_file_under(_dist_dir() / 'assets', asset_path)
    ctype, _ = mimetypes.guess_type(str(path))
    return FileResponse(path.open('rb'), content_type=ctype or 'application/octet-stream')


# Archivos sueltos en la raíz del dist de Vite
_ROOT_FILES = frozenset({'favicon.ico', 'vite.svg', 'robots.txt'})


@require_GET
def serve_spa_root_file(request, name: str):
    if name not in _ROOT_FILES:
        raise Http404()
    path = _safe_file_under(_dist_dir(), name)
    ctype, _ = mimetypes.guess_type(str(path))
    return FileResponse(path.open('rb'), content_type=ctype or 'application/octet-stream')
