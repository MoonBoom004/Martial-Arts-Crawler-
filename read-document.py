"""Offline, bounded PDF/image reader. No network, login, or paid AI calls."""
import csv
import io
import json
import os
import pathlib
import resource
import subprocess
import sys
import tempfile
import warnings

resource.setrlimit(resource.RLIMIT_AS, (1536 * 1024**2, 1536 * 1024**2))
resource.setrlimit(resource.RLIMIT_CPU, (90, 90))
resource.setrlimit(resource.RLIMIT_FSIZE, (30 * 1024**2, 30 * 1024**2))
from PIL import Image, ImageOps
Image.MAX_IMAGE_PIXELS = 24_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)

def ocr(image_path):
    with Image.open(image_path) as original:
        original.seek(0)
        image = ImageOps.exif_transpose(original).convert("RGB")
        image.thumbnail((2600, 3400))
        if max(image.size) < 1400:
            factor = min(2, 1400 / max(image.size))
            image = image.resize((int(image.width * factor), int(image.height * factor)))
        image = ImageOps.autocontrast(ImageOps.grayscale(image))
        with tempfile.TemporaryDirectory(prefix="poster-ocr-") as temp:
            normalized = pathlib.Path(temp) / "image.png"
            image.save(normalized)
            variants = []
            for mode in (3, 11):
                result = subprocess.run(["tesseract", str(normalized), "stdout", "-l", "eng", "--psm", str(mode), "tsv"], capture_output=True, text=True, timeout=22, check=True)
                lines = {}
                for row in csv.DictReader(io.StringIO(result.stdout), delimiter="\t"):
                    word = (row.get("text") or "").strip()
                    if row.get("level") != "5" or not word:
                        continue
                    key = tuple(row[field] for field in ("page_num", "block_num", "par_num", "line_num"))
                    line = lines.setdefault(key, {"words": [], "confidence": []})
                    line["words"].append(word)
                    line["confidence"].append(max(0, float(row["conf"])))
                output = [{"text": " ".join(line["words"]), "confidence": round(sum(line["confidence"]) / len(line["confidence"]) / 100, 3)} for line in lines.values()]
                score = sum(len(line["text"]) * line["confidence"] for line in output)
                variants.append((score, output))
            best = max(variants, key=lambda item: item[0])[1]
            return {"text": "\n".join(line["text"] for line in best)[:60000], "lines": best, "method": "tesseract"}

def read_document(filename, media_type):
    pages, links = [], []
    if media_type == "application/pdf":
        import pdfplumber
        with pdfplumber.open(filename) as pdf:
            total_pages = len(pdf.pages)
            for index, page in enumerate(pdf.pages[:6]):
                text = (page.extract_text() or "")[:60000]
                if len("".join(c for c in text if c.isalpha())) >= 60:
                    data = {"text": text, "lines": [{"text": line, "confidence": 0.98} for line in text.splitlines()], "method": "pdf_text"}
                else:
                    with tempfile.TemporaryDirectory(prefix="packet-page-") as temp:
                        target = str(pathlib.Path(temp) / "page")
                        subprocess.run(["pdftoppm", "-f", str(index + 1), "-l", str(index + 1), "-singlefile", "-scale-to", "2600", "-png", filename, target], capture_output=True, timeout=20, check=True)
                        data = ocr(target + ".png")
                data["page"] = index + 1
                pages.append(data)
                links.extend(link.get("uri") for link in page.hyperlinks if link.get("uri"))
                page.close()
    else:
        total_pages = 1
        pages = [{**ocr(filename), "page": 1}]
    return {"pages": pages, "links": links[:100], "totalPages": total_pages, "truncated": total_pages > len(pages)}

if __name__ == "__main__":
    try:
        print(json.dumps(read_document(sys.argv[1], sys.argv[2])))
    except Exception as error:
        # Do not echo source text or subprocess arguments into logs.
        print(json.dumps({"error": type(error).__name__}))
        sys.exit(1)
