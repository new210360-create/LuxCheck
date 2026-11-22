"""Local PDF plan extraction. Coordinates are PDF points, x right / y down."""
import base64
import io
import json
import math
import sys
from pathlib import Path

import numpy as np
import pdfplumber
import pypdfium2 as pdfium

MAX_PATHS = 16000
MAX_POINTS = 240000


def curve_points(obj):
    points, current = [], None
    for cmd in obj.get("path", []):
        if cmd[0] in ("m", "l"):
            current = (float(cmd[1][0]), float(cmd[1][1]))
            points.append(current)
        elif cmd[0] == "c" and current:
            a, b, c = cmd[1:4]
            start = current
            for i in range(1, 13):
                t = i / 12
                points.append(tuple((1-t)**3*start[k]+3*(1-t)**2*t*a[k]+3*(1-t)*t*t*b[k]+t**3*c[k] for k in (0, 1)))
            current = tuple(c)
    return points or [(float(x), float(y)) for x, y in obj.get("pts", [])]


def raster_paths(image, width, height):
    """Conservative isolated-symbol and long-stroke candidates for scanned pages."""
    img = image.convert("L")
    img.thumbnail((1350, 1350))
    binary = np.asarray(img) < 145
    hh, ww = binary.shape
    sx, sy = width / ww, height / hh
    seen = np.zeros_like(binary, dtype=bool)
    result = []
    for yy, xx in zip(*np.nonzero(binary)):
        if seen[yy, xx]:
            continue
        seen[yy, xx] = True
        stack, pixels = [(int(xx), int(yy))], []
        while stack:
            x, y = stack.pop()
            pixels.append((x, y))
            for nx, ny in ((x-1, y), (x+1, y), (x, y-1), (x, y+1)):
                if 0 <= nx < ww and 0 <= ny < hh and binary[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((nx, ny))
        if len(pixels) < 25:
            continue
        arr = np.asarray(pixels)
        x0, y0 = arr.min(axis=0)
        x1, y1 = arr.max(axis=0)
        bw, bh = x1-x0+1, y1-y0+1
        if min(bw, bh) < 9 or max(bw/ww, bh/hh) > .65:
            continue
        # Only enclosed-looking isolated symbols; text and wall networks are left for manual review.
        box = binary[y0:y1+1, x0:x1+1]
        side = min(float(box[:2].max(axis=0).mean()), float(box[-2:].max(axis=0).mean()),
                   float(box[:, :2].max(axis=1).mean()), float(box[:, -2:].max(axis=1).mean()))
        density = len(pixels) / (bw*bh)
        if side > .72:
            pts = [[x0*sx, y0*sy], [x1*sx, y0*sy], [x1*sx, y1*sy], [x0*sx, y1*sy]]
            result.append(dict(points=pts, closed=True, shape="rect", source="raster", strokeWidth=max(sx, sy)))
        elif .78 < bw/bh < 1.28 and .07 < density < .55:
            cx, cy = (x0+x1)/2, (y0+y1)/2
            radial = np.hypot((arr[:, 0]-cx)/(bw/2), (arr[:, 1]-cy)/(bh/2))
            # Ring plus cross symbols are permitted; glyphs remain uncertain candidates.
            if np.quantile(radial, .8) > .8 and np.quantile(radial, .98) < 1.18:
                pts = [[(cx+bw/2*math.cos(t))*sx, (cy+bh/2*math.sin(t))*sy] for t in np.linspace(0, 2*math.pi, 32, endpoint=False)]
                result.append(dict(points=pts, closed=True, shape="circle", source="raster", strokeWidth=max(sx, sy)))
        if len(result) > 2500:
            break
    # Long horizontal / vertical runs supply editable wall candidates, including networks joined at corners.
    for transpose in (False, True):
        data = binary.T if transpose else binary
        bands = {}
        min_run = max(30, int(data.shape[1]*.035))
        for row, values in enumerate(data):
            edges = np.diff(np.r_[False, values, False].astype(np.int8))
            for start, end in zip(np.flatnonzero(edges == 1), np.flatnonzero(edges == -1)):
                if end-start < min_run:
                    continue
                key = (round(int(start)/4), round(int(end)/4))
                previous = bands.get(key)
                if previous and row-previous[1] <= 2:
                    previous[1] = row
                else:
                    bands[key] = [row, row, int(start), int(end)]
                    previous = bands[key]
                    if transpose:
                        pts = [[row*sx, start*sy], [row*sx, end*sy]]
                    else:
                        pts = [[start*sx, row*sy], [end*sx, row*sy]]
                    previous.append(len(result))
                    result.append(dict(points=pts, closed=False, shape="line", source="raster", strokeWidth=1))
                item = result[previous[4]]
                center = (previous[0]+row)/2
                if transpose:
                    item["points"] = [[center*sx, previous[2]*sy], [center*sx, previous[3]*sy]]
                    item["strokeWidth"] = (row-previous[0]+1)*sx
                else:
                    item["points"] = [[previous[2]*sx, center*sy], [previous[3]*sx, center*sy]]
                    item["strokeWidth"] = (row-previous[0]+1)*sy
    return result[:5000]


def extract(source, number):
    warnings = []
    with pdfplumber.open(source) as pdf:
        if not 1 <= number <= len(pdf.pages):
            raise ValueError("所選頁碼超出 PDF 頁數。")
        page = pdf.pages[number-1]
        width, height = float(page.width), float(page.height)
        if not (10 < width < 20000 and 10 < height < 20000):
            raise ValueError("PDF 頁面尺寸不支援，請另存一般圖紙大小。")
        ox, oy = page.bbox[:2]
        paths = []
        count = 0
        curves = []
        for obj in page.curves:
            parts, part = [], []
            for cmd in obj.get("path", []):
                if cmd[0] == "m" and part:
                    parts.append(part)
                    part = []
                part.append(cmd)
            if part:
                parts.append(part)
            if len(parts) > 1:
                curves.extend(dict(obj, path=part) for part in parts)
            else:
                curves.append(obj)
        for obj in page.lines + page.rects + curves:
            kind = obj["object_type"]
            if obj.get("non_stroking_color") in ((1, 1, 1), (1,), 1) and not obj.get("stroke", True):
                continue
            if kind == "rect":
                x0, x1, y0, y1 = float(obj["x0"]), float(obj["x1"]), float(obj["top"]), float(obj["bottom"])
                pts, closed, shape = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)], True, "rect"
            elif kind == "line":
                # pdfplumber pts preserve the sign of sloping lines; bbox corners alone do not.
                pts = [(float(x), float(y)) for x, y in obj.get("pts", [])]
                if len(pts) != 2:
                    pts = [(float(obj["x0"]), float(obj["top"])), (float(obj["x1"]), float(obj["bottom"]))]
                closed, shape = False, "line"
            else:
                pts = curve_points(obj)
                closed = len(pts) > 2 and (obj.get("fill") or math.dist(pts[0], pts[-1]) < .15 or any(c[0] == "h" for c in obj.get("path", [])))
                shape = "path"
                if closed and len(pts) > 8:
                    ar = np.asarray(pts)
                    center = (ar.min(axis=0)+ar.max(axis=0))/2
                    radii = (ar.max(axis=0)-ar.min(axis=0))/2
                    if min(radii) > .1:
                        dist = np.sqrt(np.sum(((ar-center)/radii)**2, axis=1))
                        if np.std(dist) < .075:
                            shape = "circle" if .75 < radii[0]/radii[1] < 1.33 else "ellipse"
                elif closed and len(pts) in (4, 5):
                    shape = "rect"
            pts = [[round(float(x)-ox, 4), round(float(y)-oy, 4)] for x, y in pts]
            if len(pts) > 2 and math.dist(pts[0], pts[-1]) < .01:
                pts.pop()
            if len(pts) < 2 or any(not math.isfinite(v) for p in pts for v in p):
                continue
            count += len(pts)
            if len(paths) >= MAX_PATHS or count > MAX_POINTS:
                raise ValueError("圖面向量過多，請先另存需要的樓層或局部範圍。")
            paths.append(dict(points=pts, closed=bool(closed), shape=shape, source="vector", strokeWidth=float(obj.get("linewidth") or 0)))
        texts = []
        if len(page.chars) <= 80000:
            for word in page.extract_words()[:16000]:
                texts.append(dict(text=word["text"], x0=float(word["x0"])-ox, y0=float(word["top"])-oy, x1=float(word["x1"])-ox, y1=float(word["bottom"])-oy))
        else:
            warnings.append("文字數量過多，本頁未使用文字提示辨識。")
        document = pdfium.PdfDocument(source)
        rendered_page = document[number-1]
        rendered_page.set_cropbox(*rendered_page.get_mediabox())
        rw, rh = rendered_page.get_size()
        if abs(rw-width) > 1 or abs(rh-height) > 1:
            raise ValueError("此 PDF 的旋轉或裁切座標無法對齊，請以列印方式另存 PDF 後匯入。")
        bitmap = rendered_page.render(scale=min(2.5, 1900/max(width, height)))
        image = bitmap.to_pil().convert("RGB")
        vector_count = len(paths)
        scanned = vector_count < 5 and bool(page.images)
        if scanned:
            paths.extend(raster_paths(image, width, height))
            warnings.append("本頁為掃描或圖片型 PDF；幾何候選較不確定，請逐項核對或手動補畫。")
        if not paths:
            warnings.append("未找到可分類的線條，可在原圖上手動標記燈具、桌面與牆面。")
        stream = io.BytesIO()
        image.save(stream, format="PNG", optimize=True)
        for i, item in enumerate(paths):
            item["id"] = "pdf-" + str(i)
        result = dict(page=number, pages=len(pdf.pages), width=width, height=height, paths=paths, texts=texts,
                      preview="data:image/png;base64,"+base64.b64encode(stream.getvalue()).decode("ascii"),
                      vectorCount=vector_count, mode="raster" if scanned else "vector", warnings=warnings)
        image.close()
        bitmap.close()
        rendered_page.close()
        document.close()
        return result


if __name__ == "__main__":
    try:
        result = extract(sys.argv[1], int(sys.argv[2]))
        Path(sys.argv[3]).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
