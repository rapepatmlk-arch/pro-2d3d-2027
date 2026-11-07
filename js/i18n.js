/* Pro-2D+3D 2027 — Thai / English strings */
(function () {
  const P23 = (window.P23 = window.P23 || {});
  const DICT = {
    th: {
      m_file: "ไฟล์", m_edit: "แก้ไข", m_view: "มุมมอง", m_help: "ช่วยเหลือ",
      c_new: "สร้างงานใหม่", c_open: "เปิดไฟล์…", c_save: "บันทึก (.p23)", c_exp_dxf: "ส่งออก DXF (AutoCAD)", c_exp_obj: "ส่งออก OBJ (3D)", c_exp_pdf: "ส่งออก PDF (แบบพิมพ์)",
      c_undo: "ย้อนกลับ", c_redo: "ทำซ้ำ", c_delete: "ลบที่เลือก", c_clear_refs: "ล้างแบบอ้างอิงที่นำเข้า", c_fit: "ซูมพอดีจอ",
      c_shortcuts: "คีย์ลัด", c_about: "เกี่ยวกับโปรแกรม",
      n_home: "หน้าหลัก", n_3d: "โมเดล 3 มิติ", n_2d: "เขียนแบบ 2 มิติ", n_split: "มุมมองคู่ 2D | 3D", n_open: "เปิดไฟล์", n_sample: "บ้านตัวอย่าง", n_settings: "ตั้งค่า",
      t_theme: "ธีม", t_lang: "ภาษา", th_navy: "กรมท่า-ทอง", th_blue: "บลูพริ้นท์", th_graph: "กราไฟต์",
      h_title: "จากเส้นแรก สู่โมเดล 3 มิติ ในโปรแกรมเดียว",
      h_sub: "เปิด แก้ไข เขียนแบบ 2 มิติ และโมเดล 3 มิติ — เชื่อมข้อมูลกันแบบเรียลไทม์",
      c3_desc: "ดูโมเดล 3 มิติ ปรับความสูง/ความหนาผนัง และเลือกชิ้นงาน", c2_desc: "แปลน ผนัง ประตู หน้าต่าง เส้นบอกขนาด",
      start: "เริ่มงานใหม่ →", live: "เชื่อมต่อ\nเรียลไทม์",
      recent: "ไฟล์ล่าสุด", recent_empty: "ยังไม่มีไฟล์ — ลองเปิด \"บ้านตัวอย่าง\" หรือเริ่มงานใหม่",
      feat: "จุดเด่นของ Pro-2D+3D",
      ft1: "ซิงก์ 2D ⇄ 3D ทันที", ft1s: "แก้ผนังในแปลน โมเดล 3D อัปเดตเอง และกลับกัน",
      ft2: "แก้ไขได้ทั้ง 2D และ 3D", ft2s: "เลือกชิ้นงานในมุมมองไหนก็ได้ แก้ค่าแล้วอีกมุมมองตามทันที",
      ft3: "ไฟล์มาตรฐาน", ft3s: "เปิด DWG/DXF (ถึง 2018–2026), IFC, SKP, OBJ, PDF · บันทึก DWG, DXF, IFC, OBJ, PDF",
      tl_select: "เลือก (V)", tl_wall: "ผนัง (W)", tl_door: "ประตู (D)", tl_window: "หน้าต่าง (N)", tl_dim: "บอกขนาด (M)",
      p_thick: "หนา", p_height: "สูง", snap: "สแนป", plan: "แปลน", cam_iso: "มุมเอียง", cam_top: "มุมบน",
      snap_step: "ระยะสแนปกริด", pdf_paper: "ขนาดกระดาษ PDF", formats: "การรองรับไฟล์",
      s_ready: "พร้อมใช้งาน", s_sync: "Live Link 2D⇄3D", s_unit: "หน่วย: เมตร", close: "ปิด",
      h_select: "คลิกเลือกผนัง/ประตู/หน้าต่าง · ลากเพื่อย้าย · ลากจุดปลายผนังเพื่อยืด · ล้อเมาส์ซูม · คลิกขวา/ปุ่มกลางลากเพื่อเลื่อน",
      h_wall: "คลิกจุดเริ่ม แล้วคลิกต่อเพื่อวาดผนังต่อเนื่อง · Shift = แนวตั้ง/นอน · ดับเบิลคลิก/Esc เพื่อจบ",
      h_door: "เลื่อนเมาส์ไปบนผนัง แล้วคลิกเพื่อวางประตู",
      h_window: "เลื่อนเมาส์ไปบนผนัง แล้วคลิกเพื่อวางหน้าต่าง",
      h_dim: "คลิก 2 จุดเพื่อสร้างเส้นบอกขนาด",
      h_3d: "ลากซ้าย = หมุน · ลากขวา = เลื่อน · ล้อ = ซูม · คลิกเพื่อเลือกชิ้นงาน (ซิงก์กับ 2D)",
      k_wall: "ผนัง", k_door: "ประตู", k_window: "หน้าต่าง", k_dim: "เส้นบอกขนาด",
      pr_none: "ยังไม่ได้เลือกชิ้นงาน", pr_none_s: "คลิกผนัง ประตู หรือหน้าต่าง ในแปลน 2D หรือในโมเดล 3D เพื่อแก้ไขค่า — ทั้งสองมุมมองจะอัปเดตพร้อมกัน",
      pr_length: "ความยาว (ม.)", pr_thick: "ความหนา (ม.)", pr_height: "ความสูง (ม.)", pr_width: "กว้าง (ม.)", pr_oheight: "สูง (ม.)", pr_sill: "สูงจากพื้น (ม.)",
      pr_pos: "ระยะจากต้นผนัง (ม.)", pr_kind: "ชนิด", pr_flip: "กลับด้านบานเปิด", pr_doc: "ข้อมูลงาน", pr_name: "ชื่องาน",
      pr_stats: "ผนัง {w} · ประตู {d} · หน้าต่าง {n}", pr_refs: "แบบอ้างอิงที่นำเข้า: {l} เส้น, {t} ข้อความ",
      f_fmt: "ไฟล์", f_ver: "เวอร์ชันที่รองรับ", f_open: "เปิด", f_save: "บันทึก/ส่งออก", f_note: "หมายเหตุ",
      yes: "ได้", no: "ยัง", part: "บางส่วน",
      t_saved: "บันทึกไฟล์แล้ว: {f}", t_opened: "เปิดไฟล์แล้ว: {f}", t_dxf_in: "นำเข้า DXF ({v}) แล้ว: ผนัง {w}, เส้นอ้างอิง {l}, ข้อความ {t}",
      t_obj_in: "นำเข้า OBJ แล้ว: {n} ชิ้น (แสดงในมุมมอง 3D)", t_err: "เปิดไฟล์ไม่สำเร็จ: {e}",
      t_dwg: "ไฟล์ DWG ต้องใช้ตัวแปลงที่มี license (ODA/RealDWG) ซึ่งจะเชื่อมในเฟส 3 — ระหว่างนี้ให้ Save As เป็น DXF จาก AutoCAD แล้วเปิดได้เลย",
      t_ifc: "การเปิด IFC (IFC2x3/IFC4/IFC4.3) อยู่ในเฟส 2", t_skp: "การเปิด SKP (SketchUp 2021–2026) อยู่ในเฟส 3 (ใช้ SketchUp SDK บนเวอร์ชัน Windows)",
      t_pdfin: "การเปิด PDF เป็นแบบอ้างอิงอยู่ในเฟส 2 — ตอนนี้ส่งออก PDF ได้แล้ว",
      pdf_in_scale: "มาตราส่วนของแบบ PDF ที่นำเข้า", t_pdf_page: "ไฟล์ PDF มี {n} หน้า — เลือกหน้าที่ต้องการ (1–{n})",
      t_pdf_in: "เปิด PDF หน้า {p}/{n} เป็นแบบอ้างอิงแล้ว (1:{s} → {w} × {h} ม.) — วาดผนังทับได้เลย",
      c_exp_ifc: "ส่งออก IFC4 (BIM)", t_ifc_out: "ส่งออก IFC4 แล้ว (ผนัง ช่องเปิด ประตู หน้าต่าง พื้น)",
      t_ifc_own: "เปิด IFC ของ Pro-2D+3D แล้ว — แก้ไขได้ (ผนัง {w})", t_ifc_in: "เปิด IFC ({s}) แล้ว: {n} ชิ้น (แสดงในมุมมอง 3D)",
      c_exp_dwg: "บันทึกเป็น DWG (AutoCAD)", t_need_engine: "การบันทึก DWG ใช้ได้ในโปรแกรมเวอร์ชัน Windows — บนไอแพด/เว็บให้บันทึกเป็น DXF แทน (AutoCAD เปิดได้)",
      t_dwg_out: "บันทึก DWG แล้ว (รุ่น 2000 — ตรวจสอบแล้ว ข้อมูลครบ)", t_dwg_out_warn: "บันทึก DWG แล้ว แต่มีคำเตือน: {w}",
      s_engine_on: "Engine {v}", s_engine_off: "Engine: ไม่ได้เปิด",
      t_converting: "กำลังเปิด {f} …", t_dwg_in: "เปิด DWG แล้ว (แปลงผ่าน LibreDWG → DXF {v}): เส้น {l}, ข้อความ {t}",
      t_skp_in: "เปิด SketchUp แล้ว{v}: {n} ชิ้น (แสดงในมุมมอง 3D)", t_need_http: "การเปิด DWG/SKP ต้องเปิดโปรแกรมผ่าน Start-Pro2D3D.bat (ไม่ใช่ดับเบิลคลิก index.html)",
      t_unknown: "ไม่รู้จักชนิดไฟล์นี้", t_empty: "ยังไม่มีผนังในแบบ — วาดผนังก่อนส่งออก", t_new: "เริ่มงานใหม่แล้ว",
      t_confirm_new: "งานปัจจุบันยังไม่ได้บันทึก ต้องการทิ้งการแก้ไขหรือไม่?", t_refs_cleared: "ล้างแบบอ้างอิงแล้ว",
      t_obj_out: "ส่งออก OBJ + MTL แล้ว", t_pdf_out: "ส่งออก PDF แล้ว (มาตราส่วน 1:{s})", t_dxf_out: "ส่งออก DXF แล้ว",
      sc_title: "คีย์ลัด", about_title: "เกี่ยวกับ Pro-2D+3D 2027",
      about_body: "Pro-2D+3D 2027 · เวอร์ชัน 2027.0 (เฟส 1)\n© PRO CONSTRUCTION & DESIGN CO.,LTD.\nโปรแกรมเขียนแบบ 2 มิติและโมเดล 3 มิติ ที่ใช้ข้อมูลชุดเดียวกันแบบเรียลไทม์\nซอฟต์แวร์เสรี เผยแพร่ภายใต้สัญญาอนุญาต GNU GPL เวอร์ชัน 3 หรือใหม่กว่า (GPL-3.0-or-later) — ไม่มีการรับประกันใดๆ\nส่วนประกอบโอเพนซอร์ส: three.js (MIT License)",
    },
    en: {
      m_file: "File", m_edit: "Edit", m_view: "View", m_help: "Help",
      c_new: "New project", c_open: "Open…", c_save: "Save (.p23)", c_exp_dxf: "Export DXF (AutoCAD)", c_exp_obj: "Export OBJ (3D)", c_exp_pdf: "Export PDF (print)",
      c_undo: "Undo", c_redo: "Redo", c_delete: "Delete selected", c_clear_refs: "Clear imported reference", c_fit: "Zoom to fit",
      c_shortcuts: "Keyboard shortcuts", c_about: "About",
      n_home: "Home", n_3d: "3D Model", n_2d: "2D Drafting", n_split: "Split view 2D | 3D", n_open: "Open file", n_sample: "Sample house", n_settings: "Settings",
      t_theme: "Theme", t_lang: "Language", th_navy: "Navy Gold", th_blue: "Blueprint", th_graph: "Graphite",
      h_title: "From the first line to a 3D model, in one program",
      h_sub: "Open, edit, draft in 2D and model in 3D — linked in real time",
      c3_desc: "View the 3D model, change wall height/thickness, pick elements", c2_desc: "Plans, walls, doors, windows, dimensions",
      start: "Start new →", live: "REAL-TIME\nLINK",
      recent: "Recent files", recent_empty: "No files yet — try the Sample house or start a new project",
      feat: "Why Pro-2D+3D",
      ft1: "Instant 2D ⇄ 3D sync", ft1s: "Edit a wall in plan and the 3D model updates, and vice versa",
      ft2: "Edit in 2D and 3D", ft2s: "Pick an element in either view, change it, and the other view follows instantly",
      ft3: "Standard formats", ft3s: "Open DWG/DXF (up to 2018–2026), IFC, SKP, OBJ, PDF · save DWG, DXF, IFC, OBJ, PDF",
      tl_select: "Select (V)", tl_wall: "Wall (W)", tl_door: "Door (D)", tl_window: "Window (N)", tl_dim: "Dimension (M)",
      p_thick: "Thick", p_height: "Height", snap: "Snap", plan: "Plan", cam_iso: "Iso", cam_top: "Top",
      snap_step: "Grid snap step", pdf_paper: "PDF paper size", formats: "File format support",
      s_ready: "Ready", s_sync: "Live Link 2D⇄3D", s_unit: "Units: metres", close: "Close",
      h_select: "Click a wall/door/window · drag to move · drag a wall end to stretch · wheel to zoom · right/middle drag to pan",
      h_wall: "Click a start point, keep clicking to chain walls · Shift = ortho · double-click/Esc to finish",
      h_door: "Hover over a wall and click to place a door",
      h_window: "Hover over a wall and click to place a window",
      h_dim: "Click two points to add a dimension",
      h_3d: "Left drag = orbit · right drag = pan · wheel = zoom · click to pick (synced with 2D)",
      k_wall: "Wall", k_door: "Door", k_window: "Window", k_dim: "Dimension",
      pr_none: "Nothing selected", pr_none_s: "Click a wall, door or window in the 2D plan or the 3D model to edit it — both views update together",
      pr_length: "Length (m)", pr_thick: "Thickness (m)", pr_height: "Height (m)", pr_width: "Width (m)", pr_oheight: "Height (m)", pr_sill: "Sill height (m)",
      pr_pos: "Offset from wall start (m)", pr_kind: "Type", pr_flip: "Flip swing", pr_doc: "Project", pr_name: "Name",
      pr_stats: "{w} walls · {d} doors · {n} windows", pr_refs: "Imported reference: {l} lines, {t} texts",
      f_fmt: "Format", f_ver: "Supported versions", f_open: "Open", f_save: "Save/Export", f_note: "Notes",
      yes: "Yes", no: "Not yet", part: "Partial",
      t_saved: "Saved: {f}", t_opened: "Opened: {f}", t_dxf_in: "Imported DXF ({v}): {w} walls, {l} reference lines, {t} texts",
      t_obj_in: "Imported OBJ: {n} objects (shown in the 3D view)", t_err: "Could not open file: {e}",
      t_dwg: "DWG needs a licensed converter (ODA/RealDWG), connected in Phase 3 — for now Save As DXF in AutoCAD and open that",
      t_ifc: "Opening IFC (IFC2x3/IFC4/IFC4.3) is in Phase 2", t_skp: "Opening SKP (SketchUp 2021–2026) is in Phase 3 (SketchUp SDK in the Windows build)",
      t_pdfin: "Opening PDF as a reference is in Phase 2 — PDF export works now",
      pdf_in_scale: "Scale of imported PDF drawings", t_pdf_page: "The PDF has {n} pages — choose a page (1–{n})",
      t_pdf_in: "Opened PDF page {p}/{n} as a reference (1:{s} → {w} × {h} m) — trace walls over it",
      c_exp_ifc: "Export IFC4 (BIM)", t_ifc_out: "Exported IFC4 (walls, openings, doors, windows, slab)",
      t_ifc_own: "Opened a Pro-2D+3D IFC — editable ({w} walls)", t_ifc_in: "Opened IFC ({s}): {n} objects (shown in the 3D view)",
      c_exp_dwg: "Save as DWG (AutoCAD)", t_need_engine: "Saving DWG works in the Windows program — on iPad/web save as DXF instead (opens in AutoCAD)",
      t_dwg_out: "DWG saved (version 2000 — verified, nothing lost)", t_dwg_out_warn: "DWG saved with warnings: {w}",
      s_engine_on: "Engine {v}", s_engine_off: "Engine: off",
      t_converting: "Opening {f} …", t_dwg_in: "Opened DWG (via LibreDWG → DXF {v}): {l} lines, {t} texts",
      t_skp_in: "Opened SketchUp{v}: {n} objects (shown in the 3D view)", t_need_http: "Opening DWG/SKP needs the app started with Start-Pro2D3D.bat (not by double-clicking index.html)",
      t_unknown: "Unknown file type", t_empty: "The drawing has no walls yet — draw some before exporting", t_new: "New project started",
      t_confirm_new: "The current project has unsaved changes. Discard them?", t_refs_cleared: "Reference cleared",
      t_obj_out: "Exported OBJ + MTL", t_pdf_out: "Exported PDF (scale 1:{s})", t_dxf_out: "Exported DXF",
      sc_title: "Keyboard shortcuts", about_title: "About Pro-2D+3D 2027",
      about_body: "Pro-2D+3D 2027 · version 2027.0 (Phase 1)\n© PRO CONSTRUCTION & DESIGN CO.,LTD.\n2D drafting and 3D modelling on one shared model, synced in real time.\nFree software released under the GNU GPL version 3 or later (GPL-3.0-or-later) — WITHOUT ANY WARRANTY.\nOpen-source components: three.js (MIT License)",
    },
  };

  let lang = "th";
  P23.t = function (key, vars) {
    let s = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? vars[k] : ""));
    return s;
  };
  P23.getLang = () => lang;
  P23.setLang = function (l) {
    lang = DICT[l] ? l : "th";
    document.documentElement.lang = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.innerHTML = P23.t(el.dataset.i18n).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>");
    });
    document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = P23.t(el.dataset.i18nTitle)));
    document.querySelectorAll("[data-lang-btn]").forEach((b) => b.classList.toggle("on", b.dataset.langBtn === lang));
    try { localStorage.setItem("p23-lang", lang); } catch (e) {}
    if (P23.model) P23.model.emit("lang", {});
  };
})();
