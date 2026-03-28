import json


def to_json(data):
    return json.dumps(data, separators=(',', ':'))


def from_json(raw):
    try:
        return json.loads(raw)
    except Exception:
        return None
