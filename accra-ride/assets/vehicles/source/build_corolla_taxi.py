#!/usr/bin/env python3
"""Builds accra-ride/assets/vehicles/accrarush_corolla_taxi.glb (v2) from the original GLB.

    python3 build_corolla_taxi.py            # writes ../accrarush_corolla_taxi.glb

Input  : accrarush_corolla_taxi_v1_original.glb  (the model that shipped on master; kept untouched)
Output : ../accrarush_corolla_taxi.glb
Needs  : python3 + numpy + Pillow only (no Blender, no network).

The v1 model is IMPROVED, not replaced: its body shell, wings, doors, glass, lamps, bumpers,
plates, wheels, roof sign and pivot hierarchy are loaded and kept. This script
  * fixes defects in them (mirrored roof-sign UVs, ragged lamp edges, jagged A-pillars,
    see-through wheel arches, material names that the menu paint filter mis-handled),
  * replaces the belt-height 'tray' that stood in for a cabin with a real, simple interior,
  * adds a separate steering wheel node and finishing details.

Axes: +Y up, +Z vehicle forward, +X vehicle LEFT (left-hand drive: driver at +X), metres.
"""
import io
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import geom as G  # noqa: E402
from glb_io import Mesh, Node, Prim, read_glb, write_glb  # noqa: E402

SRC = os.path.join(HERE, "accrarush_corolla_taxi_v1_original.glb")
OUT = os.path.join(HERE, "..", "accrarush_corolla_taxi.glb")

# ---------------------------------------------------------------------------------------------
# Materials. The garage/menu paint picker (src/ui/phase-2-navigation.js applyPaint) repaints every
# material whose lower-cased name does NOT match
#     glass|window|wheel|tyre|tire|rubber|chrome|light|lamp|interior
# so only Taxi_Body_Paint / Taxi_Wing_Yellow may stay outside that pattern. Every other name below
# is chosen to match it, otherwise picking a paint colour would also tint plates, seats, trim, etc.
# ---------------------------------------------------------------------------------------------
RENAME = {
    "Underbody_Black": "Underbody_Rubber",
    "Gap_Black": "Gap_Rubber",
    "Trim_Black": "Trim_Rubber",
    "Grille_Plastic": "Grille_Rubber",
    "Sign_Body": "Sign_Body_Lamp",
    "Sign_Face": "Sign_Face_Lamp",
    "Plate_Front": "Plate_Front_Light",
    "Plate_Rear": "Plate_Rear_Light",
    "Exhaust_Metal": "Exhaust_Chrome",
    "Seat_Fabric": "Interior_Seat_Fabric",
    "Steering_Wheel": "Interior_Steering_Wheel",
    "Door_Handle": "Door_Handle_Rubber",
    "Alloy_Silver": "Wheel_Alloy_Silver",
}
PAINT_FILTER = "glass|window|wheel|tyre|tire|rubber|chrome|light|lamp|interior"

# --- cabin dimensions (world, metres) ---
FLOOR_Y = 0.33
CAB_X = 0.765          # inside face of the door shells is x = 0.77
FW_Z = 0.955           # firewall (just ahead of the dash)
RB_Z = -0.93           # rear bulkhead behind the rear seat
SHELF_Y = 0.962        # rear parcel shelf height
DRV_X = 0.36           # driver (left-hand drive): +X
PAS_X = -0.36
WHEEL_TILT = 25.0      # degrees the wheel face is tipped up from vertical


class Ctx:
    def __init__(self):
        self.sc = read_glb(SRC)
        self.root = self.sc.roots[0]
        for m in self.sc.materials:
            if m["name"] in RENAME:
                m["name"] = RENAME[m["name"]]
        self.mat_cache = {m["name"]: i for i, m in enumerate(self.sc.materials)}

    def mat(self, name, base=None, metallic=0.0, rough=0.8, emissive=None, alpha=None, double=False, tex=None):
        if name in self.mat_cache:
            return self.mat_cache[name]
        assert base is not None, "unknown material " + name
        i = self.sc.add_material(name, base, metallic, rough, emissive, alpha, double, tex)
        self.mat_cache[name] = i
        return i

    def mesh_from(self, name, parts):
        """parts: {material_name: MB} -> Mesh (skips empty builders)."""
        prims = []
        for mname, mb in parts.items():
            if mb.empty:
                continue
            P, N, U, I = mb.arrays()
            prims.append(Prim(P, N, U, None, I, self.mat_cache[mname]))
        return Mesh(name, prims)


# ---------------------------------------------------------------------------------------------
# small helpers
# ---------------------------------------------------------------------------------------------
def sup(mb, size, c, n=4.0, u=12, v=7, rx=0, ry=0, rz=0, shade="smooth"):
    P, I = G.superellipsoid(size, n, u, v)
    mb.add(G.xf(P, c, rx, ry, rz), I, shade)


def blk(mb, size, c, rx=0, ry=0, rz=0):
    P, I = G.box(size)
    mb.add(G.xf(P, c, rx, ry, rz), I, "flat")


def cyl(mb, r0, r1, h, c, rx=0, ry=0, rz=0, seg=12, shade="smooth", caps=True):
    P, I = G.cylinder(r0, r1, h, seg, caps)
    mb.add(G.xf(P, c, rx, ry, rz), I, shade)


def quad_in(mb, p0, p1, p2, p3, uv=None, toward=None):
    """Quad; if `toward` is given the quad is flipped so its normal faces that point."""
    pts = [p0, p1, p2, p3]
    if toward is not None:
        a, b, c = [np.asarray(p, np.float64) for p in (p0, p1, p2)]
        if np.dot(np.cross(b - a, c - a), np.asarray(toward, np.float64) - a) < 0:
            pts = [p0, p3, p2, p1]
            if uv is not None:
                uv = [uv[0], uv[3], uv[2], uv[1]]
    P, I = G.quad(*pts)
    mb.add(P, I, "flat", uv=uv)


def merge_prim(prim, P, N, U, I):
    """Append raw geometry to an existing Prim (keeps draw calls constant)."""
    off = len(prim.pos)
    prim.pos = np.concatenate([prim.pos, np.asarray(P, np.float32)])
    prim.nor = np.concatenate([prim.nor, np.asarray(N, np.float32)])
    prim.uv = np.concatenate([prim.uv, np.asarray(U, np.float32)])
    if prim.col is not None:
        prim.col = np.concatenate([prim.col, np.ones((len(P), prim.col.shape[1]), np.float32)])
    prim.idx = np.concatenate([prim.idx, (np.asarray(I, np.uint32) + off).astype(np.uint32)])


def body_prim(ctx, mat_name):
    m = ctx.mat_cache[mat_name]
    body = ctx.root.find("Body").mesh
    for p in body.prims:
        if p.mat == m:
            return p
    raise KeyError(mat_name)


# ---------------------------------------------------------------------------------------------
# textures
# ---------------------------------------------------------------------------------------------
def cluster_png():
    """256x128 instrument-cluster face: speedometer, small fuel/temp dial, warning-light strip."""
    S = 2
    W, H = 256 * S, 128 * S
    im = Image.new("RGB", (W, H), (10, 11, 13))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([3 * S, 3 * S, W - 3 * S, H - 3 * S], 10 * S, outline=(40, 42, 46), width=2 * S)
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 9 * S)
    except Exception:
        font = ImageFont.load_default()

    def dial(cx, cy, r, vmax, step, a0, a1, needle):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(20, 22, 26), outline=(120, 124, 130), width=2 * S)
        n = int(vmax / step)
        for i in range(n + 1):
            a = np.radians(a0 + (a1 - a0) * i / n)
            major = i % 2 == 0
            r0 = r * (0.78 if major else 0.86)
            d.line([cx + r0 * np.cos(a), cy + r0 * np.sin(a), cx + r * 0.94 * np.cos(a), cy + r * 0.94 * np.sin(a)], fill=(235, 235, 230), width=(2 if major else 1) * S)
            if major and r > 40 * S:
                tx, ty = cx + r * 0.62 * np.cos(a), cy + r * 0.62 * np.sin(a)
                lab = str(int(i * step))
                bb = d.textbbox((0, 0), lab, font=font)
                d.text((tx - (bb[2] - bb[0]) / 2, ty - (bb[3] - bb[1]) / 2), lab, fill=(225, 225, 220), font=font)
        a = np.radians(a0 + (a1 - a0) * needle)
        d.line([cx, cy, cx + r * 0.82 * np.cos(a), cy + r * 0.82 * np.sin(a)], fill=(255, 120, 20), width=3 * S)
        d.ellipse([cx - 5 * S, cy - 5 * S, cx + 5 * S, cy + 5 * S], fill=(60, 62, 66))

    dial(88 * S, 66 * S, 54 * S, 200, 20, 140, 400, 0.0)       # speedometer 0-200 km/h
    dial(190 * S, 50 * S, 26 * S, 4, 1, 200, 340, 0.55)        # fuel
    dial(190 * S, 98 * S, 20 * S, 4, 1, 200, 340, 0.5)         # temperature
    for i, col in enumerate([(220, 40, 30), (60, 200, 90), (250, 170, 30), (60, 140, 230)]):
        x = (150 + i * 14) * S
        d.ellipse([x, 8 * S, x + 8 * S, 16 * S], fill=col)
    d.text((70 * S, 104 * S), "km/h", fill=(190, 190, 185), font=font)
    im = im.resize((256, 128), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return b.getvalue()


# ---------------------------------------------------------------------------------------------
# interior
# ---------------------------------------------------------------------------------------------
def build_cabin_shell(ctx):
    """Inward-facing tub so no outside world shows through the (single-sided) v1 shell."""
    dark = G.MB()
    inside = (0, 0.7, 0.0)           # every wall faces this point
    top = 0.978
    X = CAB_X
    quad_in(dark, (-X, FLOOR_Y, RB_Z), (X, FLOOR_Y, RB_Z), (X, FLOOR_Y, FW_Z), (-X, FLOOR_Y, FW_Z), toward=inside)   # floor
    quad_in(dark, (X, FLOOR_Y, RB_Z), (X, top, RB_Z), (X, top, FW_Z), (X, FLOOR_Y, FW_Z), toward=inside)             # side walls
    quad_in(dark, (-X, FLOOR_Y, RB_Z), (-X, top, RB_Z), (-X, top, FW_Z), (-X, FLOOR_Y, FW_Z), toward=inside)
    quad_in(dark, (X, FLOOR_Y, FW_Z), (X, top, FW_Z), (-X, top, FW_Z), (-X, FLOOR_Y, FW_Z), toward=inside)           # firewall
    quad_in(dark, (X, FLOOR_Y, RB_Z), (X, SHELF_Y, RB_Z), (-X, SHELF_Y, RB_Z), (-X, FLOOR_Y, RB_Z), toward=inside)  # rear bulkhead
    quad_in(dark, (-0.66, SHELF_Y, -1.50), (-0.66, SHELF_Y, RB_Z), (0.66, SHELF_Y, RB_Z), (0.66, SHELF_Y, -1.50), toward=(0, 1.3, -1.2))  # parcel shelf
    # transmission tunnel and centre console
    sup(dark, (0.30, 0.30, 1.75), (0, 0.40, 0.05), n=5, u=14, v=6)
    sup(dark, (0.19, 0.16, 0.62), (0, 0.585, 0.17), n=5, u=12, v=6)
    # sills (carpeted rocker covers) - closes the gap under the door cards
    for sx in (1, -1):
        blk(dark, (0.10, 0.05, 1.82), (sx * 0.715, 0.355, 0.015))
    return dark


def build_headliner(ctx):
    """Inner copy of the roof / pillar skin (the v1 shell is single-sided, so from inside you saw sky)."""
    hl = G.MB()
    body = ctx.root.find("Body").mesh
    for p in body.prims:
        name = ctx.sc.materials[p.mat]["name"]
        if name not in ("Taxi_Body_Paint", "Taxi_Wing_Yellow", "Trim_Rubber"):
            continue
        t = p.idx.reshape(-1, 3)
        cen = p.pos[t].mean(1)
        sel = (cen[:, 1] > 1.0) & (cen[:, 2] > -1.55) & (cen[:, 2] < 1.0)
        if not sel.any():
            continue
        tt = t[sel][:, ::-1]                     # reversed winding -> faces the cabin
        used = np.unique(tt)
        remap = -np.ones(len(p.pos), np.int64)
        remap[used] = np.arange(len(used))
        pos = p.pos[used] - p.nor[used] * 0.014  # slightly inside the outer skin
        hl.add(pos, remap[tt].reshape(-1).astype(np.uint32), "smooth", nor=-p.nor[used])
    return hl


def door_card(z0, z1):
    """Interior door card for a LEFT (+x) door, in hinge-local coordinates. z0<z1 are hinge-local."""
    mb = G.MB()
    zc, zl = (z0 + z1) / 2, z1 - z0
    sup(mb, (0.045, 0.56, zl - 0.02), (-0.052, 0.09, zc), n=8, u=10, v=6)      # main panel
    sup(mb, (0.060, 0.045, zl - 0.04), (-0.060, 0.385, zc), n=8, u=10, v=5)    # window-sill cap
    sup(mb, (0.105, 0.05, zl * 0.52), (-0.095, 0.15, zc + zl * 0.10), n=6, u=10, v=6)  # armrest
    sup(mb, (0.08, 0.10, 0.19), (-0.082, 0.06, z1 - 0.20), n=6, u=8, v=5)      # door-pull / pocket block
    return mb


def build_dashboard(ctx, tex_idx):
    dash, vent, clus = G.MB(), G.MB(), G.MB()
    # main dash body: (z,y) profile extruded across the cabin
    prof = [(0.965, 0.945), (0.86, 0.955), (0.66, 0.955), (0.60, 0.945), (0.585, 0.925), (0.60, 0.80), (0.68, 0.60), (0.76, 0.34), (0.965, 0.33)]
    P, I = G.prism_x(prof, -0.745, 0.745)
    dash.add(P, I, "flat")
    # soft cowl pad on top (gives the dash a rounded top edge) and binnacle hood over the driver
    sup(dash, (1.46, 0.04, 0.40), (0.0, 0.945, 0.78), n=6, u=16, v=5)
    sup(dash, (0.46, 0.13, 0.20), (DRV_X, 0.965, 0.70), n=5, u=14, v=6)
    # centre stack
    sup(dash, (0.30, 0.40, 0.16), (0.0, 0.84, 0.67), n=5, u=12, v=6)
    # glove-box panel (passenger side) and driver lower trim
    blk(dash, (0.42, 0.17, 0.025), (PAS_X, 0.83, 0.595), rx=-12)
    blk(dash, (0.34, 0.11, 0.03), (DRV_X, 0.74, 0.625), rx=-12)
    # steering column cover (static; the wheel rotates on its own node)
    ax = np.array([0.0, np.sin(np.radians(WHEEL_TILT)), -np.cos(np.radians(WHEEL_TILT))])   # wheel axis, toward the driver
    hub = np.array([DRV_X, 0.93, 0.50])
    P, I = G.cylinder(0.034, 0.045, 0.30, 12, caps=False)
    dash.add(G.xf(P, hub - ax * 0.15, rx=-(90 - WHEEL_TILT)), I, "smooth")
    # rear-view mirror on a short stalk
    sup(dash, (0.20, 0.055, 0.028), (0.0, 1.235, 0.34), n=4, u=10, v=5)
    cyl(dash, 0.006, 0.006, 0.07, (0.0, 1.27, 0.35), seg=6)
    # air vents (dark inserts)
    for x in (-0.14, 0.14, -0.62, 0.62):
        cyl(vent, 0.034, 0.034, 0.018, (x, 0.945, 0.63) if abs(x) < 0.5 else (x, 0.925, 0.61), rx=90, seg=14)
    blk(vent, (0.16, 0.06, 0.02), (0.0, 0.80, 0.585))   # head-unit slot
    # instrument cluster face (textured quad on the driver-facing side of the binnacle)
    zf = 0.598
    quad_in(clus, (DRV_X + 0.17, 0.90, zf), (DRV_X - 0.17, 0.90, zf), (DRV_X - 0.17, 1.02, zf), (DRV_X + 0.17, 1.02, zf),
            uv=[(0, 1), (1, 1), (1, 0), (0, 0)], toward=(DRV_X, 1.0, 0.0))
    return dash, vent, clus


def build_steering_wheel():
    """Rim + three spokes + hub in the wheel's own frame: wheel plane = XY, axis (column) = local +Z toward the driver."""
    mb = G.MB()
    R, r = 0.178, 0.0175
    P, I = G.torus(R, r, 28, 8)
    mb.add(P, I, "smooth")
    # spokes at 3, 9 and 6 o'clock (a Corolla-style three-spoke)
    for ang in (0, 180, 270):
        a = np.radians(ang)
        c = np.array([np.cos(a), np.sin(a), 0]) * (R * 0.5)
        P, I = G.box((R * 0.95, 0.030, 0.014))
        mb.add(G.xf(P, c, rz=ang), I, "flat")
    # hub / horn pad
    sup(mb, (0.105, 0.105, 0.045), (0, 0, 0.012), n=3.2, u=14, v=6)
    return mb


def seat(front=True):
    """Seat built around its own origin (floor, centre). +Z forward."""
    mb = G.MB()
    if front:
        sup(mb, (0.46, 0.14, 0.48), (0, 0.47, 0.17), n=4, u=12, v=6)                           # cushion
        sup(mb, (0.07, 0.11, 0.40), (0.205, 0.50, 0.17), n=4, u=8, v=5)                        # cushion bolsters
        sup(mb, (0.07, 0.11, 0.40), (-0.205, 0.50, 0.17), n=4, u=8, v=5)
        sup(mb, (0.46, 0.62, 0.12), (0, 0.84, -0.12), n=4, u=12, v=7, rx=-14)                  # backrest
        sup(mb, (0.075, 0.54, 0.17), (0.205, 0.83, -0.085), n=4, u=8, v=6, rx=-14)             # backrest bolsters
        sup(mb, (0.075, 0.54, 0.17), (-0.205, 0.83, -0.085), n=4, u=8, v=6, rx=-14)
        sup(mb, (0.22, 0.17, 0.10), (0, 1.195, -0.185), n=3.4, u=12, v=6, rx=-14)              # headrest
        for x in (-0.06, 0.06):
            cyl(mb, 0.009, 0.009, 0.07, (x, 1.115, -0.165), rx=-14, seg=6)
    else:
        sup(mb, (1.30, 0.14, 0.40), (0, 0.47, -0.60), n=4, u=16, v=6)
        sup(mb, (1.30, 0.58, 0.12), (0, 0.80, -0.83), n=4, u=16, v=7, rx=-10)
        for x in (-0.60, 0.60):
            sup(mb, (0.08, 0.52, 0.16), (x, 0.80, -0.80), n=4, u=8, v=6, rx=-10)
        for x in (-0.40, 0.0, 0.40):
            sup(mb, (0.19, 0.15, 0.09), (x, 1.135, -0.885), n=3.4, u=10, v=6, rx=-10)
            for dx in (-0.05, 0.05):
                cyl(mb, 0.008, 0.008, 0.06, (x + dx, 1.07, -0.868), rx=-10, seg=6)
    return mb


# ---------------------------------------------------------------------------------------------
def stage_interior(ctx):
    sc, root = ctx.sc, ctx.root
    # new materials ---------------------------------------------------------------------------
    sc.images.append({"name": "instrument_cluster.png", "mime": "image/png", "data": cluster_png()})
    sc.textures.append({"name": "instrument_cluster.png", "sampler": 0, "source": len(sc.images) - 1})
    tex_idx = len(sc.textures) - 1
    ctx.mat("Interior_Dash", (0.085, 0.085, 0.09, 1), 0.0, 0.78)
    ctx.mat("Interior_Headliner", (0.13, 0.125, 0.12, 1), 0.0, 0.95)
    ctx.mat("Interior_Door_Card", (0.115, 0.115, 0.12, 1), 0.0, 0.82)
    ctx.mat("Interior_Cluster", (1, 1, 1, 1), 0.0, 0.35, emissive=(0.10, 0.10, 0.10), tex=tex_idx)
    ctx.mat("Interior_Vent", (0.03, 0.03, 0.033, 1), 0.2, 0.5)

    # drop v1's belt-height tray (the 'Interior_Dark' primitive inside Body) and the old Interior mesh
    body = root.find("Body").mesh
    dark_m = ctx.mat_cache["Interior_Dark"]
    body.prims = [p for p in body.prims if p.mat != dark_m]
    interior = root.find("Interior")
    root.children.remove(interior)

    # fix the roof sign: both faces had mirrored U, so the sign read "IXAT"
    sign = root.find("Roof_Sign").mesh
    for p in sign.prims:
        if sc.materials[p.mat]["name"] == "Sign_Face_Lamp":
            p.uv[:, 0] = 1.0 - p.uv[:, 0]

    inter = Node("Interior")
    ctx.interior_node = inter
    shell = build_cabin_shell(ctx)
    hl = build_headliner(ctx)
    inter.add(Node("CabinShell", mesh=ctx.mesh_from("CabinShell", {"Interior_Dark": shell, "Interior_Headliner": hl})))
    dash, vent, clus = build_dashboard(ctx, tex_idx)
    inter.add(Node("Dashboard", mesh=ctx.mesh_from("Dashboard", {"Interior_Dash": dash, "Interior_Vent": vent})))
    inter.add(Node("InstrumentCluster", mesh=ctx.mesh_from("InstrumentCluster", {"Interior_Cluster": clus})))
    zs = -0.08
    inter.add(Node("Seat_Driver", t=(DRV_X, 0, zs), mesh=ctx.mesh_from("Seat_Driver", {"Interior_Seat_Fabric": seat(True)})))
    inter.add(Node("Seat_Passenger", t=(PAS_X, 0, zs), mesh=ctx.mesh_from("Seat_Passenger", {"Interior_Seat_Fabric": seat(True)})))
    inter.add(Node("Seat_Rear", mesh=ctx.mesh_from("Seat_Rear", {"Interior_Seat_Fabric": seat(False)})))

    # steering wheel: Tilt (static placement + column tilt) -> SteeringWheel (rotate .rotation.z with steering input)
    tilt = Node("SteeringWheel_Tilt", t=(DRV_X, 0.93, 0.50), r=_wheel_quat(WHEEL_TILT))
    wheel = Node("SteeringWheel", mesh=ctx.mesh_from("SteeringWheel", {"Interior_Steering_Wheel": build_steering_wheel()}),
                 extras={"steerAxis": [0, 0, 1], "note": "rotate about local +Z; +angle = counter-clockwise seen by the driver (steer left)"})
    tilt.add(wheel)
    inter.add(tilt)
    root.add(inter)

    # door cards ride on the door hinge nodes so they swing with the doors
    for key, (z0, z1) in {"FL": (-0.91, -0.03), "RL": (-0.83, -0.02), "FR": (-0.91, -0.03), "RR": (-0.83, -0.02)}.items():
        hinge = root.find("Door_%s_Hinge" % key)
        mb = G.MB()
        card = door_card(z0, z1)
        P, N, U, I = card.arrays()
        if key.endswith("R"):
            P = P.copy()
            N = N.copy()
            P[:, 0] *= -1
            N[:, 0] *= -1
            I = I.reshape(-1, 3)[:, ::-1].reshape(-1)
        mb.P, mb.N, mb.U, mb.I, mb.n = [P], [N], [U], [I], len(P)
        hinge.add(Node("DoorCard_" + key, mesh=ctx.mesh_from("DoorCard_" + key, {"Interior_Door_Card": mb})))



# ---------------------------------------------------------------------------------------------
# exterior fixes
# ---------------------------------------------------------------------------------------------
WHEELS = {"FL": (0.73, 1.3), "FR": (-0.73, 1.3), "RL": (0.73, -1.3), "RR": (-0.73, -1.3)}
WHEEL_Y = 0.318


def arch_liner(cx, cz, R=0.372, w=0.19):
    """Dark half-cylinder shell inside the wheel arch (faces the wheel) so no sky shows past the tyre."""
    mb = G.MB()
    inner = abs(cx) - 0.17
    xs = (inner, inner + w) if cx > 0 else (-inner - w, -inner)
    angs = np.radians(np.linspace(0, 180, 16))
    for a0, a1 in zip(angs[:-1], angs[1:]):
        p = lambda x, a: (x, WHEEL_Y + R * np.sin(a), cz + R * np.cos(a))
        quad_in(mb, p(xs[0], a0), p(xs[1], a0), p(xs[1], a1), p(xs[0], a1), toward=(cx, WHEEL_Y, cz))
    return mb


def frame_for(ctx, node_name, width, lift):
    """Black rubber frame ribbon around a glass panel's boundary (windscreen / rear window seal)."""
    g = ctx.root.find(node_name).mesh.prims[0]
    loops = G.boundary_loops(g.pos, g.idx, tol=2e-3)
    loops = sorted(loops, key=len, reverse=True)[:1]
    out = G.MB()
    nrm = g.nor.mean(0)
    nrm /= np.linalg.norm(nrm)
    for lp in loops:
        P, I = G.strip_along(lp, width, lift, nrm)
        out.add(P, I, "smooth")
    return out


def stage_exterior(ctx):
    sc, root = ctx.sc, ctx.root
    # glass must be visible from inside too (v1 glass was single-sided -> sky showed through windows from the cabin)
    for m in sc.materials:
        if m["name"] in ("Glass_Tint", "Mirror_Glass"):
            m["doubleSided"] = True
    ctx.mat("Chrome")  # exists in v1
    # wheel-arch liners
    liners = G.MB()
    for cx, cz in WHEELS.values():
        P, N, U, I = arch_liner(cx, cz).arrays()
        liners.P.append(P); liners.N.append(N); liners.U.append(U); liners.I.append(I + liners.n); liners.n += len(P)
    root.add(Node("WheelArchLiners", mesh=ctx.mesh_from("WheelArchLiners", {"Underbody_Rubber": liners})))
    # inner side walls + floor pan: closes the open underbody so you cannot see through the arches to the far side
    pan = G.MB()
    for sx in (1, -1):
        quad_in(pan, (sx * 0.58, 0.29, -1.72), (sx * 0.58, 0.80, -1.72), (sx * 0.58, 0.80, 1.72), (sx * 0.58, 0.29, 1.72), toward=(sx * 2.0, 0.5, 0.0))
    quad_in(pan, (-0.58, 0.29, -1.72), (0.58, 0.29, -1.72), (0.58, 0.29, 1.72), (-0.58, 0.29, 1.72), toward=(0, -1.0, 0))
    root.add(Node("UnderbodyPan", mesh=ctx.mesh_from("UnderbodyPan", {"Underbody_Rubber": pan})))
    # glass seals
    for nm, w, l in (("Window_Windscreen", 0.045, 0.012), ("Window_Rear", 0.04, 0.012)):
        fr = frame_for(ctx, nm, w, l)
        root.add(Node(nm.replace("Window_", "Frame_"), mesh=ctx.mesh_from(nm.replace("Window_", "Frame_"), {"Trim_Rubber": fr})))
    # grille: chrome surround + two bars + centre badge-blank
    gm = G.MB()
    zf = 2.180
    blk(gm, (0.66, 0.018, 0.012), (0, 0.797, zf))
    blk(gm, (0.66, 0.018, 0.012), (0, 0.611, zf))
    blk(gm, (0.018, 0.186, 0.012), (0.327, 0.704, zf))
    blk(gm, (0.018, 0.186, 0.012), (-0.327, 0.704, zf))
    for y in (0.665, 0.704, 0.743):
        blk(gm, (0.60, 0.012, 0.010), (0, y, zf + 0.001))
    sup(gm, (0.11, 0.06, 0.016), (0, 0.704, zf + 0.004), n=2.6, u=12, v=6)
    root.add(Node("GrilleTrim", mesh=ctx.mesh_from("GrilleTrim", {"Chrome": gm})))


def _wheel_quat(tilt_deg):
    """Rotation that maps the wheel's local +Z (column axis) to (0, sin t, -cos t): back toward the driver and up."""
    a = np.radians(tilt_deg) / 2
    return [0.0, float(np.cos(a)), float(np.sin(a)), 0.0]   # = Rx(t) * Ry(180 deg)


def finish(ctx):
    sc = ctx.sc
    # rebuild the mesh list from the node tree (drops unused, includes new)
    seen, meshes = set(), []
    for r in sc.roots:
        for n in r.walk():
            if n.mesh is not None and id(n.mesh) not in seen:
                seen.add(id(n.mesh))
                meshes.append(n.mesh)
    sc.meshes = meshes
    sc.asset = dict(sc.asset)
    n = write_glb(sc, OUT, generator="AccraRide procedural Corolla builder (numpy) v1 + build_corolla_taxi.py v2")
    return n


def main():
    ctx = Ctx()
    stage_interior(ctx)
    stage_exterior(ctx)
    size = finish(ctx)
    print("wrote", os.path.normpath(OUT), size, "bytes")


if __name__ == "__main__":
    main()
