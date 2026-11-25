import * as THREE from 'three';

/**
 * 第三人稱鏡頭：跟在旅人身後，可拖曳旋轉、滾輪或雙指縮放、Q/E 轉向。
 * overview 模式用於首頁：高空緩慢繞島。
 * offsetX：右側面板打開時，把畫面中心往左推，讓旅人不被擋住。
 */
export class TPCamera {
  constructor(ground) {
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1800);
    this.ground = ground;
    this.yaw = 0.25; this.pitch = 0.36; this.dist = 9;
    this.yawT = this.yaw; this.pitchT = this.pitch; this.distT = this.dist;
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.overview = true;
    this.ovYaw = 0.3;
    this.offsetX = 0; this.offsetXT = 0;
    this.w = 1; this.h = 1;
  }

  orbit(dx, dy) { this.yawT -= dx * 0.0065; this.pitchT = THREE.MathUtils.clamp(this.pitchT + dy * 0.004, 0.08, 1.2); }
  zoom(f) { this.distT = THREE.MathUtils.clamp(this.distT * f, 3.5, 34); }
  turn(a) { this.yawT += a; }
  follow(x, y, z) { this.goal.set(x, y + 1.5, z); }
  setOverview(on) { this.overview = on; }
  /** 地面上「往前」的方向（從鏡頭看出去） */
  forward() { return new THREE.Vector2(-Math.sin(this.yaw), -Math.cos(this.yaw)); }
  right() { return new THREE.Vector2(Math.cos(this.yaw), -Math.sin(this.yaw)); }

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
