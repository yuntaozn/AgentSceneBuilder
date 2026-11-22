#!/usr/bin/env python3
"""Deterministic, read-only probes for the AgentSceneBuilder skill."""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = ROOT / "catalog"


class ProbeError(Exception):
    pass


def emit(payload: dict[str, Any], exit_code: int = 0) -> int:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return exit_code


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise ProbeError(f"File not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ProbeError(f"Invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}") from exc
    except OSError as exc:
        raise ProbeError(f"Cannot read {path}: {exc}") from exc


def load_glb_json(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    try:
        raw = path.read_bytes()
    except FileNotFoundError as exc:
        raise ProbeError(f"File not found: {path}") from exc
    except OSError as exc:
        raise ProbeError(f"Cannot read {path}: {exc}") from exc

    if len(raw) < 20:
        raise ProbeError("GLB file is too small to contain a valid header and JSON chunk")
    magic, version, declared_length = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF":
        raise ProbeError("Invalid GLB magic header")
    if declared_length != len(raw):
        raise ProbeError(f"GLB declared length {declared_length} does not match file size {len(raw)}")

    offset = 12
    json_chunk = None
    chunk_types: list[str] = []
    while offset + 8 <= len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        end = offset + chunk_length
        if end > len(raw):
            raise ProbeError("GLB chunk extends beyond the declared file length")
        chunk_name = struct.pack("<I", chunk_type).decode("ascii", errors="replace")
        chunk_types.append(chunk_name)
        if chunk_type == 0x4E4F534A and json_chunk is None:
            json_chunk = raw[offset:end]
        offset = end

    if json_chunk is None:
        raise ProbeError("GLB has no JSON chunk")
    try:
        document = json.loads(json_chunk.rstrip(b" \t\r\n\x00").decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProbeError(f"Invalid GLB JSON chunk: {exc}") from exc
    return document, {"glbVersion": version, "chunkTypes": chunk_types}


def vec3(value: Any) -> list[float] | None:
    if not isinstance(value, list) or len(value) < 3:
        return None
    if not all(isinstance(item, (int, float)) and math.isfinite(item) for item in value[:3]):
        return None
    return [float(value[0]), float(value[1]), float(value[2])]


def declared_bounds(document: dict[str, Any]) -> dict[str, Any] | None:
    mins: list[list[float]] = []
    maxs: list[list[float]] = []
    for accessor in document.get("accessors", []):
        if accessor.get("type") != "VEC3":
            continue
        low = vec3(accessor.get("min"))
        high = vec3(accessor.get("max"))
        if low is not None and high is not None:
            mins.append(low)
            maxs.append(high)
    if not mins:
        return None
    low = [min(item[index] for item in mins) for index in range(3)]
    high = [max(item[index] for item in maxs) for index in range(3)]
    return {
        "min": low,
        "max": high,
        "size": [high[index] - low[index] for index in range(3)],
        "center": [(high[index] + low[index]) / 2 for index in range(3)],
        "source": "accessor min/max declarations; node transforms are not applied",
    }


def inspect_asset(path: Path) -> dict[str, Any]:
    suffix = path.suffix.lower()
    if suffix == ".glb":
        document, container = load_glb_json(path)
    elif suffix == ".gltf":
        document = load_json(path)
        container = {"format": "gltf-json"}
    else:
        raise ProbeError("Supported asset formats are .glb and .gltf")
    if not isinstance(document, dict):
        raise ProbeError("glTF root must be a JSON object")

    warnings: list[dict[str, str]] = []
    external_uris: list[str] = []
    missing_uris: list[str] = []
    for group in ("buffers", "images"):
        for item in document.get(group, []):
            uri = item.get("uri") if isinstance(item, dict) else None
            if not isinstance(uri, str) or uri.startswith("data:"):
                continue
            external_uris.append(uri)
            if not (path.parent / uri).exists():
                missing_uris.append(uri)
    if missing_uris:
        warnings.append({"code": "ASSET_MISSING_DEPENDENCY", "message": f"Missing external resources: {', '.join(missing_uris)}"})
    bounds = declared_bounds(document)
    if bounds is None:
        warnings.append({"code": "ASSET_BOUNDS_UNAVAILABLE", "message": "No VEC3 accessor min/max declarations were found; render-time bounds are still required."})
    if not document.get("meshes"):
        warnings.append({"code": "ASSET_NO_MESHES", "message": "The asset declares no meshes."})

    return {
        "ok": True,
        "kind": "asset-inspection",
        "path": str(path.resolve()),
        "bytes": path.stat().st_size,
        "container": container,
        "asset": document.get("asset", {}),
        "counts": {
            "scenes": len(document.get("scenes", [])),
            "nodes": len(document.get("nodes", [])),
            "meshes": len(document.get("meshes", [])),
            "materials": len(document.get("materials", [])),
            "textures": len(document.get("textures", [])),
            "images": len(document.get("images", [])),
            "animations": len(document.get("animations", [])),
            "accessors": len(document.get("accessors", [])),
        },
        "declaredBounds": bounds,
        "externalUris": external_uris,
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
        "warnings": warnings,
        "limitations": ["This is a structural probe. Visual quality and transformed world bounds require rendering."],
    }


def issue(level: str, code: str, message: str, location: str | None = None) -> dict[str, str]:
    result = {"level": level, "code": code, "message": message}
    if location:
        result["location"] = location
    return result


def validate_vec3(value: Any, location: str, issues: list[dict[str, str]]) -> None:
    if not isinstance(value, list) or len(value) != 3 or not all(isinstance(v, (int, float)) and math.isfinite(v) for v in value):
        issues.append(issue("error", "SCENE_INVALID_VEC3", "Expected three finite numeric values.", location))


def validate_scene(path: Path) -> dict[str, Any]:
    document = load_json(path)
    if not isinstance(document, dict):
        raise ProbeError("Scene root must be a JSON object")
    issues: list[dict[str, str]] = []
    objects = document.get("objects", document.get("entities", []))
    if not isinstance(objects, list):
        issues.append(issue("error", "SCENE_OBJECTS_NOT_ARRAY", "objects/entities must be an array."))
        objects = []
    if not objects:
        issues.append(issue("warning", "SCENE_EMPTY", "The scene contains no objects or entities."))

    ids: set[str] = set()
    for index, obj in enumerate(objects):
        location = f"objects[{index}]"
        if not isinstance(obj, dict):
            issues.append(issue("error", "SCENE_OBJECT_NOT_OBJECT", "Scene item must be an object.", location))
            continue
        object_id = obj.get("id")
        if not isinstance(object_id, str) or not object_id.strip():
            issues.append(issue("error", "SCENE_ID_MISSING", "Scene item requires a non-empty string id.", location))
        elif object_id in ids:
            issues.append(issue("error", "SCENE_ID_DUPLICATE", f"Duplicate id: {object_id}", location))
        else:
            ids.add(object_id)
        for field in ("position", "rotation", "scale", "size"):
            if field in obj:
                validate_vec3(obj[field], f"{location}.{field}", issues)

    material_ids = {item.get("id") for item in document.get("materials", []) if isinstance(item, dict) and isinstance(item.get("id"), str)}
    camera_ids = {item.get("id") for item in document.get("cameras", []) if isinstance(item, dict) and isinstance(item.get("id"), str)}
    for index, obj in enumerate(objects):
        if not isinstance(obj, dict):
            continue
        target = obj.get("target")
        if isinstance(target, str) and target not in ids:
            issues.append(issue("error", "SCENE_TARGET_MISSING", f"Target does not exist: {target}", f"objects[{index}].target"))
        material = obj.get("material")
        if isinstance(material, str) and material not in material_ids:
            issues.append(issue("error", "SCENE_MATERIAL_MISSING", f"Material does not exist: {material}", f"objects[{index}].material"))

    steps = document.get("steps", [])
    if isinstance(steps, list):
        for step_index, step in enumerate(steps):
            if not isinstance(step, dict):
                issues.append(issue("error", "SCENE_STEP_NOT_OBJECT", "Step must be an object.", f"steps[{step_index}]"))
                continue
            camera = step.get("camera")
            if isinstance(camera, str) and camera not in camera_ids:
                issues.append(issue("error", "SCENE_CAMERA_MISSING", f"Camera does not exist: {camera}", f"steps[{step_index}].camera"))
            for field in ("show", "hide", "highlight"):
                refs = step.get(field, [])
                if isinstance(refs, list):
                    for ref_index, ref in enumerate(refs):
                        if isinstance(ref, str) and ref not in ids:
                            issues.append(issue("error", "SCENE_STEP_REFERENCE_MISSING", f"Referenced object does not exist: {ref}", f"steps[{step_index}].{field}[{ref_index}]"))

    error_count = sum(item["level"] == "error" for item in issues)
    warning_count = sum(item["level"] == "warning" for item in issues)
    return {
        "ok": error_count == 0,
        "kind": "scene-validation",
        "path": str(path.resolve()),
        "summary": {
            "objects": len(objects),
            "materials": len(document.get("materials", [])) if isinstance(document.get("materials", []), list) else 0,
            "cameras": len(document.get("cameras", [])) if isinstance(document.get("cameras", []), list) else 0,
            "steps": len(steps) if isinstance(steps, list) else 0,
            "errors": error_count,
            "warnings": warning_count,
        },
        "issues": issues,
        "limitations": ["Structural validation does not prove visual or instructional correctness."],
    }


def catalog_entries() -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    if not CATALOG_ROOT.exists():
        return entries
    for path in sorted(CATALOG_ROOT.rglob("*.json")):
        try:
            entry = load_json(path)
        except ProbeError:
            continue
        if isinstance(entry, dict):
            entry = dict(entry)
            entry["manifestPath"] = str(path.relative_to(ROOT)).replace("\\", "/")
            entries.append(entry)
    return entries


def searchable_text(entry: dict[str, Any]) -> str:
    values: list[str] = []
    for key in ("id", "title", "description", "goals", "tags", "usefulFor", "limitations", "notAStandard"):
        value = entry.get(key)
        if isinstance(value, str):
            values.append(value)
        elif isinstance(value, list):
            values.extend(str(item) for item in value)
    return " ".join(values).lower()


def search_catalog(query: str) -> dict[str, Any]:
    terms = [term.lower() for term in query.split() if term.strip()]
    results = []
    for entry in catalog_entries():
        haystack = searchable_text(entry)
        score = sum(haystack.count(term) for term in terms)
        if not terms or score:
            results.append({"score": score, "entry": entry})
    results.sort(key=lambda item: (-item["score"], item["entry"].get("id", "")))
    return {"ok": True, "kind": "catalog-search", "query": query, "count": len(results), "results": results}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="agentscene", description="AgentSceneBuilder deterministic probes")
    groups = parser.add_subparsers(dest="group", required=True)

    asset = groups.add_parser("asset")
    asset_actions = asset.add_subparsers(dest="action", required=True)
    asset_inspect = asset_actions.add_parser("inspect")
    asset_inspect.add_argument("path", type=Path)

    scene = groups.add_parser("scene")
    scene_actions = scene.add_subparsers(dest="action", required=True)
    scene_validate = scene_actions.add_parser("validate")
    scene_validate.add_argument("path", type=Path)

    catalog = groups.add_parser("catalog")
    catalog_actions = catalog.add_subparsers(dest="action", required=True)
    catalog_search = catalog_actions.add_parser("search")
    catalog_search.add_argument("query")
    catalog_actions.add_parser("list")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.group == "asset" and args.action == "inspect":
            return emit(inspect_asset(args.path))
        if args.group == "scene" and args.action == "validate":
            result = validate_scene(args.path)
            return emit(result, 0 if result["ok"] else 2)
        if args.group == "catalog" and args.action == "search":
            return emit(search_catalog(args.query))
        if args.group == "catalog" and args.action == "list":
            entries = catalog_entries()
            return emit({"ok": True, "kind": "catalog-list", "count": len(entries), "entries": entries})
        raise ProbeError("Unsupported command")
    except ProbeError as exc:
        return emit({"ok": False, "error": {"code": "AGENTSCENE_PROBE_ERROR", "message": str(exc)}}, 2)


if __name__ == "__main__":
    raise SystemExit(main())

