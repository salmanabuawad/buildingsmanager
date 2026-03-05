import json
path = r'C:\Users\salma\.cursor\projects\c-production-buildingsmanager\agent-tools\05b6f498-db6b-47b4-ae28-8a232e1987a7.txt'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
i = content.find('[')
start = i
depth = 0
while i < len(content):
    if content[i] == '[': depth += 1
    elif content[i] == ']':
        depth -= 1
        if depth == 0:
            json_str = content[start:i+1]
            break
    i += 1
decoded = json_str.encode('utf-8').decode('unicode_escape')
data = json.loads(decoded)
out_path = r'c:\production\buildingsmanager\standalone\seed\data\field_configurations_supabase.json'
with open(out_path, 'w', encoding='utf-8') as out:
    json.dump(data, out, ensure_ascii=False, indent=2)
print('OK items:', len(data))
