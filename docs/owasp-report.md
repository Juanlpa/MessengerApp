# OWASP ZAP — Reporte de Análisis Dinámico

> Herramienta: OWASP ZAP Community Edition  
> Tipo: Análisis dinámico automatizado (DAST)  
> Estado: Pendiente — ejecutar en Fase 20

---

## Cómo ejecutar el scan

### Prerequisitos
- OWASP ZAP instalado: https://www.zaproxy.org/download/
- App corriendo localmente en `http://localhost:3000`

### Comandos

```bash
# Levantar la app
npm run build && npm start

# Baseline scan (en otra terminal)
zap-baseline.py -t http://localhost:3000 -r owasp-report.html

# O via Docker
docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py \
  -t http://localhost:3000 \
  -r report_html.html
```

---

## Hallazgos

> Completar después de ejecutar el scan en Fase 20.

| ID | Severidad | Descripción | Estado |
|----|-----------|-------------|--------|
| — | — | Pendiente de ejecutar | — |

---

## Vulnerabilidades Corregidas

> Listar aquí las vulnerabilidades encontradas y cómo se corrigieron.

---

## Resultado Final

- [ ] Scan ejecutado
- [ ] 0 vulnerabilidades High
- [ ] 0 vulnerabilidades Critical
- [ ] Re-scan post-corrección ejecutado
- [ ] Reporte archivado
