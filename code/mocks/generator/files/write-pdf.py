import io, json, os, sys
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

data = json.load(sys.stdin)
font = os.environ.get("MOCK_PDF_FONT", "/System/Library/Fonts/Supplemental/Arial Unicode.ttf")
pdfmetrics.registerFont(TTFont("CJK", font))
out = io.BytesIO()
c = canvas.Canvas(out, pagesize=(595, 842), pageCompression=1, invariant=1)
c.setTitle(data["title"])
for page in data["pages"]:
    c.setFont("CJK", 13)
    y = 788
    for line in page["lines"]:
        current = ""
        for char in line:
            if pdfmetrics.stringWidth(current + char, "CJK", 13) > 505:
                if y < 45:
                    c.showPage()
                    c.setFont("CJK", 13)
                    y = 788
                c.drawString(45, y, current)
                y -= 23
                current = ""
            current += char
        if y < 45:
            c.showPage()
            c.setFont("CJK", 13)
            y = 788
        c.drawString(45, y, current)
        y -= 23
    c.showPage()
c.save()
sys.stdout.buffer.write(out.getvalue())
