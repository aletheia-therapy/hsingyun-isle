import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
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

  /**
   * 自由行走：朝 (dx, dz) 方向前進 dist 公尺，canWalk(x, z) 判斷能不能走。
   * 撞到障礙（橋的欄杆、溪岸、牆）時，會試著往左右偏一點，沿著障礙滑過去，不會卡住。
   */
  drive(dx, dz, dist, dt, canWalk) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) { this.manualMoving = false; return false; }
    dx /= len; dz /= len;
    const tryMove = (ux, uz, k) => {
      const nx = this.pos.x + ux * dist * k, nz = this.pos.y + uz * dist * k;
      if (!canWalk(nx, nz)) return false;
      this.pos.set(nx, nz); return true;
    };
    let moved = tryMove(dx, dz, 1), mx = dx, mz = dz;
    if (!moved) {
      const pref = this.slideSign || 1;
      outer: for (const a of [0.35, 0.7, 1.05, 1.4]) {
        for (const sg of [pref, -pref]) {
          const c = Math.cos(a * sg), s = Math.sin(a * sg);
          const ux = dx * c - dz * s, uz = dx * s + dz * c;
          if (tryMove(ux, uz, Math.max(0.25, Math.cos(a)))) { moved = true; mx = ux; mz = uz; this.slideSign = sg; break outer; }
        }
      }
    }
    if (moved) this.facing = dampAngle(this.facing, Math.atan2(mx, mz), 10, dt);
    this.manualMoving = moved;
    this.#sync();
    return moved;
  }

  /** 原地停下 sec 秒（路徑保留，之後繼續走） */
  pause(sec) { this.pauseT = sec; }

  #build() {
    const g = new THREE.Group();
    // 寫實比例的年輕旅人：青綠外套、米色長褲、背著背包、圍著淡金色圍巾
    const M4 = (x, y, z, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(1, 1, 1));
    this.fig = humanFigure({
      top: '#3d6f69', pants: '#cbbd9e', skin: '#dcae88', hair: '#231b16', shoe: '#4a3a2c', longSleeve: true,
      extras: { torso: [
        [new RoundedBoxGeometry(0.29, 0.37, 0.15, 2, 0.045), '#9c7440', M4(0, 0.34, -0.17)],
        [new RoundedBoxGeometry(0.2, 0.12, 0.05, 2, 0.02), '#86602f', M4(0, 0.24, -0.255)],
        [new THREE.BoxGeometry(0.035, 0.34, 0.02), '#6e5226', M4(-0.1, 0.35, 0.115)],
        [new THREE.BoxGeometry(0.035, 0.34, 0.02), '#6e5226', M4(0.1, 0.35, 0.115)],
        [new THREE.TorusGeometry(0.068, 0.026, 8, 18), '#d6b06a', M4(0, 0.585, 0, Math.PI / 2)],
      ] },
    });
    g.add(this.fig.root);
    this.body = this.fig.body;
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
    this.manualMoving = false;
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
