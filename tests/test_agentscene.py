import importlib.util
import json
import struct
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("agentscene", ROOT / "scripts" / "agentscene.py")
agentscene = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(agentscene)


class AgentSceneTests(unittest.TestCase):
    def test_basic_scene_is_valid(self):
        result = agentscene.validate_scene(ROOT / "examples" / "basic-building" / "scene.json")
        self.assertTrue(result["ok"])
        self.assertEqual(result["summary"]["objects"], 3)

    def test_duplicate_and_missing_reference_are_errors(self):
        document = {
            "objects": [{"id": "same", "type": "box"}, {"id": "same", "type": "label", "target": "missing"}]
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "scene.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            result = agentscene.validate_scene(path)
        codes = {item["code"] for item in result["issues"]}
        self.assertFalse(result["ok"])
        self.assertIn("SCENE_ID_DUPLICATE", codes)
        self.assertIn("SCENE_TARGET_MISSING", codes)

    def test_glb_structural_inspection(self):
        document = {
            "asset": {"version": "2.0"},
            "scenes": [{"nodes": [0]}],
            "nodes": [{"mesh": 0}],
            "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
            "accessors": [{"type": "VEC3", "min": [-1, 0, -2], "max": [3, 4, 2]}],
        }
        payload = json.dumps(document, separators=(",", ":")).encode("utf-8")
        payload += b" " * ((4 - len(payload) % 4) % 4)
        total_length = 12 + 8 + len(payload)
        raw = struct.pack("<4sII", b"glTF", 2, total_length)
        raw += struct.pack("<II", len(payload), 0x4E4F534A) + payload
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sample.glb"
            path.write_bytes(raw)
            result = agentscene.inspect_asset(path)
        self.assertEqual(result["counts"]["meshes"], 1)
        self.assertEqual(result["declaredBounds"]["size"], [4.0, 4.0, 4.0])

    def test_catalog_search(self):
        result = agentscene.search_catalog("GLB bounds")
        self.assertGreaterEqual(result["count"], 1)
        self.assertEqual(result["results"][0]["entry"]["id"], "asset.inspect-gltf")


if __name__ == "__main__":
    unittest.main()
