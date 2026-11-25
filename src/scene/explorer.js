import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mat, glow } from './props.js';

const SPEED = 3.6;      // 公尺／秒

/**
 * 旅人：背著背包、提著一盞小燈的年輕學習者。沿折線路徑行走，腳下跟著地形。
 */
export class Explorer {
  constructor() {
    this.object = this.#build();
    this.pos = new THREE.Vector2();
    this.path = [];
    this.seg = 0;
    this.t = 0;
    this.facing = 0;
    this.clock = 0;
    this.onArrive = null;
    this.onPoint = null;     // (index, total) 每抵達路徑上的一個點
    this.speedScale = 1;
    this.pauseT = 0;
    this.manualMoving = false;
  }

  /** 自由行走：朝 (dx, dz) 方向前進 dist 公尺，canWalk(x, z) 判斷能不能走；撞牆時沿牆滑動 */
  drive(dx, dz, dist, dt, canWalk) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) { this.manualMoving = false; return false; }
    dx /= len; dz /= len;
    this.facing = dampAngle(this.facing, Math.atan2(dx, dz), 12, dt);
    const nx = this.pos.x + dx * dist, nz = this.pos.y + dz * dist;
    let moved = false;
    if (canWalk(nx, nz)) { this.pos.set(nx, nz); moved = true; }
    else if (canWalk(nx, this.pos.y)) { this.pos.x = nx; moved = true; }
    else if (canWalk(this.pos.x, nz)) { this.pos.y = nz; moved = true; }
    this.manualMoving = moved;
    this.#sync();
    return moved;
  }

  /** 原地停下 sec 秒（路徑保留，之後繼續走） */
  pause(sec) { this.pauseT = sec; }

  #build() {
    const g = new THREE.Group();
    this.body = new THREE.Group();
    g.add(this.body);
    const coat = mat('#4f8a83', { r: 0.85 });       // 青綠色外套
    const coat2 = mat('#3e716b', { r: 0.85 });
    const pants = mat('#e8dcc0', { r: 0.95 });      // 米白長褲
    const skin = mat('#e2b893', { r: 0.8 });
    const hair = mat('#2b211b', { r: 0.9 });
    const bagM = mat('#b8863b', { r: 0.8 });        // 柔和金色背包
    const shoe = mat('#5a4a3c', { r: 0.9 });
    const add = (geo, m, x, y, z, parent = this.body) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    // 雙腿（走路時擺動）
    this.legs = [-1, 1].map((sx) => {
      const leg = new THREE.Group(); leg.position.set(sx * 0.075, 0.5, 0); this.body.add(leg);
      add(new THREE.CylinderGeometry(0.06, 0.055, 0.44, 8), pants, 0, -0.22, 0, leg);
      add(new THREE.BoxGeometry(0.1, 0.06, 0.18), shoe, 0, -0.46, 0.03, leg);
      return leg;
    });
    // 外套身體
    add(new THREE.CylinderGeometry(0.15, 0.18, 0.46, 14), coat, 0, 0.72, 0);
    add(new THREE.CylinderGeometry(0.185, 0.185, 0.06, 14), coat2, 0, 0.52, 0);
    add(new THREE.SphereGeometry(0.15, 14, 10), coat, 0, 0.94, 0).scale.set(1.05, 0.5, 0.9);
    // 圍巾
    add(new THREE.TorusGeometry(0.085, 0.03, 8, 16), mat('#d9b36a', { r: 0.9 }), 0, 0.98, 0).rotation.x = Math.PI / 2;
    // 頭與頭髮
    add(new THREE.SphereGeometry(0.13, 16, 12), skin, 0, 1.13, 0);
    const h = add(new THREE.SphereGeometry(0.138, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.15, -0.01);
    h.rotation.x = -0.25;
    // 背包
    add(new THREE.BoxGeometry(0.24, 0.3, 0.12), bagM, 0, 0.78, -0.19);
    add(new THREE.BoxGeometry(0.2, 0.08, 0.04), mat('#9a6f2f'), 0, 0.7, -0.26);
    // 手臂
    this.arms = [-1, 1].map((sx) => {
      const arm = new THREE.Group(); arm.position.set(sx * 0.19, 0.92, 0); this.body.add(arm);
      add(new THREE.CylinderGeometry(0.045, 0.04, 0.36, 8), coat, 0, -0.18, 0, arm);
      add(new THREE.SphereGeometry(0.045, 8, 6), skin, 0, -0.38, 0, arm);
      return arm;
    });
    // 右手提著一盞小燈
    this.lantern = new THREE.Group();
    this.lantern.position.set(0, -0.42, 0.04);
    this.arms[1].add(this.lantern);
    const dark = mat('#2e241c', { r: 0.7 });
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.1, 4), dark, 0, -0.05, 0, this.lantern);
    add(new THREE.CylinderGeometry(0.03, 0.04, 0.025, 10), dark, 0, -0.11, 0, this.lantern);
    const shade = add(new THREE.SphereGeometry(0.07, 16, 12), mat('#ffe0a8', { e: '#ffa040', ei: 2.4 }), 0, -0.19, 0, this.lantern);
    shade.scale.y = 1.2; shade.castShadow = false;
    add(new THREE.CylinderGeometry(0.035, 0.028, 0.02, 10), dark, 0, -0.275, 0, this.lantern);
    glow(this.lantern, 0, -0.19, 0, 0.6);
    this.light = new THREE.PointLight('#ffbe75', 2.6, 4.2, 1.6);
    this.light.position.set(0, -0.19, 0);
    this.lantern.add(this.light);
    // 腳下陰影
    const blobGeo = new THREE.CircleGeometry(0.3, 20); blobGeo.rotateX(-Math.PI / 2);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.26, depthWrite: false }));
    blob.position.y = 0.03;
    g.add(blob);
    g.scale.setScalar(1.7);
    return g;
  }

  get moving() { return this.path.length > 0; }

  place(x, z) {
    this.pos.set(x, z);
    this.path = [];
    this.#sync();
  }

  /** 沿著 points（Vector2 陣列，第一點為目前位置附近）走 */
  walk(points) {
    const pts = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 0.01);
    if (pts.length && pts[0].distanceTo(this.pos) > 0.01) pts.unshift(this.pos.clone());
    if (pts.length < 2) { this.path = []; this.onArrive?.(); return; }
    this.path = pts; this.seg = 0; this.t = 0;
  }

  stop() { this.path = []; }

  update(dt) {
    this.clock += dt;
    this.step = (this.step || 0) + dt * (this.stride || 9);
    if (this.pauseT > 0) this.pauseT -= dt;
    const walking = (this.path.length && this.pauseT <= 0) || this.manualMoving;
    if (this.path.length && this.pauseT <= 0) {
      let remain = SPEED * this.speedScale * dt;
      while (remain > 0 && this.path.length) {
        const a = this.path[this.seg], b = this.path[this.seg + 1];
        const len = a.distanceTo(b);
        const left = (1 - this.t) * len;
        if (remain < left) {
          this.t += remain / len; remain = 0;
        } else {
          remain -= left; this.seg++; this.t = 0;
          this.onPoint?.(this.seg, this.path.length - 1);
          if (this.seg >= this.path.length - 1) {
            this.pos.copy(b); this.path = [];
            this.#sync();
            this.onArrive?.();
            return;
          }
        }
        const c = this.path[this.seg], d = this.path[this.seg + 1];
        this.pos.lerpVectors(c, d, this.t);
        const dir = Math.atan2(d.x - c.x, d.y - c.y);
        this.facing = dampAngle(this.facing, dir, 10, dt);
      }
    }
    if (walking) {
      this.body.position.y = Math.abs(Math.sin(this.step)) * 0.03;
      this.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.step + i * Math.PI) * (this.stride > 12 ? 0.85 : 0.6); });
      this.arms.forEach((a, i) => { a.rotation.x = Math.sin(this.step + i * Math.PI + Math.PI) * (i ? 0.25 : 0.45); });
      this.lantern.rotation.x = -this.arms[1].rotation.x * 0.8 + Math.sin(this.step) * 0.08;
    } else {
      this.body.position.y = Math.sin(this.clock * 1.8) * 0.012;
      this.legs.forEach((l) => { l.rotation.x *= 0.85; });
      this.arms.forEach((a) => { a.rotation.x *= 0.85; });
      this.lantern.rotation.x *= 0.95;
      this.lantern.rotation.z = Math.sin(this.clock * 1.3) * 0.03;
    }
    this.manualMoving = false;
    this.light.intensity = 2.4 + Math.sin(this.clock * 13) * 0.2 + Math.sin(this.clock * 7.3) * 0.15;
    this.#sync();
  }

  /** 舊版足跡光點已移除；保留介面以相容 main.js */
  attachTrail() {}

  faceTowards(x, z) { this.facing = Math.atan2(x - this.pos.x, z - this.pos.y); }

  #sync() {
    this.object.position.set(this.pos.x, (this.ground || heightAt)(this.pos.x, this.pos.y), this.pos.y);
    this.object.rotation.y = this.facing;
  }
}

function dampAngle(a, b, lambda, dt) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * (1 - Math.exp(-lambda * dt));
}
