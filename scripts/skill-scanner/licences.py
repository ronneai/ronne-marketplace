# Lists every installed Python distribution and its licence, one per line, for the licence
# review when SkillSpector's pin moves (docs/knowledge/skill-scanner.md). Run it inside the image:
#   docker run --rm --network none --entrypoint python \
#     -v "$PWD/scripts/skill-scanner/licences.py:/l.py:ro" skillspector:2.13.2 -I /l.py
import importlib.metadata as metadata


def licence(meta):
    expression = meta.get("License-Expression")
    if expression:
        return expression
    classifiers = [
        c.split(" :: ")[-1] for c in meta.get_all("Classifier") or [] if c.startswith("License ::")
    ]
    if classifiers:
        return "; ".join(classifiers)
    text = (meta.get("License") or "").strip()
    return text.splitlines()[0][:60] if text else "UNKNOWN"


for dist in sorted(metadata.distributions(), key=lambda d: d.metadata["Name"].lower()):
    print(f"{dist.metadata['Name']}=={dist.metadata['Version']}\t{licence(dist.metadata)}")
