"""Minimal GLB 2.0 reader/writer (numpy only) used by build_corolla_taxi.py.

Why this exists: the original procedural generator for accrarush_corolla_taxi.glb was never
committed, and Blender / pygltflib / trimesh are not part of this project. This module lets the
existing GLB be loaded as editable data (nodes, meshes, materials, embedded textures), modified
by script, and written back as a valid GLB. It supports only what the taxi model uses:
triangle primitives with POSITION / NORMAL / TEXCOORD_0 / COLOR_0 and embedded PNG textures.
"""
import json
import struct
import numpy as np

CT = {5121: np.uint8, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


class Prim:
    def __init__(self, pos, nor, uv, col, idx, mat):
        self.pos = np.asarray(pos, np.float32).reshape(-1, 3)
        self.nor = np.asarray(nor, np.float32).reshape(-1, 3)
        n = len(self.pos)
        self.uv = np.zeros((n, 2), np.float32) if uv is None else np.asarray(uv, np.float32).reshape(-1, 2)
        self.col = None if col is None else np.asarray(col, np.float32).reshape(n, -1)
        self.idx = np.asarray(idx, np.uint32).reshape(-1)
        self.mat = mat  # index into Scene.materials

    @property
    def tris(self):
        return len(self.idx) // 3


class Mesh:
    def __init__(self, name, prims=None):
        self.name = name
        self.prims = prims or []


class Node:
    def __init__(self, name, t=None, r=None, s=None, mesh=None, extras=None):
        self.name = name
        self.t = list(t) if t is not None else None
        self.r = list(r) if r is not None else None
        self.s = list(s) if s is not None else None
        self.mesh = mesh  # Mesh or None
        self.children = []
        self.extras = extras

    def add(self, child):
        self.children.append(child)
        return child

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()

    def find(self, name):
        for n in self.walk():
            if n.name == name:
                return n
        return None


class Scene:
    def __init__(self):
        self.asset = {"version": "2.0"}
        self.materials = []   # glTF material dicts (texture indices refer to self.textures)
        self.textures = []    # {"name","sampler","image"}
        self.images = []      # {"name","mime","data": bytes}
        self.samplers = []
        self.roots = []       # list[Node]
        self.meshes = []      # all Mesh objects, in file order

    def material_index(self, name):
        for i, m in enumerate(self.materials):
            if m["name"] == name:
                return i
        raise KeyError(name)

    def add_material(self, name, base, metallic=0.0, rough=0.8, emissive=None, alpha=None, double=False, tex=None):
        m = {"name": name, "pbrMetallicRoughness": {"baseColorFactor": list(map(float, base)),
                                                    "metallicFactor": float(metallic),
                                                    "roughnessFactor": float(rough)}}
        if tex is not None:
            m["pbrMetallicRoughness"]["baseColorTexture"] = {"index": tex}
        if emissive is not None:
            m["emissiveFactor"] = list(map(float, emissive))
        if alpha:
            m["alphaMode"] = alpha
        if double:
            m["doubleSided"] = True
        self.materials.append(m)
        return len(self.materials) - 1


def _chunks(data):
    magic, ver, length = struct.unpack("<III", data[:12])
    assert magic == 0x46546C67 and ver == 2, "not a GLB 2.0 file"
    off, js, binc = 12, None, b""
    while off < len(data):
        cl, ct = struct.unpack("<II", data[off:off + 8])
        body = data[off + 8:off + 8 + cl]
        if ct == 0x4E4F534A:
            js = json.loads(body)
        elif ct == 0x004E4942:
            binc = body
        off += 8 + cl
    return js, binc


def read_glb(path):
    data = open(path, "rb").read()
    j, binc = _chunks(data)

    def acc(i):
        a = j["accessors"][i]
        bv = j["bufferViews"][a["bufferView"]]
        dt = np.dtype(CT[a["componentType"]])
        n = NC[a["type"]]
        base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
        stride = bv.get("byteStride") or n * dt.itemsize
        if stride == n * dt.itemsize:
            arr = np.frombuffer(binc, dtype=dt, count=a["count"] * n, offset=base).reshape(a["count"], n)
        else:
            arr = np.stack([np.frombuffer(binc, dtype=dt, count=n, offset=base + k * stride) for k in range(a["count"])])
        if a.get("normalized"):
            arr = arr.astype(np.float32) / float(np.iinfo(dt).max)
        return arr.copy()

    sc = Scene()
    sc.asset = j.get("asset", {"version": "2.0"})
    sc.materials = j.get("materials", [])
    sc.samplers = j.get("samplers", [])
    for im in j.get("images", []):
        bv = j["bufferViews"][im["bufferView"]]
        o = bv.get("byteOffset", 0)
        sc.images.append({"name": im.get("name"), "mime": im["mimeType"], "data": bytes(binc[o:o + bv["byteLength"]])})
    sc.textures = [dict(t) for t in j.get("textures", [])]
    for m in j["meshes"]:
        prims = []
        for p in m["primitives"]:
            at = p["attributes"]
            pos = acc(at["POSITION"]).astype(np.float32)
            nor = acc(at["NORMAL"]).astype(np.float32) if "NORMAL" in at else np.zeros_like(pos)
            uv = acc(at["TEXCOORD_0"]).astype(np.float32) if "TEXCOORD_0" in at else None
            col = acc(at["COLOR_0"]).astype(np.float32) if "COLOR_0" in at else None
            idx = acc(p["indices"]).reshape(-1) if "indices" in p else np.arange(len(pos))
            prims.append(Prim(pos, nor, uv, col, idx, p["material"]))
        sc.meshes.append(Mesh(m.get("name"), prims))
    nodes = []
    for n in j["nodes"]:
        nd = Node(n.get("name"), n.get("translation"), n.get("rotation"), n.get("scale"),
                  sc.meshes[n["mesh"]] if "mesh" in n else None, n.get("extras"))
        nodes.append(nd)
    for n, nd in zip(j["nodes"], nodes):
        nd.children = [nodes[c] for c in n.get("children", [])]
    sc.roots = [nodes[i] for i in j["scenes"][j.get("scene", 0)]["nodes"]]
    return sc


def write_glb(sc, path, generator=None):
    bin_parts, views, accessors = [], [], []

    def pad(b, fill=b"\x00"):
        return b + fill * ((4 - len(b) % 4) % 4)

    def add_view(data, target=None):
        off = sum(len(p) for p in bin_parts)
        bin_parts.append(pad(data))
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target:
            v["target"] = target
        views.append(v)
        return len(views) - 1

    def add_acc(arr, ctype, typ, target, minmax=False):
        bv = add_view(arr.tobytes(), target)
        a = {"bufferView": bv, "componentType": ctype, "count": int(len(arr)), "type": typ}
        if minmax:
            a["min"] = [float(x) for x in arr.min(axis=0)]
            a["max"] = [float(x) for x in arr.max(axis=0)]
        accessors.append(a)
        return len(accessors) - 1

    meshes_json = []
    mesh_index = {}
    for mi, m in enumerate(sc.meshes):
        prs = []
        for p in m.prims:
            at = {"POSITION": add_acc(p.pos.astype(np.float32), 5126, "VEC3", 34962, True),
                  "NORMAL": add_acc(p.nor.astype(np.float32), 5126, "VEC3", 34962),
                  "TEXCOORD_0": add_acc(p.uv.astype(np.float32), 5126, "VEC2", 34962)}
            if p.col is not None:
                at["COLOR_0"] = add_acc(p.col.astype(np.float32), 5126, "VEC4" if p.col.shape[1] == 4 else "VEC3", 34962)
            idx = p.idx.astype(np.uint16 if len(p.pos) < 65535 else np.uint32)
            ia = add_acc(idx.reshape(-1, 1), 5123 if idx.dtype == np.uint16 else 5125, "SCALAR", 34963)
            accessors[ia].pop("min", None)
            prs.append({"attributes": at, "indices": ia, "material": int(p.mat), "mode": 4})
        meshes_json.append({"name": m.name, "primitives": prs})
        mesh_index[id(m)] = mi

    images_json = []
    for im in sc.images:
        bv = add_view(im["data"])
        d = {"bufferView": bv, "mimeType": im["mime"]}
        if im.get("name"):
            d["name"] = im["name"]
        images_json.append(d)

    flat, order = [], {}

    def flatten(n):
        order[id(n)] = len(flat)
        flat.append(n)
        for c in n.children:
            flatten(c)

    for r in sc.roots:
        flatten(r)
    nodes_json = []
    for n in flat:
        d = {"name": n.name}
        if n.t is not None:
            d["translation"] = [round(float(x), 6) for x in n.t]
        if n.r is not None:
            d["rotation"] = [round(float(x), 6) for x in n.r]
        if n.s is not None:
            d["scale"] = [round(float(x), 6) for x in n.s]
        if n.mesh is not None:
            d["mesh"] = mesh_index[id(n.mesh)]
        if n.children:
            d["children"] = [order[id(c)] for c in n.children]
        if n.extras:
            d["extras"] = n.extras
        nodes_json.append(d)

    asset = dict(sc.asset)
    if generator:
        asset["generator"] = generator
    j = {"asset": asset, "scene": 0, "scenes": [{"nodes": [order[id(r)] for r in sc.roots]}],
         "nodes": nodes_json, "meshes": meshes_json, "materials": sc.materials,
         "accessors": accessors, "bufferViews": views}
    if sc.samplers:
        j["samplers"] = sc.samplers
    if sc.textures:
        j["textures"] = sc.textures
        j["images"] = images_json
    binc = b"".join(bin_parts)
    j["buffers"] = [{"byteLength": len(binc)}]
    jb = pad(json.dumps(j, separators=(",", ":")).encode(), b" ")
    out = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(jb) + 8 + len(binc))
    out += struct.pack("<II", len(jb), 0x4E4F534A) + jb + struct.pack("<II", len(binc), 0x004E4942) + binc
    open(path, "wb").write(out)
    return len(out)
