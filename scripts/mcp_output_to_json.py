"""Extract JSON array from Supabase MCP execute_sql output file. Usage: python scripts/mcp_output_to_json.py <input.txt> <output.json>"""
import sys, json, os
if len(sys.argv) < 3:
    print("Usage: mcp_output_to_json.py <input.txt> <output.json>")
    sys.exit(1)
raw = open(sys.argv[1], "r", encoding="utf-8").read()
start = raw.find("[{")
if start < 0:
    start = raw.find("[\n")
if start < 0:
    print("No JSON array start found")
    sys.exit(1)
depth = 0
i = start
while i < len(raw):
    c = raw[i]
    if c == "[" or c == "{":
        depth += 1
    elif c == "]" or c == "}":
        depth -= 1
        if depth == 0:
            i += 1
            break
    elif c == "\\" and i + 1 < len(raw) and raw[i + 1] == '"':
        i += 1
    i += 1
js = raw[start:i]
if "\\\"" in js:
    js = js.replace("\\\"", "\"")
try:
    data = json.loads(js)
except json.JSONDecodeError as e:
    print("JSON error:", e)
    sys.exit(1)
out = sys.argv[2]
os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
with open(out, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False)
print(out, len(data), "rows")
