"""Small numpy mesh toolkit for build_corolla_taxi.py.

Conventions (match the GLB): +Y up, +Z vehicle forward, +X vehicle left, metres.
Every constructor returns (pos, idx) with counter-clockwise winding seen from outside;
MB.add() turns that into smooth- or flat-shaded vertex data.
"""
import numpy as np

# ----------------------------------------------------------------------------- transforms
def rot_x(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_y(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_z(a):
    c, s = np.cos(a), np.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


def xf(pos, t=(0, 0, 0), rx=0.0, ry=0.0, rz=0.0, s=(1, 1, 1)):
    """scale -> rotate (X then Y then Z, degrees) -> translate."""
    p = np.asarray(pos, np.float64) * np.asarray(s, np.float64)
    r = rot_z(np.radians(rz)) @ rot_y(np.radians(ry)) @ rot_x(np.radians(rx))
    return (p @ r.T + np.asarray(t, np.float64)).astype(np.float32)


def mirror_x(pos, idx):
    """Mirror across x=0 and fix winding."""
    p = np.asarray(pos).copy()
    p[:, 0] *= -1
    i = np.asarray(idx).reshape(-1, 3)[:, ::-1].reshape(-1)
    return p, i


# ----------------------------------------------------------------------------- normals
def face_normals(pos, idx):
    t = np.asarray(idx).reshape(-1, 3)
    a, b, c = pos[t[:, 0]], pos[t[:, 1]], pos[t[:, 2]]
    return np.cross(b - a, c - a)


def smooth_normals(pos, idx):
    pos = np.asarray(pos, np.float64)
    n = np.zeros_like(pos)
    t = np.asarray(idx).reshape(-1, 3)
    fn = face_normals(pos, idx)
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True)
    return (n / np.where(l > 1e-12, l, 1)).astype(np.float32)


def orient_outward(pos, idx, center=None):
    """Flip triangles whose normal points toward the mesh centre (for convex-ish closed parts)."""
    pos = np.asarray(pos, np.float64)
    t = np.asarray(idx).reshape(-1, 3).copy()
    c = pos.mean(0) if center is None else np.asarray(center)
    fn = face_normals(pos, t)
    cen = pos[t].mean(1)
    flip = np.einsum("ij,ij->i", fn, cen - c) < 0
    t[flip] = t[flip][:, ::-1]
    return t.reshape(-1)


# ----------------------------------------------------------------------------- builder
class MB:
    """Accumulates geometry for one material."""

    def __init__(self):
        self.P, self.N, self.U, self.I, self.n = [], [], [], [], 0

    def add(self, pos, idx, shade="smooth", uv=None, nor=None):
        pos = np.asarray(pos, np.float32).reshape(-1, 3)
        idx = np.asarray(idx, np.uint32).reshape(-1)
        if shade == "flat":
            t = idx.reshape(-1, 3)
            fn = face_normals(pos.astype(np.float64), t)
            l = np.linalg.norm(fn, axis=1, keepdims=True)
            fn = (fn / np.where(l > 1e-12, l, 1)).astype(np.float32)
            P = pos[t].reshape(-1, 3)
            N = np.repeat(fn, 3, axis=0)
            if uv is not None:
                uv = np.asarray(uv, np.float32)[t].reshape(-1, 2)
            I = np.arange(len(P), dtype=np.uint32)
        else:
            P, I = pos, idx
            N = smooth_normals(pos, idx) if nor is None else np.asarray(nor, np.float32)
        U = np.zeros((len(P), 2), np.float32) if uv is None else np.asarray(uv, np.float32)
        self.P.append(P)
        self.N.append(N)
        self.U.append(U)
        self.I.append(I + self.n)
        self.n += len(P)
        return self

    @property
    def empty(self):
        return self.n == 0

    def arrays(self):
        return (np.concatenate(self.P), np.concatenate(self.N), np.concatenate(self.U), np.concatenate(self.I).astype(np.uint32))


# ----------------------------------------------------------------------------- primitives
def _sp(x, e):
    return np.sign(x) * np.abs(x) ** e


def superellipsoid(size, n=4.0, u=12, v=8):
    """Soft block. size = full extents (x,y,z). n=2 ellipsoid, n=4 pillow, n>=8 near-box."""
    sx, sy, sz = [s / 2 for s in size]
    th = np.linspace(-np.pi / 2, np.pi / 2, v + 1)
    ph = np.linspace(0, 2 * np.pi, u, endpoint=False)
    e = 2.0 / n
    P = []
    for t in th:
        for p in ph:
            P.append((sx * _sp(np.cos(t), e) * _sp(np.cos(p), e), sy * _sp(np.sin(t), e), sz * _sp(np.cos(t), e) * _sp(np.sin(p), e)))
    P = np.array(P)
    I = []
    for i in range(v):
        for j in range(u):
            a = i * u + j
            b = i * u + (j + 1) % u
            c = (i + 1) * u + j
            d = (i + 1) * u + (j + 1) % u
            I += [a, c, b, b, c, d]
    I = orient_outward(P, np.array(I), center=np.zeros(3))
    return P.astype(np.float32), I


def box(size, c=(0, 0, 0)):
    sx, sy, sz = [s / 2 for s in size]
    P = np.array([(-sx, -sy, -sz), (sx, -sy, -sz), (sx, sy, -sz), (-sx, sy, -sz), (-sx, -sy, sz), (sx, -sy, sz), (sx, sy, sz), (-sx, sy, sz)], np.float64) + np.asarray(c)
    I = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5]
    return P.astype(np.float32), orient_outward(P, np.array(I), center=np.asarray(c))


def cylinder(r0, r1, h, seg=12, caps=True):
    """Along +Y, centred. r0 at bottom, r1 at top."""
    a = np.linspace(0, 2 * np.pi, seg, endpoint=False)
    bot = np.stack([r0 * np.cos(a), -h / 2 * np.ones(seg), r0 * np.sin(a)], 1)
    top = np.stack([r1 * np.cos(a), h / 2 * np.ones(seg), r1 * np.sin(a)], 1)
    P = np.concatenate([bot, top])
    I = []
    for j in range(seg):
        k = (j + 1) % seg
        I += [j, seg + j, k, k, seg + j, seg + k]
    if caps:
        P = np.concatenate([P, [[0, -h / 2, 0], [0, h / 2, 0]]])
        cb, ct = 2 * seg, 2 * seg + 1
        for j in range(seg):
            k = (j + 1) % seg
            I += [cb, k, j, ct, seg + j, seg + k]
    return P.astype(np.float32), orient_outward(P, np.array(I), center=np.zeros(3))


def torus(R, r, segR=24, segr=8):
    a = np.linspace(0, 2 * np.pi, segR, endpoint=False)
    b = np.linspace(0, 2 * np.pi, segr, endpoint=False)
    P = []
    for ai in a:
        for bi in b:
            P.append(((R + r * np.cos(bi)) * np.cos(ai), (R + r * np.cos(bi)) * np.sin(ai), r * np.sin(bi)))  # lies in XY plane, axis = Z
    P = np.array(P)
    I = []
    for i in range(segR):
        for j in range(segr):
            a0 = i * segr + j
            a1 = i * segr + (j + 1) % segr
            b0 = ((i + 1) % segR) * segr + j
            b1 = ((i + 1) % segR) * segr + (j + 1) % segr
            I += [a0, b0, a1, a1, b0, b1]
    I = np.array(I)
    # orient by local outward normal from the ring core
    t = I.reshape(-1, 3)
    fn = face_normals(P, t)
    cen = P[t].mean(1)
    core = np.stack([R * np.cos(np.arctan2(cen[:, 1], cen[:, 0])), R * np.sin(np.arctan2(cen[:, 1], cen[:, 0])), np.zeros(len(cen))], 1)
    flip = np.einsum("ij,ij->i", fn, cen - core) < 0
    t[flip] = t[flip][:, ::-1]
    return P.astype(np.float32), t.reshape(-1)


def tube(path, radius, seg=8, caps=True):
    """Round tube along a polyline (N,3)."""
    path = np.asarray(path, np.float64)
    n = len(path)
    rings = []
    for i in range(n):
        d = path[min(i + 1, n - 1)] - path[max(i - 1, 0)]
        d /= np.linalg.norm(d)
        ref = np.array([0, 1, 0]) if abs(d[1]) < 0.9 else np.array([1, 0, 0])
        u = np.cross(d, ref)
        u /= np.linalg.norm(u)
        v = np.cross(d, u)
        a = np.linspace(0, 2 * np.pi, seg, endpoint=False)
        r = radius[i] if hasattr(radius, "__len__") else radius
        rings.append(path[i] + r * (np.outer(np.cos(a), u) + np.outer(np.sin(a), v)))
    P = np.concatenate(rings)
    I = []
    for i in range(n - 1):
        for j in range(seg):
            k = (j + 1) % seg
            a0, a1, b0, b1 = i * seg + j, i * seg + k, (i + 1) * seg + j, (i + 1) * seg + k
            I += [a0, b0, a1, a1, b0, b1]
    if caps:
        c0, c1 = len(P), len(P) + 1
        P = np.concatenate([P, [path[0], path[-1]]])
        for j in range(seg):
            k = (j + 1) % seg
            I += [c0, k, j, c1, (n - 1) * seg + j, (n - 1) * seg + k]
    I = np.array(I)
    t = I.reshape(-1, 3)
    # orient outward from the path axis
    fn = face_normals(P, t)
    cen = P[t].mean(1)
    axis_pts = np.array([path[np.argmin(np.linalg.norm(path - c, axis=1))] for c in cen])
    flip = np.einsum("ij,ij->i", fn, cen - axis_pts) < 0
    t[flip] = t[flip][:, ::-1]
    return P.astype(np.float32), t.reshape(-1)


def quad(p0, p1, p2, p3):
    """Single quad, CCW seen from the side the normal points to."""
    return np.array([p0, p1, p2, p3], np.float32), np.array([0, 1, 2, 0, 2, 3], np.uint32)


# ----------------------------------------------------------------------------- polygon prism
def _ear_clip(poly):
    """Ear clipping for a simple CCW polygon (N,2). Returns triangle index list."""
    idx = list(range(len(poly)))
    tris = []

    def area(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

    guard = 0
    while len(idx) > 3 and guard < 10000:
        guard += 1
        for k in range(len(idx)):
            i0, i1, i2 = idx[k - 1], idx[k], idx[(k + 1) % len(idx)]
            a, b, c = poly[i0], poly[i1], poly[i2]
            if area(a, b, c) <= 1e-12:
                continue
            ok = True
            for m in idx:
                if m in (i0, i1, i2):
                    continue
                p = poly[m]
                if area(a, b, p) >= 0 and area(b, c, p) >= 0 and area(c, a, p) >= 0:
                    ok = False
                    break
            if ok:
                tris.append((i0, i1, i2))
                idx.pop(k)
                break
        else:
            break
    if len(idx) == 3:
        tris.append(tuple(idx))
    return tris


def prism_x(profile_zy, x0, x1):
    """Extrude a simple polygon given as (z,y) points along X from x0 to x1 (x1 > x0).

    Side faces are oriented with the polygon's outward edge normal, caps with +/-X, so the
    result is correct for concave profiles too (dashboard, door-card shapes).
    """
    pr = np.asarray(profile_zy, np.float64)
    if 0.5 * np.sum(pr[:, 0] * np.roll(pr[:, 1], -1) - np.roll(pr[:, 0], -1) * pr[:, 1]) < 0:
        pr = pr[::-1]  # make CCW in (z,y)
    n = len(pr)
    P = np.concatenate([np.stack([np.full(n, x0), pr[:, 1], pr[:, 0]], 1), np.stack([np.full(n, x1), pr[:, 1], pr[:, 0]], 1)])
    I = []
    for i in range(n):
        j = (i + 1) % n
        da, db = pr[j, 0] - pr[i, 0], pr[j, 1] - pr[i, 1]
        out3 = np.array([0.0, -da, db])  # outward edge normal in (x,y,z)
        for tri in ([i, n + i, j], [j, n + i, n + j]):
            fn = np.cross(P[tri[1]] - P[tri[0]], P[tri[2]] - P[tri[0]])
            I += tri if np.dot(fn, out3) >= 0 else tri[::-1]
    for a_, b_, c_ in _ear_clip(pr):
        I += [n + a_, n + b_, n + c_]  # +X cap (CCW in z,y seen from +X? verified below)
        I += [a_, c_, b_]
    I = np.array(I).reshape(-1, 3)
    for k, t in enumerate(I):
        fn = np.cross(P[t[1]] - P[t[0]], P[t[2]] - P[t[0]])
        if np.all(P[t][:, 0] == x1) and fn[0] < 0:
            I[k] = t[::-1]
        elif np.all(P[t][:, 0] == x0) and fn[0] > 0:
            I[k] = t[::-1]
    return P.astype(np.float32), I.reshape(-1)


# ----------------------------------------------------------------------------- surface queries / patches
def tri_soup(prims):
    return np.concatenate([p.pos[p.idx.reshape(-1, 3)] for p in prims])


def ray_y(tris, x, z, top=True):
    a, b, c = tris[:, 0], tris[:, 1], tris[:, 2]
    d = (b[:, 2] - c[:, 2]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 2] - c[:, 2])
    ok = np.abs(d) > 1e-9
    dd = np.where(ok, d, 1)
    l1 = ((b[:, 2] - c[:, 2]) * (x - c[:, 0]) + (c[:, 0] - b[:, 0]) * (z - c[:, 2])) / dd
    l2 = ((c[:, 2] - a[:, 2]) * (x - c[:, 0]) + (a[:, 0] - c[:, 0]) * (z - c[:, 2])) / dd
    l3 = 1 - l1 - l2
    hit = ok & (l1 >= -1e-6) & (l2 >= -1e-6) & (l3 >= -1e-6)
    if not hit.any():
        return None
    y = l1[hit] * a[hit, 1] + l2[hit] * b[hit, 1] + l3[hit] * c[hit, 1]
    return float(y.max() if top else y.min())


def boundary_loops(pos, idx, tol=1e-4):
    """Welds by position and returns ordered boundary loops as lists of welded vertex positions + mean normal helper."""
    key = np.round(pos / tol).astype(np.int64)
    uniq, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.reshape(-1)
    wp = np.zeros((len(uniq), 3))
    cnt = np.zeros(len(uniq))
    np.add.at(wp, inv, pos)
    np.add.at(cnt, inv, 1)
    wp /= cnt[:, None]
    t = inv[np.asarray(idx).reshape(-1, 3)]
    edges = {}
    for tri in t:
        for k in range(3):
            a, b = tri[k], tri[(k + 1) % 3]
            if a == b:
                continue
            e = (min(a, b), max(a, b))
            edges.setdefault(e, []).append((a, b))
    nxt = {}
    for e, lst in edges.items():
        if len(lst) == 1:
            a, b = lst[0]
            nxt.setdefault(a, []).append(b)
    loops, used = [], set()
    for s in list(nxt):
        if s in used:
            continue
        loop, cur = [s], s
        used.add(s)
        while True:
            cands = [c for c in nxt.get(cur, []) if c not in used or c == s]
            if not cands:
                break
            cur = cands[0]
            if cur == s:
                break
            loop.append(cur)
            used.add(cur)
        if len(loop) >= 3:
            loops.append(wp[loop])
    return loops


def strip_along(loop, width, lift, up, inward=None, closed=True):
    """Raised rim strip hugging a closed boundary loop.

    loop   : (N,3) ordered points
    width  : strip width, extending outward from the loop (negative = inward)
    lift   : height above the surface along `up` (callable p->vec3 or fixed vec)
    returns (pos, idx) of a quad ribbon plus a vertical outer lip so it reads as a bezel.
    """
    loop = np.asarray(loop, np.float64)
    n = len(loop)
    cen = loop.mean(0)
    P, I, UP = [], [], []
    for i in range(n):
        p = loop[i]
        tangent = loop[(i + 1) % n] - loop[i - 1]
        tangent /= np.linalg.norm(tangent) + 1e-12
        u = up(p) if callable(up) else np.asarray(up, np.float64)
        u = u / (np.linalg.norm(u) + 1e-12)
        out = np.cross(tangent, u)
        out /= np.linalg.norm(out) + 1e-12
        if np.dot(out, p - cen) < 0:
            out = -out
        p_in = p + u * lift * 0.35
        p_hi = p + u * lift
        p_out = p + out * width + u * lift * 0.15
        P += [p_in, p_hi, p_out]
        UP += [u, u, u]
    P = np.array(P)
    UP = np.array(UP)
    for i in range(n):
        j = (i + 1) % n
        for k in range(2):
            a, b, c, d = 3 * i + k, 3 * i + k + 1, 3 * j + k, 3 * j + k + 1
            I += [a, c, b, b, c, d]
    I = np.array(I).reshape(-1, 3)
    fn = face_normals(P, I)
    flip = np.einsum("ij,ij->i", fn, UP[I].mean(1)) < 0
    I[flip] = I[flip][:, ::-1]
    return P.astype(np.float32), I.reshape(-1).astype(np.uint32)
