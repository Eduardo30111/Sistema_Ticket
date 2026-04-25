from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
SOURCE_MD = ROOT / "MANUAL_JEFE_OFICINA.md"
OUTPUT_PDF = ROOT / "MANUAL_JEFE_OFICINA.pdf"


def normalize_markdown_line(line: str) -> tuple[str, str]:
    text = line.strip()
    if not text:
        return "blank", ""
    if text.startswith("---"):
        return "separator", ""
    if text.startswith("### "):
        return "h3", text[4:].strip()
    if text.startswith("## "):
        return "h2", text[3:].strip()
    if text.startswith("# "):
        return "h1", text[2:].strip()
    if text.startswith("- "):
        return "bullet", text[2:].strip()
    if text[0].isdigit() and ". " in text[:4]:
        number, _, rest = text.partition(". ")
        if number.isdigit():
            return "numbered", f"{number}. {rest.strip()}"
    return "paragraph", text


def build_styles():
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="TitleCustom",
            parent=styles["Title"],
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#0f172a"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H2Custom",
            parent=styles["Heading2"],
            fontName="Helvetica-Bold",
            fontSize=14,
            leading=18,
            textColor=colors.HexColor("#14532d"),
            spaceBefore=8,
            spaceAfter=6,
        )
    )
    styles.add(
        ParagraphStyle(
            name="H3Custom",
            parent=styles["Heading3"],
            fontName="Helvetica-Bold",
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#1f2937"),
            spaceBefore=6,
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BodyCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14.5,
            textColor=colors.HexColor("#111827"),
            spaceAfter=4,
        )
    )
    styles.add(
        ParagraphStyle(
            name="BulletCustom",
            parent=styles["BodyText"],
            fontName="Helvetica",
            fontSize=10.5,
            leading=14.5,
            leftIndent=12,
            bulletIndent=0,
            textColor=colors.HexColor("#111827"),
            spaceAfter=2,
        )
    )
    return styles


def render_pdf():
    if not SOURCE_MD.exists():
        raise FileNotFoundError(f"No existe el archivo fuente: {SOURCE_MD}")

    styles = build_styles()
    doc = SimpleDocTemplate(
        str(OUTPUT_PDF),
        pagesize=LETTER,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title="Manual Jefe de Oficina",
        author="Sistema de Tickets TIC",
    )

    story = []
    for raw_line in SOURCE_MD.read_text(encoding="utf-8").splitlines():
        kind, text = normalize_markdown_line(raw_line)

        if kind in {"separator", "blank"}:
            story.append(Spacer(1, 6 if kind == "blank" else 10))
            continue

        text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        if kind == "h1":
            story.append(Paragraph(text, styles["TitleCustom"]))
        elif kind == "h2":
            story.append(Paragraph(text, styles["H2Custom"]))
        elif kind == "h3":
            story.append(Paragraph(text, styles["H3Custom"]))
        elif kind in {"bullet", "numbered"}:
            bullet_symbol = "•" if kind == "bullet" else ""
            if kind == "numbered":
                story.append(Paragraph(text, styles["BulletCustom"]))
            else:
                story.append(Paragraph(text, styles["BulletCustom"], bulletText=bullet_symbol))
        else:
            story.append(Paragraph(text, styles["BodyCustom"]))

    doc.build(story)
    print(f"PDF generado: {OUTPUT_PDF}")


if __name__ == "__main__":
    render_pdf()
