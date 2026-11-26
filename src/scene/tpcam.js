import * as THREE from 'three';

/**
 * 第三人稱鏡頭：跟在旅人身後，可拖曳旋轉、滾輪或雙指縮放、Q/E 轉向。
 * 走路時像被輕輕牽著一樣轉到人物背後，俯角 45 度：
 *   ・轉向有最高速度，而且會慢慢加速、慢慢停，不會甩頭
 *   ・轉身往回走（朝著鏡頭走）時不翻轉，鏡頭只是跟著後退
 *   ・畫面中心放在人物前方一點，看得到要去的地方
 *   ・手動轉過視角後，先停一下再跟上，不會和玩家搶鏡頭
 * overview 模式用於首頁：高空緩慢繞島。
 * offsetX：右側面板打開時，把畫面中心往左推，讓旅人不被擋住。
 */
export const FAR = 28;                 // 走路時的距離（公尺）
export const ZOOM_MAX = 34;            // 手動最遠可以拉到
export const TILT = Math.PI / 4;       // 45°
const LOOK_AHEAD = 2.4;                // 畫面中心放在人物前方幾公尺
const TURN_MAX = 0.6;                  // 自動轉向最快每秒幾弧度（約 34 度）
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class TPCamera {
  constructor(ground) {
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.25, 1500);
    this.ground = ground;
    this.yaw = 0.25; this.pitch = TILT; this.dist = FAR;
    this.yawT = this.yaw; this.pitchT = this.pitch; this.distT = this.dist;
    this.target = new THREE.Vector3();
    this.goal = new THREE.Vector3();
    this.ahead = new THREE.Vector2();
    this.overview = true;
    this.ovYaw = 0.3;
    this.offsetX = 0; this.offsetXT = 0;
    this.w = 1; this.h = 1;
    this.omega = 0;                    // 自動轉向目前的角速度
    this.moveT = 0;                    // 連續走了幾秒
    this.hold = 0;                     // 手動調整後，暫停自動跟隨的秒數
    this.manualN = 0;
    this.cinema = null; this.back = 0;
    this._f = new THREE.Vector2(); this._r = new THREE.Vector2(); this._ov = new THREE.Vector3(0, 0, -10);
  }

  orbit(dx, dy) { this.yawT -= dx * 0.005; this.pitchT = THREE.MathUtils.clamp(this.pitchT + dy * 0.0032, 0.08, 1.2); this.hold = 1.5; this.omega = 0; this.manualN++; }
  zoom(f) { this.distT = THREE.MathUtils.clamp(this.distT * f, 3.5, ZOOM_MAX); this.hold = 1.5; }
  turn(a) { this.yawT += a; this.hold = 1.5; this.omega = 0; this.manualN++; }
  follow(x, y, z) { this.goal.set(x, y + 1.5, z); }
  setOverview(on) { this.overview = on; }
  /**
   * 電影鏡頭（放煙火時）：從人物身後慢慢拉高、拉遠到看得見整座島，再緩緩繞島。
   * 結束時（on = false）慢慢回到人物背後。
   */
  setCinema(on, opt = {}) {
    if (on) {
      this.cinema = { yaw: this.yaw, pitch: opt.pitch ?? 0.36, dist: opt.dist ?? 95, center: opt.center.clone(), spin: opt.spin ?? 0.045 };
    } else if (this.cinema) {
      this.cinema = null;
      const f = opt.facing ?? this.yaw - Math.PI;
      this.yawT = this.yaw + wrap(f + Math.PI - this.yaw);
      this.pitchT = TILT; this.distT = FAR; this.hold = 0; this.omega = 0;
      this.back = 2.6;                                   // 接下來幾秒用較慢的速度回到身後
    }
  }
  /** 立刻站到旅人背後（剛上島時） */
  behind(facing) {
    this.yawT = this.yaw = facing + Math.PI; this.pitchT = this.pitch = TILT; this.distT = this.dist = FAR;
    this.hold = 0; this.omega = 0; this.ahead.set(0, 0); this.target.copy(this.goal);
  }
  /**
   * 每一幀呼叫。moving：玩家正在推方向走；facing：人物面向的角度。
   */
  autoFollow(facing, dt, moving) {
    if (this.hold > 0) this.hold -= dt;
    this.moveT = moving ? this.moveT + dt : 0;
    let want = 0;
    if (moving && this.hold <= 0 && this.moveT > 0.15) {
      const e = wrap(facing + Math.PI - this.yawT), a = Math.abs(e);
      // 往前走時鏡頭轉到身後；往旁邊走時只慢慢轉（不會一按左右就繞圈）；100～150 度之間逐漸不轉（往回走時不翻轉）
      const fall = a < 1.1 ? 1 : a < 1.75 ? 1 - 0.6 * (a - 1.1) / 0.65 : a > 2.6 ? 0 : 0.4 * (1 - (a - 1.75) / 0.85);
      if (a > 0.04) want = Math.sign(e) * Math.min(TURN_MAX, 1.3 * a) * fall;
      this.pitchT += (TILT - this.pitchT) * (1 - Math.exp(-1.2 * dt));
      this.distT += (FAR - this.distT) * (1 - Math.exp(-1.0 * dt));
    }
    this.omega += (want - this.omega) * (1 - Math.exp(-4 * dt));            // 轉向慢慢加速、慢慢停
    this.yawT += this.omega * dt;
    // 往前看：走路時畫面中心慢慢移到人物前方；停下來後慢慢回到人物身上
    const k = 1 - Math.exp(-(moving ? 1.6 : 0.7) * dt);
    this.ahead.x += ((moving ? Math.sin(facing) * LOOK_AHEAD : 0) - this.ahead.x) * k;
    this.ahead.y += ((moving ? Math.cos(facing) * LOOK_AHEAD : 0) - this.ahead.y) * k;
  }
  /** 地面上「往前」的方向（從鏡頭看出去）；回傳共用的向量，請立即使用 */
  forward(yaw = this.yaw) { return this._f.set(-Math.sin(yaw), -Math.cos(yaw)); }
  right(yaw = this.yaw) { return this._r.set(Math.cos(yaw), -Math.sin(yaw)); }

  update(dt, w, h) {
    this.w = w; this.h = h;
    const k = 1 - Math.exp(-8 * dt);
    let yaw, pitch, dist;
    if (this.overview) {
      this.ovYaw += dt * 0.035;
      this.target.lerp(this._ov, 1 - Math.exp(-1.5 * dt));
      yaw = this.ovYaw; pitch = 0.62; dist = 150;
      this.yaw = yaw;
    } else if (this.cinema) {
      const c = this.cinema, kk = 1 - Math.exp(-0.75 * dt);
      c.yaw += dt * c.spin;
      this.yaw += (c.yaw - this.yaw) * kk;
      this.pitch += (c.pitch - this.pitch) * kk;
      this.dist += (c.dist - this.dist) * kk;
      this.target.lerp(c.center, kk);
      this.yawT = this.yaw; this.pitchT = this.pitch; this.distT = this.dist;
      yaw = this.yaw; pitch = this.pitch; dist = this.dist;
    } else {
      const slow = this.back > 0;
      if (slow) this.back -= dt;
      const ka = slow ? 1 - Math.exp(-1.6 * dt) : null;
      this.yaw += (this.yawT - this.yaw) * (ka ?? (1 - Math.exp(-10 * dt)));
      this.pitch += (this.pitchT - this.pitch) * (ka ?? k);
      this.dist += (this.distT - this.dist) * (ka ?? k);
      // 水平方向跟得緊，高度跟得慢：走過起伏的地形時畫面不會上下晃
      const kx = slow ? ka : 1 - Math.exp(-7 * dt), ky = slow ? ka : 1 - Math.exp(-3 * dt);
      this.target.x += (this.goal.x + this.ahead.x - this.target.x) * kx;
      this.target.z += (this.goal.z + this.ahead.y - this.target.z) * kx;
      this.target.y += (this.goal.y - this.target.y) * ky;
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
