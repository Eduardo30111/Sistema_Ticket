from io import BytesIO
from pathlib import Path
from urllib import request as urllib_request

from PIL import Image, ImageDraw, ImageFont


A6_SIZE = (1240, 1748)
BACKGROUND_TOP = '#effff6'
BACKGROUND_BOTTOM = '#fff8e8'
GREEN_DARK = '#0f7f43'
GREEN = '#179a53'
GREEN_SOFT = '#d9f4e2'
TEXT_DARK = '#154b2f'
TEXT_MUTED = '#2d7a4f'
WHITE = '#ffffff'


def _load_font(size: int, bold: bool = False):
    candidates = []
    if bold:
        candidates.extend([
            'C:/Windows/Fonts/arialbd.ttf',
            'C:/Windows/Fonts/segoeuib.ttf',
            'C:/Windows/Fonts/calibrib.ttf',
            'DejaVuSans-Bold.ttf',
        ])
    else:
        candidates.extend([
            'C:/Windows/Fonts/arial.ttf',
            'C:/Windows/Fonts/segoeui.ttf',
            'C:/Windows/Fonts/calibri.ttf',
            'DejaVuSans.ttf',
        ])

    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _rounded_box(draw: ImageDraw.ImageDraw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def _fetch_qr_image(oficina):
    req = urllib_request.Request(oficina.qr_image_url, method='GET')
    with urllib_request.urlopen(req, timeout=20) as resp:
        content = resp.read()
    return Image.open(BytesIO(content)).convert('RGBA')


def _load_mascot_image():
    mascot_path = Path(__file__).resolve().parent.parent.parent / 'RobotTIC.png'
    return Image.open(mascot_path).convert('RGBA')


def _fit_text(draw, text, max_width, start_size, min_size=28, bold=True):
    size = start_size
    while size >= min_size:
        font = _load_font(size, bold=bold)
        bbox = draw.textbbox((0, 0), text, font=font)
        width = bbox[2] - bbox[0]
        if width <= max_width:
            return font
        size -= 2
    return _load_font(min_size, bold=bold)


def generar_sticker_oficina_png(oficina) -> bytes:
    width, height = A6_SIZE
    image = Image.new('RGBA', (width, height), WHITE)
    draw = ImageDraw.Draw(image)

    for y in range(height):
        ratio = y / max(height - 1, 1)
        top = tuple(int(v, 16) for v in (BACKGROUND_TOP[1:3], BACKGROUND_TOP[3:5], BACKGROUND_TOP[5:7]))
        bottom = tuple(int(v, 16) for v in (BACKGROUND_BOTTOM[1:3], BACKGROUND_BOTTOM[3:5], BACKGROUND_BOTTOM[5:7]))
        color = tuple(int(top[i] + (bottom[i] - top[i]) * ratio) for i in range(3))
        draw.line([(0, y), (width, y)], fill=color, width=1)

    for x in range(0, width, 48):
        draw.line([(x, 0), (x, height)], fill='#edf7ef', width=1)
    for y in range(0, height, 48):
        draw.line([(0, y), (width, y)], fill='#edf7ef', width=1)

    margin = 72
    header_h = 260
    _rounded_box(draw, (margin, margin, width - margin, margin + header_h), 42, fill=WHITE, outline=GREEN_SOFT, width=4)

    mascot = _load_mascot_image()
    mascot.thumbnail((160, 160))
    mascot_x = margin + 34
    mascot_y = margin + 52
    image.alpha_composite(mascot, (mascot_x, mascot_y))

    pill_x0 = mascot_x + mascot.width + 26
    pill_y0 = margin + 54
    pill_x1 = pill_x0 + 240
    pill_y1 = pill_y0 + 48
    _rounded_box(draw, (pill_x0, pill_y0, pill_x1, pill_y1), 24, fill='#ebfff3', outline='#bfe9cb', width=2)
    draw.text((pill_x0 + 22, pill_y0 + 11), 'OFICINA TIC', font=_load_font(24, bold=True), fill=GREEN_DARK)

    title = oficina.nombre.upper()
    title_font = _fit_text(draw, title, width - (pill_x0 + 20) - margin, 68, min_size=38, bold=True)
    title_y = pill_y1 + 34
    draw.text((pill_x0, title_y), title, font=title_font, fill=TEXT_DARK)

    subtitle = 'ESCANEA Y REPORTA TU SOPORTE TIC'
    draw.text((pill_x0 + 2, title_y + 80), subtitle, font=_load_font(24, bold=False), fill=TEXT_MUTED)

    qr_box_top = margin + header_h + 36
    qr_box_bottom = qr_box_top + 900
    _rounded_box(draw, (margin, qr_box_top, width - margin, qr_box_bottom), 48, fill=WHITE, outline=GREEN_SOFT, width=4)

    qr = _fetch_qr_image(oficina)
    qr_target_size = 600
    qr = qr.resize((qr_target_size, qr_target_size), Image.Resampling.NEAREST)
    qr_bg_size = 820
    qr_bg_x = (width - qr_bg_size) // 2
    qr_bg_y = qr_box_top + 38
    _rounded_box(draw, (qr_bg_x, qr_bg_y, qr_bg_x + qr_bg_size, qr_bg_y + qr_bg_size), 42, fill='#f9fffb', outline='#d7efdf', width=3)
    qr_x = qr_bg_x + (qr_bg_size - qr.width) // 2
    qr_y = qr_bg_y + (qr_bg_size - qr.height) // 2
    image.alpha_composite(qr, (qr_x, qr_y))

    note_title = '1. Escanea el QR'
    note_text = '2. Inicia con tu cédula\n3. Crea el ticket desde tu oficina'
    note_y = qr_bg_y + qr_bg_size + 54
    draw.text((margin + 90, note_y), note_title, font=_load_font(34, bold=True), fill=GREEN_DARK)
    draw.multiline_text((margin + 90, note_y + 56), note_text, font=_load_font(28, bold=False), fill=TEXT_MUTED, spacing=12)

    footer_h = 100
    footer_y = height - margin - footer_h
    _rounded_box(draw, (margin, footer_y, width - margin, footer_y + footer_h), 30, fill=GREEN_DARK)
    footer_font = _load_font(30, bold=True)
    footer_text = 'Oficina de las TIC'
    bbox = draw.textbbox((0, 0), footer_text, font=footer_font)
    footer_w = bbox[2] - bbox[0]
    footer_h_text = bbox[3] - bbox[1]
    draw.text(((width - footer_w) / 2, footer_y + (footer_h - footer_h_text) / 2 - 4), footer_text, font=footer_font, fill=WHITE)

    output = BytesIO()
    image.convert('RGB').save(output, format='PNG', optimize=True)
    return output.getvalue()
