import json
d = json.load(open(r'C:\Users\acuba\appsperu\docs\inventario-fuentes\catalog.json', encoding='utf-8'))

# Check Viáticos
for ds in d['datasets']:
    if 'viático' in ds['title'].lower() or 'viaticos' in ds['title'].lower():
        print(f"--- {ds['title']}")
        print(f"   tags: {ds.get('tags', [])}")
        print(f"   url: {ds.get('url', '')[:120]}")
        print(f"   resources[0].url: {ds['resources'][0].get('url', '')[:120] if ds['resources'] else 'N/A'}")
        print(f"   notes: {ds.get('notes', '')[:200]}")
        break

# Check a few more
for needle in ['Vehículos', 'Telefónicos', 'Publicidad', 'Ordenes']:
    for ds in d['datasets']:
        if needle.lower() in ds['title'].lower():
            print(f"\n--- {ds['title']}")
            print(f"   tags: {ds.get('tags', [])}")
            res0 = ds['resources'][0].get('url', '') if ds['resources'] else ''
            print(f"   resource[0].url: {res0[:140]}")
            break
