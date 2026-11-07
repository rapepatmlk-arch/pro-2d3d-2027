/* Pro-2D+3D 2027 — Wavefront OBJ export (own code) and import (three.js OBJLoader, MIT). Units: metres, Y up. */
(function () {
  const P23 = window.P23;

  function exportOBJ(view, baseName) {
    const g = view.group; g.updateMatrixWorld(true);
    const obj = ["# Pro-2D+3D 2027 OBJ export (units: metres, Y up)", "mtllib " + baseName + ".mtl"];
    const mats = new Map(); let vOff = 0, count = 0;
    const v = new THREE.Vector3(), nm = new THREE.Vector3(), nMat = new THREE.Matrix3();
    for (const m of g.children) {
      if (!m.isMesh) continue;
      const geo = m.geometry, pos = geo.attributes.position, nor = geo.attributes.normal; if (!pos) continue;
      const mat = m.material; mats.set(mat.name || "default", mat);
      const ud = m.userData || {};
      obj.push("o " + (ud.kind ? ud.kind + "_" + ud.id : "floor") + "_" + (count++), "usemtl " + (mat.name || "default"));
      nMat.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); obj.push("v " + v.x.toFixed(5) + " " + v.y.toFixed(5) + " " + v.z.toFixed(5)); }
      if (nor) for (let i = 0; i < nor.count; i++) { nm.fromBufferAttribute(nor, i).applyMatrix3(nMat).normalize(); obj.push("vn " + nm.x.toFixed(4) + " " + nm.y.toFixed(4) + " " + nm.z.toFixed(4)); }
      const idx = geo.index ? geo.index.array : [...Array(pos.count).keys()];
      for (let i = 0; i < idx.length; i += 3) {
        const a = idx[i] + 1 + vOff, b = idx[i + 1] + 1 + vOff, c = idx[i + 2] + 1 + vOff;
        obj.push(nor ? `f ${a}//${a} ${b}//${b} ${c}//${c}` : `f ${a} ${b} ${c}`);
      }
      vOff += pos.count;
    }
    const mtl = ["# Pro-2D+3D 2027 materials"];
    for (const [name, mat] of mats) {
      const c = mat.color || new THREE.Color(1, 1, 1);
      mtl.push("newmtl " + name, `Kd ${c.r.toFixed(4)} ${c.g.toFixed(4)} ${c.b.toFixed(4)}`, "Ka 0 0 0", "Ks 0.05 0.05 0.05", "d " + (mat.transparent ? mat.opacity.toFixed(3) : "1"), "illum 2", "");
    }
    return { obj: obj.join("\n") + "\n", mtl: mtl.join("\n") + "\n", meshes: count };
  }

  function importOBJ(text) {
    const group = new THREE.OBJLoader().parse(text);
    let n = 0;
    group.traverse((o) => {
      if (o.isMesh) {
        n++; o.castShadow = o.receiveShadow = true;
        const fix = (m) => { if (!m || !m.isMeshPhongMaterial) return new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.8 }); m.side = THREE.DoubleSide; return m; };
        o.material = Array.isArray(o.material) ? o.material.map(fix) : fix(o.material);
      }
    });
    return { group, meshes: n };
  }

  P23.obj = { exportOBJ, importOBJ };
})();
