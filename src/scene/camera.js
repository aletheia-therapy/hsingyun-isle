import * as THREE from 'three';

const EL = THREE.MathUtils.degToRad(33);   // 俯角
const AZ = THREE.MathUtils.degToRad(14);   // 從南方偏東一點看過去

/**
 * 構圖鏡頭：把一組 3D 點放進畫面上沒被介面遮住的區域，並平滑移動到新構圖。
 * 用 setViewOffset 讓構圖置中在「可用區域」而不是整個畫面。
 */
export class FrameCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 900);
    this.probe = new THREE.PerspectiveCamera(30, 1, 0.5, 900);
    this.dir = new THREE.Vector3(Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL));
    this.rate = 3.2;
    this.baseDir = this.dir.clone();
    this.cur = null;
    this.goal = null;
    this.parallax = new THREE.Vector2();
    this.parallaxGoal = new THREE.Vector2();
  }

  /** 計算能容納 points 的鏡頭狀態 */
  solve(points, area, margin = 0.94) {
    const cam = this.probe;
    const box = new THREE.Box3().setFromPoints(points);
    const target = box.getCenter(new THREE.Vector3());
    target.y = Math.min(target.y, box.min.y + (box.max.y - box.min.y) * 0.4);
    cam.aspect = Math.max(0.2, area.w / area.h);
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    const v = new THREE.Vector3();
    let lo = 4, hi = 600;
    for (let i = 0; i < 28; i++) {
      const d = (lo + hi) / 2;
      cam.position.copy(target).addScaledVector(this.dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let ok = true;
      for (const p of points) { v.copy(p).project(cam); if (Math.abs(v.x) > margin || Math.abs(v.y) > margin) { ok = false; break; } }
      if (ok) hi = d; else lo = d;
    }
    cam.position.copy(target).addScaledVector(this.dir, hi);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of points) { v.copy(p).project(cam); x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y); }
    return { pos: cam.position.clone(), target, offX: (x0 + x1) / 2, offY: (y0 + y1) / 2, area: { ...area } };
  }

  frame(points, area, instant = false) {
    this.goal = this.solve(points, area);
    if (instant || !this.cur) this.cur = structuredCloneState(this.goal);
  }

  /** 跟隨模式：低一點的俯角，貼近旅人 */
  setFollow(on) {
    const el = THREE.MathUtils.degToRad(on ? 36 : 33);
    this.dir.set(Math.sin(AZ) * Math.cos(el), Math.sin(el), Math.cos(AZ) * Math.cos(el));
    this.rate = on ? 5 : 3.2;
  }

  setParallax(x, y) { this.parallaxGoal.set(x, y); }

  update(dt, cw, ch) {
    if (!this.cur) return;
    const k = 1 - Math.exp(-this.rate * dt);
    const c = this.cur, g = this.goal;
    c.pos.lerp(g.pos, k); c.target.lerp(g.target, k);
    c.offX += (g.offX - c.offX) * k; c.offY += (g.offY - c.offY) * k;
    for (const key of ['left', 'top', 'w', 'h']) c.area[key] += (g.area[key] - c.area[key]) * k;
    this.parallax.lerp(this.parallaxGoal, 1 - Math.exp(-2 * dt));

    const cam = this.camera;
    const side = new THREE.Vector3(this.dir.z, 0, -this.dir.x).normalize();
    cam.position.copy(c.pos).addScaledVector(side, this.parallax.x * 0.9).add(new THREE.Vector3(0, this.parallax.y * 0.5, 0));
    cam.lookAt(c.target);
    const a = c.area;
    cam.aspect = a.w / a.h;
    cam.setViewOffset(a.w, a.h, -a.left + (c.offX * a.w) / 2, -a.top - (c.offY * a.h) / 2, cw, ch);
    cam.updateProjectionMatrix();
  }
}

function structuredCloneState(s) {
  return { pos: s.pos.clone(), target: s.target.clone(), offX: s.offX, offY: s.offY, area: { ...s.area } };
}
