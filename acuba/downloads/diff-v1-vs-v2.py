"""Genera diff unificado v1 (runbook original) vs v2 (runbook contrastado)."""
import difflib, sys, pathlib

v1 = pathlib.Path(r"C:\Users\acuba\.minimax\v2\assets\2026\08\26\18-06-40-398-asset_20260826-180640-398_30f89a18e121_4aa753e3-runbook-ingesta-alsol-5-regiones.md").read_text(encoding="utf-8").splitlines(keepends=True)
v2 = pathlib.Path(r"C:\Users\acuba\appsperu\acuba\downloads\runbook-ingesta-alsol-5-regiones.md").read_text(encoding="utf-8").splitlines(keepends=True)

diff = difflib.unified_diff(
    v1, v2,
    fromfile="v1 (attachment, 2026-08-26 18:06)",
    tofile="v2 (cursor/alsol-ingest-5-regiones-f938 @ d699cf0)",
    n=2,
)
out = "".join(diff)
pathlib.Path(r"C:\Users\acuba\appsperu\acuba\downloads\runbook-v1-vs-v2.diff").write_text(out, encoding="utf-8")
print(f"v1 lines: {len(v1)}, v2 lines: {len(v2)}")
print(f"diff bytes: {len(out)}")
print(f"wrote: acuba/downloads/runbook-v1-vs-v2.diff")
# Resumen
adds = sum(1 for l in out.splitlines() if l.startswith("+") and not l.startswith("+++"))
dels = sum(1 for l in out.splitlines() if l.startswith("-") and not l.startswith("---"))
print(f"+{adds} -{dels}")
