"""normalizer.py — Helpers de normalización.

Funciones pequeñas y reutilizables que aparecen en casi todos los scrapers.
"""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any


def clean_text(s: str | None) -> str:
    """Quita espacios duplicados, \r, \t; trim."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", s.replace("\r", " ").replace("\t", " ")).strip()


def to_float(s: Any) -> float | None:
    """Convierte strings tipo '1,234.56' o 'S/ 1.234,56' a float. None si no se puede."""
    if s is None or s == "":
        return None
    if isinstance(s, (int, float)):
        return float(s)
    s = str(s).strip()
    # Quitar símbolos de moneda y espacios
    s = re.sub(r"[S$/€\s]", "", s)
    # Formato europeo: 1.234,56 → 1234.56
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # Solo coma, podría ser decimal o miles
        parts = s.split(",")
        if len(parts[-1]) == 3 and len(parts) > 1:  # miles
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    try:
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_date(s: str | None) -> str | None:
    """Intenta parsear fecha en formatos comunes del Estado peruano. Devuelve ISO."""
    if not s:
        return None
    s = s.strip()
    formats = [
        "%Y-%m-%dT%H:%M:%S",  # ISO
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d/%m/%Y - %H:%M",
        "%Y-%m-%d %H:%M:%S",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(s, fmt).isoformat()
        except ValueError:
            continue
    return None


def flatten_organization(org: dict | None) -> dict | None:
    """Normaliza distintos formatos de 'organization' a un dict consistente."""
    if not org:
        return None
    if isinstance(org, dict):
        return {
            "id": org.get("id"),
            "name": org.get("name") or org.get("title"),
            "title": org.get("title") or org.get("name"),
        }
    if isinstance(org, str):
        return {"id": None, "name": org, "title": org}
    return None
