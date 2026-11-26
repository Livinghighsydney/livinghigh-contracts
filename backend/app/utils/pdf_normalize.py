"""Make template PDFs safe for Documenso's field placement.

Some PDF generators store the page size only once, on the parent /Pages node (valid PDF,
"inherited" MediaBox). Documenso then places field text as if the page were US Letter
(612x792), so on A4 pages every value lands lower/further right than where staff put it.
Writing an explicit MediaBox/CropBox onto every page fixes that. Normal PDFs are unchanged
apart from being re-saved.
"""
import io
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, RectangleObject


def normalize_page_boxes(pdf_bytes: bytes) -> bytes:
    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
    except Exception as exc:
        raise ValueError("Could not read this PDF. Please check the file and try again.") from exc
    if reader.is_encrypted:
        raise ValueError("This PDF is password-protected. Please upload an unlocked PDF.")

    writer = PdfWriter(clone_from=reader)
    for page in writer.pages:
        media = RectangleObject(page.mediabox)  # resolves inherited values
        crop = RectangleObject(page.cropbox)
        page[NameObject("/MediaBox")] = media
        page[NameObject("/CropBox")] = crop

    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()
