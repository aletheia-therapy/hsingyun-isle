import * as THREE from 'three';
import { heightAt } from './terrain.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { humanFigure, animateFigure } from './npc.js';

const SPEED = 3.6;      // 公尺／秒（沿路徑自動走時）
/** 輕快小跑步：全速時每一步 1.35 公尺；走得慢時步伐跟著變小。換腳的節奏依實際移動的距離計算，腳不會在地上滑 */
const STEP_MIN = 0.75, STEP_MAX = 1.35, GAIT_REF = 5.0;

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
    this.step = 0;           // 步伐相位（每走一步加 π）
    this.speedNow = 0;       // 這一幀實際移動的速度
    this.gait = 0;           // 0 = 站著，1 = 全速小跑
  }

  /**
   * 自由行走：朝 (dx, dz) 方向前進 dist 公尺，canWalk(x, z) 判斷能不能走。
   * 撞到障礙（橋的欄杆、溪岸、牆）時，會試著往左右偏一點，沿著障礙滑過去，不會卡住。
   */
  drive(dx, dz, dist, dt, canWalk) {
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) { this.manualMoving = false; return false; }
    dx /= len; dz /= len;
    const x0 = this.pos.x, z0 = this.pos.y;
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
    if (moved) {
      this.facing = dampAngle(this.facing, Math.atan2(mx, mz), 8, dt);          // 轉身平順一點，不會一碰就轉過去
      const d = Math.hypot(this.pos.x - x0, this.pos.y - z0);
      this.speedNow = d / Math.max(dt, 1e-4);
      this.step += d * Math.PI / (STEP_MIN + (STEP_MAX - STEP_MIN) * this.gait);
    }
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
    // 被樹冠或屋頂擋住時，仍然看得到人物的淡淡輪廓（只畫上半身，走在草地裡時腿不會發光）。
    // 先畫輪廓（只在被擋住的地方出現），再畫人物本身，所以人物自己的手臂不會在身上畫出輪廓。
    let own = null;
    const sil = new THREE.MeshBasicMaterial({ color: '#ffd77a', transparent: true, opacity: 0.62, depthWrite: false, depthFunc: THREE.GreaterDepth, fog: false });
    this.fig.root.traverse((o) => {
      if (!o.isMesh) return;
      if (!own) { own = o.material.clone(); own.transparent = true; }
      o.material = own; o.renderOrder = 10;
    });
    this.fig.torso.traverse((o) => {
      if (!o.isMesh || o.userData.sil) return;
      const s = new THREE.Mesh(o.geometry, sil); s.userData.sil = true; s.renderOrder = 9; s.castShadow = false; s.receiveShadow = false;
      o.add(s);
    });
    const blobGeo = new THREE.CircleGeometry(0.32, 20); blobGeo.rotateX(-Math.PI / 2);
    const blob = new THREE.Mesh(blobGeo, new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.24, depthWrite: false }));
    blob.position.y = 0.03;
    g.add(blob);
    // 腳下一圈淡金色的光環：遠遠看也找得到自己
    const ringGeo = new THREE.RingGeometry(0.46, 0.58, 40); ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#ffd98a', transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    ring.position.y = 0.04; ring.renderOrder = 2;
    g.add(ring);
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
    if (this.pauseT > 0) this.pauseT -= dt;
    const pathWalk = this.path.length && this.pauseT <= 0;
    const walking = pathWalk || this.manualMoving;
    if (pathWalk) this.step += SPEED * this.speedScale * dt * Math.PI / STEP_MIN;
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
    // 步伐大小、身體前傾隨速度平順變化（起步、停下都不會突然換姿勢）
    const want = walking ? Math.min(1, (this.manualMoving ? this.speedNow : SPEED) / GAIT_REF) : 0;
    this.gait += (want - this.gait) * (1 - Math.exp(-10 * dt));
    animateFigure(this.fig, { walking: walking && this.gait > 0.08, phase: this.step, amp: 0.6 + 0.75 * this.gait, t: this.clock });
    if (walking) this.fig.torso.rotation.x = 0.03 + 0.09 * this.gait;
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
