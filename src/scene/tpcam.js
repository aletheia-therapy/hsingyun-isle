import * as THREE from 'three';

/**
 * 第三人稱鏡頭：跟在旅人身後，可拖曳旋轉、滾輪或雙指縮放、Q/E 轉向。
 * 走路時自動轉到旅人背後、拉到最遠、從約 60 度往下俯視（autoFollow）。
 * 手動轉過視角後，會先停一下再自動跟上，不會和玩家搶鏡頭。
 * overview 模式用於首頁：高空緩慢繞島。
 * offsetX：右側面板打開時，把畫面中心往左推，讓旅人不被擋住。
 */
export const FAR = 34;
export const TILT = Math.PI / 3;          // 60°
export class TPCamera {
  constructor(ground) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 1500);
    this.ground = ground;
    this.yaw = 0.25; this.pitch = TILT; this.dist = FAR;
    this.yawT = this.yaw; this.pitchT = this.pitch; this.distT = this.dist;
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.overview = true;
    this.ovYaw = 0.3;
    this.offsetX = 0; this.offsetXT = 0;
    this.w = 1; this.h = 1;
    this.hold = 0;                         // 手動調整後，暫停自動跟隨的秒數
    this.manualN = 0;                      // 手動轉過幾次視角（搖桿的參考方向要跟著更新）
  }

  orbit(dx, dy) { this.yawT -= dx * 0.0065; this.pitchT = THREE.MathUtils.clamp(this.pitchT + dy * 0.004, 0.08, 1.2); this.hold = 1.5; this.manualN++; }
  zoom(f) { this.distT = THREE.MathUtils.clamp(this.distT * f, 3.5, FAR); this.hold = 1.5; }
  turn(a) { this.yawT += a; this.hold = 1.5; this.manualN++; }
  follow(x, y, z) { this.goal.set(x, y + 1.5, z); }
  setOverview(on) { this.overview = on; }
  /** 立刻站到旅人背後的最遠視角（剛上島時） */
  behind(facing) { this.yawT = this.yaw = facing + Math.PI; this.pitchT = this.pitch = TILT; this.distT = this.dist = FAR; this.hold = 0; }
  /**
   * 走路時：鏡頭慢慢轉到旅人背後（facing 的反方向）、拉到最遠、俯角約 60 度。
   * 轉向用最短的方向，速度隨角度差變化，大轉彎時也不會甩頭。
   */
  autoFollow(facing, dt, moving) {
    if (this.hold > 0) { this.hold -= dt; return; }
    if (!moving) return;
    let d = facing + Math.PI - this.yawT;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yawT += d * (1 - Math.exp(-1.6 * dt));
    this.distT += (FAR - this.distT) * (1 - Math.exp(-1.4 * dt));
    this.pitchT += (TILT - this.pitchT) * (1 - Math.exp(-1.4 * dt));
  }
  /** 地面上「往前」的方向（從鏡頭看出去） */
  forward(yaw = this.yaw) { return new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw)); }
  right(yaw = this.yaw) { return new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)); }

  update(dt, w, h) {
    this.w = w; this.h = h;
    const k = 1 - Math.exp(-8 * dt), kt = 1 - Math.exp(-6 * dt);
    let yaw, pitch, dist;
    if (this.overview) {
      this.ovYaw += dt * 0.035;
      this.target.lerp(new THREE.Vector3(0, 0, -10), 1 - Math.exp(-1.5 * dt));
      yaw = this.ovYaw; pitch = 0.62; dist = 150;
      this.yaw = yaw;
    } else {
      this.yaw += (this.yawT - this.yaw) * k;
      this.pitch += (this.pitchT - this.pitch) * k;
      this.dist += (this.distT - this.dist) * k;
      this.target.lerp(this.goal, kt);
      yaw = this.yaw; pitch = this.pitch; dist = this.dist;
    }
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(yaw) * Math.cos(pitch) * dist,
      this.target.y + Math.sin(pitch) * dist,
      this.target.z + Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    // 鏡頭不鑽進地面
    const gy = this.ground(cam.position.x, cam.position.z) + 0.8;
    if (cam.position.y < gy) cam.position.y = gy;
    cam.lookAt(this.target);
    cam.aspect = w / h;
    this.offsetX += (this.offsetXT - this.offsetX) * k;
    if (Math.abs(this.offsetX) > 0.5) cam.setViewOffset(w, h, this.offsetX, 0, w, h); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }
}
