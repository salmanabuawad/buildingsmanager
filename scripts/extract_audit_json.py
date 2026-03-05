import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
raw_path = os.path.join(root, "standalone", "seed", "data", "audit_raw.txt")
out_path = os.path.join(root, "standalone", "seed", "data", "audit.json")
raw = open(raw_path, "r", encoding="utf-8").read()
start = raw.find("[{")
if start == -1:
    start = raw.find("[\n")
end = raw.rfind("]") + 1
if start >= 0 and end > start:
    js = raw[start:end]
    if "\\\"" in js:
        js = js.replace("\\\"", "\"")
    data = json.loads(js)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    print("audit.json rows:", len(data))
else:
    print("Could not extract JSON")
