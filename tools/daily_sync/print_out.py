import json

p = r"D:\tm-ia\tools\daily_sync\out.json"
j = json.load(open(p, "r", encoding="utf-8"))

print("SKUs:", len(j.get("prices", [])))
print("veoModels entries:", len(j.get("veoModels", [])))

for m in j.get("veoModels", [])[:20]:
    print(m)
