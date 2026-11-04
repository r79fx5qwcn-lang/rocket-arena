// Physics constants. Units are Unreal Units (uu, 1 uu ≈ 1 cm), seconds, radians,
// exactly like Rocket League. Values come from community reverse engineering of
// Rocket League (RLBot wiki, RocketSim, Chip's papers on car/ball physics).
//
// World axes used by the engine (Three.js friendly):
//   X = width of the field, Y = up, Z = length (blue goal at -Z, orange goal at +Z)
// Car local axes: +X forward, +Y up, +Z right.
import { Curve } from './math.js';

export const TICK_RATE = 120;
export const DT = 1 / TICK_RATE;
export const UU_TO_M = 0.01; // render scale

export const GRAVITY = 650;

// ---------- Arena ----------
export const ARENA = {
  HALF_W: 4096,       // side walls at x = ±4096
  HALF_L: 5120,       // back walls at z = ±5120
  HEIGHT: 2044,
  CORNER_R: 1400,     // vertical rounded corners (approximation of RL chamfered corners)
  FILLET_R: 520,      // floor/wall and wall/ceiling transition radius (wall riding)
  GOAL_HALF_W: 893,
  GOAL_H: 643,
  GOAL_DEPTH: 880,
  GOAL_FLOOR_R: 300,  // floor/wall transition radius inside the goals and at the posts
  GOAL_TAPER: 1100,   // the back wall transition grows from GOAL_FLOOR_R to FILLET_R over this width
  GOAL_CORNER_R: 400, // plan radius of the back corners of the goals
  POST_BLEND: 260,    // rounding of the goal posts in plan
};

// ---------- Ball ----------
export const BALL = {
  RADIUS: 91.25,
  VISUAL_RADIUS: 92.75,
  MASS: 30,
  MAX_SPEED: 6000,
  MAX_ANG_SPEED: 6,
  DRAG: 0.03,           // Bullet linear damping
  FRICTION: 0.35,
  RESTITUTION: 0.6,
};
BALL.INERTIA = 0.4 * BALL.MASS * BALL.RADIUS * BALL.RADIUS;

// ---------- Car (Octane hitbox) ----------
export const CAR = {
  MASS: 180,
  HITBOX_HALF: { x: 59.0, y: 18.08, z: 42.1 },  // forward, up, right half extents
  HITBOX_OFFSET: { x: 13.88, y: 20.75, z: 0 },   // hitbox center relative to the center of mass
  REST_HEIGHT: 17.01,
  MAX_SPEED: 2300,
  MAX_ANG_SPEED: 5.5,
  FLIP_MAX_ANG_SPEED: 10,
  SUPERSONIC_START: 2200,
  SUPERSONIC_MAINTAIN: 2100,

  // Wheels: connection points relative to center of mass (forward, up, right)
  WHEELS: [
    { x: 51.25, y: 23.6, z: -25.9, r: 12.5, front: true },  // front left
    { x: 51.25, y: 23.6, z: 25.9, r: 12.5, front: true },   // front right
    { x: -33.75, y: 20.755, z: -29.5, r: 15.0, front: false }, // back left
    { x: -33.75, y: 20.755, z: 29.5, r: 15.0, front: false },  // back right
  ],
  SUSP_REST: 38.755,
  SUSP_STIFFNESS: 18,     // acceleration units per uu of compression (per wheel)
  SUSP_DAMP_COMP: 2.4,
  SUSP_DAMP_RELAX: 3.4,
  SUSP_BUMPSTOP: 18,
  SUSP_BUMPSTOP_K: 14,

  // Driving
  BRAKE_ACCEL: 3500,
  COAST_ACCEL: 525,
  STOPPING_SPEED: 25,
  THROTTLE_AIR_ACCEL: 200 / 3,
  BOOST_ACCEL_GROUND: 2975 / 3,
  BOOST_ACCEL_AIR: 3175 / 3,
  BOOST_PER_SECOND: 100 / 3,
  BOOST_MIN_TIME: 0.1,
  BOOST_MAX: 100,
  BOOST_SPAWN: 33.3,
  POWERSLIDE_RISE: 5,
  POWERSLIDE_FALL: 2,

  // Jump
  JUMP_IMMEDIATE: 875 / 3,
  JUMP_ACCEL: 4375 / 3,
  JUMP_MIN_TIME: 0.025,
  JUMP_MAX_TIME: 0.2,
  JUMP_RESET_PAD: 1 / 40,
  DOUBLEJUMP_MAX_DELAY: 1.25,

  // Dodge / flip
  DODGE_DEADZONE: 0.5,
  FLIP_TORQUE_TIME: 0.65,
  FLIP_Z_DAMP_120: 0.35,
  FLIP_Z_DAMP_START: 0.15,
  FLIP_Z_DAMP_END: 0.21,
  FLIP_INITIAL_VEL: 500,
  FLIP_FORWARD_SCALE: 1,
  FLIP_SIDE_SCALE: 1.9,
  FLIP_BACKWARD_SCALE: 2.5,
  FLIP_BACKWARD_X_SCALE: 16 / 15,
  FLIP_TORQUE_ROLL: 260 * 0.09587 * 4,   // ≈100 rad/s²: a dodge reaches its max spin in ~0.1 s
  FLIP_TORQUE_PITCH: 224 * 0.09587 * 4,

  // Air control (Chip's measurements, rad/s²)
  AIR_TORQUE: { roll: 36.08, pitch: 12.15, yaw: 8.92 },
  AIR_DAMP: { roll: 4.47, pitch: 2.80, yaw: 1.89 },

  // Collision
  WORLD_RESTITUTION: 0.3,
  WORLD_FRICTION: 0.3,
  BALL_FRICTION: 2.0,
  BALL_RESTITUTION: 0.0,
  CAR_CAR_RESTITUTION: 0.1,
  CAR_CAR_FRICTION: 0.09,

  AUTOFLIP_IMPULSE: 200,
  AUTOFLIP_TIME: 0.4,
  AUTOROLL_FORCE: 100,
  AUTOROLL_TORQUE: 80,
  SELF_RIGHT_TORQUE: 16,  // rad/s² when lying on a side
  SELF_RIGHT_LIFT: 250,

  DEMO_RESPAWN_TIME: 3,
  BUMP_COOLDOWN: 0.25,
};

const hx = CAR.HITBOX_HALF.x * 2, hy = CAR.HITBOX_HALF.y * 2, hz = CAR.HITBOX_HALF.z * 2;
// Box inertia of the hitbox (diagonal, local axes: roll(x), yaw(y), pitch(z))
CAR.INERTIA = {
  x: CAR.MASS / 12 * (hy * hy + hz * hz),
  y: CAR.MASS / 12 * (hx * hx + hz * hz),
  z: CAR.MASS / 12 * (hx * hx + hy * hy),
};

// ---------- Curves ----------
// Throttle acceleration as a function of forward speed
export const DRIVE_ACCEL_CURVE = new Curve([[0, 1600], [1400, 160], [1410, 0]]);
// Front wheel steer angle as a function of forward speed (radians)
export const STEER_ANGLE_CURVE = new Curve([[0, 0.53356], [500, 0.31930], [1000, 0.18203], [1500, 0.10570], [1750, 0.08507], [3000, 0.03454]]);
export const POWERSLIDE_STEER_CURVE = new Curve([[0, 0.39235], [2500, 0.12610]]);
// Lateral friction as function of slip ratio
export const LAT_FRICTION_CURVE = new Curve([[0, 1], [1, 0.2]]);
// Handbrake (powerslide) multiplier on lateral friction
export const HANDBRAKE_LAT_FACTOR = 0.1;
export const HANDBRAKE_LONG_FACTOR_CURVE = new Curve([[0, 0.5], [1, 0.9]]);
// Friction factor when not throttling on a non-flat surface (slides down walls)
export const NON_STICKY_FRICTION_CURVE = new Curve([[0, 0.1], [0.7075, 0.5], [1, 1]]);

// Ball hit "Psyonix impulse"
export const BALL_HIT = {
  Z_SCALE: 0.35,
  FORWARD_SCALE: 0.65,
  MAX_DELTA_VEL: 4600,
  FACTOR_CURVE: new Curve([[0, 0.65], [500, 0.65], [2300, 0.55], [4600, 0.30]]),
};

// Bumps / demos
export const BUMP_VEL_GROUND_CURVE = new Curve([[0, 5 / 6], [1400, 1100], [2200, 1530]]);
export const BUMP_VEL_AIR_CURVE = new Curve([[0, 5 / 6], [1400, 1390], [2200, 1945]]);
export const BUMP_UPWARD_CURVE = new Curve([[0, 2 / 6], [1400, 278], [2200, 417]]);

// ---------- Boost pads (RL layout, converted: RL(x, y) -> (x, z)) ----------
export const BOOST_PADS = {
  BIG_AMOUNT: 100, SMALL_AMOUNT: 12,
  BIG_COOLDOWN: 10, SMALL_COOLDOWN: 4,
  BIG_RADIUS: 208, SMALL_RADIUS: 144,
  BIG: [[3072, -4096], [-3072, -4096], [3584, 0], [-3584, 0], [3072, 4096], [-3072, 4096]],
  SMALL: [
    [0, -4240], [-1792, -4184], [1792, -4184], [-940, -3308], [940, -3308], [0, -2816],
    [-3584, -2484], [3584, -2484], [-1788, -2300], [1788, -2300], [-2048, -1036], [0, -1024],
    [2048, -1036], [-1024, 0], [1024, 0], [-2048, 1036], [0, 1024], [2048, 1036],
    [-1788, 2300], [1788, 2300], [-3584, 2484], [3584, 2484], [0, 2816], [-940, 3308],
    [940, 3308], [-1792, 4184], [1792, 4184], [0, 4240],
  ],
};

// Kickoff spawns for the blue team (z < 0). Orange is mirrored.
export const KICKOFF_SPAWNS = [
  { x: -2048, z: -2560 }, { x: 2048, z: -2560 },
  { x: -256, z: -3840 }, { x: 256, z: -3840 },
  { x: 0, z: -4608 },
];
export const RESPAWN_SPOTS = [
  { x: -2304, z: -4608 }, { x: -2688, z: -4608 }, { x: 2304, z: -4608 }, { x: 2688, z: -4608 },
];
