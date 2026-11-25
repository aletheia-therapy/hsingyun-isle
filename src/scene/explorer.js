import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { mat, glow } from './props.js';
import { humanFigure, animateFigure } from './npc.js';

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
    // 寫實比例的年輕旅人：青綠外套、米色長褲、背包，右手提一盞小燈
    this.fig = humanFigure({ top: '#3f7a73', pants: '#d9ccb0', skin: '#dcae88', hair: '#231b16', shoe: '#4a3a2c' });
    g.add(this.fig.root);
    this.body = this.fig.body;
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.14), mat('#a57a3a', { r: 0.8 }));
    bag.position.set(0, 0.34, -0.17); bag.castShadow = true; this.fig.torso.add(bag);
    const strap = mat('#7a5a2a');
    for (const sx of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.34, 0.02), strap); st.position.set(sx * 0.1, 0.35, 0.105); this.fig.torso.add(st); }
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.025, 8, 16), mat('#d9b36a', { r: 0.9 }));
    scarf.rotation.x = Math.PI / 2; scarf.position.y = 0.58; this.fig.torso.add(scarf);
    this.lantern = new THREE.Group();
    this.lantern.position.set(0, -0.33, 0.02);
    this.fig.arms[1].userData.elbow.add(this.lantern);
    const dark = mat('#2e241c', { r: 0.7 });
    const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); this.lantern.add(o); return o; };
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 4), dark, 0, -0.04, 0);
    add(new THREE.CylinderGeometry(0.03, 0.04, 0.02, 10), dark, 0, -0.09, 0);
    const shade = add(new THREE.SphereGeometry(0.06, 16, 12), mat('#ffe0a8', { e: '#ffa040', ei: 2.2 }), 0, -0.16, 0);
    shade.scale.y = 1.2;
    add(new THREE.CylinderGeometry(0.03, 0.024, 0.02, 10), dark, 0, -0.235, 0);
    glow(this.lantern, 0, -0.16, 0, 0.5);
    this.light = new THREE.PointLight('#ffbe75', 1.6, 3.5, 1.6);
    this.light.position.set(0, -0.16, 0);
    this.lantern.add(this.light);
    const blobGeo = new THREE.CircleGeometry(0.32, 20); blobGeo.rotateX(-Math.PI / 2);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.24, depthWrite: false }));
    blob.position.y = 0.03;
    g.add(blob);
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
    animateFigure(this.fig, { walking, phase: this.step, amp: this.stride > 13 ? 1.25 : 1, t: this.clock });
    if (walking) this.fig.torso.rotation.x = this.stride > 13 ? 0.12 : 0.04;
    else this.fig.torso.rotation.x *= 0.9;
    this.lantern.rotation.x = -(this.fig.arms[1].rotation.x) * 0.9;
    this.manualMoving = false;
    this.light.intensity = 1.5 + Math.sin(this.clock * 13) * 0.12 + Math.sin(this.clock * 7.3) * 0.1;
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
