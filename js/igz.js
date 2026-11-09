/* Pro3D-2027 for iPad — reading .igz (the Pro3D / IngeTrazo model), formats 1, 2 and 3.
 * A ZIP (format ≥2) of document.json + textures/ (+ geom/*.bin, format 3: binary meshes).
 * Faces are polygons (outer loop + holes) in metres, Z up; groups hold faces/edges or are
 * instances of a prototype (component) with a column-major 4×4 ``xform``.
 * Textures use the .skp planar projection (projection_basis of core/texture.py). */
(function () {
  "use strict";
  const P = (window.P23 = window.P23 || {});
  let fflate = null, earcut = null;

  /* .skp plane basis: xr = normalize(Z × n), yr = n × xr; vertical normals: (X, ±Y) */
  function basis(n, rot) {
    let u, v;
    const cx = -n.y, cy = n.x;                          // Z × n = (-ny, nx, 0)
    const len = Math.hypot(cx, cy);
    if (len < 1e-3) { u = new THREE.Vector3(1, 0, 0); v = new THREE.Vector3(0, n.z >= 0 ? 1 : -1, 0); }
    else { u = new THREE.Vector3(cx / len, cy / len, 0); v = new THREE.Vector3().crossVectors(n, u).normalize(); }
    if (rot) {
      const a = (rot * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
      const u2 = u.clone().multiplyScalar(ca).addScaledVector(v, sa), v2 = v.clone().multiplyScalar(ca).addScaledVector(u, -sa);
      u = u2; v = v2;
    }
    return [u, v];
  }
  function newell(pts) {
    const n = new THREE.Vector3();
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      n.x += (a[1] - b[1]) * (a[2] + b[2]); n.y += (a[2] - b[2]) * (a[0] + b[0]); n.z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n.lengthSq() > 0 ? n.normalize() : n.set(0, 0, 1);
  }

  /* One builder per material key: triangles collected, then one BufferGeometry. */
  function makeBuilder(materialFor) {
    const buckets = new Map();
    return {
      face(outer, holes, attrs) {
        if (!outer || outer.length < 3) return;
        if (attrs && attrs.hidden) return;
        const n = newell(outer);
        // 2D coordinates in the face plane for earcut
        const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
        const drop = az >= ax && az >= ay ? 2 : ax >= ay ? 0 : 1;
        const flat = [], all = [], holeIdx = [];
        const push = (p) => { all.push(p); if (drop === 0) flat.push(p[1], p[2]); else if (drop === 1) flat.push(p[0], p[2]); else flat.push(p[0], p[1]); };
        outer.forEach(push);
        for (const h of holes || []) { if (h.length < 3) continue; holeIdx.push(all.length); h.forEach(push); }
        const tri = earcut(flat, holeIdx.length ? holeIdx : null, 2);
        if (!tri.length) return;
        const m = materialFor(attrs || {});
        let b = buckets.get(m.key);
        if (!b) { b = { mat: m, pos: [], nor: [], uv: [] }; buckets.set(m.key, b); }
        const tex = attrs && attrs.texture;
        let U = null, V = null, sw = 1, sh = 1;
        if (tex) { [U, V] = basis(n, +tex.rot || 0); sw = Math.abs(+tex.sw) > 1e-9 ? +tex.sw : 1; sh = Math.abs(+tex.sh) > 1e-9 ? +tex.sh : 1; }
        const uvw = tex && Array.isArray(tex.uvw) && tex.uvw.length === 8 ? tex.uvw : null;
        for (let k = 0; k < tri.length; k += 3) {
          // keep the polygon's own winding (earcut may flip): compare with the Newell normal
          let i0 = tri[k], i1 = tri[k + 1], i2 = tri[k + 2];
          const a = all[i0], bb = all[i1], c = all[i2];
          const cr = new THREE.Vector3(bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]).cross(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
          if (cr.dot(n) < 0) { const t = i1; i1 = i2; i2 = t; }
          for (const i of [i0, i1, i2]) {
            const p = all[i];
            b.pos.push(p[0], p[1], p[2]); b.nor.push(n.x, n.y, n.z);
            if (uvw) b.uv.push(uvw[0] * p[0] + uvw[1] * p[1] + uvw[2] * p[2] + uvw[3], uvw[4] * p[0] + uvw[5] * p[1] + uvw[6] * p[2] + uvw[7]);
            else if (U) b.uv.push((p[0] * U.x + p[1] * U.y + p[2] * U.z) / sw, (p[0] * V.x + p[1] * V.y + p[2] * V.z) / sh);
            else b.uv.push(0, 0);
          }
        }
      },
      build(name) {
        const g = new THREE.Group(); g.name = name || "";
        for (const b of buckets.values()) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
          geo.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
          geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
          const mesh = new THREE.Mesh(geo, b.mat.material); mesh.name = name || "";
          g.add(mesh);
        }
        return g;
      },
    };
  }

  async function read(buf) {
    if (!fflate) fflate = await import(P.url("vendor/fflate/browser.js"));
    if (!earcut) { const m = await import(P.url("vendor/earcut/earcut.js")); earcut = m.default || m.earcut || m; }
    const bytes = new Uint8Array(buf);
    let files = {}, doc;
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) { files = fflate.unzipSync(bytes); doc = JSON.parse(new TextDecoder().decode(files["document.json"])); }
    else doc = JSON.parse(new TextDecoder().decode(bytes));
    const scene = doc.scene || doc;
    const texCache = new Map(), matCache = new Map();
    const matsByName = {};
    for (const m of scene.materials || []) if (m && m.name) matsByName[m.name] = m;
    function texture(path) {
      if (texCache.has(path)) return texCache.get(path);
      let t = null;
      const data = files[path];
      if (data) {
        const blob = new Blob([data], { type: /\.png$/i.test(path) ? "image/png" : "image/jpeg" });
        t = new THREE.TextureLoader().load(URL.createObjectURL(blob), () => P.requestRender && P.requestRender());
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      }
      texCache.set(path, t); return t;
    }
    function materialFor(a) {
      const tex = a.texture && a.texture.embed ? a.texture.embed : "";
      const col = Array.isArray(a.color) ? a.color : null;
      const op = a.opacity != null ? +a.opacity : 1;
      const key = tex + "|" + (col ? col.join(",") : "") + "|" + op;
      if (matCache.has(key)) return matCache.get(key);
      const p = { side: THREE.DoubleSide, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
      if (tex && texture(tex)) p.map = texture(tex);
      else if (col) { const c = col.map((x) => (x > 1 ? x / 255 : x)); p.color = new THREE.Color(c[0], c[1], c[2]); }
      else p.color = new THREE.Color(0.92, 0.92, 0.9);
      if (op < 1) { p.transparent = true; p.opacity = op; }
      const m = { key, material: new THREE.MeshStandardMaterial(p) };
      matCache.set(key, m); return m;
    }
    function arraysOf(geom) {
      const blob = files[geom.member]; if (!blob) return null;
      const out = {};
      for (const name in geom.arrays) {
        const [dt, shape, off] = geom.arrays[name];
        const count = shape.reduce((a, b) => a * b, 1);
        const T = { "<f4": Float32Array, "<i4": Int32Array, "<u1": Uint8Array, "|u1": Uint8Array, "<i8": BigInt64Array, "<f8": Float64Array }[dt];
        if (!T) continue;
        out[name] = new T(blob.buffer.slice(blob.byteOffset + off, blob.byteOffset + off + count * T.BYTES_PER_ELEMENT));
      }
      return out;
    }
    function buildMesh(block, name) {
      const b = makeBuilder(materialFor);
      if (block.geom) {
        const A = arraysOf(block.geom); if (!A) return b.build(name);
        const table = block.geom.face_attrs || [], pos = A.pos, rings = A.rings, sizes = A.ring_sizes, counts = A.ring_counts, fa = A.face_attr;
        let r = 0, idx = 0;
        const ring = () => { const n = sizes[r++]; const pts = []; for (let k = 0; k < n; k++) { const i = rings[idx++]; pts.push([pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]); } return pts; };
        for (let f = 0; f < counts.length; f++) {
          const outer = ring(), holes = [];
          for (let h = 1; h < counts[f]; h++) holes.push(ring());
          const t = fa && fa[f] >= 0 ? table[fa[f]] : null;
          b.face(outer, holes, t || {});
        }
      } else for (const f of block.faces || []) b.face(f.vertices, f.holes, f);
      return b.build(name);
    }
    const root = new THREE.Group(); root.name = "igz";
    const protos = (scene.protos || []).map((p, i) => buildMesh(p, "component " + (i + 1)));
    function addGroups(list, parent) {
      for (const g of list || []) {
        if (g.billboard) continue;                       // the scale figure: not part of the model
        let node;
        if (g.proto != null && protos[g.proto]) node = protos[g.proto].clone();
        else node = buildMesh(g, g.name || "");
        node.name = g.name || node.name || "";
        if (Array.isArray(g.xform) && g.xform.length === 16) { node.matrixAutoUpdate = false; node.matrix.fromArray(g.xform); }
        if (g.hidden) node.visible = false;
        if (g.children) addGroups(g.children, node);
        parent.add(node);
      }
    }
    addGroups(scene.groups, root);
    if ((scene.faces && scene.faces.length) || scene.geom) root.add(buildMesh(scene, "model"));
    return { group: root, format: doc.igz_format || 1, zUp: true };
  }

  P.igz = { read };
})();
