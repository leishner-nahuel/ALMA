"""Servidor local liviano de ALMA. La interfaz y la lógica principal están en app.js."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError
from urllib.parse import urlsplit, parse_qs, quote
import csv
import io
import math
from pathlib import Path
from functools import partial
import json

BASE = Path(__file__).resolve().parent
NOAA_ONI = "https://www.cpc.ncep.noaa.gov/data/indices/oni.ascii.txt"
NOAA_OISST = "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21NrtAgg.csv"

class ALMAHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        route = urlsplit(self.path).path
        if route == "/api/oisst":
            try:
                params = parse_qs(urlsplit(self.path).query)
                lat = float(params.get("lat", [""])[0])
                lon = float(params.get("lon", [""])[0])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    raise ValueError("Coordenadas fuera de rango")

                # NOAA OISST usa celdas globales de 0,25 grados y longitud 0..360.
                lat_index = max(0, min(719, round((lat + 89.875) / 0.25)))
                lon360 = lon % 360
                lon_index = max(0, min(1439, round((lon360 - 0.125) / 0.25)))
                grid_lat = -89.875 + lat_index * 0.25
                grid_lon = 0.125 + lon_index * 0.25
                query = f"anom[(last)][(0.0)][({grid_lat:.3f})][({grid_lon:.3f})]"
                url = NOAA_OISST + "?" + quote(query, safe="[](),.:+-")
                req = Request(url, headers={"User-Agent": "ALMA-educational-dashboard/1.1", "Accept": "text/csv"})
                with urlopen(req, timeout=20) as response:
                    csv_text = response.read().decode("utf-8", "replace")
                anomaly = None
                data_date = None
                for row in reversed(list(csv.reader(io.StringIO(csv_text)))):
                    if len(row) >= 5:
                        try:
                            value = float(row[-1])
                            if math.isfinite(value) and value > -9:
                                anomaly = value
                                data_date = row[0]
                                break
                        except (ValueError, TypeError):
                            continue
                if anomaly is None:
                    raise ValueError("NOAA no tiene un dato oceánico válido para este punto (puede ser tierra o una celda sin dato)")
                payload = {"anomaly_c": anomaly, "date": data_date, "grid_lat": grid_lat, "grid_lon": grid_lon,
                           "source": "NOAA NCEI OISST v2.1 preliminary", "resolution_degrees": 0.25,
                           "latency": "producto diario preliminar; aproximadamente 1 día de demora"}
                body, status = json.dumps(payload).encode(), 200
            except (URLError, HTTPError, TimeoutError, ValueError, IndexError) as error:
                body, status = json.dumps({"error": "No se pudo obtener la anomalía diaria NOAA", "detail": str(error)}).encode(), 503
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if route == "/api/enso-grid":
            try:
                # Malla diaria real sobre el Pacífico ecuatorial: 5° entre puntos.
                query = "anom[(last)][(0.0)][(-9.875):10:(5.125)][(190.125):10:(280.125)]"
                url = NOAA_OISST + "?" + quote(query, safe="[](),.:+-")
                req = Request(url, headers={"User-Agent": "ALMA-educational-dashboard/1.1", "Accept": "text/csv"})
                with urlopen(req, timeout=25) as response:
                    csv_text = response.read().decode("utf-8", "replace")
                points = []
                dates = []
                for row in csv.reader(io.StringIO(csv_text)):
                    if len(row) < 5:
                        continue
                    try:
                        lat_value, lon_value, anomaly = float(row[2]), float(row[3]), float(row[4])
                        if math.isfinite(anomaly) and anomaly > -9:
                            points.append({"lat": lat_value, "lng": lon_value if lon_value <= 180 else lon_value - 360, "anomaly_c": anomaly})
                            dates.append(row[0])
                    except (ValueError, TypeError):
                        continue
                if not points:
                    raise ValueError("NOAA no devolvió puntos válidos para el Pacífico ecuatorial")
                payload = {"points": points, "date": dates[-1], "source": "NOAA NCEI OISST v2.1 preliminary",
                           "spacing_degrees": 2.5, "latency": "producto diario preliminar; aproximadamente 1 día de demora"}
                body, status = json.dumps(payload).encode(), 200
            except (URLError, HTTPError, TimeoutError, ValueError, IndexError) as error:
                body, status = json.dumps({"error": "No se pudo obtener la malla diaria NOAA", "detail": str(error)}).encode(), 503
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if route == "/api/oni":
            try:
                req = Request(NOAA_ONI, headers={"User-Agent": "ALMA-educational-dashboard/1.0"})
                with urlopen(req, timeout=12) as response:
                    lines = response.read().decode("utf-8", "replace").splitlines()
                rows = [line.split() for line in lines[1:] if len(line.split()) == 4]
                season, year, _sst, anomaly = rows[-1]
                payload = {"season": season, "year": int(year), "anomaly": float(anomaly),
                           "source": "NOAA Climate Prediction Center", "frequency": "trimestral"}
                body, status = json.dumps(payload).encode(), 200
            except (URLError, TimeoutError, ValueError, IndexError) as error:
                body, status = json.dumps({"error": "No se pudo obtener el índice ONI", "detail": str(error)}).encode(), 503
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

if __name__ == "__main__":
    handler = partial(ALMAHandler, directory=str(BASE))
    server = ThreadingHTTPServer(("127.0.0.1", 8000), handler)
    print("ALMA disponible en http://127.0.0.1:8000  (Ctrl+C para cerrar)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor ALMA detenido.")
        server.server_close()
