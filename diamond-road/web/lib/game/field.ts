import * as THREE from "three";
import {
  BaseballEngine,
  BASES,
  BASE_PATH_LENGTH,
  SWING_SWEET,
  WALL_DISTANCE,
  WALL_HEIGHT,
  DEFENSE,
  pitchData,
  playerLabel,
  formOf,
  V,
  batReach,
  clamp,
  lerp,
  runnerPose,
  playerYaw,
  RULES,
  type RunnerTrack,
  type Vec,
} from "./engine";
import * as tex from "./textures";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Avatar, CLIP_KEYS, loadAvatarAssets, type AvatarAssets, type ClipName } from "./avatars";
import { HitboxView } from "./hitbox-view";
import { touchDistance } from "./hitbox";
/** White "[별호] 이름" text for a fielder's head: no box, a dark outline keeps it readable. */
function nameTag(label: string) {
  const c = document.createElement("canvas"),
    g = c.getContext("2d")!,
    // Drawn at double size so the text stays sharp when the tag is shown large.
    font = '800 60px "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    h = 84;
  g.font = font;
  c.width = Math.ceil(g.measureText(label).width + 28);
  c.height = h;
  g.font = font;
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.lineJoin = "round";
  g.lineWidth = 10;
  g.strokeStyle = "rgba(8, 14, 18, 0.9)";
  g.strokeText(label, c.width / 2, h / 2 + 2);
  g.fillStyle = "#ffffff";
  g.fillText(label, c.width / 2, h / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/**
 * Smooth path through timed keyframes (Catmull-Rom): unlike easing each segment separately,
 * the motion never stops at a keyframe, so hands and bat keep flowing.
 */
function spline(keys: [number, Vec][], t: number): Vec {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let k = 0;
  while (k < n - 2 && t > keys[k + 1][0]) k++;
  const p0 = keys[Math.max(0, k - 1)][1],
    p1 = keys[k][1],
    p2 = keys[k + 1][1],
    p3 = keys[Math.min(n - 1, k + 2)][1],
    u = (t - keys[k][0]) / (keys[k + 1][0] - keys[k][0] || 1),
    c = (a: number, b: number, d: number, e: number) =>
      0.5 *
      (2 * b +
        (d - a) * u +
        (2 * a - 5 * b + 4 * d - e) * u * u +
        (3 * b - a - 3 * d + e) * u * u * u);
  return V(c(p0.x, p1.x, p2.x, p3.x), c(p0.y, p1.y, p2.y, p3.y), c(p0.z, p1.z, p2.z, p3.z));
}
/** Same for one number (joint angles). */
const curve = (keys: [number, number][], t: number) =>
  spline(
    keys.map(([k, v]) => [k, V(v, 0, 0)]),
    t,
  ).x;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** Batter's swing: seconds from the start to the follow-through, and how long it is held. */
const SWING_TIME = 0.42;
/** Highlight replay: slow-motion speed and the window around the catch (s of play time). */
/** Batter keeps swinging this long into the play before the runner takes over (s). */
const BAT_FOLLOW = 0.34;
/** Drawn ball radius: enlarged to read on screen (the real ball, 0.0365 m, is what the
 * strike call uses). */
const BALL_DRAWN = 0.082;
const REPLAY_SLOW = 0.4,
  REPLAY_BEFORE = 1.3,
  REPLAY_AFTER = 1.1;
type ReplayActor = {
  x: number;
  z: number;
  yaw: number;
  clip: ClipName | null;
  time: number;
  on: boolean;
};
/** One recorded frame: every fielder (f0..f8) and runner (r0..r3), and the ball. */
type ReplayFrame = {
  t: number;
  chaser: number;
  actors: Map<string, ReplayActor>;
  ball: THREE.Vector3;
  ballOn: boolean;
};
const SWING_HOLD = 0.45;
/** Trail colour of the fastest pitches. */
const HOT = new THREE.Color("#fff1c9");

type Figure = {
  root: THREE.Group;
  /** Shoulder joints (upper arm hangs along local −Y) and elbow joints (bend about local X). */
  left: THREE.Group;
  right: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Knee joints: negative rotation.x folds the shin back. */
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  bat?: THREE.Mesh;
  /** Jersey texture, flipped back when the model is mirrored so the number still reads. */
  jersey: THREE.Texture;
};
export class BaseballField {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 900);
  private players: Figure[] = [];
  /** Name tag above each fielder (DEFENSE order) and the text it currently shows. */
  private tags: { sprite: THREE.Sprite; text: string }[] = [];
  private batter: Figure;
  private runners: Figure[] = [];
  private ball: THREE.Mesh;
  private halo: THREE.Mesh;
  private target: THREE.Group;
  private hint: THREE.Group;
  private zone: THREE.Group;
  private trail: THREE.Line;
  /** 180 km/h and up: a blue fire around the ball and a comet tail of glows behind it. */
  private fire: THREE.Mesh[] = [];
  /** Limit break: an electric gold aura around our player and a ring on the ground. */
  private aura: THREE.Mesh | null = null;
  private auraRing: THREE.Mesh | null = null;
  private trailPositions: THREE.Vector3[] = [];
  private landing: THREE.Mesh;
  private time = 0;
  /** Mixamo players (null until the models load, or if they fail: the drawn figures stay). */
  private avatars: Map<Figure, Avatar> | null = null;
  private runnerMoving: boolean[] = [false, false, false, false];
  private runnerSlide: number[] = [-1, -1, -1, -1];
  /** Render time each runner's slide began (-1 = not sliding). */
  private slideStart: number[] = [-1, -1, -1, -1];
  /** Hit by pitch: the reaction plays at the plate while the call is on screen. */
  private hbpSeen = 0;
  private hbpAt = -9;
  /** This slide is a tag dodge (trip into the bag, then the dive clip's get-up). */
  private slideDodge: boolean[] = [false, false, false, false];
  /** Each runner's live track this frame (turns, falls), or null. */
  private runnerTracks: (RunnerTrack | null)[] = [null, null, null, null];
  private lastAvatarPos = new Map<Figure, THREE.Vector3>();
  /** Developer hitbox view and the hit-by-pitch marker. */
  private hitboxes: HitboxView;
  private diveSide = new Map<Figure, "diving_l" | "diving_r">();
  /** Last few seconds of the chasing fielder (for the highlight replay). */
  private tape: ReplayFrame[] = [];
  private tapeLive: object | null = null;
  private replaySrc: object | null = null;
  private replayPending: {
    r: NonNullable<BaseballEngine["state"]["replay"]>;
    play: object | null;
  }[] = [];
  private replayQueue: NonNullable<BaseballField["replay"]>[] = [];
  private replay: {
    play: object | null;
    text: string;
    frames: ReplayFrame[];
    startedAt: number;
    at: number;
    /** Who is shown: actor key -> team/glove. */
    cast: { key: string; team: "home" | "away"; glove: boolean; lefty: boolean }[];
    base?: { base: number; out: boolean };
    tvState: string;
  } | null = null;
  private replayAvatars: Avatar[] = [];
  private batSwing: { flight: object; press: number; contactAt: number; from: number } | null =
    null;
  private replayBall: THREE.Mesh | null = null;
  private replayCam = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 500);
  /** Real time for the replay window, so fast-forward does not rush the slow motion. */
  private replayClock = 0;
  private tv: {
    scene: THREE.Scene;
    cam: THREE.OrthographicCamera;
    canvas: HTMLCanvasElement;
    tex: THREE.CanvasTexture;
  } | null = null;
  /** Weather: lights and sky to dim, rain streaks, and wet-ground material settings. */
  private skyDome!: THREE.Mesh;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private weatherShown: "clear" | "rain" = "clear";
  private rain: THREE.LineSegments | null = null;
  private dry = new Map<THREE.MeshStandardMaterial, { roughness: number; color: THREE.Color }>();
  /** Swing animation clock (render time), so a missed swing still plays to the end. */
  private swingFlight: object | null = null;
  private swingStart = -10;
  private lastHand = 1;
  /** Last shown joint rotations of the pitcher and batter, for smoothing pose changes. */
  private poseMemory = new WeakMap<THREE.Object3D, THREE.Quaternion>();
  private resize: ResizeObserver;
  private lastPhase = "";
  private disposed = false;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  private cameraKey = "";
  /** Light mode (AI training ground): no crowd, no shadows, plain pixel ratio. */
  private lite: boolean;
  constructor(
    private host: HTMLElement,
    private engine: BaseballEngine,
    opts: { lite?: boolean } = {},
  ) {
    this.lite = !!opts.lite;
    this.hitboxes = new HitboxView(this.scene, engine);
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.lite,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(this.lite ? 1 : Math.min(window.devicePixelRatio, 1.7));
    this.renderer.shadowMap.enabled = !this.lite;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "3D 야구장. 마우스로 조준하고 클릭해 투구 또는 스윙",
    );
    this.renderer.domElement.style.touchAction = "none";
    host.appendChild(this.renderer.domElement);
    // Late-afternoon game: a sky dome that fades to a warm haze, soft sky fill from above, bounce
    // light from the grass and a low warm sun that throws long shadows across the infield.
    this.scene.background = new THREE.Color("#c9d6dc");
    this.scene.fog = new THREE.Fog("#d4d9d4", 170, 520);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(600, 32, 16),
      new THREE.MeshBasicMaterial({
        map: tex.skyTexture(),
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      }),
    );
    sky.position.set(0, -40, 40);
    this.scene.add(sky);
    this.skyDome = sky;
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x4f6b3a, 1.15);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffe2bf, 3.4);
    this.sun = sun;
    sun.position.set(-48, 46, -30);
    sun.target.position.set(0, 0, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 75;
    sun.shadow.camera.bottom = -45;
    sun.shadow.normalBias = 0.03;
    sun.shadow.bias = -0.0004;
    sun.shadow.camera.far = 220;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    // Soft fill from the opposite side so shadowed faces keep some detail.
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.55);
    fill.position.set(40, 30, 60);
    this.scene.add(fill);
    this.makePark();
    DEFENSE.forEach((p, i) => {
      const fig = this.figure(i === 1 ? "#233f58" : "#eeeade", i === 1 ? "#233f58" : "#294b62");
      fig.root.position.set(p.x, 0, p.z);
      fig.root.rotation.y = Math.PI;
      this.scene.add(fig.root);
      this.players.push(fig);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ transparent: true, depthTest: false, sizeAttenuation: false }),
      );
      sprite.position.set(0, 2.2, 0);
      sprite.renderOrder = 10;
      sprite.visible = false;
      fig.root.add(sprite);
      this.tags.push({ sprite, text: "" });
    });
    this.batter = this.figure("#c06645", "#26353e", true);
    this.scene.add(this.batter.root);
    for (let i = 0; i < 4; i++) {
      const runner = this.figure("#c06645", "#26353e", false, false);
      this.scene.add(runner.root);
      this.runners.push(runner);
    }
    // Leather ball with red stitches; a faint glow keeps it readable against the crowd.
    this.ball = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_DRAWN, 24, 16),
      new THREE.MeshStandardMaterial({
        map: tex.ballTexture(),
        roughness: 0.45,
        emissive: "#8f8668",
        emissiveIntensity: 0.35,
      }),
    );
    this.ball.castShadow = true;
    this.scene.add(this.ball);
    this.halo = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.16, 28),
      new THREE.MeshBasicMaterial({
        color: "#fff0a9",
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthTest: false,
      }),
    );
    this.scene.add(this.halo);
    this.zone = new THREE.Group();
    this.line(
      [
        V(-0.215, 0.55, 0.02),
        V(0.215, 0.55, 0.02),
        V(0.215, 1.35, 0.02),
        V(-0.215, 1.35, 0.02),
        V(-0.215, 0.55, 0.02),
      ],
      "#f0e9c8",
      this.zone,
      0.65,
    );
    for (let i = 1; i < 3; i++) {
      this.line(
        [V(-0.215, 0.55 + (i * 0.8) / 3, 0.02), V(0.215, 0.55 + (i * 0.8) / 3, 0.02)],
        "#e1e4d0",
        this.zone,
        0.18,
      );
      this.line(
        [V(-0.215 + (i * 0.43) / 3, 0.55, 0.02), V(-0.215 + (i * 0.43) / 3, 1.35, 0.02)],
        "#e1e4d0",
        this.zone,
        0.18,
      );
    }
    this.scene.add(this.zone);
    this.target = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.085, 0.096, 32),
      new THREE.MeshBasicMaterial({ color: "#f0be60", side: THREE.DoubleSide, depthTest: false }),
    );
    this.target.add(ring);
    this.line([V(-0.14, 0, 0), V(0.14, 0, 0)], "#f0be60", this.target);
    this.line([V(0, -0.14, 0), V(0, 0.14, 0)], "#f0be60", this.target);
    this.scene.add(this.target);
    // Batting: faint disc where the pitch will cross the plate (radius 1, scaled per pitch).
    this.hint = new THREE.Group();
    // A soft glow rather than a hard ring: the batter only has a rough read of the pitch.
    const glow = document.createElement("canvas");
    glow.width = glow.height = 128;
    const g = glow.getContext("2d")!,
      grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(255,248,223,0.42)");
    grad.addColorStop(0.6, "rgba(255,248,223,0.2)");
    grad.addColorStop(1, "rgba(255,248,223,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const glowMap = new THREE.CanvasTexture(glow);
    glowMap.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 2.3),
      new THREE.MeshBasicMaterial({
        map: glowMap,
        transparent: true,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    disc.renderOrder = 2;
    this.hint.add(disc);
    this.scene.add(this.hint);
    this.trail = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: "#ffe3a1", transparent: true, opacity: 0.8 }),
    );
    this.scene.add(this.trail);
    this.buildEffects();
    // Real player models: load in the background; the drawn figures play until they are in.
    loadAvatarAssets()
      .then((assets) => {
        if (!this.disposed) this.setupAvatars(assets);
      })
      .catch(() => {
        /* keep the drawn figures */
      });
    this.landing = new THREE.Mesh(
      new THREE.RingGeometry(1.8, 2, 40),
      new THREE.MeshBasicMaterial({ color: "#f8c267", side: THREE.DoubleSide }),
    );
    this.landing.rotation.x = -Math.PI / 2;
    this.scene.add(this.landing);
    this.resize = new ResizeObserver(() => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    });
    this.resize.observe(host);
    this.renderer.domElement.addEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDown);
    this.update(0);
    // Development only: lets browser tests read draw-call counts. Stripped from builds.
    if (import.meta.env.DEV) (window as unknown as { __field?: BaseballField }).__field = this;
  }
  /** Draw calls and triangles of the last frame (performance check). */
  get stats() {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }
  private material(color: string) {
    if (!this.materials.has(color))
      this.materials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.83 }));
    return this.materials.get(color)!;
  }
  private mesh(
    geo: THREE.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = this.scene,
  ) {
    const m = new THREE.Mesh(geo, this.material(color));
    m.position.set(x, y, z);
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  private box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    parent: THREE.Object3D = this.scene,
  ) {
    return this.mesh(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
  }
  private disk(x: number, z: number, r: number, color: string, y = 0.015) {
    const m = this.mesh(new THREE.CircleGeometry(r, 80), color, x, y, z);
    m.rotation.x = -Math.PI / 2;
    return m;
  }
  private line(points: Vec[], color: string, parent: THREE.Object3D = this.scene, opacity = 1) {
    const geo = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      ),
      line = new THREE.Line(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }),
      );
    parent.add(line);
    return line;
  }
  private label(
    text: string,
    color: string,
    bg: string,
    w: number,
    h: number,
    x: number,
    y: number,
    z: number,
    rotation = Math.PI,
  ) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 88px Arial";
    ctx.fillText(text, 512, 136, 980);
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    m.position.set(x, y, z);
    m.rotation.y = rotation;
    this.scene.add(m);
  }
  /** A flat mesh lying on the ground from a 2D outline given in world (x, z) metres. */
  private ground(outline: Vec[], material: THREE.Material, y: number, holes: Vec[][] = []) {
    // Shape coordinates are (x, -z) so that rotating −90° about X lays them on the field.
    const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, -p.z)));
    shape.holes = holes.map((h) => new THREE.Path(h.map((p) => new THREE.Vector2(p.x, -p.z))));
    const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 64), material);
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }
  /** A chalk stripe of real width between two ground points. */
  private chalk(a: Vec, b: Vec, width = 0.1) {
    const len = Math.hypot(b.x - a.x, b.z - a.z),
      m = new THREE.Mesh(new THREE.PlaneGeometry(width, len), this.chalkMaterial);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = -Math.atan2(b.x - a.x, b.z - a.z);
    m.position.set((a.x + b.x) / 2, 0.045, (a.z + b.z) / 2);
    m.receiveShadow = true;
    this.scene.add(m);
  }
  private chalkMaterial = new THREE.MeshStandardMaterial({
    color: "#f4f1e6",
    roughness: 0.95,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  /** Clay material whose UVs are metres (ShapeGeometry) — `tile` metres per texture repeat. */
  private clay(tile = 5) {
    const map = tex.dirtColor(),
      bump = tex.dirtDetail();
    map.repeat.set(1 / tile, 1 / tile);
    bump.repeat.set(1 / 1.2, 1 / 1.2);
    return new THREE.MeshStandardMaterial({
      map,
      bumpMap: bump,
      bumpScale: 0.6,
      roughness: 0.97,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
  }
  /** Stand fronts: home bowl radius, foul-line stands' distance from the line, outfield radius. */
  private static readonly HOME_STAND = 26;
  private static readonly HOME_END = Math.PI / 4 + 0.35;
  private static readonly LINE_STAND = 9;
  private static readonly OUTFIELD_STAND = 112;
  private static readonly OUTFIELD_END = Math.PI / 4 + 0.09;
  /** Where the foul-line stands begin (metres from home along the line) — the bowl's end. */
  private static lineStart() {
    const f = BaseballField,
      x = Math.sin(f.HOME_END) * f.HOME_STAND,
      z = Math.cos(f.HOME_END) * f.HOME_STAND;
    return (x + z) * Math.SQRT1_2;
  }
  /** Point at `along` metres down a foul line (side +1 = third, −1 = first), `out` m outside it. */
  private static linePoint(side: number, along: number, out: number) {
    const r2 = Math.SQRT1_2;
    return V(side * r2 * (along + out), 0, r2 * (along - out));
  }
  /** Inside edge of all the stands: the grass reaches up to here. */
  private fieldOutline() {
    const f = BaseballField,
      pts: Vec[] = [],
      start = f.lineStart();
    for (let i = 0; i <= 8; i++)
      pts.push(f.linePoint(1, start + (i / 8) * (f.OUTFIELD_STAND - start), f.LINE_STAND));
    for (let i = 0; i <= 64; i++) {
      const a = f.OUTFIELD_END - (i / 64) * f.OUTFIELD_END * 2;
      pts.push(V(Math.sin(a) * f.OUTFIELD_STAND, 0, Math.cos(a) * f.OUTFIELD_STAND));
    }
    for (let i = 8; i >= 0; i--)
      pts.push(f.linePoint(-1, start + (i / 8) * (f.OUTFIELD_STAND - start), f.LINE_STAND));
    for (let i = 0; i <= 48; i++) {
      const a = 2 * Math.PI - f.HOME_END - (i / 48) * (2 * Math.PI - 2 * f.HOME_END);
      pts.push(V(Math.sin(a) * f.HOME_STAND, 0, Math.cos(a) * f.HOME_STAND));
    }
    return pts;
  }
  private makePark() {
    // Turf: one 320 m plane with the mowing pattern, plus a fine blade bump that tiles every 2 m.
    // Outside the stands: concrete concourse and parking, so no grass shows past the stadium.
    const outside = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.MeshStandardMaterial({ color: "#7a7f7c", roughness: 0.95 }),
    );
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(0, -0.05, 40);
    outside.receiveShadow = true;
    this.scene.add(outside);
    // Turf: the playing field inside the stand fronts, with the mowing pattern (one texture over
    // 320 m) and a fine blade bump tiling every 2 m. ShapeGeometry UVs are metres.
    const turfMap = tex.turf(),
      blades = tex.grassDetail();
    turfMap.repeat.set(1 / 320, 1 / 320);
    turfMap.offset.set(0.5, 0.625);
    blades.repeat.set(0.5, 0.5);
    this.ground(
      this.fieldOutline(),
      new THREE.MeshStandardMaterial({
        map: turfMap,
        bumpMap: blades,
        bumpScale: 0.9,
        roughness: 0.92,
      }),
      0,
    );
    const clay = this.clay();
    // Infield skin: out along the foul lines to the 29 m arc around the mound, with the grass
    // infield square cut out of it (its edges sit 1.2 m inside the base lines).
    const r2 = Math.SQRT1_2,
      arcR = 29,
      mound = V(0, 0, 18.44),
      lineT = 38.94,
      skin: Vec[] = [V(0, 0, -1.2), V(-lineT * r2 - 1.1, 0, lineT * r2 - 0.3)];
    const end = Math.atan2(lineT * r2, lineT * r2 - mound.z);
    for (let i = 0; i <= 48; i++) {
      const a = -end + (i / 48) * end * 2;
      skin.push(V(Math.sin(a) * arcR, 0, mound.z + Math.cos(a) * arcR));
    }
    skin.push(V(lineT * r2 + 1.1, 0, lineT * r2 - 0.3));
    const half = 19.4 - 1.7,
      infieldGrass = [
        V(0, 0, 19.4 - half),
        V(half, 0, 19.4),
        V(0, 0, 19.4 + half),
        V(-half, 0, 19.4),
      ];
    this.ground(skin, clay, 0.02, [infieldGrass]);
    // Dirt circles: home plate area, the base cut-outs and the mound.
    const circle = (cx: number, cz: number, r: number, y: number, m: THREE.Material) => {
      const pts: Vec[] = [];
      for (let i = 0; i < 48; i++) {
        const a = (i / 48) * Math.PI * 2;
        pts.push(V(cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r));
      }
      return this.ground(pts, m, y);
    };
    circle(0, 0, 4.0, 0.024, clay);
    for (const b of BASES.slice(0, 3)) circle(b.x, b.z, 2.4, 0.024, clay);
    circle(0, 18.44, 2.74, 0.026, clay);
    // Warning track in front of the wall.
    const track: Vec[] = [];
    for (let i = 0; i <= 64; i++) {
      const a = -Math.PI / 4 - 0.06 + (i / 64) * (Math.PI / 2 + 0.12);
      track.push(V(Math.sin(a) * 107.6, 0, Math.cos(a) * 107.6));
    }
    for (let i = 64; i >= 0; i--) {
      const a = -Math.PI / 4 - 0.06 + (i / 64) * (Math.PI / 2 + 0.12);
      track.push(V(Math.sin(a) * 102.5, 0, Math.cos(a) * 102.5));
    }
    this.ground(track, this.clay(6), 0.02);
    // Mound: a low clay hill with the rubber on top.
    const moundMap = tex.dirtColor();
    moundMap.repeat.set(3, 1);
    const hill = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 2.74, 0.26, 48, 1),
      new THREE.MeshStandardMaterial({ map: moundMap, roughness: 0.97 }),
    );
    hill.position.set(0, 0.15, 18.44);
    hill.receiveShadow = true;
    this.scene.add(hill);
    this.box(0, 0.29, 18.6, 0.61, 0.03, 0.15, "#f4efe2");
    // Bases: thick, cushioned canvas bags (rounded edges) on a dark rubber anchor plate.
    const bagMaterial = new THREE.MeshStandardMaterial({ color: "#f5f1e8", roughness: 0.75 }),
      anchorMaterial = new THREE.MeshStandardMaterial({ color: "#3a3a36", roughness: 0.9 }),
      bagGeometry = new RoundedBoxGeometry(0.42, 0.14, 0.42, 3, 0.035);
    BASES.slice(0, 3).forEach((p) => {
      const bag = new THREE.Mesh(bagGeometry, bagMaterial);
      bag.position.set(p.x, 0.085, p.z);
      bag.rotation.y = Math.PI / 4;
      bag.castShadow = bag.receiveShadow = true;
      const anchor = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.46), anchorMaterial);
      anchor.position.set(p.x, 0.012, p.z);
      anchor.rotation.y = Math.PI / 4;
      this.scene.add(anchor, bag);
    });
    // Home plate: white pentagon on a thin black rubber edge.
    const plateOutline = (k: number) => [
      V(-0.215 * k, 0, 0.22 * k),
      V(0.215 * k, 0, 0.22 * k),
      V(0.215 * k, 0, 0),
      V(0, 0, -0.24 * k),
      V(-0.215 * k, 0, 0),
    ];
    this.ground(plateOutline(1.08), new THREE.MeshStandardMaterial({ color: "#2b2b28" }), 0.05);
    this.ground(
      plateOutline(1),
      new THREE.MeshStandardMaterial({ color: "#fbf9f2", roughness: 0.6 }),
      0.055,
    );
    // Chalk: foul lines to the poles, batter's boxes and the catcher's box.
    this.chalk(V(-0.3, 0, 0.3), V(-106 * r2, 0, 106 * r2), 0.1);
    this.chalk(V(0.3, 0, 0.3), V(106 * r2, 0, 106 * r2), 0.1);
    // Batter's boxes: 1.22 × 1.83 m, 15 cm off the plate.
    for (const x of [-0.98, 0.98]) {
      const x0 = x - 0.61,
        x1 = x + 0.61,
        z0 = -0.92,
        z1 = 0.92;
      this.chalk(V(x0, 0, z0), V(x1, 0, z0), 0.08);
      this.chalk(V(x1, 0, z0), V(x1, 0, z1), 0.08);
      this.chalk(V(x1, 0, z1), V(x0, 0, z1), 0.08);
      this.chalk(V(x0, 0, z1), V(x0, 0, z0), 0.08);
    }
    this.chalk(V(-0.65, 0, -0.9), V(-0.65, 0, -3.0), 0.08);
    this.chalk(V(0.65, 0, -0.9), V(0.65, 0, -3.0), 0.08);
    this.chalk(V(-0.65, 0, -3.0), V(0.65, 0, -3.0), 0.08);
    this.makeStadium();
  }
  /** Walls, seating bowl, bleachers, crowd, scoreboard and light towers. */
  private makeStadium() {
    const r2 = Math.SQRT1_2;
    // Outfield wall: one continuous padded curve with a yellow home-run line on top.
    const fairStart = -Math.PI / 4 - 0.06,
      fairLength = Math.PI / 2 + 0.12,
      pad = tex.wallPadding();
    pad.repeat.set(70, 1);
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        WALL_DISTANCE,
        WALL_DISTANCE,
        WALL_HEIGHT,
        128,
        1,
        true,
        fairStart,
        fairLength,
      ),
      new THREE.MeshStandardMaterial({ map: pad, roughness: 0.75, side: THREE.DoubleSide }),
    );
    wall.position.y = WALL_HEIGHT / 2;
    wall.receiveShadow = true;
    this.scene.add(wall);
    const lineTop = new THREE.Mesh(
      new THREE.CylinderGeometry(
        WALL_DISTANCE + 0.05,
        WALL_DISTANCE + 0.05,
        0.14,
        128,
        1,
        true,
        fairStart,
        fairLength,
      ),
      new THREE.MeshStandardMaterial({ color: "#f0c43c", roughness: 0.5, side: THREE.DoubleSide }),
    );
    lineTop.position.y = WALL_HEIGHT + 0.05;
    this.scene.add(lineTop);
    for (const side of [-1, 1]) {
      const pole = this.mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 16, 10),
        "#f0c74b",
        side * 107 * r2,
        8,
        107 * r2,
      );
      pole.castShadow = true;
    }
    // Seating bowl around home plate, from the left-field line round to the right-field line:
    // a stepped profile turned on a lathe, so every row is a real curved step.
    const concrete = new THREE.MeshStandardMaterial({
      color: "#7d8a8c",
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const bowl = (
      inner: number,
      rows: number,
      base: number,
      phiStart: number,
      phiLength: number,
    ) => {
      const profile: THREE.Vector2[] = [
        new THREE.Vector2(inner, 0),
        new THREE.Vector2(inner, base),
      ];
      for (let k = 0; k < rows; k++) {
        const r = inner + k * 1.25,
          y = base + k * 0.62;
        profile.push(new THREE.Vector2(r + 1.25, y), new THREE.Vector2(r + 1.25, y + 0.62));
      }
      const top = profile[profile.length - 1];
      profile.push(new THREE.Vector2(top.x + 0.6, top.y + 2.2), new THREE.Vector2(top.x + 0.6, 0));
      const m = new THREE.Mesh(new THREE.LatheGeometry(profile, 96, phiStart, phiLength), concrete);
      m.receiveShadow = true;
      m.castShadow = true;
      this.scene.add(m);
      // Padded front wall (the backstop behind home is part of it).
      const front = new THREE.Mesh(
        new THREE.CylinderGeometry(
          inner - 0.05,
          inner - 0.05,
          base,
          96,
          1,
          true,
          phiStart,
          phiLength,
        ),
        new THREE.MeshStandardMaterial({
          color: "#1f4038",
          roughness: 0.7,
          side: THREE.DoubleSide,
        }),
      );
      front.position.y = base / 2;
      this.scene.add(front);
      return { inner, rows, base, phiStart, phiLength };
    };
    const F = BaseballField;
    const seats = [
      // From the third-base side (φ just past π/4), round behind home (φ = π), to first base.
      bowl(F.HOME_STAND, 18, 1.4, F.HOME_END, 2 * Math.PI - 2 * F.HOME_END),
      bowl(F.OUTFIELD_STAND, 12, 3.6, -F.OUTFIELD_END, F.OUTFIELD_END * 2),
    ];
    // Foul-line stands: the same stepped profile run straight along each line, joining the
    // home bowl to the outfield stands so the bowl is closed all the way round.
    const lineRows = 16,
      lineBase = 1.4,
      lineStart = F.lineStart(),
      lineLength = F.OUTFIELD_STAND + 2 - lineStart;
    const profile = new THREE.Shape();
    profile.moveTo(F.LINE_STAND, 0);
    profile.lineTo(F.LINE_STAND, lineBase);
    for (let k = 0; k < lineRows; k++) {
      const u = F.LINE_STAND + (k + 1) * 1.25,
        y = lineBase + k * 0.62;
      profile.lineTo(u, y);
      profile.lineTo(u, y + 0.62);
    }
    const standBack = F.LINE_STAND + lineRows * 1.25 + 0.6;
    profile.lineTo(standBack, lineBase + lineRows * 0.62 + 2.2);
    profile.lineTo(standBack, 0);
    profile.closePath();
    const runGeometry = new THREE.ExtrudeGeometry(profile, {
      depth: lineLength,
      bevelEnabled: false,
    });
    runGeometry.translate(0, 0, lineStart);
    for (const side of [1, -1]) {
      // Local +Z runs down the line, local +X points away from the field.
      const g = new THREE.Group();
      g.rotation.y = (side * Math.PI) / 4;
      g.scale.x = side;
      const run = new THREE.Mesh(runGeometry, concrete);
      run.castShadow = run.receiveShadow = true;
      g.add(run);
      const pad = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, lineBase, lineLength),
        new THREE.MeshStandardMaterial({ color: "#1f4038", roughness: 0.7 }),
      );
      pad.position.set(F.LINE_STAND - 0.05, lineBase / 2, lineStart + lineLength / 2);
      g.add(pad);
      this.scene.add(g);
    }
    // Crowd: seated fans as instanced capsules in team-ish colours, most seats filled.
    const fanGeometry = new THREE.CylinderGeometry(0.15, 0.19, 0.62, 5, 1, true),
      fans = new THREE.InstancedMesh(
        fanGeometry,
        new THREE.MeshStandardMaterial({ roughness: 0.9 }),
        7000,
      ),
      o = new THREE.Object3D(),
      palette = [
        "#e9dcc3",
        "#cf6a4c",
        "#2a4a66",
        "#f2f0ea",
        "#dcb356",
        "#5b7f8c",
        "#1f2a33",
        "#b8423a",
      ],
      color = new THREE.Color();
    let count = 0,
      seed = 3;
    const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (const b of seats)
      for (let k = 0; k < b.rows; k++) {
        const r = b.inner + k * 1.25 + 0.75,
          y = b.base + k * 0.62 + 0.42,
          perRow = Math.floor((r * b.phiLength) / 0.62);
        for (let j = 0; j < perRow && count < 7000; j++) {
          if (rnd() < 0.3) continue;
          const phi = b.phiStart + ((j + 0.5) / perRow) * b.phiLength;
          o.position.set(Math.sin(phi) * r, y, Math.cos(phi) * r);
          o.rotation.y = phi + Math.PI;
          o.scale.setScalar(0.9 + rnd() * 0.2);
          o.updateMatrix();
          fans.setMatrixAt(count, o.matrix);
          fans.setColorAt(count, color.set(palette[Math.floor(rnd() * palette.length)]));
          count++;
        }
      }
    for (const side of [1, -1])
      for (let k = 0; k < lineRows; k++) {
        const out = F.LINE_STAND + k * 1.25 + 0.62,
          y = lineBase + k * 0.62 + 0.42;
        for (
          let along = lineStart + 1;
          along < lineStart + lineLength && count < 7000;
          along += 0.62
        ) {
          if (rnd() < 0.35) continue;
          const p = F.linePoint(side, along, out);
          o.position.set(p.x, y, p.z);
          o.rotation.y = 0;
          o.scale.setScalar(0.9 + rnd() * 0.2);
          o.updateMatrix();
          fans.setMatrixAt(count, o.matrix);
          fans.setColorAt(count, color.set(palette[Math.floor(rnd() * palette.length)]));
          count++;
        }
      }
    fans.count = count;
    if (!this.lite) this.scene.add(fans);
    // Behind-home sign on the backstop padding.
    this.label("MISAN BASEBALL", "#ead7a8", "#1f4038", 5.2, 1.3, 0, 0.75, -25.5, 0);
    // Scoreboard above the centre-field bleachers.
    this.box(0, 16, 128, 30, 13, 1.2, "#16252c");
    this.label("DIAMOND ROAD", "#f2c778", "#16252c", 26, 5, 0, 18.8, 127.3);
    this.label("HOME OF THE NEXT ACE", "#c6d9d5", "#16252c", 22, 3, 0, 14.2, 127.3);
    for (const x of [-9, 9])
      this.mesh(new THREE.CylinderGeometry(0.5, 0.6, 12, 10), "#5d6a6c", x, 5, 128.6);
    // Distant city skyline beyond the stadium (fades into the haze).
    const towers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),
      70,
    );
    for (let i = 0; i < 70; i++) {
      const a = -1.9 + (i / 70) * 3.8 + (rnd() - 0.5) * 0.04,
        r = 240 + rnd() * 90,
        h = 18 + rnd() * rnd() * 70,
        w = 12 + rnd() * 16;
      o.position.set(Math.sin(a) * r, h / 2, 40 + Math.cos(a) * r);
      o.rotation.set(0, a, 0);
      o.scale.set(w, h, 10 + rnd() * 14);
      o.updateMatrix();
      towers.setMatrixAt(i, o.matrix);
      towers.setColorAt(i, color.set(["#8796a0", "#9aa7ad", "#7d8b96", "#a9b2b4"][i % 4]));
    }
    this.scene.add(towers);
    // Light towers with glowing lamp banks, two over each stand.
    const lamp = new THREE.MeshStandardMaterial({
      color: "#fffbe8",
      emissive: "#fff6d8",
      emissiveIntensity: 1.6,
    });
    for (const [x, z] of [
      [-62, -48],
      [74, 0],
      [-88, 98],
      [88, 98],
    ]) {
      const mast = this.mesh(new THREE.CylinderGeometry(0.35, 0.6, 34, 10), "#8a9597", x, 17, z);
      mast.castShadow = true;
      const head = new THREE.Group();
      head.position.set(x, 34.5, z);
      head.lookAt(0, 0, 30);
      this.scene.add(head);
      this.box(0, 0, 0, 8, 3.4, 0.5, "#e4e2d6", head);
      for (let i = -3; i <= 3; i++)
        for (let j = -1; j <= 1; j++) {
          const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), lamp);
          bulb.position.set(i * 1.1, j * 1.0, 0.27);
          head.add(bulb);
        }
    }
  }
  private static readonly SHOULDER_X = 0.215;
  private static readonly SHOULDER_Y = 1.45;
  private static readonly UPPER_ARM = 0.28;
  private static readonly FOREARM = 0.27;
  private ikBasis = new THREE.Matrix4();
  /**
   * Two-bone IK: bend the shoulder and elbow so the hand reaches `target` (figure-local metres).
   * `pole` is the direction the elbow should point (e.g. down and out).
   */
  private reach(f: Figure, side: "L" | "R", target: Vec, pole: Vec) {
    const F = BaseballField,
      shoulder = side === "L" ? f.left : f.right,
      elbow = side === "L" ? f.elbowL : f.elbowR,
      sx = side === "L" ? -F.SHOULDER_X : F.SHOULDER_X,
      a = F.UPPER_ARM,
      b = F.FOREARM,
      d = new THREE.Vector3(target.x - sx, target.y - F.SHOULDER_Y, target.z),
      dist = clamp(d.length(), 0.08, a + b - 0.002);
    d.normalize();
    const p = new THREE.Vector3(pole.x, pole.y, pole.z);
    p.sub(d.clone().multiplyScalar(p.dot(d)));
    if (p.lengthSq() < 1e-6) p.set(0, -1, 0).sub(d.clone().multiplyScalar(-d.y));
    p.normalize();
    const alpha = Math.acos(clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1)),
      upper = d
        .clone()
        .multiplyScalar(Math.cos(alpha))
        .add(p.clone().multiplyScalar(Math.sin(alpha))),
      handFromElbow = d
        .clone()
        .multiplyScalar(dist)
        .sub(upper.clone().multiplyScalar(a))
        .normalize(),
      bend = Math.acos(clamp(upper.dot(handFromElbow), -1, 1)),
      bendDir = handFromElbow.clone().sub(upper.clone().multiplyScalar(upper.dot(handFromElbow)));
    if (bendDir.lengthSq() < 1e-8) bendDir.copy(p).multiplyScalar(-1);
    bendDir.normalize();
    // Local −Y along the upper arm, local −Z toward the bend, local X completes the frame.
    const y = upper.clone().negate(),
      z = bendDir.clone().negate(),
      x = new THREE.Vector3().crossVectors(y, z);
    shoulder.quaternion.setFromRotationMatrix(this.ikBasis.makeBasis(x, y, z));
    elbow.rotation.set(bend, 0, 0);
  }
  /** Both hands to these points, elbows pointing down and slightly out. */
  /** Swaps the drawn figures for the Mixamo players (each with its own animation mixer). */
  private setupAvatars(assets: AvatarAssets) {
    const all = [...this.players, this.batter, ...this.runners];
    this.avatars = new Map();
    for (const fig of all) {
      const a = new Avatar(assets);
      this.scene.add(a.object);
      this.avatars.set(fig, a);
      // Hide the drawn body; the root stays (positions, the name tag, the camera targets).
      for (const c of fig.root.children) if (!(c as THREE.Sprite).isSprite) c.visible = false;
    }
    // The highlight replay's own player and ball (shown only while the TV window draws).
    for (let k = 0; k < 2; k++) {
      const a = new Avatar(assets);
      a.object.visible = false;
      this.scene.add(a.object);
      this.replayAvatars.push(a);
    }
    this.replayBall = this.ball.clone();
    this.replayBall.visible = false;
    this.scene.add(this.replayBall);
  }
  /**
   * Picks and times each player's animation from the game state: the pitch and the swing are
   * scrubbed to the exact moments the rules use (release, contact); runs and idles loop.
   */
  private driveAvatars(dt: number, cam: string) {
    const s = this.engine.state,
      l = s.live,
      batting = this.engine.batting,
      K = CLIP_KEYS,
      fielders = this.engine.fielders,
      f = s.flight;
    const place = (fig: Figure, a: Avatar, yaw: number, smooth = false) => {
      a.object.visible = fig.root.visible;
      const target = new THREE.Vector3(fig.root.position.x, 0, fig.root.position.z),
        last = this.lastAvatarPos.get(fig);
      // Small jumps (a dive's last metre) are eased; long ones (new play) snap.
      if (smooth && last && last.distanceTo(target) < 6)
        a.object.position.lerp(target, 1 - Math.exp(-dt * 12));
      else a.object.position.copy(target);
      this.lastAvatarPos.set(fig, target.clone());
      a.object.rotation.set(0, yaw, 0);
    };
    // Fielder i's clip during a live play (chasing, catching, diving, throwing, covering).
    const running = (a: Avatar, moved: number, offset: number) => {
      if (moved > 0.02) a.play("run", { loop: true, speed: clamp(moved / dt / 6, 0.6, 1.4) });
      else a.play("idle", { loop: true, offset });
    };
    // Fielder i's clip during a live play (chasing, catching, diving, throwing, covering).
    const fielding = (i: number, a: Avatar, fig: Figure, moved: number) => {
      if (!l || s.phase !== "inplay") return false;
      const e = l.elapsed,
        t = l.throw,
        plan = l.plan;
      // Which way he dives: toward where the dive ends (planned) or the ball.
      const sideOf = () => {
        let side = this.diveSide.get(fig);
        if (!side) {
          const goal = plan?.end ?? (l.ground ? s.ball : l.catchPoint),
            yaw = a.object.rotation.y,
            dx = goal.x - fig.root.position.x,
            dz = goal.z - fig.root.position.z;
          // diving_r goes to the model's right (its local -X).
          side = dx * Math.cos(yaw) - dz * Math.sin(yaw) < 0 ? "diving_r" : "diving_l";
          this.diveSide.set(fig, side);
        }
        return side;
      };
      // Planned catch (automatic fielding): the motion starts before the ball arrives, so the
      // crouch and take-off of a leap, the launch of a dive or the reach of a catch are seen.
      if (plan && l.fielder === i && l.fieldedAt === null && !l.diveTried && e < plan.at) {
        const to = plan.at - e;
        if (plan.style === "dive" && plan.launchAt !== undefined && e >= plan.launchAt) {
          const u = clamp((e - plan.launchAt) / Math.max(1e-3, plan.at - plan.launchAt), 0, 1);
          a.play(sideOf(), { time: lerp(K.diveStart, K.diveReach, u), fade: 0.12 });
          return true;
        }
        if (plan.style === "jump" && to < K.jumpCatch - K.jumpStart) {
          a.play("jump_catch", { time: K.jumpCatch - to, fade: 0.15 });
          return true;
        }
        if (plan.style === "catch" && to < K.catchMoment - K.catchStart) {
          a.play("catch", { time: K.catchMoment - to, fade: 0.15 });
          return true;
        }
      }
      // A dive (caught or not): in the air at the moment, then get up in time for the throw
      // (or, after a miss, when he can move again; a backup may be chasing the ball meanwhile).
      const diveAt = l.diveTried && l.diver === i ? l.catchMoment : undefined;
      if (diveAt !== undefined && e >= diveAt) {
        const endAt = l.downUntil ?? (l.fieldedAt ?? diveAt) + l.hold;
        if (e < endAt) {
          const side = sideOf();
          const rate = (K.diveUp - K.diveReach) / Math.max(0.6, endAt - diveAt);
          a.play(side, { time: Math.min(K.diveUp, K.diveReach + (e - diveAt) * rate), fade: 0.1 });
          return true;
        }
      }
      // Rundown, tag about to land (slow motion): he turns to the runner and puts the glove down.
      const rd = l.rundown;
      if (i === l.fielder && rd && this.engine.timeScale < 1) {
        const rr = l.runners.find((x) => x.id === rd.runnerId);
        if (rr) {
          const p = runnerPose(rr).position;
          a.object.rotation.y =
            playerYaw(V(p.x - l.fielderPos.x, 0, p.z - l.fielderPos.z)) + Math.PI;
          a.play("ground_catch", { time: K.groundPickup, fade: 0.15 });
          return true;
        }
      }
      if (l.fielder !== i) {
        // The one who just threw finishes his follow-through.
        if (t && t.thrower === i && e < t.startedAt + (K.throwEnd - K.throwRelease)) {
          a.play("throw", { time: K.throwRelease + (e - t.startedAt) });
          return true;
        }
        // Receiver: glove up as the throw arrives.
        const arrive = t && t.receiver === i ? t.startedAt + t.duration : null;
        if (arrive !== null && e > arrive - 0.45 && e < arrive + 0.7)
          a.play("catch", { time: K.catchMoment + (e - arrive), fade: 0.12 });
        else running(a, moved, i * 1.7);
        return true;
      }
      if (t && l.state === "송구" && t.receivedAt === null)
        a.play("throw", { time: Math.min(K.throwEnd, K.throwRelease + (e - t.startedAt)) });
      else if (
        l.fieldedAt !== null &&
        (l.state === "포구" || (!t && e - l.fieldedAt < (l.catchStyle === "jump" ? 0.6 : 0.4)))
      ) {
        // Fielded: the catch/pickup plays out (a leap lands even if the play is already over),
        // then the throw's wind-up so the ball leaves the hand when the rules release it.
        const release = l.state === "포구" ? l.fieldedAt + l.hold - e : 9,
          moment = l.catchStyle === "jump" ? (l.catchMoment ?? l.fieldedAt) : l.fieldedAt;
        if (!l.caughtFly && release < K.throwRelease - K.throwStart)
          a.play("throw", { time: K.throwRelease - release, fade: 0.15 });
        else if (l.catchStyle === "jump")
          a.play("jump_catch", { time: Math.min(K.jumpEnd, K.jumpCatch + (e - moment)) });
        else if (l.catchStyle === "ground")
          a.play("ground_catch", { time: K.groundPickup + (e - moment) });
        else a.play("catch", { time: K.catchMoment + (e - moment) });
      } else if (t && t.receivedAt !== null && t.receiver === i && e < t.receivedAt + 0.4)
        // He just caught the throw (and may now chase a runner).
        a.play("catch", { time: K.catchMoment + (e - t.receivedAt) });
      else if (t && t.receivedAt !== null && t.receiver !== i && e < t.receivedAt + 0.5)
        a.play("throw", { time: Math.min(K.throwEnd, K.throwRelease + (e - t.startedAt)) });
      else running(a, moved, 0);
      return true;
    };
    if (!l?.diveTried && l?.plan?.style !== "dive") this.diveSide.clear();
    // --- fielders (0 = pitcher, 1 = catcher)
    this.players.forEach((fig, i) => {
      const a = this.avatars!.get(fig)!,
        p = fielders[i],
        lefty = p?.hand === "L",
        last = this.lastAvatarPos.get(fig),
        moved = last ? Math.hypot(fig.root.position.x - last.x, fig.root.position.z - last.z) : 0;
      a.setTeam(batting ? "away" : "home");
      a.setGlove(true, lefty);
      // Models face +Z; the drawn figures face their local -Z.
      place(fig, a, fig.root.rotation.y + Math.PI, !!l);
      // The catcher's camera sits right behind him: he would fill the screen.
      if (i === 1 && cam === "catcher") a.object.visible = false;
      if (fielding(i, a, fig, moved)) return;
      if (i === 0) {
        const clip = lefty ? "pitch_l" : "pitch_r";
        if (s.phase === "windup")
          a.play(clip, { time: (1 - s.timer / 0.62) * K.pitchRelease, fade: 0.1 });
        else if (f && (s.phase === "flight" || s.phase === "result"))
          a.play(clip, { time: Math.min(K.pitchEnd, K.pitchRelease + f.elapsed * 0.9) });
        else if (s.phase === "ready") a.play(clip, { time: 0, fade: 0.35 });
        else a.play("idle", { loop: true });
      } else if (i === 1) a.play("catcher_idle", { loop: true });
      else a.play("idle", { loop: true, offset: i * 1.7 });
    });
    // --- batter: stance, stride on every pitch, swing timed so the bat meets the ball, bunt
    const live = s.phase === "inplay" && l?.kind === "batted" ? l : null,
      // He finishes the swing before he drops the bat and runs (the runner takes over).
      following = !!live && live.elapsed < BAT_FOLLOW;
    {
      const fig = this.batter,
        a = this.avatars!.get(fig)!,
        lefty = this.engine.batter.hand === "L",
        side = lefty ? "_l" : "_r",
        swingClip = `swing${side}` as "swing_r";
      a.setTeam(batting ? "home" : "away");
      a.setBat(true, lefty);
      a.object.visible = fig.root.visible || following;
      a.object.position.set(lefty ? -0.82 : 0.82, 0, 0);
      a.object.rotation.set(0, 0, 0);
      const bunt = s.swingStyle === "bunt" && batting;
      // A new swing: the user's bat reaches the hitting point when a perfectly timed swing
      // would (the rules' sweet spot); the AI's swing is decided at the plate, so at once.
      if (f && (f.swung || f.aiSwing) && this.batSwing?.flight !== f) {
        const vd = f.visualDuration;
        this.batSwing = {
          flight: f,
          press: this.time,
          contactAt: this.time + (f.swung ? Math.max(0.05, (1 - SWING_SWEET) * vd) : 0.05),
          from: a.clip === swingClip ? Math.min(a.clipTime, 0.8) : 0.72,
        };
      } else if (this.batSwing && (f ? this.batSwing.flight !== f : s.phase !== "inplay"))
        this.batSwing = null;
      const sw = this.batSwing,
        since = sw ? this.time - sw.contactAt : Infinity;
      // Hit by pitch: he reacts where the ball got him (head, body or legs), only while the
      // call is shown; then the next batter steps in as usual.
      if (s.hbp && s.hbp.id !== this.hbpSeen) {
        this.hbpSeen = s.hbp.id;
        this.hbpAt = this.time;
      }
      const hbp = s.phase === "result" && !s.live && s.lastOutcome === "HitByPitch" ? s.hbp : null,
        // (No reaction for a ball off the legs or feet: that clip did not fit.)
        react = hbp
          ? hbp.part === "머리"
            ? { clip: "hit_high" as const, from: K.hitHighFrom, to: K.hitHigh }
            : hbp.part === "다리" || hbp.part === "발"
              ? null
              : { clip: "hit_mid" as const, from: K.hitMidFrom, to: K.hitMid }
          : null;
      if (hbp && react && this.time - this.hbpAt < react.to - react.from) {
        // Straight into the reaction from his stance (no idle lead-in), still facing the
        // plate as he stood, blended over a few frames instead of snapping.
        a.setBat(false, hbp.x < 0);
        a.object.visible = true;
        a.object.position.set(hbp.x < 0 ? -0.82 : 0.82, 0, 0);
        // (The stance clip already turns him to the plate; the reaction clip faces ahead, so the
        // body turns while one blends into the other.)
        const turn = Math.min(1, (this.time - this.hbpAt) / 0.12);
        a.object.rotation.set(0, (hbp.x < 0 ? Math.PI / 2 : -Math.PI / 2) * turn, 0);
        a.play(react.clip, { time: react.from + (this.time - this.hbpAt), fade: 0.12 });
      } else if (bunt && (s.phase === "windup" || s.phase === "flight" || (sw && since < 0.9)))
        a.play(`bunt${side}` as "bunt_r", {
          time: s.phase === "windup" ? (1 - s.timer / 0.62) * K.buntSquare : K.buntSquare,
        });
      else if (sw && since < 0.6) {
        // Into the contact point, then a decelerating follow-through that ends with the bat
        // over the shoulder; a short hold, then a slow blend back into the stance.
        const v = clamp(since / 0.3, 0, 1),
          time =
            since < 0
              ? lerp(
                  sw.from,
                  K.swingContact,
                  clamp((this.time - sw.press) / (sw.contactAt - sw.press), 0, 1),
                )
              : lerp(K.swingContact, K.swingFinish, 1 - (1 - v) * (1 - v));
        a.play(swingClip, { time, fade: 0.06 });
      } else if (s.phase === "flight" && f && !sw) {
        // Stride and load while the ball comes in; a take goes back to the stance afterwards.
        const u = clamp((f.elapsed / f.visualDuration - 0.2) / 0.65, 0, 1);
        a.play(swingClip, { time: lerp(0.35, 0.72, u * u * (3 - 2 * u)), fade: 0.25 });
      } else a.play(`idle_bat${side}` as "idle_bat_r", { loop: true, fade: 0.5 });
    }
    // --- runners
    const batterSpot = this.avatars!.get(this.batter)!.object.position;
    this.runners.forEach((fig, i) => {
      const a = this.avatars!.get(fig)!;
      a.setTeam(batting ? "home" : "away");
      a.setGlove(false);
      // The batter-runner leaves from where the batter stood (eased, no pop).
      const leaving = i === 0 && !!live && live.elapsed < BAT_FOLLOW + 0.6;
      place(fig, a, fig.root.rotation.y + Math.PI, leaving);
      if (i === 0 && following) {
        a.object.visible = false;
        a.object.position.set(batterSpot.x, 0, batterSpot.z);
      }
      // Slide on its own clock from the take-off: down onto the bag, then the clip's own
      // get-up, and only then the stance (no snap from lying flat to standing).
      const track = this.runnerTracks[i],
        e = l?.elapsed ?? 0;
      // Tripped: stumble, flat on his face, then up again (the dive clip's get-up).
      if (track && track.fellAt !== undefined && e >= track.fellAt && e < track.delay) {
        const u = e - track.fellAt,
          up = K.diveUp - K.diveDown;
        if (u < K.fallDown - K.fallFrom) a.play("fall_flat", { time: K.fallFrom + u, fade: 0.1 });
        else if (e < track.delay - up) a.play("fall_flat", { time: K.fallDown });
        else a.play("diving_r", { time: K.diveUp - (track.delay - e), fade: 0.3 });
        this.slideStart[i] = -1;
        return;
      }
      // Turning back between bases: plant and spin (he still faces the old way at first).
      if (
        track &&
        track.turnAt !== undefined &&
        e >= track.turnAt &&
        e < track.turnAt + RULES.turnTime
      ) {
        const u = (e - track.turnAt) / RULES.turnTime;
        a.object.rotation.y += Math.PI;
        a.play("run_turn", { time: lerp(K.turnFrom, K.turnTo, u), fade: 0.08 });
        this.slideStart[i] = -1;
        return;
      }
      if (this.runnerSlide[i] >= 0 && this.slideStart[i] < 0) {
        this.slideStart[i] = this.time;
        // Head first (around a tag, or back to the bag) or feet first: the rules chose.
        this.slideDodge[i] = track?.slide?.kind === "dive";
      }
      const dodge = this.slideDodge[i],
        since = this.slideStart[i] >= 0 ? this.time - this.slideStart[i] : -1,
        slideT = since >= 0 ? K.slideFrom + since * K.slideRate : -1,
        dodgeIn = K.dodgeDown - K.dodgeFrom,
        dodgeEnd = dodgeIn + 0.25 + (K.diveUp - K.diveDown);
      if (
        !fig.root.visible ||
        ((dodge ? since > dodgeIn : slideT > K.slideGetUp) &&
          this.runnerMoving[i] &&
          this.runnerSlide[i] < 0)
      )
        this.slideStart[i] = -1;
      if (this.slideStart[i] >= 0 && dodge && since < dodgeEnd) {
        if (since < dodgeIn) a.play("trip", { time: K.dodgeFrom + since, fade: 0.08 });
        else if (since < dodgeIn + 0.25) a.play("trip", { time: K.dodgeDown });
        else a.play("diving_r", { time: K.diveDown + (since - dodgeIn - 0.25), fade: 0.3 });
      } else if (this.slideStart[i] >= 0 && !dodge && slideT < K.slideEnd)
        a.play("slide", { time: slideT, fade: 0.1 });
      else {
        this.slideStart[i] = -1;
        if (this.runnerMoving[i]) a.play("run", { loop: true, speed: 1.15, offset: i * 0.1 });
        else a.play("idle", { loop: true, offset: i * 2.3, fade: 0.45 });
      }
    });
    for (const a of this.avatars!.values()) a.update(dt);
    this.recordReplay();
  }
  /** Records everyone each frame; starts the replay once the highlight has played out. */
  private recordReplay() {
    const s = this.engine.state,
      l = s.live;
    // Every live play (a steal or pickoff can make a close call too; recording only batted
    // balls replayed the previous play's tape: the fielder on the bag and no runner).
    if (l && s.phase === "inplay") {
      if (this.tapeLive !== l) {
        this.tape = [];
        this.tapeLive = l;
      }
      const actors = new Map<string, ReplayActor>(),
        rec = (key: string, fig: Figure) => {
          const a = this.avatars!.get(fig)!;
          actors.set(key, {
            x: a.object.position.x,
            z: a.object.position.z,
            yaw: a.object.rotation.y,
            clip: a.clip,
            time: a.clipTime,
            on: a.object.visible,
          });
        };
      this.players.forEach((fig, i) => rec("f" + i, fig));
      this.runners.forEach((fig, i) => rec("r" + i, fig));
      this.tape.push({
        t: l.elapsed,
        chaser: l.fielder,
        actors,
        ball: this.ball.position.clone(),
        ballOn: this.ball.visible,
      });
      while (this.tape.length && this.tape[0].t < l.elapsed - 4) this.tape.shift();
    }
    // Replays turned off (settings): none queued, and one on screen closes.
    if (!s.replays) {
      this.replayPending = [];
      this.replayQueue = [];
      this.replay = null;
      this.replaySrc = s.replay;
    }
    // New highlight from the rules: wait until its window has been recorded.
    const r = s.replay;
    if (r && r !== this.replaySrc && s.replays) {
      this.replaySrc = r;
      this.replayPending.push({ r, play: l });
    }
    this.replayPending = this.replayPending.filter(({ r, play }) => {
      const after = r.base ? 0.8 : REPLAY_AFTER,
        over =
          !l ||
          s.phase !== "inplay" ||
          l !== play ||
          l !== this.tapeLive ||
          l.elapsed >= r.at + after;
      if (!over) return true;
      const frames = this.tape.filter((f) => f.t >= r.at - REPLAY_BEFORE && f.t <= r.at + after);
      // At most two replays from one play (a double play shows both calls).
      if (frames.length < 5 || this.replayQueue.filter((q) => q.play === play).length >= 2)
        return false;
      // A runner who is called out leaves the main picture at once; in the replay he stays
      // where he was tagged/forced, so the call is seen with him in it.
      if (r.base) {
        const key = "r" + r.base.runner;
        let seen: ReplayActor | undefined;
        frames.forEach((f, i) => {
          const a = f.actors.get(key);
          if (a?.on) seen = a;
          else if (seen) {
            const copy = new Map(f.actors);
            copy.set(key, { ...seen });
            frames[i] = { ...f, actors: copy };
          }
        });
      }
      const defense = this.engine.batting ? "away" : "home",
        offense = this.engine.batting ? "home" : "away",
        lefty = this.engine.fielders[r.fielder]?.hand === "L";
      this.replayQueue.push({
        play,
        text: r.text,
        frames,
        startedAt: 0,
        at: r.at,
        cast: r.base
          ? [
              { key: "r" + r.base.runner, team: offense, glove: false, lefty: false },
              { key: "f" + r.fielder, team: defense, glove: true, lefty },
            ]
          : // A fielding highlight follows the fielder who made it.
            [{ key: "f" + r.fielder, team: defense, glove: true, lefty }],
        base: r.base ? { base: r.base.base, out: r.base.out } : undefined,
        tvState: "",
      });
      return false;
    });
    // One replay at a time, in order; a new one never cuts off the one on screen.
    if (!this.replay && this.replayQueue.length && this.replayAvatars.length) {
      const next = this.replayQueue.shift()!;
      next.startedAt = this.replayClock;
      this.replay = next;
      next.cast.forEach((c, k) => {
        const a = this.replayAvatars[k];
        a.setTeam(c.team);
        a.setGlove(c.glove, c.lefty);
      });
    }
    // The next batter/inning waits while a replay is pending, queued or on screen.
    s.replayBusy = !!this.replay || this.replayQueue.length > 0 || this.replayPending.length > 0;
  }
  private drawTv(label: string, verdict: string, tone: string) {
    if (!this.tv) {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 80;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene(),
        bar = new THREE.Mesh(
          new THREE.PlaneGeometry(2, 0.3),
          new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false }),
        );
      bar.position.y = 0.85;
      scene.add(bar);
      this.tv = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1), canvas, tex };
    }
    const g = this.tv.canvas.getContext("2d")!;
    g.clearRect(0, 0, 640, 80);
    g.fillStyle = "rgba(10, 16, 24, 0.72)";
    g.fillRect(0, 0, 640, 80);
    g.fillStyle = "#e5483d";
    g.beginPath();
    g.arc(30, 40, 10, 0, Math.PI * 2);
    g.fill();
    g.font = "800 34px Pretendard, 'Noto Sans KR', sans-serif";
    g.textBaseline = "middle";
    g.fillStyle = "#ffffff";
    g.fillText("REPLAY", 52, 42);
    g.fillStyle = "#f2c14e";
    g.fillText(label, 206, 42);
    g.textAlign = "right";
    if (verdict) {
      g.font = "900 40px Pretendard, 'Noto Sans KR', sans-serif";
      g.fillStyle = tone;
      g.fillText(verdict, 624, 42);
    } else {
      g.font = "700 26px Pretendard, sans-serif";
      g.fillStyle = "#cfd8e3";
      g.fillText(`SLOW ×${REPLAY_SLOW}`, 624, 42);
    }
    g.textAlign = "left";
    this.tv.tex.needsUpdate = true;
  }
  /**
   * How far (CSS px) the canvas's bottom-left corner is hidden: below the window's bottom, or
   * under the key guide or the pitcher/batter badge drawn over it.
   */
  private replayLift(w: number) {
    const host = this.renderer.domElement.getBoundingClientRect();
    let bottom = Math.min(host.bottom, window.innerHeight);
    for (const sel of [".controls-footer", ".field-bottom .pitcher-badge"]) {
      const r = document.querySelector(sel)?.getBoundingClientRect();
      if (r && r.height && r.left < host.left + w + 12 && r.top < bottom && r.bottom > host.top)
        bottom = Math.min(bottom, r.top);
    }
    return Math.max(0, host.bottom - bottom);
  }
  /** The small TV window (bottom-left): the highlight again, in slow motion. */
  private renderReplay() {
    const R = this.replay,
      ball = this.replayBall;
    if (!R || !ball) return;
    const fr = R.frames,
      t0 = fr[0].t,
      t1 = fr[fr.length - 1].t,
      real = this.replayClock - R.startedAt;
    // The replay plays once, holds the last frame a moment, then the window closes.
    // (A close play holds the call on screen a little longer.)
    if (real > (t1 - t0) / REPLAY_SLOW + (R.base ? 1.8 : 1.2)) {
      this.replay = null;
      this.engine.state.replayBusy = this.replayQueue.length > 0 || this.replayPending.length > 0;
      return;
    }
    const tt = Math.min(t1, t0 + real * REPLAY_SLOW);
    let k = 0;
    while (k < fr.length - 2 && fr[k + 1].t <= tt) k++;
    const A = fr[k],
      B = fr[k + 1] ?? A,
      u = B.t > A.t ? clamp((tt - A.t) / (B.t - A.t), 0, 1) : 0;
    // Caption: the call appears once the ball is in the glove at the bag.
    const call = R.base
        ? tt >= Math.min(R.at, t1) - 1e-6
          ? R.base.out
            ? "아웃!"
            : "세이프!"
          : ""
        : "",
      label = R.base ? (R.base.base === 4 ? "홈" : R.base.base + "루") + " 접전" : R.text,
      tvState = label + call;
    if (tvState !== R.tvState) {
      R.tvState = tvState;
      this.drawTv(label, call, R.base?.out ? "#ff6b5e" : "#5fd38a");
    }
    R.cast.forEach((c, n) => {
      const av = this.replayAvatars[n],
        a = A.actors.get(c.key),
        b = B.actors.get(c.key) ?? a;
      if (!av || !a || !b) return;
      av.object.position.set(lerp(a.x, b.x, u), 0, lerp(a.z, b.z, u));
      av.object.rotation.set(0, a.yaw, 0);
      if (a.clip)
        av.pose(a.clip, a.clip === b.clip && b.time >= a.time ? lerp(a.time, b.time, u) : a.time);
      av.object.visible = a.on;
    });
    ball.position.lerpVectors(A.ball, B.ball, u);
    // Camera.
    if (R.base) {
      // Close play: from just past the bag, looking back down the runner's path, so the
      // runner is seen coming the whole way and the fielder takes the throw in front of us.
      // (Side-on from 5.5 m, the runner stayed out of the picture until the last moment:
      // the replay showed the fielder standing on the bag and nothing else.)
      const bag = BASES[R.base.base - 1],
        prev = BASES[(R.base.base + 2) % 4],
        key = R.cast[0].key,
        start = fr.find((f) => f.actors.get(key)?.on)?.actors.get(key);
      let ax = (prev.x - bag.x) / (Math.hypot(prev.x - bag.x, prev.z - bag.z) || 1),
        az = (prev.z - bag.z) / (Math.hypot(prev.x - bag.x, prev.z - bag.z) || 1);
      // The way he really came (a runner going back to a bag comes from the other side).
      if (start) {
        const rx = start.x - bag.x,
          rz = start.z - bag.z,
          rl = Math.hypot(rx, rz);
        if (rl > 2) {
          ax = rx / rl;
          az = rz / rl;
        }
      }
      let sx = -az,
        sz = ax;
      // A little off the line, on the outside of the diamond (away from its centre).
      if (sx * (bag.x - 0) + sz * (bag.z - 19.4) < 0) {
        sx = -sx;
        sz = -sz;
      }
      this.replayCam.position.set(bag.x - ax * 6.5 + sx * 2.6, 1.9, bag.z - az * 6.5 + sz * 2.6);
      this.replayCam.lookAt(bag.x + ax * 3.5, 0.8, bag.z + az * 3.5);
    } else {
      // Fielding highlight: side-on to his run (the side facing home), following him.
      const f0 = fr[0].actors.get(R.cast[0].key)!,
        atF = fr.find((f) => f.t >= R.at) ?? fr[fr.length - 1],
        at = atF.actors.get(R.cast[0].key)!,
        rx = at.x - f0.x,
        rz = at.z - f0.z,
        rl = Math.hypot(rx, rz);
      let sx = rl > 0.5 ? -rz / rl : -at.x / (Math.hypot(at.x, at.z) || 1),
        sz = rl > 0.5 ? rx / rl : -at.z / (Math.hypot(at.x, at.z) || 1);
      if (sx * -at.x + sz * -at.z < 0) {
        sx = -sx;
        sz = -sz;
      }
      // A leap is framed wider and higher, so the ball is seen coming down into the glove.
      const p = this.replayAvatars[0].object.position,
        leap = R.text === "점프 캐치",
        dist = leap ? 6.5 : 5;
      this.replayCam.position.set(p.x + sx * dist, leap ? 1.9 : 1.7, p.z + sz * dist);
      this.replayCam.lookAt(p.x, leap ? 1.7 : 1.05, p.z);
    }
    // Hide what belongs to the live view: name tags, the live ball and the real players shown.
    const hidden: [THREE.Object3D, boolean][] = [];
    const hide = (o: THREE.Object3D) => {
      hidden.push([o, o.visible]);
      o.visible = false;
    };
    const shown = new Set(R.cast.map((c) => c.key));
    for (const [fig, live] of this.avatars!) {
      hide(fig.root);
      const i = this.players.indexOf(fig),
        j = this.runners.indexOf(fig);
      if ((i >= 0 && shown.has("f" + i)) || (j >= 0 && shown.has("r" + j))) hide(live.object);
    }
    hide(this.ball);
    hide(this.halo);
    hide(this.trail);
    for (const m of this.fire) hide(m);
    if (this.aura) hide(this.aura);
    if (this.auraRing) hide(this.auraRing);
    ball.visible = A.ballOn;
    const r = this.renderer,
      size = r.getSize(new THREE.Vector2()),
      w = Math.round(Math.min(size.x * 0.36, 440)),
      h = Math.round((w * 9) / 16),
      // Bottom-left, lifted above whatever covers that corner: the bottom of the window, the
      // key guide pinned there, and the pitcher/batter badge.
      x = 12,
      y = clamp(this.replayLift(w) + 12, 12, Math.max(12, size.y - h - 60)),
      clear = r.getClearColor(new THREE.Color()),
      alpha = r.getClearAlpha(),
      shadows = r.shadowMap.autoUpdate;
    r.setScissorTest(true);
    r.setScissor(x - 3, y - 3, w + 6, h + 6);
    r.setClearColor(0xf4f1e8, 1);
    r.clear(true, true, false);
    r.setViewport(x, y, w, h);
    r.setScissor(x, y, w, h);
    this.replayCam.aspect = w / h;
    this.replayCam.updateProjectionMatrix();
    r.shadowMap.autoUpdate = false;
    r.render(this.scene, this.replayCam);
    r.shadowMap.autoUpdate = shadows;
    r.autoClear = false;
    r.clearDepth();
    r.render(this.tv!.scene, this.tv!.cam);
    r.autoClear = true;
    r.setScissorTest(false);
    r.setViewport(0, 0, size.x, size.y);
    r.setClearColor(clear, alpha);
    for (const av of this.replayAvatars) av.object.visible = false;
    ball.visible = false;
    for (const [o, v] of hidden) o.visible = v;
  }
  /** A fielder holding the ball shows it in his glove (or throwing hand), not in mid-air. */
  private holdBall() {
    const l = this.engine.state.live;
    if (!this.avatars || !l || this.engine.state.phase !== "inplay") return;
    const t = l.throw,
      holder =
        t && t.receivedAt !== null
          ? t.receiver
          : !t && l.fieldedAt !== null && l.kind === "batted"
            ? l.fielder
            : -1;
    const a = holder >= 0 ? this.avatars.get(this.players[holder]) : undefined;
    if (a) a.ballPoint(this.ball.position);
    // A planned catch: over its last instant the ball flies into the glove (no snap).
    const p = l.plan;
    if (
      l.fieldedAt === null &&
      p &&
      (p.style === "catch" || p.style === "jump" || (p.style === "dive" && p.success))
    ) {
      const to = p.at - l.elapsed,
        catcher = this.avatars.get(this.players[l.fielder]),
        glove = to >= 0 && to < 0.14 ? catcher?.ballPoint(new THREE.Vector3()) : null;
      if (glove) this.ball.position.lerp(glove, 1 - to / 0.14);
    }
  }
  /** Number of rain streaks (kept modest for low-end laptops). */
  private static RAIN_DROPS = 1100;
  /** Soft round glow (white centre fading out), tinted by the material colour. */
  private glowTexture(): THREE.Texture {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!,
      grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  private buildEffects() {
    const tex = this.glowTexture(),
      glow = (color: string) =>
        new THREE.MeshBasicMaterial({
          map: tex,
          color,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glow(i ? "#1f6fff" : "#4fb0ff"));
      m.visible = false;
      m.renderOrder = 3;
      this.fire.push(m);
      this.scene.add(m);
    }
    this.aura = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.2), glow("#ffb21f"));
    this.aura.visible = false;
    this.aura.renderOrder = 3;
    this.scene.add(this.aura);
    this.auraRing = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.8, 40), glow("#ffd75e"));
    this.auraRing.rotation.x = -Math.PI / 2;
    this.auraRing.visible = false;
    this.scene.add(this.auraRing);
  }
  /** Blue fire on 180 km/h+ pitches; the limit-break aura on our player. */
  private updateEffects(dt: number) {
    const s = this.engine.state,
      f = s.flight,
      blue = s.phase === "flight" && !!f && f.speed >= 180 && this.ball.visible;
    this.fire.forEach((m, i) => {
      const at = i === 0 ? this.ball.position : this.trailPositions[this.trailPositions.length - 1 - i * 3];
      m.visible = blue && !!at;
      if (!m.visible || !at) return;
      m.position.copy(at);
      m.quaternion.copy(this.camera.quaternion);
      const flick = 1 + Math.sin(this.time * 40 + i * 1.7) * 0.12,
        size = (i === 0 ? 0.7 : 0.6 * (1 - i / 11)) * this.ball.scale.x * flick;
      m.scale.setScalar(size);
      (m.material as THREE.MeshBasicMaterial).opacity = i === 0 ? 0.9 : 0.75 * (1 - i / 9);
    });
    // Limit break: on the pitcher when we pitch, on the batter when we bat.
    const on = this.engine.limitActive && s.mode === "match",
      fig = this.engine.batting ? this.batter : this.players[0],
      where = fig ? (this.avatars?.get(fig)?.object.position ?? fig.root.position) : null;
    for (const m of [this.aura, this.auraRing]) if (m) m.visible = on && !!where;
    if (on && where && this.aura && this.auraRing) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
      // Just behind him as the camera sees him, so the glow frames him instead of covering him.
      const bx = where.x - this.camera.position.x,
        bz = where.z - this.camera.position.z,
        bl = Math.hypot(bx, bz) || 1;
      this.aura.position.set(where.x + (bx / bl) * 0.5, 1.25, where.z + (bz / bl) * 0.5);
      // Upright billboard: turns to face the camera around the vertical only.
      this.aura.rotation.set(
        0,
        Math.atan2(this.camera.position.x - where.x, this.camera.position.z - where.z),
        0,
      );
      this.aura.scale.set(1 + pulse * 0.08, 1 + pulse * 0.05, 1);
      (this.aura.material as THREE.MeshBasicMaterial).opacity = 0.7 + pulse * 0.3;
      const grow = (this.time * 1.4) % 1;
      this.auraRing.position.set(where.x, 0.04, where.z);
      this.auraRing.scale.setScalar(0.8 + grow * 1.4);
      (this.auraRing.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - grow);
    }
    void dt;
  }
  private updateWeather(dt: number) {
    const want = this.engine.raining ? "rain" : "clear";
    if (want !== this.weatherShown) this.setWeather(want);
    if (want !== "rain" || !this.rain) return;
    // Streaks fall in a box that follows the camera, so it always looks like rain in view.
    const pos = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute,
      a = pos.array as Float32Array,
      cam = this.camera.position,
      fall = 30 * dt;
    for (let i = 0; i < a.length; i += 6) {
      let x = a[i],
        y = a[i + 1] - fall,
        z = a[i + 2];
      const out =
        y < Math.max(0, cam.y - 14) || Math.abs(x - cam.x) > 45 || Math.abs(z - cam.z) > 45;
      if (out) {
        x = cam.x + (Math.random() - 0.5) * 90;
        z = cam.z + (Math.random() - 0.5) * 90;
        y = cam.y + 6 + Math.random() * 28;
      }
      a[i] = x;
      a[i + 1] = y;
      a[i + 2] = z;
      // A short streak, slanted a little by the wind.
      a[i + 3] = x + 0.08;
      a[i + 4] = y + 0.9;
      a[i + 5] = z + 0.05;
    }
    pos.needsUpdate = true;
  }
  /** Rain: darker sky and lights, grey fog, wet (glossier, darker) ground, rain streaks. */
  private setWeather(w: "clear" | "rain") {
    this.weatherShown = w;
    const rain = w === "rain";
    this.renderer.toneMappingExposure = rain ? 0.92 : 1.05;
    this.hemi.intensity = rain ? 0.8 : 1.15;
    this.sun.intensity = rain ? 1.2 : 3.4;
    (this.scene.background as THREE.Color).set(rain ? "#8e989f" : "#c9d6dc");
    const fog = this.scene.fog as THREE.Fog;
    fog.color.set(rain ? "#8f979c" : "#d4d9d4");
    fog.near = rain ? 70 : 170;
    fog.far = rain ? 330 : 520;
    (this.skyDome.material as THREE.MeshBasicMaterial).color.set(rain ? "#7d868d" : "#ffffff");
    // Wet ground: every rough surface (grass, clay, chalk, concrete) gets darker and glossier.
    if (!this.dry.size)
      this.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial && m.roughness >= 0.85)
          this.dry.set(m, { roughness: m.roughness, color: m.color.clone() });
      });
    this.dry.forEach((d, m) => {
      m.roughness = rain ? d.roughness * 0.55 : d.roughness;
      m.color.copy(d.color);
      if (rain) m.color.multiplyScalar(0.82);
    });
    if (rain && !this.rain) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(BaseballField.RAIN_DROPS * 6), 3),
      );
      this.rain = new THREE.LineSegments(
        g,
        new THREE.LineBasicMaterial({ color: "#c9d8e4", transparent: true, opacity: 0.5 }),
      );
      this.rain.frustumCulled = false;
      this.scene.add(this.rain);
    }
    if (this.rain) this.rain.visible = rain;
  }
  private smoothPose(f: Figure, rate: number, restore: [THREE.Object3D, THREE.Euler][]) {
    const joints: THREE.Object3D[] = [
      f.root,
      f.left,
      f.right,
      f.elbowL,
      f.elbowR,
      f.legL,
      f.legR,
      f.kneeL,
      f.kneeR,
    ];
    if (f.bat) joints.push(f.bat);
    for (const j of joints) {
      const last = this.poseMemory.get(j);
      if (!last || !f.root.visible) this.poseMemory.set(j, j.quaternion.clone());
      else {
        restore.push([j, j.rotation.clone()]);
        last.slerp(j.quaternion, rate);
        j.quaternion.copy(last);
      }
    }
  }
  private hands(f: Figure, right: Vec, left: Vec) {
    this.reach(f, "R", right, V(0.6, -0.8, 0.25));
    this.reach(f, "L", left, V(-0.6, -0.8, 0.25));
  }
  private figureCount = 0;
  /**
   * A 1.85 m ballplayer facing local −Z. Joints (shoulders, hips) are groups so the animation
   * code can swing arms and legs; everything else hangs off the root.
   */
  private figure(shirt: string, cap: string, withBat = false, glove = !withBat): Figure {
    const root = new THREE.Group(),
      n = this.figureCount++,
      skins = ["#e0b28c", "#c99872", "#a8754f", "#e8c09c"],
      skin = new THREE.MeshStandardMaterial({ color: skins[n % skins.length], roughness: 0.55 }),
      cloth = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
      pants = cloth(shirt === "#eeeade" ? "#ece9df" : "#c9c7bf"),
      socks = cloth(cap),
      shoes = new THREE.MeshStandardMaterial({ color: "#1b1c1e", roughness: 0.5 }),
      part = (
        geo: THREE.BufferGeometry,
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
        parent: THREE.Object3D = root,
      ) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        m.receiveShadow = true;
        parent.add(m);
        return m;
      };
    // Torso: jersey with the number on the back (the texture's centre faces +Z after the turn).
    const jerseyMat = new THREE.MeshStandardMaterial({
      map: tex.jersey(shirt, cap, String([18, 7, 24, 3, 11, 52, 9, 31, 5, 27][n % 10])),
      roughness: 0.82,
    });
    // Torso turned on a lathe: waist, chest, rounded shoulders into the neck; flattened front to
    // back like a real chest. The jersey number sits on the back.
    const torsoProfile = [
      [0.165, 1.04],
      [0.178, 1.14],
      [0.205, 1.3],
      [0.215, 1.4],
      [0.2, 1.48],
      [0.15, 1.54],
      [0.07, 1.575],
      [0.05, 1.58],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const torso = part(new THREE.LatheGeometry(torsoProfile, 24), jerseyMat, 0, 0, 0);
    torso.rotation.y = Math.PI;
    torso.scale.z = 0.72;
    // Shoulders and sleeves are plain shirt cloth (the numbered texture is only for the torso).
    const sleeve = cloth(shirt);
    for (const x of [-0.2, 0.2])
      part(new THREE.SphereGeometry(0.082, 14, 10), sleeve, x, 1.45, 0).scale.set(1, 1, 0.9);
    part(new THREE.CylinderGeometry(0.178, 0.178, 0.05, 20), cloth("#24262a"), 0, 1.07, 0);
    const hips = part(new THREE.CylinderGeometry(0.18, 0.165, 0.2, 20), pants, 0, 0.96, 0);
    hips.scale.z = 0.85;
    part(new THREE.CylinderGeometry(0.055, 0.065, 0.1, 12), skin, 0, 1.6, 0);
    const head = part(new THREE.SphereGeometry(0.115, 20, 16), skin, 0, 1.73, 0);
    head.scale.set(0.92, 1.12, 1);
    // Ears and a hint of a nose so the head reads as a face from the side and front.
    for (const x of [-0.105, 0.105])
      part(new THREE.SphereGeometry(0.025, 8, 6), skin, x, 1.72, 0.005);
    part(new THREE.SphereGeometry(0.022, 8, 6), skin, 0, 1.71, -0.112);
    if (withBat) {
      // Batting helmet: glossy shell with an ear flap and a short bill.
      const helmet = new THREE.MeshStandardMaterial({
        color: cap,
        roughness: 0.28,
        metalness: 0.15,
      });
      part(
        new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI / 1.85),
        helmet,
        0,
        1.745,
        0.005,
      );
      const flap = part(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14), helmet, -0.12, 1.69, 0);
      flap.rotation.z = Math.PI / 2;
      part(new THREE.BoxGeometry(0.2, 0.014, 0.08), helmet, 0, 1.765, -0.15);
    } else {
      const capMat = cloth(cap);
      part(
        new THREE.SphereGeometry(0.124, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        capMat,
        0,
        1.765,
        0,
      );
      const bill = part(
        new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, 0, Math.PI),
        capMat,
        0,
        1.77,
        -0.07,
      );
      bill.rotation.y = Math.PI / 2;
      bill.scale.z = 1.25;
    }
    // Arms hang from the shoulder joint: sleeve, forearm, hand.
    // Arms: shoulder joint → upper arm (sleeve) → elbow joint → forearm and hand. Poses are set
    // by reach() (two-bone IK), so hands go exactly where the motion needs them.
    const arm = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, BaseballField.SHOULDER_Y, 0);
      root.add(g);
      part(new THREE.CapsuleGeometry(0.06, 0.18, 4, 10), sleeve, 0, -0.13, 0, g);
      const e = new THREE.Group();
      e.position.y = -BaseballField.UPPER_ARM;
      g.add(e);
      part(new THREE.SphereGeometry(0.052, 10, 8), skin, 0, 0, 0, e);
      part(new THREE.CapsuleGeometry(0.044, 0.17, 4, 10), skin, 0, -0.13, 0, e);
      part(new THREE.SphereGeometry(0.046, 10, 8), skin, 0, -BaseballField.FOREARM, 0, e);
      return { g, e };
    };
    const L = arm(-BaseballField.SHOULDER_X),
      R = arm(BaseballField.SHOULDER_X),
      left = L.g,
      right = R.g;
    // Glove on the left hand: a deep brown leather pocket.
    if (glove) {
      const mitt = part(
        new THREE.SphereGeometry(0.1, 14, 10),
        new THREE.MeshStandardMaterial({ color: "#7a4a26", roughness: 0.6 }),
        0,
        -BaseballField.FOREARM - 0.03,
        -0.02,
        L.e,
      );
      mitt.scale.set(0.75, 1.15, 0.55);
    }
    // Legs swing from the hip: pants to below the knee, stirrup socks, cleats pointing forward.
    const leg = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, 0.93, 0);
      root.add(g);
      // Thigh, then the knee joint carrying the shin, stirrup sock and cleat.
      part(new THREE.CapsuleGeometry(0.088, 0.3, 4, 10), pants, 0, -0.21, 0, g);
      const k = new THREE.Group();
      k.position.y = -0.44;
      g.add(k);
      part(new THREE.CapsuleGeometry(0.068, 0.1, 4, 10), pants, 0, -0.04, 0, k);
      part(new THREE.CapsuleGeometry(0.058, 0.24, 4, 10), socks, 0, -0.22, 0, k);
      part(new THREE.BoxGeometry(0.11, 0.08, 0.27), shoes, 0, -0.44, -0.05, k);
      return { g, k };
    };
    const LL = leg(-0.105),
      LR = leg(0.105),
      legL = LL.g,
      legR = LR.g;
    let bat: THREE.Mesh | undefined;
    if (withBat) {
      // Ash bat held at the knob end: the mesh's origin is the hands, the barrel runs along +Y.
      const wood = new THREE.MeshStandardMaterial({ color: "#d8b07a", roughness: 0.45 });
      bat = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.013, 0.86, 14), wood);
      bat.geometry.translate(0, 0.36, 0);
      bat.castShadow = true;
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 12), wood);
      knob.position.y = -0.07;
      bat.add(knob);
      root.add(bat);
    }
    return {
      root,
      left,
      right,
      elbowL: L.e,
      elbowR: R.e,
      legL,
      legR,
      kneeL: LL.k,
      kneeR: LR.k,
      bat,
      jersey: jerseyMat.map!,
    };
  }
  private pointerMove = (e: PointerEvent) => {
    this.aimFromPointer(e);
  };
  private pointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.aimFromPointer(e);
    if (this.engine.batting) this.engine.swing();
    else this.engine.throwAt();
  };
  private aimFromPointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    const target = new THREE.Vector3();
    if (
      this.raycaster.ray.intersectPlane(this.plane, target) &&
      Math.abs(target.x) < 1.3 &&
      target.y > -0.1 &&
      target.y < 2.3
    )
      this.engine.setAim(target.x, target.y);
  }
  /** `real`: wall-clock seconds (fast-forward passes the sped-up `dt`; replays use real time). */
  update(dt: number, real = dt) {
    this.replayClock += real;
    if (this.disposed || !this.host.clientWidth || !this.host.clientHeight) return;
    this.time += dt;
    const s = this.engine.state,
      f0 = s.flight;
    let cam = s.camera;
    // Auto camera follows the ball, after a short look at the bat meeting it (close views).
    if (
      s.phase === "inplay" &&
      s.autoCamera &&
      !(
        s.live?.kind === "batted" &&
        s.live.elapsed < BAT_FOLLOW - 0.04 &&
        (cam === "catcher" || cam === "pitcher")
      )
    )
      cam = "ball";
    const key = cam + this.host.clientWidth / this.host.clientHeight;
    const narrow = this.host.clientWidth < 600;
    let pos = new THREE.Vector3(),
      look = new THREE.Vector3(),
      fov = 32;
    // Rundown (auto camera): close on the runner and the ball; slow motion → on the glove.
    const lv = s.live,
      rd = s.phase === "inplay" && s.autoCamera ? lv?.rundown : undefined,
      rdRunner = rd && lv ? lv.runners.find((r) => r.id === rd.runnerId) : undefined,
      rundownCam =
        !!rd &&
        !!lv &&
        !!rdRunner &&
        (rd.end === undefined || (rd.tagAt !== undefined && lv.elapsed < rd.tagAt + RULES.tagHold)),
      slow = this.engine.timeScale < 1;
    if (rundownCam && lv && rdRunner) {
      const rp = runnerPose(rdRunner).position,
        b = s.ball,
        mid = V((rp.x + b.x) / 2, 0, (rp.z + b.z) / 2),
        spread = Math.hypot(rp.x - b.x, rp.z - b.z),
        // From the infield side (toward the mound), looking out at the base path.
        ix = 0 - mid.x,
        iz = 19 - mid.z,
        n = Math.hypot(ix, iz) || 1;
      const glove = slow
        ? this.avatars?.get(this.players[lv.fielder])?.ballPoint(new THREE.Vector3())
        : null;
      if (glove) {
        const back = 3.6;
        pos.set(glove.x + (ix / n) * back, glove.y + 1.1, glove.z + (iz / n) * back);
        look.set((glove.x + rp.x) / 2, Math.max(0.6, glove.y - 0.2), (glove.z + rp.z) / 2);
        fov = 36;
      } else {
        const back = Math.max(9, spread * 0.8 + 6);
        pos.set(mid.x + (ix / n) * back, 3.5 + spread * 0.12, mid.z + (iz / n) * back);
        look.set(mid.x, 1, mid.z);
        fov = 42;
      }
    } else if (cam === "pitcher") {
      pos.set(-1.4, 2.75, 24.4);
      look.set(0, 1, 0);
      fov = narrow ? 36 : 27;
    } else if (cam === "catcher") {
      pos.set(0, 1.95, -5.3);
      // Aim slightly low so the strike zone sits above the bottom HUD.
      look.set(0, 0.3, 18.44);
      fov = 39;
    } else if (cam === "broadcast") {
      pos.set(53, 37, -24);
      look.set(0, 0, 28);
      fov = 51;
    } else if (cam === "top") {
      // Low overhead view from behind home: the whole diamond large, the outfield still in frame.
      pos.set(0, 66, -30);
      look.set(0, 0, 44);
      fov = 56;
    } else {
      const b = s.ball;
      pos.set(b.x * 0.42 + 25, Math.max(25, b.y + 17), b.z * 0.45 - 18);
      look.set(b.x * 0.7, Math.max(1, b.y * 0.4), b.z * 0.7 + 8);
      fov = 56;
    }
    // Development only: browser tests can park the camera anywhere for close-ups.
    const devCam = import.meta.env.DEV
      ? (window as unknown as { __cam?: [number, number, number, number, number, number, number] })
          .__cam
      : undefined;
    if (devCam) {
      pos.set(devCam[0], devCam[1], devCam[2]);
      look.set(devCam[3], devCam[4], devCam[5]);
      fov = devCam[6];
    }
    // (dt is slowed down in slow motion; the camera still moves at its own pace.)
    const k =
      this.cameraKey !== key || devCam
        ? 1
        : Math.min(1, (dt / Math.max(0.05, this.engine.timeScale)) * (rundownCam ? 3.5 : 5));
    this.camera.position.lerp(pos, k);
    this.camera.lookAt(look);
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.cameraKey = key;
    const swing = Math.sin(this.time * 18);
    // Arms pump opposite to the legs while running, elbows near 90°.
    const runArms = (p: Figure) =>
      this.hands(
        p,
        V(0.26, 1.12 + 0.1 * Math.max(0, swing), -0.08 - 0.24 * swing),
        V(-0.26, 1.12 + 0.1 * Math.max(0, -swing), -0.08 + 0.24 * swing),
      );
    const runLegs = (p: Figure, phase = swing) => {
      p.legL.rotation.x = phase * 0.7;
      p.legR.rotation.x = -phase * 0.7;
      // The trailing leg's shin kicks up behind; the leading one is nearly straight.
      p.kneeL.rotation.x = -(0.2 + 0.55 * (1 - phase));
      p.kneeR.rotation.x = -(0.2 + 0.55 * (1 + phase));
    };
    const stand = (p: Figure) => {
      p.legL.rotation.set(0, 0, 0);
      p.legR.rotation.set(0, 0, 0);
      p.kneeL.rotation.x = 0;
      p.kneeR.rotation.x = 0;
      p.root.position.y = 0;
    };
    // Name tags: position + name of whoever is on defense now (our team or the rival school).
    const fielders = this.engine.fielders,
      // Far cameras (broadcast, ball, top) get larger names; close ones keep them small.
      far = cam === "broadcast" || cam === "ball" || cam === "top",
      tagH = (narrow ? 1.3 : 1) * (far ? 0.044 : 0.026);
    this.tags.forEach((t, i) => {
      const p = fielders[i],
        text = p ? playerLabel(p) : "";
      if (t.text !== text) {
        t.text = text;
        const m = t.sprite.material;
        m.map?.dispose();
        m.map = nameTag(text);
        m.needsUpdate = true;
        const img = m.map.image as HTMLCanvasElement;
        t.sprite.userData.aspect = img.width / img.height;
      }
      // Only while the ball is in play (not during the pitcher–batter duel), and never for
      // the player the camera is standing behind.
      t.sprite.visible =
        s.nameTags &&
        s.mode === "match" &&
        (s.phase === "inplay" || (s.phase === "result" && !!s.live)) &&
        !(cam === "pitcher" && i === 0) &&
        !(cam === "catcher" && i === 1);
      t.sprite.scale.set(tagH * (t.sprite.userData.aspect ?? 4), tagH, 1);
    });
    this.players.forEach((p, i) => {
      const pos = s.phase === "inplay" && s.live ? s.live.defenders[i] : DEFENSE[i];
      p.root.position.set(pos.x, 0, pos.z);
      p.root.visible = true;
      p.root.rotation.set(0, i === 1 ? Math.PI : 0, 0);
      stand(p);
      // Ready position: glove out in front, throwing hand relaxed.
      this.hands(p, V(0.3, 1.0, -0.12), V(-0.27, 1.08, -0.24));
    });
    const pitcher = this.players[0];
    const cocked = V(0.42, 1.74, 0.24);
    if (s.mode !== "batting" && s.phase === "ready" && !this.engine.batting) {
      // Set position: ball hidden in the glove at the chest.
      this.hands(pitcher, V(0.02, 1.28, -0.25), V(-0.05, 1.3, -0.27));
    } else if (s.phase === "windup" && !this.engine.batting) {
      const u = clamp(1 - s.timer / 0.62, 0, 1);
      // Leg kick, then the front leg strides out and lands where the release pose starts,
      // so there is no jump between the wind-up and the release.
      pitcher.legL.rotation.x = curve(
        [
          [0, 0],
          [0.42, 1.35],
          [0.78, 0.95],
          [1, 0.6],
        ],
        u,
      );
      pitcher.kneeL.rotation.x = curve(
        [
          [0, 0],
          [0.42, -1.7],
          [0.78, -0.95],
          [1, -0.35],
        ],
        u,
      );
      pitcher.kneeR.rotation.x = curve(
        [
          [0, 0],
          [0.42, -0.18],
          [1, 0],
        ],
        u,
      );
      pitcher.root.rotation.x = -0.08 * Math.sin(u * Math.PI);
      this.hands(
        pitcher,
        spline(
          [
            [0, V(0.02, 1.28, -0.25)],
            [0.4, V(0.0, 1.4, -0.22)],
            [0.7, V(0.36, 0.98, 0.16)],
            [1, cocked],
          ],
          u,
        ),
        spline(
          [
            [0, V(-0.05, 1.3, -0.27)],
            [0.4, V(-0.04, 1.42, -0.24)],
            [1, V(-0.16, 1.5, -0.55)],
          ],
          u,
        ),
      );
    } else if (
      (s.phase === "flight" || (s.phase === "result" && !s.live)) &&
      f0 &&
      !this.engine.batting
    ) {
      // Release out in front, then follow through across the body; front leg planted.
      // The finish is held through the call, then the pose eases back (pose smoothing).
      const k = s.phase === "result" ? 1 : clamp(f0.elapsed / 0.34, 0, 1),
        e = smooth(k);
      pitcher.root.rotation.x = 0.28 * e;
      pitcher.legL.rotation.x = 0.6;
      pitcher.kneeL.rotation.x = -0.35;
      pitcher.legR.rotation.x = -0.5 * e;
      pitcher.kneeR.rotation.x = -0.9 * e;
      this.hands(
        pitcher,
        spline(
          [
            [0, cocked],
            [0.3, V(0.3, 1.86, -0.38)],
            [0.62, V(0.0, 1.2, -0.5)],
            [1, V(-0.22, 0.86, -0.38)],
          ],
          k,
        ),
        spline(
          [
            [0, V(-0.16, 1.5, -0.55)],
            [0.35, V(-0.1, 1.3, -0.3)],
            [1, V(-0.2, 1.2, -0.06)],
          ],
          k,
        ),
      );
    }
    const catcher = this.players[1];
    // Full crouch: thighs forward and spread, shins folded under.
    if (s.phase !== "inplay" || s.live?.fielder !== 1) {
      catcher.root.position.y = -0.5;
      catcher.legL.rotation.set(1.35, 0, -0.35);
      catcher.legR.rotation.set(1.35, 0, 0.35);
      catcher.kneeL.rotation.x = -2.35;
      catcher.kneeR.rotation.x = -2.35;
      catcher.root.rotation.x = -0.12;
    }
    // Catcher presents the glove as a target.
    this.hands(catcher, V(0.22, 0.95, -0.12), V(-0.12, 1.25, -0.42));
    // From the catcher camera the catcher model would hide the zone and the incoming ball.
    catcher.root.visible = cam !== "catcher" || s.phase === "inplay";
    const hand = this.engine.batter.hand === "L" ? -1 : 1;
    // A new batter from the other side: jump to his stance instead of turning around.
    if (hand !== this.lastHand) {
      this.lastHand = hand;
      this.poseMemory = new WeakMap();
    }
    this.batter.root.position.set(hand * 0.82, -0.04, 0);
    // Athletic stance: feet wider than the shoulders, knees soft.
    this.batter.legL.rotation.set(0.12, 0, -0.16);
    this.batter.legR.rotation.set(0.12, 0, 0.16);
    this.batter.kneeL.rotation.x = -0.3;
    this.batter.kneeR.rotation.x = -0.3;
    // Left-handed batters are the mirror image: bat and hands on the other side.
    this.batter.root.scale.x = hand;
    this.batter.jersey.repeat.x = hand;
    const f = s.flight;
    // The batter leaves the box only on a batted ball (not on a steal, pickoff or wild pitch).
    this.batter.root.visible =
      s.mode !== "bullpen" && !(s.phase === "inplay" && s.live?.kind === "batted");
    // Swing clock in render time: starts when the player swings (or, for the AI batter, when
    // its swing is decided at the plate, already partway so the bat meets the ball there).
    // A miss still plays the whole swing and follow-through; a new pitch resets it.
    if (f && (f.swung || f.aiSwing) && this.swingFlight !== f) {
      this.swingFlight = f;
      this.swingStart = this.time - (f.aiSwing && !f.swung ? SWING_TIME * 0.45 : 0);
    } else if (!f || (f !== this.swingFlight && (s.phase === "ready" || s.phase === "windup")))
      this.swingFlight = null;
    const since = this.swingFlight ? this.time - this.swingStart : Infinity,
      // 0 = stance … 1 = follow-through; after the hold the batter settles back into the stance.
      su = since <= SWING_TIME + SWING_HOLD ? clamp(since / SWING_TIME, 0, 1) : 0;
    // Batting: both hands on the handle (left hand lower). Load (hands back), then the bat
    // comes through level over the plate (fastest at contact) and wraps over the front shoulder.
    this.batter.root.rotation.y =
      (hand * Math.PI) / 2 +
      hand *
        curve(
          [
            [0, 0],
            [0.2, -0.12],
            [0.5, 0.45],
            [0.75, 0.82],
            [1, 0.9],
          ],
          su,
        );
    // Stride: the front leg lifts a little on the load and plants before contact.
    this.batter.legL.rotation.x = curve(
      [
        [0, 0.12],
        [0.18, 0.42],
        [0.42, 0.18],
        [1, 0.1],
      ],
      su,
    );
    this.batter.kneeL.rotation.x = curve(
      [
        [0, -0.3],
        [0.18, -0.7],
        [0.42, -0.15],
        [1, -0.1],
      ],
      su,
    );
    this.batter.kneeR.rotation.x = curve(
      [
        [0, -0.3],
        [0.5, -0.45],
        [1, -0.6],
      ],
      su,
    );
    const grip = spline(
        [
          [0, V(0.17, 1.4, -0.14)],
          [0.2, V(0.22, 1.46, -0.04)],
          [0.5, V(-0.02, 1.1, -0.42)],
          [0.78, V(-0.24, 1.3, -0.3)],
          [1, V(-0.28, 1.42, -0.1)],
        ],
        su,
      ),
      // Bat direction along the same smooth path (normalised), so it never pauses at contact.
      dir = spline(
        [
          [0, V(0.4, 0.82, 0.4)],
          [0.2, V(0.5, 0.75, 0.55)],
          [0.5, V(-0.3, 0.06, -0.95)],
          [0.78, V(-0.6, 0.35, -0.2)],
          [1, V(-0.35, 0.55, 0.76)],
        ],
        su,
      ),
      up = new THREE.Vector3(0, 1, 0);
    const bat = this.batter.bat!;
    bat.position.set(grip.x, grip.y, grip.z);
    bat.quaternion.setFromUnitVectors(up, new THREE.Vector3(dir.x, dir.y, dir.z).normalize());
    const along = new THREE.Vector3(0, 1, 0).applyQuaternion(bat.quaternion);
    this.hands(
      this.batter,
      V(grip.x + along.x * 0.09, grip.y + along.y * 0.09, grip.z + along.z * 0.09),
      grip,
    );
    if (s.live && s.phase === "inplay") {
      const l = s.live,
        p = this.players[l.fielder],
        target = l.throw ? l.throw.to : l.bounced ? l.land : l.catchPoint;
      p.root.rotation.set(
        0,
        playerYaw(V(target.x - l.fielderPos.x, 0, target.z - l.fielderPos.z)),
        0,
      );
      if (l.fieldedAt === null) {
        runLegs(p);
        runArms(p);
      } else if (l.state === "송구") this.hands(p, cocked, V(-0.2, 1.4, -0.48));
      else this.hands(p, V(0.05, 1.3, -0.3), V(-0.06, 1.32, -0.32));
      if (l.caughtFly) this.hands(p, V(0.28, 1.05, -0.12), V(-0.18, 2.0, -0.36));
      this.landing.visible = l.fieldedAt === null;
      this.landing.position.set(l.land.x, 0.1, l.land.z);
    } else this.landing.visible = false;
    this.runners.forEach((r, i) => {
      r.root.visible = false;
      stand(r);
      // Lead-off stance by default: knees soft, hands out in front.
      this.hands(r, V(0.3, 0.98, -0.2), V(-0.3, 0.98, -0.2));
      const l = s.live;
      this.runnerMoving[i] = false;
      this.runnerSlide[i] = -1;
      this.runnerTracks[i] = null;
      const show = (
        pose: ReturnType<typeof runnerPose>,
        track?: { progress: number; target: number; stealing?: boolean },
      ) => {
        this.runnerMoving[i] = pose.moving;
        // The rules decide the slide (it moves where he touches the bag); the picture follows.
        // (Once: a runner standing on the bag after his slide does not slide again.)
        const slide = (track as RunnerTrack | undefined)?.slide,
          live = s.live;
        if (
          track &&
          slide &&
          slide.base === track.target &&
          !!live &&
          live.elapsed - slide.at < 0.5
        )
          this.runnerSlide[i] = 1;
        r.root.visible = pose.visible;
        r.root.position.set(pose.position.x, 0, pose.position.z);
        r.root.rotation.y = playerYaw(pose.facing);
        if (pose.moving) {
          runLegs(r, Math.sin(this.time * 18 + i));
          runArms(r);
        }
      };
      if (l && s.phase === "inplay") {
        const track = l.runners.find((r) => r.id === i);
        if (track) {
          this.runnerTracks[i] = track;
          const pose = runnerPose(track),
            rd = l.rundown;
          // Tagged at the end of a rundown: he stays in the picture while it sinks in.
          if (
            track.out &&
            rd?.runnerId === track.id &&
            rd.tagAt !== undefined &&
            l.elapsed < rd.tagAt + RULES.tagHold + 0.05
          ) {
            pose.visible = true;
            pose.moving = false;
          }
          // Sliding: his body stops where his foot (hand) meets the bag, not on top of it,
          // until he gets up.
          const sl = track.slide;
          if (sl && sl.base === track.target) {
            const up =
                sl.kind === "dive"
                  ? 2.15
                  : (CLIP_KEYS.slideEnd - CLIP_KEYS.slideFrom) / CLIP_KEYS.slideRate,
              d = touchDistance(sl.kind) / BASE_PATH_LENGTH;
            if (l.elapsed - sl.at < up) {
              const back = track.progress > sl.base,
                hold = back
                  ? Math.max(track.progress, sl.base + d)
                  : Math.min(track.progress, sl.base - d);
              if (hold !== track.progress) {
                const held = runnerPose({ ...track, progress: hold });
                pose.position = held.position;
              }
            }
          }
          show(pose, track);
        }
      } else if (s.stealTrack && i === s.stealTrack.from - 1) {
        // The E-steal runner breaks during the delivery.
        show({ ...runnerPose(s.stealTrack), visible: true, moving: true }, s.stealTrack);
      } else if (i < 3 && s.bases[i]) {
        r.root.visible = true;
        r.root.position.set(BASES[i].x + 0.65, 0, BASES[i].z);
        r.root.rotation.y = 0;
      }
    });
    this.ball.position.set(s.ball.x, s.ball.y, s.ball.z);
    this.holdBall();
    // Hit by pitch: the ball drops off the batter and rolls a little.
    if (s.phase === "result" && !s.live && s.hbp && s.lastOutcome === "HitByPitch") {
      const t = this.time - this.hbpAt;
      this.ball.position.set(
        s.hbp.x + Math.min(t, 1.2) * 0.4 * Math.sign(s.hbp.x),
        Math.max(0.04, s.hbp.y - 4.9 * t * t),
        s.hbp.z + Math.min(t, 1.2) * 0.6,
      );
    }
    this.hitboxes.update(dt, this.camera);
    // A knuckleball barely spins (that is why it flutters): only a slow tumble.
    if (s.phase === "flight" || s.phase === "inplay")
      this.ball.rotation.x +=
        dt * (s.phase === "flight" && s.flight && pitchData(s.flight.pitch).flutter ? 1.2 : 30);
    this.ball.visible = s.phase === "flight" || s.phase === "inplay" || s.phase === "result";
    const ballDistance = this.camera.position.distanceTo(this.ball.position);
    // The ball is drawn about twice its real size (and bigger far away) so it reads on screen,
    // the same size all the way in. (v11.17 shrank it to real size near the plate so close
    // calls read right from the catcher's view; the sudden shrink looked wrong and made the
    // ball hard to hit, so the close-call text "존에서 N cm 빠짐" explains those calls instead.)
    this.ball.scale.setScalar(Math.max(1, ballDistance / 18));
    this.halo.position.copy(this.ball.position);
    this.halo.quaternion.copy(this.camera.quaternion);
    this.halo.scale.copy(this.ball.scale);
    this.halo.visible = this.ball.visible && s.phase !== "result";
    this.zone.visible = s.phase !== "inplay" && (cam === "pitcher" || cam === "catcher");
    this.target.visible = this.zone.visible && s.phase !== "result";
    const aim = s.flight && !this.engine.batting ? s.flight.aim : s.aim;
    this.target.position.set(aim.x, aim.y, 0.03);
    // When batting, the aim ring shows how far the bat may miss and still connect.
    this.target.scale.setScalar(
      this.engine.batting ? batReach(formOf(this.engine.batter).contact, s.swingStyle) / 0.09 : 1,
    );
    const hint = this.engine.batting && s.flight ? s.flight.hint : null;
    this.hint.visible =
      !!hint && (s.phase === "windup" || s.phase === "flight") && cam !== "top" && cam !== "ball";
    if (hint) {
      this.hint.position.set(hint.x, hint.y, 0.025);
      this.hint.scale.setScalar(hint.r);
    }
    if (this.lastPhase !== s.phase) {
      this.trailPositions = [];
      this.lastPhase = s.phase;
    }
    // Pitch speed made visible: fast pitches leave a longer, brighter, white-hot trail,
    // slow ones a short faint one (0 at 120 km/h or below, 1 at 165 km/h and up).
    const heat = s.phase === "flight" && f ? Math.min(1, Math.max(0, (f.speed - 120) / 45)) : 0.4;
    const lh = s.live,
      held =
        s.phase === "inplay" &&
        !!lh &&
        (lh.throw ? lh.throw.receivedAt !== null : lh.fieldedAt !== null);
    // A held ball has no tail: the throw starts a fresh one (no kink from the pickup).
    if (held) this.trailPositions = [];
    else if (s.phase === "flight" || s.phase === "inplay") {
      this.trailPositions.push(this.ball.position.clone());
      const keep = s.phase === "flight" ? Math.round(12 + heat * 34) : 26;
      while (this.trailPositions.length > keep) this.trailPositions.shift();
    } else this.trailPositions = [];
    this.trail.geometry.dispose();
    this.trail.geometry = new THREE.BufferGeometry().setFromPoints(this.trailPositions);
    const material = this.trail.material as THREE.LineBasicMaterial;
    material.color.set(pitchData(f?.pitch ?? s.selected).color).lerp(HOT, heat * 0.7);
    if (s.phase === "flight" && f && f.speed >= 180) material.color.set("#4fb6ff");
    material.opacity = 0.4 + heat * 0.6;
    // Ease the pitcher's and batter's joints toward this frame's pose, so phase changes
    // (set → wind-up → release → back to the set, swing → stance) never snap.
    if (this.avatars) this.driveAvatars(dt, cam);
    this.updateWeather(dt);
    this.updateEffects(dt);
    // Only the drawn image is smoothed: the computed pose is put back after rendering, so the
    // next frame's pose code never reads a blended (re-decomposed) rotation.
    const rate = 1 - Math.exp(-dt * 26),
      restore: [THREE.Object3D, THREE.Euler][] = [];
    this.smoothPose(this.players[0], rate, restore);
    // After a swing the batter settles back into the stance more slowly (about half a second).
    const settling =
      this.time - this.swingStart > SWING_TIME + SWING_HOLD && this.time - this.swingStart < 2;
    this.smoothPose(this.batter, settling ? 1 - Math.exp(-dt * 7) : rate, restore);
    this.renderer.render(this.scene, this.camera);
    this.renderReplay();
    // Restore the exact angles (Euler), not a quaternion: re-reading a turn past 90° as Euler
    // angles flips x and z, which made the batter shake on every swing.
    for (const [j, e] of restore) j.rotation.copy(e);
  }
  dispose() {
    this.disposed = true;
    this.hitboxes.dispose();
    this.resize.disconnect();
    this.renderer.domElement.removeEventListener("pointermove", this.pointerMove);
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDown);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((v) => {
          const map = (v as THREE.MeshStandardMaterial).map;
          if (map) map.dispose();
          v.dispose();
        });
      }
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
