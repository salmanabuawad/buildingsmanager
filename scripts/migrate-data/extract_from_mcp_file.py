"""Parse MCP tool output file (JSON with 'result' key) and extract the array to export_*.json"""
import json
import sys

def main():
    path = sys.argv[1]
    outpath = sys.argv[2]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    result = data.get("result", "")
    start = result.find("[")
    if start < 0:
        print("No array in result", file=sys.stderr)
        sys.exit(1)
    depth = 0
    end = start
    for i, c in enumerate(result[start:], start):
        if c == "[": depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    arr_str = result[start:end]
    arr = json.loads(arr_str)
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(arr, f, ensure_ascii=False)
    print(f"Wrote {len(arr)} rows to {outpath}")

if __name__ == "__main__":
    main()
