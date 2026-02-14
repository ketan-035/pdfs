from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm
from PyPDF2 import PdfMerger
import markdown2

def word_to_pdf(text, out):
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(out)

    story = []

    for p in text.split("\n"):
        story.append(Paragraph(p, styles["Normal"]))
        story.append(Spacer(1, 0.2*cm))

    doc.build(story)


def md_to_pdf(cells, out):
    styles = getSampleStyleSheet()
    doc = SimpleDocTemplate(out)

    story = []

    for md in cells:
        html = markdown2.markdown(md)
        story.append(Paragraph(html, styles["Normal"]))
        story.append(Spacer(1, 0.3*cm))

    doc.build(story)


def merge(a, b, out):
    m = PdfMerger()
    m.append(a)
    m.append(b)
    m.write(out)
    m.close()
