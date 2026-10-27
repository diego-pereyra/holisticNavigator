#!/usr/bin/env python3
"""Servidor estático con soporte de HTTP Range (para imitar a GitHub Pages).

Un solo archivo compartido por los workflows que necesitan servir la dist
(deploy-pages, uat, demo): antes estaba copiado dentro de cada .yml y las copas
habían derivado (una con `st_size` sin paréntesis mandaba un Content-Length
inútil y el navegador cortaba la conexión: ERR_EMPTY_RESPONSE).

Se lee el archivo completo a memoria por request: sin file descriptors
filtrados, sin estado residual entre pedidos keep-alive del mismo handler.
"""
import http.server
import io
import os
import re


class RangeHandler(http.server.SimpleHTTPRequestHandler):
    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return super().send_head()
        try:
            with open(path, "rb") as fh:
                data = fh.read()
        except OSError:
            self.send_error(404, "File not found")
            return None
        size = len(data)
        ctype = self.guess_type(path)
        rng = self.headers.get("Range")
        m = re.match(r"bytes=(\d*)-(\d*)$", rng.strip()) if rng else None
        if m and (m.group(1) or m.group(2)):
            if m.group(1):
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else size - 1
            else:
                start = max(0, size - int(m.group(2)))
                end = size - 1
            if start >= size:
                self.send_response(416)
                self.send_header("Content-Range", "bytes */%d" % size)
                self.end_headers()
                return None
            end = min(end, size - 1)
            body = data[start:end + 1]
            self.send_response(206)
            self.send_header("Content-type", ctype)
            self.send_header("Content-Range", "bytes %d-%d/%d" % (start, end, size))
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Accept-Ranges", "bytes")
            self.end_headers()
            return io.BytesIO(body)
        self.send_response(200)
        self.send_header("Content-type", ctype)
        self.send_header("Content-Length", str(size))
        self.send_header("Accept-Ranges", "bytes")
        self.end_headers()
        return io.BytesIO(data)


if __name__ == "__main__":
    import sys

    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8087
    root = sys.argv[2] if len(sys.argv) > 2 else "."
    os.chdir(root)
    http.server.ThreadingHTTPServer(("", port), RangeHandler).serve_forever()
