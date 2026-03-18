"""Extract JSON array from MCP execute_sql result text (from file or stdin)."""
import re
import sys

def extract(path=None):
    text = open(path, "r", encoding="utf-8").read() if path else sys.stdin.read()
    # MCP wraps result in <untrusted-data-...>\n[JSON]\n</untrusted-data
    idx = text.find("<untrusted-data-")
    if idx < 0:
        idx = 0
    start = text.find("[", idx)
    if start < 0:
        return None
    depth = 0
    end = start
    for i, ch in enumerate(text[start:], start):
        if ch == "[": depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    out = text[start:end]
    # MCP result may be double-escaped (\" in the JSON string)
    if '\\"' in out:
        out = out.replace('\\"', '"')
    return out

if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else None
    outpath = sys.argv[2] if len(sys.argv) > 2 else None
    out = extract(path)
    if out:
        if outpath:
            open(outpath, "w", encoding="utf-8").write(out)
        else:
            sys.stdout.reconfigure(encoding="utf-8")
            sys.stdout.write(out)
    else:
        sys.exit(1)
