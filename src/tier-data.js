/**
 * Tier classification engine for sync quality.
 * Binary search (right-bisect) over sorted threshold arrays.
 * 100 RTT tiers + 100 offset tiers + 12 watch guidance tiers = 212 total.
 * Logarithmic threshold distribution: dense where differences matter, sparse where they don't.
 */

// ─── Utilities ──────────────────────────────────────────────

export function bisectRight(thresholds, value) {
  let lo = 0;
  let hi = thresholds.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (thresholds[mid] <= value) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export function classify(thresholds, tiers, value) {
  const idx = bisectRight(thresholds, value);
  return tiers[Math.min(idx, tiers.length - 1)];
}

export function computeWatchScore(rtt, absOffset) {
  return (rtt / 2) + absOffset;
}

// ─── Verified Analogy Constants ─────────────────────────────
// Every value fact-checked against peer-reviewed sources.
// All descriptions MUST reference these instead of hardcoding numbers.

export const ANALOGY = {
  // ── Human Body ─────────────────────────────────────────────
  EYE_BLINK_MS: 150,              // voluntary blink, 100-400ms range (Harvard BioNumbers BNID 100706)
  REFLEX_BLINK_MS: 100,           // fastest reflex blink
  BLINK_REFLEX_INITIATION_MS: 12, // R1 component latency, 10-15ms range
  RETINA_RESPONSE_MS: 20,         // cone photoreceptor peak response
  VISUAL_REACTION_MS: 250,        // simple visual reaction time, textbook canonical
  FASTEST_CONSCIOUS_REACTION_MS: 120, // trained athletes, extreme minimum
  HEARTBEAT_MS: 800,              // resting 75bpm = 800ms/beat
  NERVE_VELOCITY_MS_PER_CM: 0.018,// myelinated peripheral nerve ~55m/s
  FINGER_TO_BRAIN_MS: 20,         // ~1m at 55m/s, sensory one-way
  FINGER_SNAP_MS: 7,              // Georgia Tech 2021, Journal of the Royal Society Interface
  KEY_HOLD_MS: 78,                // Aalto University 136M keystroke study, press-to-release

  // ── Animals ────────────────────────────────────────────────
  HOUSEFLY_WING_MS: 5,            // 200Hz, confirmed
  HONEYBEE_WING_MS: 4.2,          // 230-240Hz (PNAS)
  HUMMINGBIRD_WING_MS: 12,        // small species hovering, 50-80Hz range
  DRAGONFLY_WING_MS: 33,          // average 27-30Hz = 33-37ms
  SNAIL_MM_PER_SEC: 1,            // garden snail, confirmed

  // ── Physics ────────────────────────────────────────────────
  SPEED_OF_LIGHT_KM_PER_MS: 300,  // 299.792km/ms, standard rounding
  SPEED_OF_SOUND_M_PER_MS: 0.343, // at 20°C dry air, sea level
  EARTH_CIRCUMFERENCE_KM: 40075,  // WGS 84 equatorial
  MOON_RTT_MS: 2560,              // Earth-Moon light round-trip (~2.56s)

  // ── Technology ─────────────────────────────────────────────
  QUARTZ_OSCILLATION_MS: 0.0305,  // 32,768Hz standard watch crystal
  CAMERA_FLASH_MS: 1.5,           // full-power speedlight, 1.3-2.5ms range
  FRAME_60FPS_MS: 16.7,           // 1000/60
  FRAME_24FPS_MS: 41.7,           // 1000/24
  FRAME_144HZ_MS: 6.9,            // 1000/144
  FRAME_240HZ_MS: 4.2,            // 1000/240
  AUDIO_MONITORING_MS: 15,        // professional target 10-20ms
  LIP_SYNC_THRESHOLD_MS: 45,      // ITU detection threshold
};

// ─── Natural Fraction Algorithm ─────────────────────────────
// Converts milliseconds to the closest natural-sounding English fraction.
// Uses a denominator whitelist — no awkward fractions like "a seventh."

export function humanFraction(ms) {
  const seconds = ms / 1000;

  // Below 50ms: just say the number
  if (ms < 50) return `${Math.round(ms)} milliseconds`;
  // Above 10s: round to whole seconds
  if (seconds > 10) return `${Math.round(seconds)} seconds`;

  // Hard-coded exact matches for ultra-common values (within 5%)
  const exactMap = [
    [0.1,   'a tenth of a second'],
    [0.125, 'an eighth of a second'],
    [0.2,   'a fifth of a second'],
    [0.25,  'a quarter of a second'],
    [0.333, 'a third of a second'],
    [0.5,   'half a second'],
    [0.667, 'two thirds of a second'],
    [0.75,  'three quarters of a second'],
    [1.0,   'one second'],
    [1.5,   'a second and a half'],
    [2.0,   'two seconds'],
    [3.0,   'three seconds'],
    [5.0,   'five seconds'],
  ];

  for (const [val, label] of exactMap) {
    if (Math.abs(seconds - val) / val <= 0.05) return label;
  }

  // Denominator whitelist: only natural-sounding English fractions
  const denominators = [2, 3, 4, 5, 6, 8, 10];
  let bestLabel = null;
  let bestScore = Infinity;

  const ordinals = {
    2: 'half', 3: 'third', 4: 'quarter',
    5: 'fifth', 6: 'sixth', 8: 'eighth', 10: 'tenth',
  };
  const pluralOrdinals = {
    2: 'halves', 3: 'thirds', 4: 'quarters',
    5: 'fifths', 6: 'sixths', 8: 'eighths', 10: 'tenths',
  };
  const numeralWords = {
    1: 'one', 2: 'two', 3: 'three', 4: 'four',
    5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine',
  };

  for (const d of denominators) {
    const n = Math.round(seconds * d);
    if (n < 1 || n >= d) continue;

    const fracVal = n / d;
    const error = Math.abs(seconds - fracVal);
    // Complexity penalty: prefer simpler denominators among ties
    const penalty = 0.005 * (d - 2) / 8;
    const score = error + penalty;

    if (score < bestScore) {
      bestScore = score;
      if (n === 1) {
        const article = d === 8 ? 'an' : 'a';
        bestLabel = d === 2 ? 'half a second' : `${article} ${ordinals[d]} of a second`;
      } else {
        bestLabel = `${numeralWords[n]} ${pluralOrdinals[d]} of a second`;
      }
    }
  }

  // Use fraction if within 15% of actual value
  if (bestLabel && bestScore / seconds <= 0.15) {
    return bestLabel;
  }

  // Fallback: plain number
  if (seconds < 1) return `${Math.round(ms)} milliseconds`;
  if (seconds < 2) return `about ${seconds.toFixed(1)} seconds`;
  return `about ${Math.round(seconds)} seconds`;
}

// ─── RTT Tiers (100) ───────────────────────────────────────

export const RTT_THRESHOLDS = [
  0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5,
  6, 7, 8, 10, 12, 14, 16, 18, 20, 22,
  25, 28, 30, 33, 36, 40, 44, 48, 52, 56,
  60, 65, 70, 75, 80, 85, 90, 95, 100, 110,
  120, 130, 140, 150, 160, 175, 190, 200, 220, 250,
  275, 300, 325, 350, 375, 400, 450, 500, 550, 600,
  650, 700, 750, 800, 850, 900, 1000, 1100, 1250, 1500,
  1750, 2000, 2250, 2500, 3000, 3500, 4000, 5000, 6000, 7000,
  8000, 9000, 10000, 12000, 14000, 16000, 20000, 25000, 30000, 35000,
  40000, 50000, 60000, 75000, 90000, 120000, 180000, 300000, 600000, 3600000,
];

export const RTT_TIERS = [
  {
    label: 'Instantaneous',
    severity: 'exceptional',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. At this speed, light itself only traveled about ${Math.round(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km. The corrected time on screen is accurate to within ±${v.halfRtt}ms, which is beyond the threshold of any human perception.`,
  },
  {
    label: 'Instantaneous',
    severity: 'exceptional',
    analogies: ['quartz_oscillation'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is faster than a single tick of a 2GHz processor takes to complete a complex instruction. The on-screen time is accurate to within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Near-instant',
    severity: 'exceptional',
    analogies: ['quartz_oscillation'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. A quartz crystal in a wristwatch vibrates once every ${ANALOGY.QUARTZ_OSCILLATION_MS}ms, so this response arrived in about ${Math.round(v.rtt / ANALOGY.QUARTZ_OSCILLATION_MS)} crystal oscillations. The on-screen time's accuracy ceiling is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Near-instant',
    severity: 'exceptional',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Sound travels about ${(v.rtt * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(2)} meters in this time. The on-screen time's accuracy of ±${v.halfRtt}ms is essentially perfect for any practical purpose.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Light could circle a football field about ${Math.round(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS * 1000 / 100)} times in this interval. The time shown on screen is accurate to within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is faster than the time between frames on a 480Hz gaming monitor. The on-screen time's accuracy of ±${v.halfRtt}ms is well beyond what the human eye can detect.`,
  },
  {
    label: 'Outstanding',
    severity: 'excellent',
    analogies: ['hummingbird_wing'],
    domain: 'animal',
    description: v => `${v.rtt}ms round-trip. A hummingbird flaps its wings once every ${ANALOGY.HUMMINGBIRD_WING_MS}ms, so your server response arrived many times faster than a single wingbeat. The corrected time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Outstanding',
    severity: 'excellent',
    analogies: ['nerve_signal'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. Nerve signals in your body travel at roughly ${ANALOGY.NERVE_VELOCITY_MS_PER_CM}ms per centimeter, so in this time a signal would travel about ${(v.rtt / ANALOGY.NERVE_VELOCITY_MS_PER_CM).toFixed(0)}cm along a nerve fiber. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Superb',
    severity: 'excellent',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. Professional competitive gamers consider anything under 5ms to be elite-tier latency. The time on screen is synced to within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Superb',
    severity: 'excellent',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is faster than the click latency of most high-end gaming mice. The on-screen time's accuracy of ±${v.halfRtt}ms is outstanding.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    analogies: ['honeybee_wing'],
    domain: 'animal',
    description: v => `${v.rtt}ms round-trip. A honeybee flaps its wings once every ${ANALOGY.HONEYBEE_WING_MS}ms, so this response took about ${(v.rtt / ANALOGY.HONEYBEE_WING_MS).toFixed(1)} wingbeats. The corrected time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. In this time, light traveled roughly ${Math.round(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km, enough to cross a small country. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Very fast',
    severity: 'great',
    analogies: ['monitor_pixel'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is faster than the time it takes your monitor to switch a single pixel's color on most displays. The on-screen time's accuracy of ±${v.halfRtt}ms is excellent.`,
  },
  {
    label: 'Very fast',
    severity: 'great',
    analogies: ['light_distance'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. A camera flash typically lasts about ${ANALOGY.CAMERA_FLASH_MS}ms, so your entire server round-trip completed in roughly ${(v.rtt / ANALOGY.CAMERA_FLASH_MS).toFixed(1)} flash durations. The time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Very fast',
    severity: 'great',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. The fastest conscious human reactions are around ${ANALOGY.FASTEST_CONSCIOUS_REACTION_MS}ms, making this sync about ${Math.round(ANALOGY.FASTEST_CONSCIOUS_REACTION_MS / v.rtt)}x faster than your best possible reaction. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Fast',
    severity: 'great',
    analogies: ['hummingbird_wing'],
    domain: 'animal',
    description: v => `${v.rtt}ms round-trip. A hummingbird's wing completes one full beat in about ${ANALOGY.HUMMINGBIRD_WING_MS}ms, so your signal returned in just over one wingbeat. The time shown on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Fast',
    severity: 'great',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. One frame at 60fps takes ${ANALOGY.FRAME_60FPS_MS}ms, so this response arrived faster than your screen can even draw a single frame. The corrected time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Quick',
    severity: 'good',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is roughly one frame of a 60fps display. The time on screen is accurate to within ±${v.halfRtt}ms, which is invisible to the naked eye.`,
  },
  {
    label: 'Quick',
    severity: 'good',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. A typical LED light flickers in about 10ms, and your response arrived in a comparable blink. The on-screen time's accuracy of ±${v.halfRtt}ms is more than sufficient.`,
  },
  {
    label: 'Quick',
    severity: 'good',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is similar to the input lag on a high-end gaming keyboard. The on-screen time's accuracy of ±${v.halfRtt}ms is great for everyday timekeeping.`,
  },
  {
    label: 'Above average',
    severity: 'good',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. In competitive online gaming, this latency would be considered very playable. The time shown on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Above average',
    severity: 'good',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Light traveled about ${Math.round(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km during this exchange, roughly the distance from London to Paris. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Above average',
    severity: 'good',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. A 24fps film frame lasts ${ANALOGY.FRAME_24FPS_MS}ms, so your sync completed faster than a single movie frame. The on-screen time's accuracy of ±${v.halfRtt}ms is solid.`,
  },
  {
    label: 'Good',
    severity: 'good',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. This is well under the threshold where humans start to perceive delays (about 50ms). The time shown on screen is accurate to within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Good',
    severity: 'good',
    analogies: ['dragonfly_wing'],
    domain: 'animal',
    description: v => `${v.rtt}ms round-trip. A dragonfly's wing completes a full stroke in about ${ANALOGY.DRAGONFLY_WING_MS}ms. Your sync took about ${(v.rtt / ANALOGY.DRAGONFLY_WING_MS).toFixed(1)} wing strokes. The time shown on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Good',
    severity: 'good',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. At this speed, the time server could be several thousand kilometers away and still deliver excellent accuracy. The time on screen is synced to within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Good',
    severity: 'good',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. This is roughly how long it takes sound to travel ${(v.rtt * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(0)} meters through air. The on-screen time's accuracy of ±${v.halfRtt}ms is perfectly fine.`,
  },
  {
    label: 'Solid',
    severity: 'good',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. About ${(v.rtt / ANALOGY.FRAME_24FPS_MS).toFixed(1)} frames at cinema's 24fps standard. The time shown on screen is accurate to ±${v.halfRtt}ms, well within useful range.`,
  },
  {
    label: 'Solid',
    severity: 'good',
    analogies: ['audio_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. Professional audio engineers target under ${ANALOGY.AUDIO_MONITORING_MS}ms for live monitoring, so this sync is in a comparable range. The on-screen time's accuracy of ±${v.halfRtt}ms is solid.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. You are right at the edge of human perceptible delay. The on-screen time's accuracy of ±${v.halfRtt}ms is still well under one tenth of a second.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is about ${(v.rtt / ANALOGY.FRAME_60FPS_MS).toFixed(0)} frames on a 60fps display. The on-screen time's accuracy of ±${v.halfRtt}ms means it could be off by that amount in either direction.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    analogies: ['key_hold'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. A single keypress lasts about ${ANALOGY.KEY_HOLD_MS}ms from press to release, so your sync completed in less than one keystroke. The time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Light traveled about ${Math.round(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km during this exchange, roughly from New York to Boston. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. This is about half the duration of a typical eye blink (which takes around ${ANALOGY.EYE_BLINK_MS}ms). The corrected time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. Roughly ${(v.rtt / ANALOGY.FRAME_24FPS_MS).toFixed(1)} frames of a 24fps movie. The on-screen time's accuracy of ±${v.halfRtt}ms is still good for general timekeeping.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    analogies: ['housefly_wing'],
    domain: 'animal',
    description: v => `${v.rtt}ms round-trip. A housefly beats its wings once every ${ANALOGY.HOUSEFLY_WING_MS}ms, which means about ${Math.round(v.rtt / ANALOGY.HOUSEFLY_WING_MS)} wingbeats passed during this sync. The time shown on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Sound traveled about ${Math.round(v.rtt * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters in this time, roughly the length of a concert hall. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Below average',
    severity: 'fair',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is approaching the threshold where latency becomes noticeable in everyday computing tasks. The time on screen is still accurate to within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Below average',
    severity: 'fair',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. About ${(v.rtt / ANALOGY.FRAME_60FPS_MS).toFixed(0)} frames at 60fps. The on-screen time's accuracy of ±${v.halfRtt}ms is still under a tenth of a second, which works fine for setting a watch.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. Now past the 100ms mark, delays at this range start to feel sluggish in interactive applications. The on-screen time's accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. This is about ${(v.rtt / ANALOGY.EYE_BLINK_MS).toFixed(1)} eye blinks. The ±${v.halfRtt}ms accuracy means the time on screen could be off by over a tenth of a second.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. In online gaming, this would be considered laggy. The time on screen is still accurate to within ±${v.halfRtt}ms, just over a tenth of a second.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Light could have traveled ${Math.round(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km, roughly the distance across multiple US states. The time shown on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. This is close to the average human reaction time to a visual stimulus (about ${ANALOGY.VISUAL_REACTION_MS}ms). The on-screen time's accuracy of ±${v.halfRtt}ms is starting to become noticeable.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. A single eye blink takes about ${ANALOGY.EYE_BLINK_MS}ms, so this sync took about ${(v.rtt / ANALOGY.EYE_BLINK_MS).toFixed(1)} blinks. The time on screen is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. Your connection to the time server has some significant latency. Consider switching to a closer network if on-screen accuracy beyond ±${v.halfRtt}ms matters to you.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['remote_desktop'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This is roughly the delay you feel when using a remote desktop over a decent connection. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    analogies: ['lip_sync'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. At this latency, the uncertainty window of ±${v.halfRtt}ms means the second shown on screen might occasionally appear to jump or stall briefly.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. This is about ${(v.rtt / ANALOGY.VISUAL_REACTION_MS).toFixed(1)}x the average human reaction time. The on-screen time's accuracy of ±${v.halfRtt}ms means you are approaching a quarter-second of uncertainty.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. If you were playing an online game, this would be noticeably laggy. The time on screen is accurate to ±${v.halfRtt}ms. Wifi or cellular congestion may be the cause.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Sound would travel about ${Math.round(v.rtt * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters in this time, nearly the length of a city block. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. The sync took about a quarter of a second. The time on screen is accurate to ±${v.halfRtt}ms. Try a wired connection for better results.`,
  },
  {
    label: 'Poor',
    severity: 'poor',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. At this latency, the accuracy ceiling of ±${v.halfRtt}ms means the time on screen could be off by roughly a third of a second. A faster network would help significantly.`,
  },
  {
    label: 'Poor',
    severity: 'poor',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. This is over twice the average human reaction time. The ±${v.halfRtt}ms uncertainty is now clearly visible if you compare against another clock.`,
  },
  {
    label: 'Poor',
    severity: 'poor',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. Your network added about ${(v.rtt / ANALOGY.EYE_BLINK_MS).toFixed(0)} eye-blinks worth of delay to the sync. The on-screen time is accurate to ±${v.halfRtt}ms. Closing bandwidth-heavy apps may help.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. The time server response took over a third of a second. The on-screen time's accuracy of ±${v.halfRtt}ms is enough that you might notice the seconds digit lagging behind reality.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['light_distance', 'earth_circumference'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. In this time, light could have circled the Earth about ${(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(1)} times. The ±${v.halfRtt}ms accuracy window is significant.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. This much latency suggests a congested network, a distant server, or a VPN adding overhead. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. Half a second of round-trip time means the on-screen time's accuracy is limited to ±${v.halfRtt}ms. Consider syncing again when your connection improves.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['heartbeat'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. A heartbeat takes about ${ANALOGY.HEARTBEAT_MS}ms, so this sync took roughly ${(v.rtt / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. The on-screen time's accuracy of ±${v.halfRtt}ms is notable.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms round-trip. Sound would have traveled about ${Math.round(v.rtt * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters, over half a kilometer. The accuracy ceiling of ±${v.halfRtt}ms means the time on screen may visibly differ from true atomic time.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms round-trip. At this point, each sync attempt is taking almost a full second. The time on screen is accurate to ±${v.halfRtt}ms at best. Network quality is the bottleneck.`,
  },
  {
    label: 'Bad',
    severity: 'poor',
    analogies: ['heartbeat'],
    domain: 'biology',
    description: v => `${v.rtt}ms round-trip. The response took about ${(v.rtt / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. With ±${v.halfRtt}ms of uncertainty, the seconds on screen may be off by close to a full second.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Over a full second of delay. The on-screen time's accuracy is limited to ±${v.halfRtt}ms. Your network connection appears to be under heavy load.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    analogies: ['light_distance', 'earth_circumference'],
    domain: 'physics',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Light could have circled the entire Earth ${(v.rtt * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(1)} times during this sync. The ±${v.halfRtt}ms accuracy is quite coarse.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At this latency, even simple web pages would feel sluggish. The on-screen time's accuracy of ±${v.halfRtt}ms means it could easily be off by a second or more.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This much delay is typical of severely congested wifi, satellite internet, or a very distant server. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    analogies: ['heartbeat'],
    domain: 'biology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Multiple heartbeats passed while waiting for the time server. With ±${v.halfRtt}ms uncertainty, the seconds shown on screen are unreliable.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. The accuracy window of ±${v.halfRtt}ms (over a second) means the seconds on screen are essentially a rough estimate. Try resyncing on a better connection.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Sound traveled about ${(v.rtt * ANALOGY.SPEED_OF_SOUND_M_PER_MS / 1000).toFixed(1)}km in this time. The on-screen time's ±${v.halfRtt}ms accuracy means minutes are reliable, but seconds are approximate.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At nearly two full seconds of delay, the sync is barely useful for second-level accuracy. The ±${v.halfRtt}ms uncertainty is substantial. Try a different network.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This level of latency is usually caused by satellite links, extreme network congestion, or intercontinental routing issues. The on-screen time is accurate to only ±${v.halfRtt}ms.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Over two seconds of latency makes second-level accuracy impossible. The ±${v.halfRtt}ms uncertainty means the time on screen is approximate. Only the minute is reliable.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At this latency, your connection to the time server is severely impaired. The on-screen time's accuracy of ±${v.halfRtt}ms means you can trust the hour and minute, but not the seconds.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. The signal traveled for over two seconds each way. With ±${v.halfRtt}ms uncertainty, the time on screen is only accurate to the nearest few seconds at best.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['mars_delay'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This is similar to the delay on a deep-space communication relay. The on-screen time is accurate to ±${v.halfRtt}ms. Check your internet connection and try syncing again.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['heartbeat'],
    domain: 'biology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Three or more seconds of delay. The ±${v.halfRtt}ms accuracy window is enormous. Only the minute hand would be trustworthy on an analog clock at this precision.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At ${(v.rtt / 1000).toFixed(1)} seconds of latency, your connection is barely maintaining contact with the time server. The on-screen time is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Multiple seconds of network delay suggest a nearly broken connection. The ±${v.halfRtt}ms uncertainty makes seconds meaningless. Try a different network entirely.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['snail_speed'],
    domain: 'animal',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. A snail moves about ${ANALOGY.SNAIL_MM_PER_SEC}mm per second, and it would have crawled ${(v.rtt / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(1)}mm during this sync. The on-screen time's accuracy of ±${v.halfRtt}ms means only minutes are reliable.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Your network took over five seconds to complete the time sync. With ±${v.halfRtt}ms of uncertainty, the time on screen is effectively guessing at the seconds.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['moon_rtt'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At this latency, the time server might as well be on the Moon (Earth-Moon round-trip is about ${(ANALOGY.MOON_RTT_MS / 1000).toFixed(1)} seconds). The on-screen time is accurate to ±${v.halfRtt}ms. The connection is severely degraded.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Seven seconds of delay means your internet connection is hanging on by a thread. The ±${v.halfRtt}ms accuracy makes the seconds on screen meaningless.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['mars_delay'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This is approaching Mars rover communication delays. The on-screen time's ±${v.halfRtt}ms accuracy means only the hour and minute should be trusted.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Nearly ten seconds to reach a time server and back. With ±${v.halfRtt}ms of uncertainty, you are better off using your device's built-in clock until your network recovers.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Over ten seconds of latency. The ±${v.halfRtt}ms accuracy window is so large that this sync provides almost no value over your device's local clock.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At ${(v.rtt / 60000).toFixed(1)} minutes of delay, your connection appears to be timing out repeatedly. The on-screen time's accuracy of ±${v.halfRtt}ms makes the seconds and even the minute unreliable.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This level of latency is usually caused by a proxy, captive portal, or network that is actively throttling connections. The on-screen time is accurate to ±${v.halfRtt}ms. Try a different network.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Your connection took over 20 seconds. The on-screen time's ±${v.halfRtt}ms uncertainty is measured in tens of seconds. Only the hour is trustworthy.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Half a minute of latency. The sync is essentially useless for timekeeping purposes. With ±${v.halfRtt}ms of uncertainty, your device's local clock is more accurate.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Over half a minute of network delay. At ±${v.halfRtt}ms of uncertainty, the sync result is not meaningful. Your connection may be intermittently dropping.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Nearly a minute of delay. The ±${v.halfRtt}ms accuracy window is so wide that the sync cannot provide useful time information. Check if your internet is working at all.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Over a minute to reach a time server. At this point, the ±${v.halfRtt}ms uncertainty spans entire minutes. The sync is not providing usable data.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['moon_rtt'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. A signal to the Moon and back takes ${(ANALOGY.MOON_RTT_MS / 1000).toFixed(1)} seconds. Your time sync took ${(v.rtt / ANALOGY.MOON_RTT_MS).toFixed(0)}x longer than that. The on-screen time's accuracy of ±${v.halfRtt}ms is not meaningful.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['mars_delay'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. At this extreme latency, your network connection is effectively non-functional for real-time data. The ±${v.halfRtt}ms accuracy window spans multiple minutes.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['moon_rtt'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. An hour of round-trip delay. The concept of "syncing" is meaningless at this timescale. With ±${v.halfRtt}ms of uncertainty, the result is pure noise. Your connection is not working.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Two minutes or more of latency. The sync data is completely stale by the time it arrives. With ±${v.halfRtt}ms uncertainty, only the hour display can be trusted.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Five minutes of delay. This is beyond any reasonable network timeout. The ±${v.halfRtt}ms uncertainty means the sync is entirely meaningless. Your device clock is far more accurate.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Ten or more minutes of latency. At ±${v.halfRtt}ms of uncertainty, the sync cannot tell you anything useful about the current time. Something is fundamentally broken with your network.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    analogies: ['moon_rtt'],
    domain: 'space',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Over an hour of delay. This is not a network connection, it is a timeout. With ±${v.halfRtt}ms of uncertainty, please verify you have an active internet connection and try again.`,
  },
];

// ─── Offset Tiers (100) ────────────────────────────────────

export const OFFSET_THRESHOLDS = [
  0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4,
  5, 6, 7, 8, 10, 12, 14, 16, 18, 20,
  23, 25, 28, 30, 35, 40, 45, 50, 55, 60,
  70, 80, 90, 100, 115, 130, 150, 175, 200, 225,
  250, 300, 350, 400, 450, 500, 600, 700, 800, 1000,
  1200, 1500, 1750, 2000, 2500, 3000, 3500, 4000, 5000, 6000,
  7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 60000,
  75000, 90000, 120000, 150000, 180000, 240000, 300000, 450000, 600000, 900000,
  1200000, 1800000, 2700000, 3600000, 5400000, 7200000, 10800000, 14400000, 21600000, 43200000,
  86400000, 172800000, 345600000, 604800000, 1209600000, 2592000000, 5184000000, 15768000000, 31536000000, 315360000000,
];

export const OFFSET_TIERS = [
  // ── Tier 0: ≤0.1ms — Perfect ──
  {
    label: 'Perfect',
    severity: 'exceptional',
    analogies: ['quartz_oscillation'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. Your device clock is ${v.direction} atomic time by less than a tenth of a millisecond — just ${(v.absOffset / ANALOGY.QUARTZ_OSCILLATION_MS).toFixed(1)} quartz crystal oscillations. This is physically near the limit of what network sync can measure. The time shown on screen has been corrected and is essentially flawless.`,
    alt: {
      analogies: ['light_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms. Your device clock is ${v.direction} atomic time by less than a tenth of a millisecond. Light travels only about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS).toFixed(0)}km in this interval. The time shown on screen has been corrected and is essentially flawless.`,
    },
  },
  // ── Tier 1: ≤0.25ms — Perfect ──
  {
    label: 'Perfect',
    severity: 'exceptional',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.sign}${v.absOffset}ms. A quarter of a millisecond ${v.direction} atomic time. Light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this interval. Your device clock is extraordinarily accurate, and the time shown on screen has been corrected to match.`,
    alt: {
      analogies: ['quartz_oscillation'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. A quarter of a millisecond ${v.direction} atomic time — about ${Math.round(v.absOffset / ANALOGY.QUARTZ_OSCILLATION_MS)} ticks of a quartz watch crystal. Your device clock is extraordinarily accurate, and the time shown on screen has been corrected to match.`,
    },
  },
  // ── Tier 2: ≤0.5ms — Perfect ──
  {
    label: 'Perfect',
    severity: 'exceptional',
    analogies: ['housefly_wing'],
    domain: 'animal',
    description: v => `${v.sign}${v.absOffset}ms. Half a millisecond ${v.direction} atomic time. A housefly's wing beats once every ${ANALOGY.HOUSEFLY_WING_MS}ms, so this drift is a tenth of a single wingbeat. The time shown on screen has been corrected and is spot on.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms. Half a millisecond ${v.direction} atomic time. Sound travels only about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS * 100).toFixed(1)} centimeters in this interval. The time shown on screen has been corrected and is spot on.`,
    },
  },
  // ── Tier 3: ≤0.75ms — Near-perfect ──
  {
    label: 'Near-perfect',
    severity: 'exceptional',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.sign}${v.absOffset}ms. Three quarters of a millisecond ${v.direction} atomic time. Sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS * 100).toFixed(0)} centimeters in this time. Your device keeps remarkably precise time, and the time shown on screen has been corrected.`,
    alt: {
      analogies: ['honeybee_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Three quarters of a millisecond ${v.direction} atomic time — less than a fifth of a single honeybee wingbeat (${ANALOGY.HONEYBEE_WING_MS}ms). Your device keeps remarkably precise time, and the time shown on screen has been corrected.`,
    },
  },
  // ── Tier 4: ≤1ms — Near-perfect ──
  {
    label: 'Near-perfect',
    severity: 'exceptional',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. Exactly one millisecond ${v.direction} atomic time. This is roughly the duration of a single camera flash strobe (about ${ANALOGY.CAMERA_FLASH_MS}ms). Exceptional device clock accuracy. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['housefly_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Exactly one millisecond ${v.direction} atomic time — a fifth of a single housefly wingbeat (${ANALOGY.HOUSEFLY_WING_MS}ms). Exceptional device clock accuracy. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 5: ≤1.5ms — Exceptional ──
  {
    label: 'Exceptional',
    severity: 'excellent',
    analogies: ['light_distance'],
    domain: 'physics',
    description: v => `${v.sign}${v.absOffset}ms. Your device's built-in clock drifts ${v.absOffset}ms ${v.direction} atomic time. Light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this interval. Excellent accuracy, and the time shown on screen has been corrected.`,
    alt: {
      analogies: ['honeybee_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Your device's built-in clock drifts ${v.absOffset}ms ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.HONEYBEE_WING_MS).toFixed(1)} honeybee wingbeats. Excellent accuracy, and the time shown on screen has been corrected.`,
    },
  },
  // ── Tier 6: ≤2ms — Exceptional ──
  {
    label: 'Exceptional',
    severity: 'excellent',
    analogies: ['honeybee_wing'],
    domain: 'animal',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Two milliseconds is about half a honeybee wingbeat (${ANALOGY.HONEYBEE_WING_MS}ms per beat). Your device clock is doing a stellar job. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['quartz_oscillation'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Two milliseconds is about ${Math.round(v.absOffset / ANALOGY.QUARTZ_OSCILLATION_MS)} oscillations of a quartz watch crystal. Your device clock is doing a stellar job. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 7: ≤2.5ms — Exceptional ──
  {
    label: 'Exceptional',
    severity: 'excellent',
    analogies: ['audio_latency'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 2.5ms of drift, you are well within professional audio monitoring standards (target: ${ANALOGY.AUDIO_MONITORING_MS}ms). The time shown on screen has been corrected and is accurate.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 2.5ms of drift, sound would travel less than a meter (${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(2)}m). The time shown on screen has been corrected and is accurate.`,
    },
  },
  // ── Tier 8: ≤3ms — Outstanding ──
  {
    label: 'Outstanding',
    severity: 'excellent',
    analogies: ['sound_distance'],
    domain: 'physics',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Three milliseconds is about the time it takes sound to travel one meter (at ${ANALOGY.SPEED_OF_SOUND_M_PER_MS}m/ms). Your device is impressively well synced. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['housefly_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Three milliseconds is about ${(v.absOffset / ANALOGY.HOUSEFLY_WING_MS).toFixed(1)} housefly wingbeats. Your device is impressively well synced. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 9: ≤4ms — Outstanding ──
  {
    label: 'Outstanding',
    severity: 'excellent',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. A ${v.absOffset}ms drift ${v.direction} atomic time. This is roughly how long a single frame lasts on a 240Hz gaming monitor (${ANALOGY.FRAME_240HZ_MS}ms). Excellent clock hardware. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['honeybee_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. A ${v.absOffset}ms drift ${v.direction} atomic time — about one honeybee wingbeat (${ANALOGY.HONEYBEE_WING_MS}ms). Excellent clock hardware. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 10: ≤5ms — Excellent ──
  {
    label: 'Excellent',
    severity: 'excellent',
    analogies: ['housefly_wing'],
    domain: 'animal',
    description: v => `${v.sign}${v.absOffset}ms. Five milliseconds ${v.direction} atomic time, about the duration of one housefly wingbeat (${ANALOGY.HOUSEFLY_WING_MS}ms). Still excellent precision for any consumer device. The time shown on screen has been corrected to atomic accuracy.`,
    alt: {
      analogies: ['frame_rate'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. Five milliseconds ${v.direction} atomic time — less than one frame on a 144Hz display (${ANALOGY.FRAME_144HZ_MS}ms). Still excellent precision for any consumer device. The time shown on screen has been corrected to atomic accuracy.`,
    },
  },
  // ── Tier 11: ≤6ms — Excellent ──
  {
    label: 'Excellent',
    severity: 'great',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Six milliseconds is shorter than a single frame on a 144Hz display (${ANALOGY.FRAME_144HZ_MS}ms). Your device's built-in clock is performing very well. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['finger_snap'],
      domain: 'biology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Six milliseconds is close to the duration of a finger snap (${ANALOGY.FINGER_SNAP_MS}ms). Your device's built-in clock is performing very well. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 12: ≤7ms — Excellent ──
  {
    label: 'Excellent',
    severity: 'great',
    analogies: ['finger_snap'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, this is about the duration of a finger snap (${ANALOGY.FINGER_SNAP_MS}ms). Very good device accuracy. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['audio_latency'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, this is well below the professional audio monitoring target of ${ANALOGY.AUDIO_MONITORING_MS}ms. Very good device accuracy. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 13: ≤8ms — Very good ──
  {
    label: 'Very good',
    severity: 'great',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. Your device drifts ${v.absOffset}ms ${v.direction} atomic time. This is about half the duration of one frame at 60fps (${ANALOGY.FRAME_60FPS_MS}ms). No human could perceive this gap. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['hummingbird_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Your device drifts ${v.absOffset}ms ${v.direction} atomic time — about two thirds of one hummingbird wingbeat (${ANALOGY.HUMMINGBIRD_WING_MS}ms). No human could perceive this gap. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 14: ≤10ms — Very good ──
  {
    label: 'Very good',
    severity: 'great',
    analogies: ['audio_latency'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. A ${v.absOffset}ms drift ${v.direction} atomic time. Professional musicians can barely detect audio delays at this threshold (monitoring target: ${ANALOGY.AUDIO_MONITORING_MS}ms). Your device is well calibrated. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['hummingbird_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. A ${v.absOffset}ms drift ${v.direction} atomic time — less than one hummingbird wingbeat (${ANALOGY.HUMMINGBIRD_WING_MS}ms). Your device is well calibrated. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 15: ≤12ms — Very good ──
  {
    label: 'Very good',
    severity: 'great',
    analogies: ['hummingbird_wing'],
    domain: 'animal',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Twelve milliseconds is about one hummingbird wingbeat (${ANALOGY.HUMMINGBIRD_WING_MS}ms). Still comfortably within professional timing requirements. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['blink_reflex'],
      domain: 'biology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Twelve milliseconds is about the time it takes a blink reflex to initiate (${ANALOGY.BLINK_REFLEX_INITIATION_MS}ms). Still comfortably within professional timing requirements. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 16: ≤14ms — Very good ──
  {
    label: 'Very good',
    severity: 'great',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. At ${v.absOffset}ms ${v.direction} atomic time, your drift is right at about one frame at 60fps (${ANALOGY.FRAME_60FPS_MS}ms). Imperceptible to the eye. The time shown on screen has been corrected to atomic accuracy.`,
    alt: {
      analogies: ['hummingbird_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. At ${v.absOffset}ms ${v.direction} atomic time, your drift is about one hummingbird wingbeat (${ANALOGY.HUMMINGBIRD_WING_MS}ms). Imperceptible to the eye. The time shown on screen has been corrected to atomic accuracy.`,
    },
  },
  // ── Tier 17: ≤16ms — Good ──
  {
    label: 'Good',
    severity: 'great',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. A ${v.absOffset}ms offset ${v.direction} atomic time. This equals about one frame on a 60Hz display (${ANALOGY.FRAME_60FPS_MS}ms). Still a very good result for any consumer clock. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['audio_latency'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. A ${v.absOffset}ms offset ${v.direction} atomic time — about the professional target for audio monitoring latency (${ANALOGY.AUDIO_MONITORING_MS}ms). Still a very good result for any consumer clock. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 18: ≤18ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['blink_reflex'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, your device drifts roughly one and a half times as long as a blink reflex takes to initiate (${ANALOGY.BLINK_REFLEX_INITIATION_MS}ms). The time shown on screen has been corrected and reads accurately.`,
    alt: {
      analogies: ['frame_rate'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, your device drifts about one frame on a 60fps display (${ANALOGY.FRAME_60FPS_MS}ms). The time shown on screen has been corrected and reads accurately.`,
    },
  },
  // ── Tier 19: ≤20ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['retina_response', 'nerve_signal'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. Twenty milliseconds ${v.direction} atomic time. This is about the time for a nerve signal to travel from your finger to your brain (${ANALOGY.FINGER_TO_BRAIN_MS}ms) or your retina to respond to light (${ANALOGY.RETINA_RESPONSE_MS}ms). The time shown on screen has been corrected automatically.`,
    alt: {
      analogies: ['hummingbird_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Twenty milliseconds ${v.direction} atomic time — less than two hummingbird wingbeats (${ANALOGY.HUMMINGBIRD_WING_MS}ms each). The time shown on screen has been corrected automatically.`,
    },
  },
  // ── Tier 20: ≤23ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['retina_response'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms drift is about how long it takes your retina to respond to a flash of light (${ANALOGY.RETINA_RESPONSE_MS}ms). Perfectly normal. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms drift — sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(1)} meters in this time. Perfectly normal. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 21: ≤25ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. Your device's built-in clock is ${v.absOffset}ms ${v.direction} atomic time. This is roughly ${(v.absOffset / ANALOGY.FRAME_60FPS_MS).toFixed(1)} frames on a typical 60fps display. You would never notice without precise measurement. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['dragonfly_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Your device's built-in clock is ${v.absOffset}ms ${v.direction} atomic time — less than one dragonfly wing stroke (${ANALOGY.DRAGONFLY_WING_MS}ms). You would never notice without precise measurement. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 22: ≤28ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['hummingbird_wing'],
    domain: 'animal',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, a hummingbird completes about ${(v.absOffset / ANALOGY.HUMMINGBIRD_WING_MS).toFixed(1)} wing flaps. This is a typical offset for most devices. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['nerve_signal'],
      domain: 'biology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, a nerve signal has traveled about ${(v.absOffset / ANALOGY.FINGER_TO_BRAIN_MS).toFixed(1)} times the distance from your fingertip to your brain. This is a typical offset for most devices. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 23: ≤30ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['dragonfly_wing'],
    domain: 'animal',
    description: v => `${v.sign}${v.absOffset}ms. Thirty milliseconds ${v.direction} atomic time. This is about the duration of one dragonfly wing stroke (${ANALOGY.DRAGONFLY_WING_MS}ms). Normal device behavior. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['frame_rate'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. Thirty milliseconds ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.FRAME_60FPS_MS).toFixed(1)} frames at 60fps. Normal device behavior. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 24: ≤35ms — Good ──
  {
    label: 'Good',
    severity: 'good',
    analogies: ['gaming_latency'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms offset is within the range where competitive gamers start to notice input lag, but it is invisible for timekeeping. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['dragonfly_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms offset is about one dragonfly wing stroke (${ANALOGY.DRAGONFLY_WING_MS}ms). Invisible for timekeeping. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 25: ≤40ms — Fine ──
  {
    label: 'Fine',
    severity: 'good',
    analogies: ['nerve_signal'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. Your device is ${v.absOffset}ms ${v.direction} atomic time. About twice the time it takes a nerve signal to travel from your finger to your brain (${ANALOGY.FINGER_TO_BRAIN_MS}ms one-way). The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['frame_rate'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. Your device is ${v.absOffset}ms ${v.direction} atomic time — about one frame at cinema's 24fps (${ANALOGY.FRAME_24FPS_MS}ms). The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 26: ≤45ms — Fine ──
  {
    label: 'Fine',
    severity: 'good',
    analogies: ['lip_sync'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, this is right at the threshold where lip-sync errors become detectable in video (${ANALOGY.LIP_SYNC_THRESHOLD_MS}ms). Completely normal drift. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['dragonfly_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, about ${(v.absOffset / ANALOGY.DRAGONFLY_WING_MS).toFixed(1)} dragonfly wing strokes. Completely normal drift. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 27: ≤50ms — Fine ──
  {
    label: 'Fine',
    severity: 'good',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. Fifty milliseconds ${v.direction} atomic time. Right at the edge of conscious human perception for visual events. The time shown on screen has been corrected and is accurate.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms. Fifty milliseconds ${v.direction} atomic time. Sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(0)} meters in this time — roughly across a large room. The time shown on screen has been corrected and is accurate.`,
    },
  },
  // ── Tier 28: ≤55ms — Fine ──
  {
    label: 'Fine',
    severity: 'good',
    analogies: ['frame_rate'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms drift is about ${(v.absOffset / ANALOGY.FRAME_60FPS_MS).toFixed(1)} frames at 60fps. Most devices land somewhere around here. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['hummingbird_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms drift is about ${(v.absOffset / ANALOGY.HUMMINGBIRD_WING_MS).toFixed(1)} hummingbird wingbeats. Most devices land somewhere around here. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 29: ≤60ms — Acceptable ──
  {
    label: 'Acceptable',
    severity: 'good',
    analogies: ['lip_sync'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. At ${v.absOffset}ms ${v.direction} atomic time, your device is past the threshold where lip-sync errors become detectable (${ANALOGY.LIP_SYNC_THRESHOLD_MS}ms). The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['heartbeat_fraction'],
      domain: 'biology',
      description: v => `${v.sign}${v.absOffset}ms. At ${v.absOffset}ms ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a single heartbeat. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 30: ≤70ms — Acceptable ──
  {
    label: 'Acceptable',
    severity: 'fair',
    analogies: ['key_hold'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Seventy milliseconds is close to the duration of a single keypress (about ${ANALOGY.KEY_HOLD_MS}ms). A minor drift that is fully corrected in the time shown on screen.`,
    alt: {
      analogies: ['heartbeat_fraction'],
      domain: 'biology',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. About ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a single heartbeat (${ANALOGY.HEARTBEAT_MS}ms). A minor drift that is fully corrected in the time shown on screen.`,
    },
  },
  // ── Tier 31: ≤80ms — Acceptable ──
  {
    label: 'Acceptable',
    severity: 'fair',
    analogies: ['key_hold'],
    domain: 'technology',
    description: v => `${v.sign}${v.absOffset}ms. Your device's built-in clock drifts ${v.absOffset}ms ${v.direction} atomic time. About the duration of a single keypress on a keyboard (${ANALOGY.KEY_HOLD_MS}ms). The time shown on screen has been corrected to compensate.`,
    alt: {
      analogies: ['dragonfly_wing'],
      domain: 'animal',
      description: v => `${v.sign}${v.absOffset}ms. Your device's built-in clock drifts ${v.absOffset}ms ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.DRAGONFLY_WING_MS).toFixed(1)} dragonfly wing strokes. The time shown on screen has been corrected to compensate.`,
    },
  },
  // ── Tier 32: ≤90ms — Noticeable ──
  {
    label: 'Noticeable',
    severity: 'fair',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, this drift is getting close to a tenth of a second — about ${(v.absOffset / ANALOGY.EYE_BLINK_MS * 100).toFixed(0)}% of an eye blink (${ANALOGY.EYE_BLINK_MS}ms). You still would not notice in daily use. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(0)} meters in this time. You still would not notice in daily use. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 33: ≤100ms — Noticeable ──
  {
    label: 'Noticeable',
    severity: 'fair',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. One tenth of a second ${v.direction} atomic time. This is the minimum duration of a reflex eye blink (${ANALOGY.REFLEX_BLINK_MS}ms). The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['lip_sync'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. One tenth of a second ${v.direction} atomic time — over twice the lip-sync detection threshold (${ANALOGY.LIP_SYNC_THRESHOLD_MS}ms). The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 34: ≤115ms — Noticeable ──
  {
    label: 'Noticeable',
    severity: 'fair',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, your device clock has a bit of drift, close to the fastest conscious human reaction time (${ANALOGY.FASTEST_CONSCIOUS_REACTION_MS}ms for trained athletes). The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['light_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, light has traveled about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 35: ≤130ms — Noticeable ──
  {
    label: 'Noticeable',
    severity: 'fair',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. Your device drifts ${v.absOffset}ms ${v.direction} atomic time. This is close to the duration of a voluntary eye blink (${ANALOGY.EYE_BLINK_MS}ms). The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['gaming_latency'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. Your device drifts ${v.absOffset}ms ${v.direction} atomic time. In online gaming, this much latency would feel noticeably sluggish. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 36: ≤150ms — Noticeable ──
  {
    label: 'Noticeable',
    severity: 'fair',
    analogies: ['eye_blink'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms offset is about the duration of one eye blink (${ANALOGY.EYE_BLINK_MS}ms). The time shown on screen accounts for this and has been corrected.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(0)} meters in this time — roughly half a city block. The time shown on screen accounts for this and has been corrected.`,
    },
  },
  // ── Tier 37: ≤175ms — Drifted ──
  {
    label: 'Drifted',
    severity: 'fair',
    analogies: ['heartbeat_fraction'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. At ${v.absOffset}ms ${v.direction} atomic time, your device has measurable clock drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a heartbeat. This is typical of devices that have not synced to a time server recently. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['light_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms. At ${v.absOffset}ms ${v.direction} atomic time, light has traveled about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km. This is typical of devices that have not synced to a time server recently. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 38: ≤200ms — Drifted ──
  {
    label: 'Drifted',
    severity: 'fair',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A fifth of a second of drift — approaching the average visual reaction time (${ANALOGY.VISUAL_REACTION_MS}ms). Fast enough that you would not see it on an analog clock, but measurable digitally. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['sound_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A fifth of a second of drift. Sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS).toFixed(0)} meters in this time. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 39: ≤225ms — Drifted ──
  {
    label: 'Drifted',
    severity: 'mediocre',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. Nearly a quarter second ${v.direction} atomic time — close to the average visual reaction time (${ANALOGY.VISUAL_REACTION_MS}ms). Your device's internal clock is drifting more than average. The time shown on screen has been corrected to compensate for this.`,
    alt: {
      analogies: ['frame_rate'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. Nearly a quarter second ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.FRAME_60FPS_MS).toFixed(0)} frames at 60fps. Your device's internal clock is drifting more than average. The time shown on screen has been corrected to compensate for this.`,
    },
  },
  // ── Tier 40: ≤250ms — Drifted ──
  {
    label: 'Drifted',
    severity: 'mediocre',
    analogies: ['reaction_time'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A ${v.absOffset}ms offset is about the average human visual reaction time (${ANALOGY.VISUAL_REACTION_MS}ms). You might notice your device seconds tick slightly out of sync with a reference. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['light_distance'],
      domain: 'physics',
      description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A quarter of a second — light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this time. You might notice your device seconds tick slightly out of sync. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 41: ≤300ms — Significant drift ──
  {
    label: 'Significant drift',
    severity: 'mediocre',
    analogies: ['heartbeat_fraction'],
    domain: 'biology',
    description: v => `${v.sign}${v.absOffset}ms. Three tenths of a second ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a heartbeat. This level of drift would cause noticeable audio delay in a video call. The time shown on screen has been corrected for this.`,
    alt: {
      analogies: ['lip_sync'],
      domain: 'technology',
      description: v => `${v.sign}${v.absOffset}ms. Three tenths of a second ${v.direction} atomic time — over ${(v.absOffset / ANALOGY.LIP_SYNC_THRESHOLD_MS).toFixed(0)}x the lip-sync detection threshold. This level of drift would cause noticeable delay in a video call. The time shown on screen has been corrected for this.`,
    },
  },
  // ── Tier 42–49: remaining mediocre tiers ──
  { label: 'Significant drift', severity: 'mediocre', analogies: ['eye_blink'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, your device clock is over a third of a second off — about ${(v.absOffset / ANALOGY.EYE_BLINK_MS).toFixed(1)} eye blinks. Definitely drifting, but the time shown on screen has been corrected.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, sound has traveled about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters. Definitely drifting, but the time shown on screen has been corrected.` } },
  { label: 'Significant drift', severity: 'mediocre', analogies: ['heartbeat_fraction'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms. Nearly half a second ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a heartbeat. Watching two clocks side by side, you would see the seconds change at different moments. The time shown on screen has been corrected for this.`, alt: { analogies: ['gaming_latency'], domain: 'technology', description: v => `${v.sign}${v.absOffset}ms. Nearly half a second ${v.direction} atomic time. In online gaming, this latency would be completely unplayable. The time shown on screen has been corrected for this.` } },
  { label: 'Significant drift', severity: 'mediocre', analogies: ['heartbeat_fraction'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, your device is more than half a heartbeat (${ANALOGY.HEARTBEAT_MS}ms) adrift. This is clearly measurable. The time shown on screen has been corrected for accuracy.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, sound travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters — roughly a city block and a half. This is clearly measurable. The time shown on screen has been corrected for accuracy.` } },
  { label: 'Large drift', severity: 'mediocre', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms. Half a second ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a heartbeat. Your device clock is significantly out of sync. You would see a clear difference comparing seconds to another clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${v.absOffset}ms. Half a second ${v.direction} atomic time. Light travels ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this interval. The time shown on screen has been corrected for this.` } },
  { label: 'Large drift', severity: 'mediocre', analogies: ['heartbeat_fraction'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Over half a second of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a heartbeat. Your device may benefit from a time sync in its settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['reaction_time'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Over half a second of drift — more than ${(v.absOffset / ANALOGY.VISUAL_REACTION_MS).toFixed(1)}x the average human reaction time. Your device may benefit from a time sync in its settings. The time shown on screen has been corrected for this.` } },
  { label: 'Large drift', severity: 'mediocre', analogies: ['heartbeat_fraction'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms. Seven tenths of a second ${v.direction} atomic time — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS * 100).toFixed(0)}% of a heartbeat. Your device clock has substantial drift. The time shown on screen has been corrected, but your other apps rely on the uncorrected device clock.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${v.absOffset}ms. Seven tenths of a second ${v.direction} atomic time. Sound travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters in this time. The time shown on screen has been corrected, but your other apps rely on the uncorrected device clock.` } },
  { label: 'Large drift', severity: 'mediocre', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, your device's built-in clock is nearly a full heartbeat off (${ANALOGY.HEARTBEAT_MS}ms). Consider enabling automatic time sync in your device settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At ${v.absOffset}ms, light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km. Consider enabling automatic time sync in your device settings. The time shown on screen has been corrected for this.` } },
  { label: 'Large drift', severity: 'mediocre', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. A full second of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. This is visible to anyone comparing clocks. The time shown on screen has been corrected, but your device's built-in clock itself needs attention.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. A full second of drift — a snail travels about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(1)}mm in this time. The time shown on screen has been corrected, but your device's built-in clock itself needs attention.` } },
  // ── Tiers 50–58: poor/bad severity ──
  { label: 'Significant', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Over a second of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. Your device has not synced with a time server in a while. The time shown on screen has been corrected for this.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Over a second of drift. Sound travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters in this time. The time shown on screen has been corrected for this.` } },
  { label: 'Significant', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. A second and a half of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats — means your device seconds are visibly out of step. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. A second and a half of drift. Light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this time. The time shown on screen has been corrected for this.` } },
  { label: 'Significant', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Nearly two seconds of clock drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. Your device's internal oscillator has wandered noticeably. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Nearly two seconds of drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(1)}mm in this time. The time shown on screen has been corrected for this.` } },
  { label: 'Significant', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Two full seconds off — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. You would easily spot this comparing your device to a wall clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Two full seconds off. Sound travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS)} meters in this time — over half a kilometer. The time shown on screen has been corrected for this.` } },
  { label: 'Significant', severity: 'poor', analogies: ['moon_rtt'], domain: 'space', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Two and a half seconds of drift — close to the Earth-Moon light round-trip (${(ANALOGY.MOON_RTT_MS / 1000).toFixed(1)}s). Check if automatic time sync is enabled on your device. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Two and a half seconds of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. Check if automatic time sync is enabled on your device. The time shown on screen has been corrected for this.` } },
  { label: 'Severe', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Three seconds off — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. Your device clock is drifting badly. Enable "Set time automatically" in your settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['moon_rtt'], domain: 'space', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Three seconds off — longer than a light round-trip to the Moon (${(ANALOGY.MOON_RTT_MS / 1000).toFixed(1)}s). Enable "Set time automatically" in your settings. The time shown on screen has been corrected for this.` } },
  { label: 'Severe', severity: 'poor', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Three and a half seconds of drift — a snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(1)}mm. This is well beyond normal. Your device likely has automatic time sync disabled. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Three and a half seconds of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(1)} heartbeats. This is well beyond normal. Your device likely has automatic time sync disabled. The time shown on screen has been corrected for this.` } },
  { label: 'Severe', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Four seconds of drift — ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. This is far outside normal operating range. Please check your date and time settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Four seconds of drift. Sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS / 1000).toFixed(1)}km in this time. Please check your date and time settings. The time shown on screen has been corrected for this.` } },
  { label: 'Severe', severity: 'poor', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Five seconds adrift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Something is clearly wrong with your device's time sync. The time shown on screen has been corrected, but your system clock needs fixing.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Five seconds adrift. Light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this time. The time shown on screen has been corrected, but your system clock needs fixing.` } },
  // ── Tiers 59–66: bad severity ──
  { label: 'Severe', severity: 'bad', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Six seconds of drift — a snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm. Your device clock may be running on battery backup or has lost its time server connection. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Six seconds of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device clock may be running on battery backup or has lost its time server connection. The time shown on screen has been corrected for this.` } },
  { label: 'Severe', severity: 'bad', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Seven and a half seconds off — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. This amount of drift typically means automatic time sync is turned off or broken. The time shown on screen has been corrected for this.`, alt: { analogies: ['moon_rtt'], domain: 'space', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Seven and a half seconds off — about ${(v.absOffset / ANALOGY.MOON_RTT_MS).toFixed(1)}x the Earth-Moon light round-trip. This means automatic time sync is turned off or broken. The time shown on screen has been corrected for this.` } },
  { label: 'Critical', severity: 'bad', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Ten seconds of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device clock is running well outside normal bounds. Go to Settings and enable automatic date and time. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Ten seconds of drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm — a full centimeter. Go to Settings and enable automatic date and time. The time shown on screen has been corrected for this.` } },
  { label: 'Critical', severity: 'bad', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Over twelve seconds adrift — a snail crawls about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm in this time. Your device is seriously out of sync. The time shown on screen has been corrected, but other apps on your device may have issues.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Over twelve seconds adrift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device is seriously out of sync. The time shown on screen has been corrected, but other apps on your device may have issues.` } },
  { label: 'Critical', severity: 'bad', analogies: ['moon_rtt'], domain: 'space', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Fifteen seconds off — about ${(v.absOffset / ANALOGY.MOON_RTT_MS).toFixed(0)}x the Earth-Moon light round-trip. This could cause authentication token failures and certificate errors. Fix your device time settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Fifteen seconds off. A snail would crawl ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm. This could cause authentication token failures. Fix your device time settings. The time shown on screen has been corrected for this.` } },
  { label: 'Critical', severity: 'bad', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Twenty seconds of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. This is far enough to cause problems with two-factor authentication codes. Fix your device clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['sound_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Twenty seconds of drift. Sound travels about ${(v.absOffset * ANALOGY.SPEED_OF_SOUND_M_PER_MS / 1000).toFixed(1)}km in this time. Fix your device clock. The time shown on screen has been corrected for this.` } },
  { label: 'Critical', severity: 'bad', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Twenty-five seconds adrift — a snail crawls about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm. TOTP authentication codes will fail at this level of drift. Open your time settings immediately. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Twenty-five seconds adrift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. TOTP authentication codes will fail at this level of drift. Open your time settings immediately. The time shown on screen has been corrected for this.` } },
  { label: 'Critical', severity: 'bad', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Half a minute of clock drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. This will break time-sensitive protocols like Kerberos authentication. Your device time settings need attention. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Half a minute of clock drift. Light travels about ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this time. This will break time-sensitive protocols. The time shown on screen has been corrected for this.` } },
  // ── Tiers 67–99: critical/broken severity ──
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Forty seconds off — a snail would crawl ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm. Your device clock is badly misconfigured. Many online services may behave unexpectedly. The time shown on screen has been corrected, but fix your device clock.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Forty seconds off — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device clock is badly misconfigured. Many online services may behave unexpectedly. The time shown on screen has been corrected, but fix your device clock.` } },
  { label: 'Broken', severity: 'critical', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Nearly a minute of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device clock is essentially broken for any time-sensitive operation. Please fix your date and time settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Nearly a minute of drift. Light travels ${Math.round(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS)}km in this time — over a third of the way around Earth. Please fix your date and time settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. A full minute off. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(1)} times. Your device clock has likely lost contact with any time server. Go to your system settings and enable automatic time. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. A full minute off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm. Your device clock has likely lost contact with any time server. Go to your system settings and enable automatic time. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. A minute and a half adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC).toFixed(0)}mm. This will cause SSL certificate warnings and authentication failures. Fix your clock immediately. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. A minute and a half adrift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. This will cause SSL certificate warnings and authentication failures. Fix your clock immediately. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Two minutes of drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Your device is almost certainly not using network time. Open Settings, then Date and Time, and turn on automatic sync. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Two minutes of drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. Open Settings, then Date and Time, and turn on automatic sync. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Two and a half minutes of drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. This will cause widespread issues with websites and apps. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Two and a half minutes of drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. This will cause widespread issues with websites and apps. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Three minutes adrift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. At this level, many secure websites may refuse to load properly. Fix your device time settings right away. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Three minutes adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. At this level, many secure websites may refuse to load properly. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Four minutes of clock drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. Automated backups, calendar events, and sync services are all affected. Please correct your device clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Four minutes of clock drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Please correct your device clock. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['mars_delay'], domain: 'space', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Five minutes off. This is a common threshold where enterprise systems begin rejecting connections entirely. Fix your clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Five minutes off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. This is where enterprise systems reject connections entirely. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Seven and a half minutes adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. Your device clock appears to have been manually set incorrectly or the CMOS battery may be failing. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Seven and a half minutes adrift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device clock appears to have been manually set incorrectly. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Ten minutes of drift — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. Your device is telling a completely different story about what time it is. Check your system date and time settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Ten minutes of drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Check your system date and time settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Fifteen minutes off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. At this point, your device clock is unreliable for any purpose. Please enable automatic time in your settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['heartbeat'], domain: 'biology', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Fifteen minutes off — about ${(v.absOffset / ANALOGY.HEARTBEAT_MS).toFixed(0)} heartbeats. At this point, your device clock is unreliable for any purpose. Please enable automatic time in your settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Twenty minutes adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. File timestamps, message ordering, and calendar sync will all be wrong on your device. Fix your clock immediately. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Twenty minutes adrift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Fix your clock immediately. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Half an hour of drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Your device may have a dead CMOS battery if it is a desktop, or a broken NTP configuration. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Half an hour of drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. Your device may have a dead CMOS battery or a broken NTP configuration. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Your device clock is off by nearly an hour. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 10).toFixed(0)}cm. This could be a timezone misconfiguration or a completely broken time setting. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Your device clock is off by nearly an hour. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. This could be a timezone misconfiguration. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Over an hour of drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. This is almost certainly a timezone error or a manually set wrong time. Check both your timezone and clock settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Over an hour of drift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Check both your timezone and clock settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['moon_rtt'], domain: 'space', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Two hours off. That is about ${(v.absOffset / ANALOGY.MOON_RTT_MS).toFixed(0)}x the Earth-Moon light round-trip. Your device may be set to the wrong timezone, or the time was entered manually and is incorrect. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Two hours off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device may be set to the wrong timezone. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Three hours adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. This is likely a timezone issue. Verify both your timezone setting and that automatic time is enabled. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Three hours adrift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. This is likely a timezone issue. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Four hours off. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Your device clock is set to a completely wrong time or timezone. Open your date and time settings to fix this. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Four hours off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device clock is set to a completely wrong time or timezone. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Six hours of drift — a snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device is half a day off from reality. Check your timezone and enable automatic time sync immediately. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Six hours of drift. Light would circle the Earth about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / ANALOGY.EARTH_CIRCUMFERENCE_KM).toFixed(0)} times. Check your timezone and enable automatic time sync immediately. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Twelve hours off. Light would travel about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / 1e9).toFixed(1)} billion km. Your device may have AM and PM swapped, or the timezone is set halfway around the world from your location. The time shown on screen has been corrected for this.`, alt: { analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Twelve hours off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device may have AM and PM swapped. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full day off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device clock is set to the wrong date entirely. Go to your system settings and correct the date and time. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'physics', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full day off. Light would travel about ${(v.absOffset * ANALOGY.SPEED_OF_LIGHT_KM_PER_MS / 1e9).toFixed(1)} billion km. Your device clock is set to the wrong date entirely. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Two days adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device is living in a different day than reality. This will break almost everything time-dependent. Fix your clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Two days adrift. Your device is living in a different day than reality. This will break almost everything time-dependent. Fix your clock. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Four days off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device date is seriously wrong. SSL certificates may appear invalid and websites will not load correctly. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Four days off. Your device date is seriously wrong. SSL certificates may appear invalid and websites will not load correctly. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full week off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device is living in a completely different week. This requires immediate attention in your date and time settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full week off. Your device is living in a completely different week. This requires immediate attention in your date and time settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Two weeks adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device date is set to entirely the wrong part of the month. All scheduled events and reminders will be wrong. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Two weeks adrift. Your device date is set to entirely the wrong part of the month. All scheduled events and reminders will be wrong. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A month off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(1)} meters. Your device is stuck in the wrong month. On a computer, this may indicate a dead CMOS battery. Fix your date settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A month off. Your device is stuck in the wrong month. On a computer, this may indicate a dead CMOS battery. Fix your date settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. About two months adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(0)} meters. Your device calendar is deeply wrong. This will cause problems with virtually every app and service. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. About two months adrift. Your device calendar is deeply wrong. This will cause problems with virtually every app and service. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. About half a year off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(0)} meters. Your device is living in an entirely different season. This is likely a dead battery or a factory-reset date. Please fix your clock. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. About half a year off. Your device is living in an entirely different season. This is likely a dead battery or a factory-reset date. Please fix your clock. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full year adrift. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(0)} meters. Your device thinks it is a different year. This is a common sign of a dead CMOS battery on desktops or a factory-reset device. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full year adrift. Your device thinks it is a different year. This is a common sign of a dead CMOS battery on desktops or a factory-reset device. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Multiple years off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(0)} meters — potentially across a room. Your device clock has reset to a factory default or the CMOS battery is dead. This page cannot help until your system clock is roughly correct. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Multiple years off. Your device clock has reset to a factory default or the CMOS battery is dead. This page cannot help until your system clock is roughly correct. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A decade or more off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000).toFixed(0)} meters. Your device clock has reset to a factory default date, possibly January 1, 2000 or similar. Replace the CMOS battery and correct your date settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A decade or more off. Your device clock has reset to a factory default date. Replace the CMOS battery and correct your date settings. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Decades off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000000).toFixed(1)}km. Your device clock is set to an entirely different era. Replace the CMOS battery and correct your date settings immediately. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Decades off. Your device clock is set to an entirely different era. Replace the CMOS battery and correct your date settings immediately. The time shown on screen has been corrected for this.` } },
  { label: 'Broken', severity: 'critical', analogies: ['snail_speed'], domain: 'animal', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A century or more off. A snail would crawl about ${(v.absOffset / 1000 * ANALOGY.SNAIL_MM_PER_SEC / 1000000).toFixed(1)}km. Your device is living in a completely different century. This page cannot provide meaningful corrections. Replace the CMOS battery and correct your date and time settings. The time shown on screen has been corrected for this.`, alt: { analogies: ['light_distance'], domain: 'general', description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A century or more off. Your device is living in a completely different century. This page cannot provide meaningful corrections. Replace the CMOS battery and correct your date and time settings. The time shown on screen has been corrected for this.` } },
];

// ─── Watch Guidance Tiers (12) ──────────────────────────────

export const WATCH_THRESHOLDS = [
  5, 15, 30, 50, 100, 250, 500, 1000, 2000, 5000, 30000, 300000,
];

export const WATCH_TIERS = [
  {
    label: 'Laboratory-grade',
    severity: 'exceptional',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms — sub-millisecond precision approaching dedicated timing hardware. Set your second hand with absolute confidence.`,
  },
  {
    label: 'Near-perfect',
    severity: 'excellent',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms — better than most radio-controlled atomic watches achieve. The seconds on screen are rock solid. Set your watch right on the tick.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms. Under 30ms of combined error is below the threshold of human perception. Set your watch on the tick with full confidence.`,
  },
  {
    label: 'Very good',
    severity: 'good',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms — ${humanFraction(v.uncertainty)} of possible error. You can confidently set your watch on the tick. The difference is invisible to the eye.`,
  },
  {
    label: 'Good',
    severity: 'fair',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms — ${humanFraction(v.uncertainty)} of possible error. The seconds shown are a reliable reference. Feel confident setting on the tick.`,
  },
  {
    label: 'Reliable',
    severity: 'mediocre',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms — ${humanFraction(v.uncertainty)} of possible error. The seconds are close but not exact. For best results, use the minute change as your primary reference.`,
  },
  {
    label: 'Approximate',
    severity: 'mediocre',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${v.uncertainty.toFixed(1)}ms — ${humanFraction(v.uncertainty)} of combined error. The seconds are approximate. Set your watch using the minute change for the most accurate result.`,
  },
  {
    label: 'Rough',
    severity: 'poor',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${(v.uncertainty / 1000).toFixed(1)}s — ${humanFraction(v.uncertainty)} of combined error. Do not rely on the seconds for watch-setting. Use the minute display as your reference.`,
  },
  {
    label: 'Limited',
    severity: 'poor',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is accurate to within ${(v.uncertainty / 1000).toFixed(1)}s — ${humanFraction(v.uncertainty)} of possible error. The minutes are your only reliable reference. A faster connection would improve accuracy significantly.`,
  },
  {
    label: 'Poor',
    severity: 'bad',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is only accurate to within ${(v.uncertainty / 1000).toFixed(1)}s — ${humanFraction(v.uncertainty)} of combined error. Only the hour and approximate minute are reliable. Try resyncing on a better connection.`,
  },
  {
    label: 'Unreliable',
    severity: 'critical',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is only accurate to within ${(v.uncertainty / 1000).toFixed(0)}s — over 5 seconds of combined error. Only the hour is dependable. The minutes may be off by one or more. Switch to a faster network and reload.`,
  },
  {
    label: 'Not usable',
    severity: 'critical',
    analogies: [],
    domain: 'general',
    description: v => `The corrected time on screen is only accurate to within ${(v.uncertainty / 60000).toFixed(1)} minutes. The combined error is too large for meaningful time display. Your device's built-in clock is more reliable. Fix your connection or device clock settings and try again.`,
  },
];
