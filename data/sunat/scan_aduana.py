import openpyxl, os, sys

base = r'C:\Users\acuba\appsperu\data\sunat'
keywords = ['aduana', 'salaverry', 'paita', 'chimbote', 'pisco', 'matarani', 'ilo', 'tubarao']

for f in sorted(os.listdir(base)):
    if not f.endswith('.xlsx'):
        continue
    path = os.path.join(base, f)
    try:
        wb = openpyxl.load_workbook(path, data_only=True)
    except Exception as e:
        print(f'ERROR {f}: {e}')
        continue
    for ws in wb.worksheets:
        for ridx, row in enumerate(ws.iter_rows(values_only=True)):
            for cidx, cell in enumerate(row):
                if cell and isinstance(cell, str):
                    low = cell.lower()
                    if any(kw in low for kw in keywords):
                        ctx = [str(c)[:25] if c else '' for c in row[:8]]
                        print(f'{f} | r{ridx+1}c{cidx+1}: {" | ".join(ctx)}')
                        break
