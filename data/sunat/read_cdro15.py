import openpyxl, os

base = r'C:\Users\acuba\appsperu\data\sunat'

for fname in ['cdro_15.xlsx', 'cdro_16.xlsx']:
    path = os.path.join(base, fname)
    if not os.path.exists(path):
        print('MISSING: ' + fname)
        continue
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb.active
    print('=== ' + fname + ' (' + str(ws.max_row) + 'r x ' + str(ws.max_column) + 'c) ===')
    # Show rows 1-12
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i >= 12:
            break
        vals = []
        for c in row:
            vals.append(str(c)[:28] if c is not None else '')
        print('  r' + str(i+1) + ': ' + ' | '.join(vals))
    # Show first 10 data rows
    print('  ... data rows:')
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i < 10:
            continue
        vals = []
        for c in row:
            vals.append(str(c)[:28] if c is not None else '')
        print('  r' + str(i+1) + ': ' + ' | '.join(vals))
        if i >= 18:
            break
    print()
