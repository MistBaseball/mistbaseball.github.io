/**
 * Mixamo player model + baseball animations for the 3D field.
 *
 * Assets (public/models): player.glb (one skinned character, "Ch06") and anims.glb (24 clips
 * on the same skeleton, named after the source files: pitch_r, swing_l, run, diving_r, ...).
 * Each on-field player gets a clone with its own AnimationMixer. The game never reads the
 * animations back: it only shows them, so rules and timings stay in engine.ts.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { BAT_STYLE, rainbowRGB } from "./custom";

export type ClipName =
  | "throw"
  | "bunt_l"
  | "bunt_r"
  | "catch"
  | "catcher_idle"
  | "diving_l"
  | "diving_r"
  | "ground_catch"
  | "idle"
  | "idle_bat_l"
  | "idle_bat_r"
  | "jump_catch"
  | "pitch_l"
  | "pitch_r"
  | "run"
  | "slide"
  | "swing_l"
  | "swing_r"
  | "turn180"
  | "trip"
  | "fall_flat"
  | "run_turn"
  | "hit_high"
  | "hit_mid";

/**
 * Key moments of each clip (seconds), measured from the files (dev-avatar.html):
 * the pitch leaves the hand at 0.93 s, the bat meets the ball at 0.92 s, and so on.
 */
export const CLIP_KEYS = {
  pitchRelease: 0.93,
  pitchEnd: 2.3,
  swingContact: 1.0,
  /** Bat wrapped over the shoulder; later frames drop the bat to run. */
  swingFinish: 1.2,
  buntSquare: 1.05,
  throwRelease: 1.45,
  throwStart: 1.0,
  throwEnd: 2.2,
  catchMoment: 0.55,
  /** Planned catch: the glove comes up from here (0.4 s before the ball). */
  catchStart: 0.15,
  groundPickup: 0.72,
  diveLaunch: 0.55,
  /** Planned dive: the clip starts here at take-off (a short gather before the launch). */
  diveStart: 0.42,
  /** Stretched out in the air: where the glove meets the ball. */
  diveReach: 0.9,
  diveDown: 1.75,
  diveUp: 3.0,
  jumpCatch: 1.35,
  /** Planned leap: glove up, crouch and take-off from here (0.6 s before the catch). */
  jumpStart: 0.75,
  jumpEnd: 1.9,
  slideDown: 0.3,
  /** Slide on a clock: starts at slideFrom, runs at slideRate (×clip speed); flat on the bag
   * around 0.45–0.6, pushes up from slideGetUp, stands at slideEnd. */
  slideFrom: 0.1,
  slideRate: 1.15,
  slideGetUp: 0.7,
  slideEnd: 1.18,
  /** Runner turning back (rundown, run_turn): plant, low spin, first strides the other way. */
  turnFrom: 0.2,
  turnTo: 1.05,
  /** Hit by pitch, at the plate while the call is shown: each clip from the moment the ball
   *  lands (its idle lead-in skipped) to the end of the reaction (head: just before the fall;
   *  body: doubled over). A ball off the legs or feet has no reaction. */
  hitHighFrom: 0.3,
  hitHigh: 0.98,
  hitMidFrom: 0.2,
  hitMid: 1.35,
  /** Dodging a tag into the bag (trip): take-off at dodgeFrom, flat on the ground at dodgeDown;
   *  then the dive clip's get-up (diveDown → diveUp). */
  dodgeFrom: 0.1,
  dodgeDown: 0.75,
  /** Runner tripping: stumble at fallFrom, flat on his face at fallDown. */
  fallFrom: 0.45,
  fallDown: 1.5,
};

export type AvatarAssets = {
  template: THREE.Object3D;
  clips: Map<ClipName, THREE.AnimationClip>;
  /** Team uniform textures: the navy outfit repainted (home cream, away terracotta). */
  uniforms: { home: THREE.Material[]; away: THREE.Material[] };
  /** An outfit in any colour, skin tone and pattern (made once, then kept). */
  outfit: (color: string, skin: number, pattern?: string, trim?: string) => THREE.Material[];
};

/** Time for the moving patterns (rainbow, aurora): the field sets it every frame. */
export const PATTERN_TIME = { value: 0 };

/**
 * Pattern code for the outfit material. `P` is the vertex in the model's own pose (cm after ×100; y up,
 * arms along x); `k` says how much of the pattern colour `pc` shows. Only cloth pixels count
 * (the mask), and the cloth's own shading is kept.
 */
const PATTERN_GLSL: Record<string, string> = {
  stripes: "k = step(0.8, fract(P.x * 0.2));",
  band: "k = step(0.78, fract(P.y * 0.09));",
  check: "k = abs(step(0.5, fract(P.x * 0.1)) - step(0.5, fract(P.y * 0.1)));",
  twotone: "k = smoothstep(24.0, 27.0, abs(P.x));",
  dots: "k = step(length(fract(P.xy * 0.15) - 0.5), 0.23);",
  fade: "k = smoothstep(55.0, 150.0, P.y);",
  aurora: "k = 0.5 + 0.5 * sin(P.y * 0.06 + P.x * 0.03 + uTime * 1.2);",
  rainbow:
    "k = 1.0; pc = 0.5 + 0.5 * cos(6.28318 * (P.y * 0.007 + P.x * 0.004 + uTime * 0.25 + vec3(0.0, 0.3333, 0.6667)));",
};

/** Cloth pixels (1) vs skin, trim, shoes and cap (0), by the same test as `repaint`. */
function clothMask(source: THREE.Texture) {
  const img = source.image as CanvasImageSource & { width: number; height: number },
    canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height),
    px = data.data;
  let cloth = 0;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i],
      gg = px[i + 1],
      b = px[i + 2],
      max = Math.max(r, gg, b),
      on = !(max > 92 || r > b + 6);
    const v = on ? Math.min(255, ((92 - max) / 22) * 255) : 0;
    if (on) cloth++;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = source.flipY;
  return { texture: t, cloth };
}

/** Puts a pattern on an outfit material (a shader patch; the material stays a standard one). */
function patternize(m: THREE.MeshStandardMaterial, mask: THREE.Texture, pattern: string, color: THREE.Color, trim: string) {
  const code = PATTERN_GLSL[pattern];
  if (!code) return;
  const base = (color.r + color.g + color.b) / 3 || 0.05,
    trimColor = new THREE.Color(trim);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.patMask = { value: mask };
    shader.uniforms.uTime = PATTERN_TIME;
    shader.uniforms.uTrim = { value: trimColor };
    shader.uniforms.uBase = { value: base * 0.95 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPat;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPat = transformed;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vPat;\nuniform sampler2D patMask;\nuniform float uTime;\nuniform vec3 uTrim;\nuniform float uBase;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        {
          vec3 P = vPat * 100.0;
          float cloth = texture2D(patMask, vMapUv).r;
          float shade = clamp(dot(diffuseColor.rgb, vec3(0.3333)) / uBase, 0.45, 1.5);
          vec3 pc = uTrim;
          float k = 0.0;
          ${code}
          diffuseColor.rgb = mix(diffuseColor.rgb, pc * shade, clamp(k, 0.0, 1.0) * cloth);
        }`,
      );
  };
  m.customProgramCacheKey = () => `pattern-${pattern}`;
}

/** Every bone name in the model starts with this prefix (three.js drops the ':'). */
const BONE = "mixamorig9";

/**
 * The clips were made with root motion; the game moves the players itself, so keep only
 * the hips' height (dives and slides still go down to the ground) and pin x/z to frame 0.
 */
function stripRootMotion(clip: THREE.AnimationClip) {
  for (const t of clip.tracks) {
    if (!t.name.endsWith("Hips.position")) continue;
    const v = t.values,
      x0 = v[0],
      z0 = v[2];
    for (let i = 0; i < v.length; i += 3) {
      v[i] = x0;
      v[i + 2] = z0;
    }
  }
}

/**
 * Repaints the dark navy outfit in a team colour, keeping the cloth's shading. Skin, the
 * white trim, the shoes and the cap stay as they are.
 */
function repaint(source: THREE.Texture, color: string): THREE.Texture {
  const img = source.image as CanvasImageSource & { width: number; height: number },
    canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, canvas.width, canvas.height),
    px = data.data,
    team = new THREE.Color(color);
  const tr = team.r * 255,
    tg = team.g * 255,
    tb = team.b * 255;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i],
      gg = px[i + 1],
      b = px[i + 2],
      max = Math.max(r, gg, b),
      min = Math.min(r, gg, b);
    // Navy / near-black cloth: dark and not warm (skin and the red parts are warm).
    if (max > 92 || r > b + 6) continue;
    const lum = (r + gg + b) / 3,
      // Soft edge so seams do not show a hard line.
      w = Math.min(1, (92 - max) / 22) * (max - min < 40 ? 1 : 0.5),
      shade = Math.min(1.25, 0.58 + lum / 70);
    px[i] = r + (tr * shade - r) * w;
    px[i + 1] = gg + (tg * shade - gg) * w;
    px[i + 2] = b + (tb * shade - b) * w;
  }
  g.putImageData(data, 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.flipY = source.flipY;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export async function loadAvatarAssets(base = import.meta.env.BASE_URL): Promise<AvatarAssets> {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),
    [player, anims] = await Promise.all([
      loader.loadAsync(`${base}models/player.glb`),
      loader.loadAsync(`${base}models/anims.glb`),
    ]);
  const clips = new Map<ClipName, THREE.AnimationClip>();
  for (const c of anims.animations) {
    stripRootMotion(c);
    clips.set(c.name as ClipName, c);
  }
  const template = player.scene;
  // Materials in mesh order, then a home and an away copy with the outfit repainted.
  const originals: THREE.MeshStandardMaterial[] = [];
  template.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
    originals.push(m.material as THREE.MeshStandardMaterial);
  });
  // Repainted cloth is made once per colour; a skin tone only changes the body material's tint.
  const cloth = new Map<string, THREE.Texture[]>(),
    outfits = new Map<string, THREE.Material[]>();
  // Where the cloth is (made once), and which of the materials is the outfit.
  let masks: { texture: THREE.Texture; cloth: number }[] | null = null;
  const clothMasks = () =>
    (masks ??= originals.map((m) => (m.map ? clothMask(m.map) : { texture: null!, cloth: 0 })));
  const paint = (color: string) => {
    let maps = cloth.get(color);
    if (!maps) cloth.set(color, (maps = originals.map((m) => (m.map ? repaint(m.map, color) : null!))));
    return maps;
  };
  const outfit = (color: string, skin = 1, pattern = "", trim = "#ffffff") => {
    const key = `${color}|${skin}|${pattern}|${pattern ? trim : ""}`;
    let mats = outfits.get(key);
    if (!mats) {
      const maps = paint(color);
      mats = originals.map((m, i) => {
        const c = m.clone();
        if (maps[i]) c.map = maps[i];
        // The first material is the body (skin and hair); the second is the outfit.
        if (i === 0) c.color.multiplyScalar(skin);
        c.roughness = 0.85;
        c.metalness = 0;
        return c;
      });
      if (pattern) {
        const ms = clothMasks(),
          at = ms.reduce((best, m, i) => (m.cloth > ms[best].cloth ? i : best), 0);
        patternize(mats[at] as THREE.MeshStandardMaterial, ms[at].texture, pattern, new THREE.Color(color), trim);
      }
      outfits.set(key, mats);
    }
    return mats;
  };
  return {
    template,
    clips,
    uniforms: { home: outfit("#ece6d6"), away: outfit("#b4563c") },
    outfit,
  };
}

/** A leather glove for the glove hand (procedural, small). */
function makeGlove() {
  const leather = new THREE.MeshStandardMaterial({ color: "#7a4a24", roughness: 0.7 }),
    g = new THREE.Group(),
    pocket = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), leather);
  pocket.scale.set(1, 1.25, 0.45);
  pocket.position.set(0, 0.09, 0.03);
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 0.07, 4, 8), leather);
  thumb.position.set(0.075, 0.05, 0.03);
  thumb.rotation.z = -0.6;
  g.add(pocket, thumb);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}
/** A wooden bat, handle at the origin, barrel along +Y. */
function makeBat() {
  const wood = new THREE.MeshStandardMaterial({ color: "#c79a5b", roughness: 0.5 }),
    bat = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.014, 0.86, 12), wood);
  bat.position.y = 0.36;
  bat.castShadow = true;
  const g = new THREE.Group();
  g.add(bat);
  return g;
}

export class Avatar {
  readonly object: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private current: ClipName | null = null;
  private meshes: THREE.SkinnedMesh[] = [];
  private team: "home" | "away" | null = null;
  readonly rightHand: THREE.Object3D;
  readonly leftHand: THREE.Object3D;
  private glove: THREE.Object3D | null = null;
  private bat: THREE.Object3D | null = null;
  /** Grip points (base of the middle finger) of the bat's bottom and top hands. */
  private grip: [THREE.Object3D, THREE.Object3D] | null = null;
  private batDir = new THREE.Vector3(0, 1, 0);
  /** Bat pose relative to the bottom hand, captured while both hands hold it. */
  private batInHand = new THREE.Matrix4();
  private batHeld = false;
  private throwHand: THREE.Object3D | null = null;

  constructor(private assets: AvatarAssets) {
    this.object = SkeletonUtils.clone(assets.template);
    this.object.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) this.meshes.push(m);
    });
    this.mixer = new THREE.AnimationMixer(this.object);
    for (const [name, clip] of assets.clips) this.actions.set(name, this.mixer.clipAction(clip));
    this.rightHand = this.object.getObjectByName(`${BONE}RightHand`)!;
    this.leftHand = this.object.getObjectByName(`${BONE}LeftHand`)!;
  }
  private outfitKey = "";
  /**
   * The team's outfit; `look` gives it a colour of its own (`uniform`) and a skin tone factor
   * (`skin`, 1 = as modelled).
   */
  setTeam(
    team: "home" | "away",
    look?: { uniform?: string; skin?: number; pattern?: string; trim?: string },
  ) {
    const color = look?.uniform || "",
      skin = look?.skin ?? 1,
      pattern = look?.pattern || "",
      trim = look?.trim || "#ffffff",
      key = `${team}|${color}|${skin}|${pattern}|${trim}`;
    if (key === this.outfitKey) return;
    this.outfitKey = key;
    this.team = team;
    const mats =
      !color && skin === 1 && !pattern
        ? this.assets.uniforms[team]
        : this.assets.outfit(color || (team === "home" ? "#ece6d6" : "#b4563c"), skin, pattern, trim);
    this.meshes.forEach((m, i) => (m.material = mats[i % mats.length]));
  }
  /** Height and build (1 = as modelled); the feet stay on the ground. */
  setBuild(height = 1, width = 1) {
    this.object.scale.set(width, height, width);
  }
  /** Bones live in centimetre-scaled parents: attached props need the inverse scale. */
  private attach(prop: THREE.Object3D, bone: THREE.Object3D) {
    bone.add(prop);
    this.object.updateMatrixWorld(true);
    const s = new THREE.Vector3();
    bone.getWorldScale(s);
    prop.scale.setScalar(1 / Math.max(1e-6, s.x));
  }
  /** Glove on the left hand (right-handed thrower) or the right hand. */
  setGlove(on: boolean, leftHanded = false) {
    if (!on) {
      if (this.glove) this.glove.visible = false;
      return;
    }
    const hand = leftHanded ? this.rightHand : this.leftHand;
    // The ball sits at the base of the middle finger (world units, whatever the bone scale).
    const side = leftHanded ? "Left" : "Right";
    this.throwHand =
      this.object.getObjectByName(`${BONE}${side}HandMiddle1`) ??
      (leftHanded ? this.leftHand : this.rightHand);
    if (!this.glove) this.glove = makeGlove();
    if (this.glove.parent !== hand) this.attach(this.glove, hand);
    this.glove.visible = true;
  }
  /**
   * Bat held in both hands: it runs from the bottom hand through the top hand, so it follows
   * any clip (stance, swing, bunt) without per-clip calibration.
   */
  private batMat: THREE.MeshStandardMaterial | null = null;
  private batShown = "";
  /** A bought bat skin ("" = the wooden bat); moving ones need the clock (`time`, s). */
  setBatSkin(id: string, time = 0) {
    const m = this.batMat,
      s = BAT_STYLE[id];
    if (!m) return;
    if (s?.anim) m.color.setRGB(...rainbowRGB(time * 0.3));
    else if (this.batShown === id) return;
    else {
      m.color.set(s?.color ?? "#c79a5b");
      m.metalness = s?.metal ? 0.85 : 0;
      m.roughness = s?.metal ? 0.28 : 0.5;
    }
    this.batShown = id;
  }
  setBat(on: boolean, leftHanded = false) {
    if (!on) {
      if (this.bat) this.bat.visible = false;
      this.grip = null;
      return;
    }
    if (!this.bat) {
      this.bat = makeBat();
      this.object.add(this.bat);
      this.batMat = (this.bat.children[0] as THREE.Mesh).material as THREE.MeshStandardMaterial;
    }
    const g = (side: string) =>
      this.object.getObjectByName(`${BONE}${side}HandMiddle1`) ??
      (side === "Left" ? this.leftHand : this.rightHand);
    // A right-handed batter has the left hand at the knob and the right hand above it.
    this.grip = leftHanded ? [g("Right"), g("Left")] : [g("Left"), g("Right")];
    this.bat.visible = true;
  }
  private placeBat() {
    if (!this.bat || !this.grip || !this.bat.visible) return;
    this.object.updateMatrixWorld(true);
    const lo = this.object.worldToLocal(this.grip[0].getWorldPosition(new THREE.Vector3())),
      hi = this.object.worldToLocal(this.grip[1].getWorldPosition(new THREE.Vector3())),
      d = hi.clone().sub(lo),
      len = d.length(),
      // The bottom hand (left for a right-handed batter) in this avatar's space.
      hand = new THREE.Matrix4()
        .copy(this.object.matrixWorld)
        .invert()
        .multiply(this.grip[0].matrixWorld);
    if (len < 0.3) {
      // Both hands on the handle: the bat runs from the bottom hand through the top hand.
      if (len > 0.03) this.batDir.copy(d.divideScalar(len));
      this.bat.position.copy(lo).addScaledVector(this.batDir, -0.04);
      this.bat.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this.batDir);
      this.bat.scale.setScalar(1);
      this.bat.updateMatrix();
      // Remember how the bat sits in the bottom hand for the one-handed finish.
      this.batInHand.copy(hand).invert().multiply(this.bat.matrix);
      this.batHeld = true;
    } else if (this.batHeld) {
      // Top hand let go (follow-through): the bat stays in the bottom hand at that angle.
      new THREE.Matrix4()
        .multiplyMatrices(hand, this.batInHand)
        .decompose(this.bat.position, this.bat.quaternion, this.bat.scale);
    }
  }

  /**
   * Shows a clip. `time` scrubs it to an exact moment (synchronised moves such as the pitch
   * or the swing); without it the clip plays on its own (`loop` for run/idle). Changing clips
   * cross-fades for `fade` seconds.
   */
  play(
    name: ClipName,
    opts: { time?: number; loop?: boolean; speed?: number; fade?: number; offset?: number } = {},
  ) {
    const a = this.actions.get(name);
    if (!a) return;
    if (this.current !== name) {
      const prev = this.current ? this.actions.get(this.current) : null;
      a.reset();
      a.setLoop(opts.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = true;
      if (opts.offset) a.time = opts.offset % a.getClip().duration;
      a.play();
      if (prev && prev !== a) a.crossFadeFrom(prev, opts.fade ?? 0.18, false);
      this.current = name;
    }
    if (opts.time !== undefined) {
      a.time = Math.min(Math.max(0, opts.time), a.getClip().duration - 1e-3);
      a.timeScale = 0;
    } else a.timeScale = opts.speed ?? 1;
  }
  /** Where a held ball sits: in the glove's pocket, or in the throwing hand while throwing. */
  ballPoint(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.glove?.visible) return null;
    if (this.current === "throw" && this.throwHand) return this.throwHand.getWorldPosition(out);
    return this.glove.localToWorld(out.set(0, 0.09, 0.07));
  }
  get clip() {
    return this.current;
  }
  /** Playback position of the current clip (s). */
  get clipTime() {
    return this.current ? (this.actions.get(this.current)?.time ?? 0) : 0;
  }
  /** Freezes on one exact frame (no blending): used to replay recorded frames. */
  pose(name: ClipName, time: number) {
    const a = this.actions.get(name);
    if (!a) return;
    this.mixer.stopAllAction();
    a.reset().play();
    a.setEffectiveWeight(1);
    a.time = Math.min(Math.max(0, time), a.getClip().duration - 1e-3);
    a.timeScale = 0;
    this.current = name;
    this.mixer.update(0);
    this.placeBat();
  }
  update(dt: number) {
    this.mixer.update(dt);
    this.placeBat();
  }
  dispose() {
    this.mixer.stopAllAction();
    this.object.removeFromParent();
  }
}
