/* Sample house: single-storey 10 × 8 m house (living room + 2 bedrooms). */
(function () {
  const P23 = window.P23;
  P23.sampleHouse = function () {
    const m = P23.model;
    m.newDoc();
    m.doc.name = "Sample house";
    const W = (ax, ay, bx, by, t) => m.addWall({ x: ax, y: ay }, { x: bx, y: by }, t || 0.2, 3.0);
    const south = W(0, 0, 10, 0), east = W(10, 0, 10, 8), north = W(10, 8, 0, 8), west = W(0, 8, 0, 0);
    const mid = W(6, 0, 6, 8, 0.12), bed = W(6, 4, 10, 4, 0.12);
    m.addOpening(south.id, "door", 3.0, { w: 1.2 });
    m.addOpening(south.id, "window", 8.0, { w: 1.6 });
    m.addOpening(south.id, "window", 1.2, { w: 1.2 });
    m.addOpening(east.id, "window", 2.0, { w: 1.4 });
    m.addOpening(east.id, "window", 6.0, { w: 1.4 });
    m.addOpening(north.id, "window", 2.0, { w: 1.6 });
    m.addOpening(north.id, "window", 7.0, { w: 2.4, h: 1.4, sill: 0.7 });
    m.addOpening(west.id, "window", 4.0, { w: 1.8 });
    m.addOpening(mid.id, "door", 2.0, { w: 0.8 });
    m.addOpening(mid.id, "door", 6.0, { w: 0.8, flip: true });
    void bed;
    m.addDim({ x: 0, y: 0 }, { x: 10, y: 0 }, -1.2);
    m.addDim({ x: 0, y: 0 }, { x: 0, y: 8 }, 1.2);
    m.addDim({ x: 0, y: 8 }, { x: 6, y: 8 }, 0.9);
    m.addDim({ x: 6, y: 8 }, { x: 10, y: 8 }, 0.9);
    m.undoStack = []; m.redoStack = []; m.dirty = false;
    m.emit("load", {}); m.changed("app");
  };
})();
