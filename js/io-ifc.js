/* Pro-2D+3D 2027 — IFC (BIM).
 * Export: IFC4 STEP written here (IfcWall + IfcOpeningElement + IfcDoor/IfcWindow + IfcSlab, swept-solid bodies, wall axes).
 *         The full Pro-2D+3D model is also embedded as a property ("P23_Model") so our own IFC re-opens as editable walls.
 * Import: any IFC2x3 / IFC4 / IFC4x3 via web-ifc (MPL-2.0, WebAssembly) → 3D reference model;
 *         IFC files written by Pro-2D+3D re-open as the editable 2D/3D model.
 * Units: metres. IFC is Z-up; plan (x, y) = IFC (x, y).
 */
(function () {
  const P23 = window.P23, M = P23.model, G = P23.geom;

  /* ---------- STEP helpers ---------- */
  const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  function guid() {
    const b = new Uint8Array(16); crypto.getRandomValues(b);
    let n = 0n; for (const x of b) n = (n << 8n) | BigInt(x);
    let s = B64[Number(n >> 126n)];
    for (let i = 20; i >= 0; i--) s += B64[Number((n >> BigInt(i * 6)) & 63n)];
    return s;
  }
  const R = (v) => { v = Math.abs(v) < 1e-9 ? 0 : v; let s = String(+v.toFixed(6)); if (!/[.eE]/.test(s)) s += "."; return s; };
  const S = (str) => "'" + String(str).replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/[^\x20-\x7e]/g, (c) => "\\X2\\" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") + "\\X0\\") + "'";
  const unS = (s) => s.replace(/''/g, "'").replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/g, (_, h) => h.match(/.{4}/g).map((x) => String.fromCharCode(parseInt(x, 16))).join("")).replace(/\\\\/g, "\\");

  function exportIFC() {
    const doc = M.doc, lines = []; let id = 0;
    const E = (txt) => { lines.push(`#${++id}=${txt};`); return "#" + id; };
    const pt3 = (x, y, z) => E(`IFCCARTESIANPOINT((${R(x)},${R(y)},${R(z)}))`);
    const pt2 = (x, y) => E(`IFCCARTESIANPOINT((${R(x)},${R(y)}))`);
    const dir3 = (x, y, z) => E(`IFCDIRECTION((${R(x)},${R(y)},${R(z)}))`);
    const now = Math.floor(Date.now() / 1000);

    const person = E("IFCPERSON($,$,'',$,$,$,$,$)");
    const org = E(`IFCORGANIZATION($,${S("PRO CONSTRUCTION & DESIGN CO.,LTD.")},$,$,$)`);
    const po = E(`IFCPERSONANDORGANIZATION(${person},${org},$)`);
    const appl = E(`IFCAPPLICATION(${org},'2027.0','Pro-2D+3D 2027','P23')`);
    const oh = E(`IFCOWNERHISTORY(${po},${appl},$,.ADDED.,${now},${po},${appl},${now})`);
    const units = E(`IFCUNITASSIGNMENT((${[E("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)"), E("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)"), E("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)"), E("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)")].join(",")}))`);
    const O = pt3(0, 0, 0), Z = dir3(0, 0, 1), X = dir3(1, 0, 0);
    const world = E(`IFCAXIS2PLACEMENT3D(${O},${Z},${X})`);
    const ctx = E(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${world},$)`);
    const body = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${ctx},$,.MODEL_VIEW.,$)`);
    const axisCtx = E(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Axis','Model',*,*,*,*,${ctx},$,.GRAPH_VIEW.,$)`);
    const project = E(`IFCPROJECT('${guid()}',${oh},${S(doc.name || "Pro-2D+3D project")},$,$,$,$,(${ctx}),${units})`);
    const sitePl = E(`IFCLOCALPLACEMENT($,${world})`), bldPl = E(`IFCLOCALPLACEMENT(${sitePl},${world})`), stPl = E(`IFCLOCALPLACEMENT(${bldPl},${world})`);
    const site = E(`IFCSITE('${guid()}',${oh},'Site',$,$,${sitePl},$,$,.ELEMENT.,$,$,$,$,$)`);
    const bld = E(`IFCBUILDING('${guid()}',${oh},${S(doc.name || "Building")},$,$,${bldPl},$,$,.ELEMENT.,$,$,$)`);
    const storey = E(`IFCBUILDINGSTOREY('${guid()}',${oh},'Ground floor',$,$,${stPl},$,$,.ELEMENT.,0.)`);
    E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${project},(${site}))`);
    E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${site},(${bld}))`);
    E(`IFCRELAGGREGATES('${guid()}',${oh},$,$,${bld},(${storey}))`);

    const box = (w, d, h, cx, cy, ctxRef) => { // rectangle profile centred at (cx, cy), extruded up by h
      const prof = E(`IFCRECTANGLEPROFILEDEF(.AREA.,$,${E(`IFCAXIS2PLACEMENT2D(${pt2(cx, cy)},$)`)},${R(w)},${R(d)})`);
      const solid = E(`IFCEXTRUDEDAREASOLID(${prof},${world},${Z},${R(h)})`);
      return E(`IFCSHAPEREPRESENTATION(${ctxRef || body},'Body','SweptSolid',(${solid}))`);
    };
    const contained = [];
    const walls = doc.walls;
    for (const w of walls) {
      const L = G.len(w.a, w.b); if (L < 1e-4) continue;
      const ux = (w.b.x - w.a.x) / L, uy = (w.b.y - w.a.y) / L;
      const extA = G.joined(w.a, w, walls) ? w.t / 2 : 0, extB = G.joined(w.b, w, walls) ? w.t / 2 : 0;
      const wpl = E(`IFCLOCALPLACEMENT(${stPl},${E(`IFCAXIS2PLACEMENT3D(${pt3(w.a.x, w.a.y, 0)},${Z},${dir3(ux, uy, 0)})`)})`);
      const axis = E(`IFCSHAPEREPRESENTATION(${axisCtx},'Axis','Curve2D',(${E(`IFCPOLYLINE((${pt2(0, 0)},${pt2(L, 0)}))`)}))`);
      const wb = box(L + extA + extB, w.t, w.h, (L + extB - extA) / 2, 0);
      const wall = E(`IFCWALL('${guid()}',${oh},'Wall',$,$,${wpl},${E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${axis},${wb}))`)},$,.STANDARD.)`);
      contained.push(wall);
      for (const o of G.openingsOf(w, doc.openings)) {
        const sill = Math.max(0, o.sill), oh2 = Math.min(o.h, w.h - sill);
        const opl = E(`IFCLOCALPLACEMENT(${wpl},${E(`IFCAXIS2PLACEMENT3D(${pt3(o.pos, 0, sill)},${Z},${X})`)})`);
        const op = E(`IFCOPENINGELEMENT('${guid()}',${oh},'Opening',$,$,${opl},${E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${box(o.w, w.t + 0.1, oh2, 0, 0)}))`)},$,.OPENING.)`);
        E(`IFCRELVOIDSELEMENT('${guid()}',${oh},$,$,${wall},${op})`);
        const fpl = E(`IFCLOCALPLACEMENT(${opl},${world})`);
        let fill;
        if (o.kind === "door") {
          const rep = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${box(o.w - 0.03, 0.045, oh2 - 0.01, 0, 0)}))`);
          fill = E(`IFCDOOR('${guid()}',${oh},'Door',$,$,${fpl},${rep},$,${R(oh2)},${R(o.w)},.DOOR.,${o.flip ? ".SINGLE_SWING_RIGHT." : ".SINGLE_SWING_LEFT."},$)`);
        } else {
          const rep = E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${box(o.w, 0.02, oh2, 0, 0)}))`);
          fill = E(`IFCWINDOW('${guid()}',${oh},'Window',$,$,${fpl},${rep},$,${R(oh2)},${R(o.w)},.WINDOW.,.SINGLE_PANEL.,$)`);
        }
        E(`IFCRELFILLSELEMENT('${guid()}',${oh},$,$,${op},${fill})`);
        contained.push(fill);
      }
    }
    // floor slab under the walls
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, tm = 0;
    for (const w of walls) { for (const p of [w.a, w.b]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); } tm = Math.max(tm, w.t); }
    if (walls.length) {
      const spl = E(`IFCLOCALPLACEMENT(${stPl},${E(`IFCAXIS2PLACEMENT3D(${pt3(0, 0, -0.1)},${Z},${X})`)})`);
      const sb = box(x1 - x0 + tm, y1 - y0 + tm, 0.1, (x0 + x1) / 2, (y0 + y1) / 2);
      contained.push(E(`IFCSLAB('${guid()}',${oh},'Floor slab',$,$,${spl},${E(`IFCPRODUCTDEFINITIONSHAPE($,$,(${sb}))`)},$,.FLOOR.)`));
    }
    if (contained.length) E(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${guid()}',${oh},$,$,(${contained.join(",")}),${storey})`);
    // embedded editable model (round-trip back into Pro-2D+3D)
    const keep = { format: "p23", version: 1, name: doc.name, walls: doc.walls, openings: doc.openings, dims: doc.dims };
    const prop = E(`IFCPROPERTYSINGLEVALUE('P23Model',$,IFCTEXT(${S(JSON.stringify(keep))}),$)`);
    const pset = E(`IFCPROPERTYSET('${guid()}',${oh},'P23_Model',$,(${prop}))`);
    E(`IFCRELDEFINESBYPROPERTIES('${guid()}',${oh},$,$,(${project}),${pset})`);

    const fname = (doc.name || "Pro2D3D").replace(/[\\/:*?"<>|]+/g, "_") + ".ifc";
    const ts = new Date().toISOString().slice(0, 19);
    return ["ISO-10303-21;", "HEADER;", "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');",
      `FILE_NAME(${S(fname)},'${ts}',(''),(${S("PRO CONSTRUCTION & DESIGN CO.,LTD.")}),'Pro-2D+3D 2027','Pro-2D+3D 2027 v2027.0','');`,
      "FILE_SCHEMA(('IFC4'));", "ENDSEC;", "DATA;", ...lines, "ENDSEC;", "END-ISO-10303-21;", ""].join("\n");
  }

  /* ---------- import ---------- */
  function embeddedModel(text) {
    const m = /IFCPROPERTYSINGLEVALUE\('P23Model',\$,IFCTEXT\('((?:[^']|'')*)'\)/.exec(text);
    if (!m) return null;
    try { const d = JSON.parse(unS(m[1])); return d && d.format === "p23" ? d : null; } catch (e) { return null; }
  }
  let api = null;
  async function ifcToGroup(buf) {
    if (location.protocol === "file:") throw new Error(P23.t("t_need_http"));
    if (!api) {
      if (!window.WebIFC) await new Promise((res, rej) => { // 6 MB — load only when an IFC is opened
        const s = document.createElement("script"); s.src = "vendor/web-ifc/web-ifc-api-iife.js"; s.onload = res; s.onerror = () => rej(new Error("web-ifc failed to load")); document.head.appendChild(s);
      });
      api = new WebIFC.IfcAPI();
      api.SetWasmPath(new URL("vendor/web-ifc/", document.baseURI).href, true);
      await api.Init();
    }
    const id = api.OpenModel(new Uint8Array(buf), { COORDINATE_TO_ORIGIN: false });
    const schema = api.GetModelSchema(id);
    const group = new THREE.Group(), mats = new Map(); let n = 0;
    api.StreamAllMeshes(id, (mesh) => {
      const pgs = mesh.geometries;
      for (let i = 0; i < pgs.size(); i++) {
        const pg = pgs.get(i), geo = api.GetGeometry(id, pg.geometryExpressID);
        const v = api.GetVertexArray(geo.GetVertexData(), geo.GetVertexDataSize());
        const ix = api.GetIndexArray(geo.GetIndexData(), geo.GetIndexDataSize());
        geo.delete();
        const pos = new Float32Array(v.length / 2), nor = new Float32Array(v.length / 2);
        for (let k = 0, j = 0; k < v.length; k += 6, j += 3) { pos[j] = v[k]; pos[j + 1] = v[k + 1]; pos[j + 2] = v[k + 2]; nor[j] = v[k + 3]; nor[j + 1] = v[k + 4]; nor[j + 2] = v[k + 5]; }
        const g = new THREE.BufferGeometry();
        g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3)); g.setIndex(new THREE.BufferAttribute(ix, 1));
        const c = pg.color, key = [c.x, c.y, c.z, c.w].map((q) => q.toFixed(3)).join(",");
        if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(c.x, c.y, c.z), roughness: 0.85, transparent: c.w < 1, opacity: c.w, side: THREE.DoubleSide }));
        const m = new THREE.Mesh(g, mats.get(key));
        m.applyMatrix4(new THREE.Matrix4().fromArray(pg.flatTransformation));
        m.castShadow = m.receiveShadow = true; group.add(m); n++;
      }
    });
    api.CloseModel(id);
    return { group, meshes: n, schema };
  }

  P23.ifc = { exportIFC, ifcToGroup, embeddedModel, guid };
})();
