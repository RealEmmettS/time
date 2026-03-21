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
    description: v => `${v.rtt}ms round-trip. At this speed, light itself only traveled about ${Math.round(v.rtt * 300)}km. Your clock is accurate to ±${v.halfRtt}ms, which is beyond the threshold of any human perception.`,
  },
  {
    label: 'Instantaneous',
    severity: 'exceptional',
    description: v => `${v.rtt}ms round-trip. This is faster than a single tick of a 2GHz processor takes to complete a complex instruction. Accuracy is within ±${v.halfRtt}ms.`,
  },
  {
    label: 'Near-instant',
    severity: 'exceptional',
    description: v => `${v.rtt}ms round-trip. A quartz crystal in a wristwatch vibrates once every 0.03ms, so this response arrived in about ${Math.round(v.rtt / 0.03)} crystal oscillations. Accuracy ceiling is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Near-instant',
    severity: 'exceptional',
    description: v => `${v.rtt}ms round-trip. Sound travels about ${(v.rtt * 0.343).toFixed(2)} meters in this time. Your sync accuracy of ±${v.halfRtt}ms is essentially perfect for any practical purpose.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    description: v => `${v.rtt}ms round-trip. Light could circle a football field about ${Math.round(v.rtt * 300000 / 100)} times in this interval. Your clock is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    description: v => `${v.rtt}ms round-trip. This is faster than the time between frames on a 480Hz gaming monitor. Accuracy of ±${v.halfRtt}ms is well beyond what the human eye can detect.`,
  },
  {
    label: 'Outstanding',
    severity: 'excellent',
    description: v => `${v.rtt}ms round-trip. A hummingbird flaps its wings once every 12ms, so your server response arrived many times faster than a single wingbeat. Clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Outstanding',
    severity: 'excellent',
    description: v => `${v.rtt}ms round-trip. Nerve signals in your body travel at roughly 0.3ms per centimeter, so in this time a pain signal barely crossed your fingernail. Accuracy sits at ±${v.halfRtt}ms.`,
  },
  {
    label: 'Superb',
    severity: 'excellent',
    description: v => `${v.rtt}ms round-trip. Professional competitive gamers consider anything under 5ms to be elite-tier latency. Your clock is synced to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Superb',
    severity: 'excellent',
    description: v => `${v.rtt}ms round-trip. This is faster than the click latency of most high-end gaming mice. Your time accuracy of ±${v.halfRtt}ms is outstanding.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. A honeybee flaps its wings once every 5ms, so this response took about ${(v.rtt / 5).toFixed(1)} wingbeats. Clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. In this time, light traveled roughly ${Math.round(v.rtt * 300)}km, enough to cross a small country. Your accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Very fast',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. This is faster than the time it takes your monitor to switch a single pixel's color on most displays. Accuracy of ±${v.halfRtt}ms is excellent.`,
  },
  {
    label: 'Very fast',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. A camera flash typically lasts about 1ms, so your entire server round-trip completed in roughly ${v.rtt} flash durations. Clock is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Very fast',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. The fastest human reflexes are around 100ms, making this sync about ${Math.round(100 / v.rtt)}x faster than your best possible reaction. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Fast',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. A hummingbird's wing completes one full beat in about 12ms, so your signal returned in just over one wingbeat. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Fast',
    severity: 'great',
    description: v => `${v.rtt}ms round-trip. One frame at 60fps takes 16.7ms, so this response arrived faster than your screen can even draw a single frame. Clock is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Quick',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. This is roughly one frame of a 60fps display. Your clock is accurate to ±${v.halfRtt}ms, which is invisible to the naked eye.`,
  },
  {
    label: 'Quick',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. A typical LED light flickers in about 10ms, and your response arrived in a comparable blink. Accuracy of ±${v.halfRtt}ms is more than sufficient.`,
  },
  {
    label: 'Quick',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. This is similar to the input lag on a high-end gaming keyboard. Your clock accuracy of ±${v.halfRtt}ms is great for everyday timekeeping.`,
  },
  {
    label: 'Above average',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. In competitive online gaming, this latency would be considered very playable. Clock accuracy sits at ±${v.halfRtt}ms.`,
  },
  {
    label: 'Above average',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. Light traveled about ${Math.round(v.rtt * 300)}km during this exchange, roughly the distance from London to Paris. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Above average',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. A 24fps film frame lasts 41.7ms, so your sync completed faster than a single movie frame. Accuracy of ±${v.halfRtt}ms is solid.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. This is well under the threshold where humans start to perceive delays (about 50ms). Your clock is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. A dragonfly's wing completes a full stroke in about 25ms. Your sync took about ${(v.rtt / 25).toFixed(1)} wing strokes. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. At this speed, the time server could be several thousand kilometers away and still deliver excellent accuracy. Clock is synced to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. This is roughly how long it takes sound to travel ${(v.rtt * 0.343).toFixed(0)} meters through air. Accuracy of ±${v.halfRtt}ms is perfectly fine.`,
  },
  {
    label: 'Solid',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. About ${(v.rtt / 41.7).toFixed(1)} frames at cinema's 24fps standard. Your clock is accurate to ±${v.halfRtt}ms, well within useful range.`,
  },
  {
    label: 'Solid',
    severity: 'good',
    description: v => `${v.rtt}ms round-trip. Professional audio engineers consider anything under 50ms acceptable for live monitoring. Your time accuracy of ±${v.halfRtt}ms is solid.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. You are right at the edge of human perceptible delay. Your clock accuracy of ±${v.halfRtt}ms is still well under one tenth of a second.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. This is about ${(v.rtt / 16.7).toFixed(0)} frames on a 60fps display. Accuracy of ±${v.halfRtt}ms means your clock could be off by that amount in either direction.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. A fast typist hits a key roughly every 60ms, so your sync completed in about one keystroke's duration. Clock is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Average',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. Light traveled about ${Math.round(v.rtt * 300)}km during this exchange, roughly from New York to Boston. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. This is about half the duration of a typical eye blink (which takes around 150ms). Clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. Roughly ${(v.rtt / 41.7).toFixed(1)} frames of a 24fps movie. Your accuracy of ±${v.halfRtt}ms is still good for general timekeeping.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. A housefly beats its wings once every 5ms, which means about ${Math.round(v.rtt / 5)} wingbeats passed during this sync. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Moderate',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. Sound traveled about ${Math.round(v.rtt * 0.343)} meters in this time, roughly the length of a concert hall. Clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Below average',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. This is approaching the threshold where latency becomes noticeable in everyday computing tasks. Your clock is still accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Below average',
    severity: 'fair',
    description: v => `${v.rtt}ms round-trip. About ${(v.rtt / 16.7).toFixed(0)} frames at 60fps. The accuracy of ±${v.halfRtt}ms is still under a tenth of a second, which works fine for setting a watch.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. Now past the 100ms mark, delays at this range start to feel sluggish in interactive applications. Your clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. This is about ${(v.rtt / 150).toFixed(1)} eye blinks. The ±${v.halfRtt}ms accuracy means your displayed time could be off by over a tenth of a second.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. In online gaming, this would be considered laggy. For a clock, it still means accuracy within ±${v.halfRtt}ms, just over a tenth of a second.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. Light could have traveled ${Math.round(v.rtt * 300)}km, roughly the distance across multiple US states. Clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. This is close to the average human reaction time to a visual stimulus (about 250ms). Accuracy of ±${v.halfRtt}ms is starting to become noticeable.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. A single eye blink takes about 150ms, so this sync took about ${(v.rtt / 150).toFixed(1)} blinks. Clock is accurate to ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. Your connection to the time server has some significant latency. Consider switching to a closer network if accuracy beyond ±${v.halfRtt}ms matters to you.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. This is roughly the delay you feel when using a remote desktop over a decent connection. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Slow',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. At this latency, the uncertainty window of ±${v.halfRtt}ms means the displayed second might occasionally appear to jump or stall briefly.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. This is about ${(v.rtt / 250).toFixed(1)}x the average human reaction time. Clock accuracy of ±${v.halfRtt}ms means you are approaching a quarter-second of uncertainty.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. If you were playing an online game, this would be noticeably laggy. For a clock display, accuracy is ±${v.halfRtt}ms. Wifi or cellular congestion may be the cause.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. Sound would travel about ${Math.round(v.rtt * 0.343)} meters in this time, nearly the length of a city block. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Poor',
    severity: 'mediocre',
    description: v => `${v.rtt}ms round-trip. The sync took about a quarter of a second. Your displayed time is accurate to ±${v.halfRtt}ms. Try a wired connection for better results.`,
  },
  {
    label: 'Poor',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. At this latency, the accuracy ceiling of ±${v.halfRtt}ms means the clock could be off by roughly a third of a second. A faster network would help significantly.`,
  },
  {
    label: 'Poor',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. This is over twice the average human reaction time. The ±${v.halfRtt}ms uncertainty is now clearly visible if you compare against another clock.`,
  },
  {
    label: 'Poor',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. Your network added about ${(v.rtt / 150).toFixed(0)} eye-blinks worth of delay to the sync. Accuracy is ±${v.halfRtt}ms. Closing bandwidth-heavy apps may help.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. The time server response took over a third of a second. Accuracy of ±${v.halfRtt}ms is enough that you might notice the seconds digit lagging behind reality.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. In this time, light could have circled the Earth about ${(v.rtt * 300 / 40075).toFixed(1)} times. The ±${v.halfRtt}ms accuracy window is significant.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. This much latency suggests a congested network, a distant server, or a VPN adding overhead. Clock accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. Half a second of round-trip time means the clock's accuracy is limited to ±${v.halfRtt}ms. Consider syncing again when your connection improves.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. A heartbeat takes about 800ms, so this sync took roughly ${(v.rtt / 800).toFixed(1)} heartbeats. Accuracy of ±${v.halfRtt}ms is notable.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. Sound would have traveled about ${Math.round(v.rtt * 0.343)} meters, over half a kilometer. The accuracy ceiling of ±${v.halfRtt}ms means the displayed time may visibly differ from true atomic time.`,
  },
  {
    label: 'Very slow',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. At this point, each sync attempt is taking almost a full second. Your clock is accurate to ±${v.halfRtt}ms at best. Network quality is the bottleneck.`,
  },
  {
    label: 'Bad',
    severity: 'poor',
    description: v => `${v.rtt}ms round-trip. The response took about ${(v.rtt / 800).toFixed(1)} heartbeats. With ±${v.halfRtt}ms of uncertainty, the seconds display may be off by close to a full second.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Over a full second of delay. Accuracy is limited to ±${v.halfRtt}ms. Your network connection appears to be under heavy load.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Light could have circled the entire Earth ${(v.rtt * 300 / 40075).toFixed(1)} times during this sync. The ±${v.halfRtt}ms accuracy is quite coarse.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At this latency, even simple web pages would feel sluggish. Clock accuracy of ±${v.halfRtt}ms means the time shown could easily be off by a second or more.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This much delay is typical of severely congested wifi, satellite internet, or a very distant server. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Multiple heartbeats passed while waiting for the time server. With ±${v.halfRtt}ms uncertainty, the displayed seconds are unreliable.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. The accuracy window of ±${v.halfRtt}ms (over a second) means the clock's seconds display is essentially a rough estimate. Try resyncing on a better connection.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Sound traveled about ${(v.rtt * 0.343 / 1000).toFixed(1)}km in this time. Your clock's ±${v.halfRtt}ms accuracy means minutes are reliable, but seconds are approximate.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At nearly two full seconds of delay, the sync is barely useful for second-level accuracy. The ±${v.halfRtt}ms uncertainty is substantial. Try a different network.`,
  },
  {
    label: 'Very bad',
    severity: 'bad',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This level of latency is usually caused by satellite links, extreme network congestion, or intercontinental routing issues. Accuracy is only ±${v.halfRtt}ms.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Over two seconds of latency makes second-level accuracy impossible. The ±${v.halfRtt}ms uncertainty means the displayed time is approximate. Only the minute is reliable.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At this latency, your connection to the time server is severely impaired. Accuracy of ±${v.halfRtt}ms means you can trust the hour and minute, but not the seconds.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. The signal traveled for over two seconds each way. With ±${v.halfRtt}ms uncertainty, the clock is only accurate to the nearest few seconds at best.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This is similar to the delay on a deep-space communication relay. Accuracy is ±${v.halfRtt}ms. Check your internet connection and try syncing again.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Three or more seconds of delay. The ±${v.halfRtt}ms accuracy window is enormous. Only the minute hand would be trustworthy on an analog clock at this precision.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At ${(v.rtt / 1000).toFixed(1)} seconds of latency, your connection is barely maintaining contact with the time server. Accuracy is ±${v.halfRtt}ms.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Multiple seconds of network delay suggest a nearly broken connection. The ±${v.halfRtt}ms uncertainty makes seconds meaningless. Try a different network entirely.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. A snail moves about 1mm per second, and it would have crawled ${(v.rtt / 1000).toFixed(1)}mm during this sync. Accuracy of ±${v.halfRtt}ms means only minutes are reliable.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Your network took over five seconds to complete the time sync. With ±${v.halfRtt}ms of uncertainty, the clock is effectively guessing at the seconds.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At this latency, the time server might as well be on the Moon (Earth-Moon round-trip is about 2.5 seconds). Accuracy is ±${v.halfRtt}ms. The connection is severely degraded.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Seven seconds of delay means your internet connection is hanging on by a thread. The ±${v.halfRtt}ms accuracy makes the seconds display meaningless.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This is approaching Mars rover communication delays. The clock's ±${v.halfRtt}ms accuracy means only the hour and minute should be trusted.`,
  },
  {
    label: 'Critical',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Nearly ten seconds to reach a time server and back. With ±${v.halfRtt}ms of uncertainty, you are better off using your device's built-in clock until your network recovers.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. Over ten seconds of latency. The ±${v.halfRtt}ms accuracy window is so large that this sync provides almost no value over your device's local clock.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. At ${(v.rtt / 60000).toFixed(1)} minutes of delay, your connection appears to be timing out repeatedly. Accuracy of ±${v.halfRtt}ms makes the seconds and even the minute unreliable.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 1000).toFixed(1)}s) round-trip. This level of latency is usually caused by a proxy, captive portal, or network that is actively throttling connections. Accuracy is ±${v.halfRtt}ms. Try a different network.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Your connection took over 20 seconds. The clock's ±${v.halfRtt}ms uncertainty is measured in tens of seconds. Only the hour is trustworthy.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Half a minute of latency. The sync is essentially useless for timekeeping purposes. With ±${v.halfRtt}ms of uncertainty, your device's local clock is more accurate.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Over half a minute of network delay. At ±${v.halfRtt}ms of uncertainty, the sync result is not meaningful. Your connection may be intermittently dropping.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Nearly a minute of delay. The ±${v.halfRtt}ms accuracy window is so wide that the sync cannot provide useful time information. Check if your internet is working at all.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Over a minute to reach a time server. At this point, the ±${v.halfRtt}ms uncertainty spans entire minutes. The sync is not providing usable data.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. A signal to the Moon and back takes 2.5 seconds. Your time sync took ${(v.rtt / 2500).toFixed(0)}x longer than that. Accuracy of ±${v.halfRtt}ms is not meaningful.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. At this extreme latency, your network connection is effectively non-functional for real-time data. The ±${v.halfRtt}ms accuracy window spans multiple minutes.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. An hour of round-trip delay. The concept of "syncing" is meaningless at this timescale. With ±${v.halfRtt}ms of uncertainty, the result is pure noise. Your connection is not working.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Two minutes or more of latency. The sync data is completely stale by the time it arrives. With ±${v.halfRtt}ms uncertainty, only the hour display can be trusted.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Five minutes of delay. This is beyond any reasonable network timeout. The ±${v.halfRtt}ms uncertainty means the sync is entirely meaningless. Your device clock is far more accurate.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
    description: v => `${v.rtt}ms (${(v.rtt / 60000).toFixed(1)} minutes) round-trip. Ten or more minutes of latency. At ±${v.halfRtt}ms of uncertainty, the sync cannot tell you anything useful about the current time. Something is fundamentally broken with your network.`,
  },
  {
    label: 'Unusable',
    severity: 'critical',
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
  {
    label: 'Perfect',
    severity: 'exceptional',
    description: v => `${v.sign}${v.absOffset}ms. Your device clock is ${v.direction} atomic time by less than a tenth of a millisecond. This is physically near the limit of what network sync can measure. The displayed time is corrected and essentially flawless.`,
  },
  {
    label: 'Perfect',
    severity: 'exceptional',
    description: v => `${v.sign}${v.absOffset}ms. A quarter of a millisecond ${v.direction} atomic time. Light travels about 75 kilometers in this interval. Your device clock is extraordinarily accurate, and the displayed time is corrected to match.`,
  },
  {
    label: 'Perfect',
    severity: 'exceptional',
    description: v => `${v.sign}${v.absOffset}ms. Half a millisecond ${v.direction} atomic time. A housefly's wing beats once every 5ms, so this drift is a tenth of a single wingbeat. The displayed time has been corrected and is spot on.`,
  },
  {
    label: 'Near-perfect',
    severity: 'exceptional',
    description: v => `${v.sign}${v.absOffset}ms. Three quarters of a millisecond ${v.direction} atomic time. Sound travels about 26 centimeters in this time. Your device keeps remarkably precise time, and the displayed clock is corrected.`,
  },
  {
    label: 'Near-perfect',
    severity: 'exceptional',
    description: v => `${v.sign}${v.absOffset}ms. Exactly one millisecond ${v.direction} atomic time. This is roughly the duration of a single camera flash strobe. Exceptional device clock accuracy. The displayed time is corrected.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    description: v => `${v.sign}${v.absOffset}ms. Your clock drifts ${v.absOffset}ms ${v.direction} atomic time. A single neuron fires in about 1ms, so this is just slightly longer than that. Excellent accuracy, and the displayed time is corrected.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Two milliseconds is faster than the click of a mechanical keyboard switch. Your device clock is doing a stellar job. The displayed time has been corrected.`,
  },
  {
    label: 'Exceptional',
    severity: 'excellent',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 2.5ms of drift, you are well within professional broadcast timing standards. The displayed time is corrected and accurate.`,
  },
  {
    label: 'Outstanding',
    severity: 'excellent',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Three milliseconds is about the time it takes sound to travel one meter. Your device is impressively well synced. The displayed time has been corrected.`,
  },
  {
    label: 'Outstanding',
    severity: 'excellent',
    description: v => `${v.sign}${v.absOffset}ms. A 4ms drift ${v.direction} atomic time. This is roughly how long a single frame lasts on a 240Hz gaming monitor. Excellent clock hardware. The displayed time is corrected.`,
  },
  {
    label: 'Excellent',
    severity: 'excellent',
    description: v => `${v.sign}${v.absOffset}ms. Five milliseconds ${v.direction} atomic time, about half the duration of a housefly wingbeat. Still excellent precision for any consumer device. The displayed time is corrected to atomic accuracy.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Six milliseconds is shorter than a single frame on a standard 144Hz display. Your clock is performing very well. The displayed time has been corrected.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 7ms, this is still well below the threshold of human audio perception for latency. Very good device accuracy. The displayed time is corrected.`,
  },
  {
    label: 'Very good',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms. Your device drifts 8ms ${v.direction} atomic time. This is about half the duration of one frame at 60fps. No human could perceive this gap. The displayed time is corrected.`,
  },
  {
    label: 'Very good',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms. A 10ms drift ${v.direction} atomic time. Professional musicians can barely detect audio delays at this threshold. Your device is well calibrated. The displayed time has been corrected.`,
  },
  {
    label: 'Very good',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Twelve milliseconds is roughly one frame at 80fps. Still comfortably within professional timing requirements. The displayed time is corrected.`,
  },
  {
    label: 'Very good',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms. At 14ms ${v.direction} atomic time, your drift is right at about one frame at 60fps. Imperceptible to the eye. The displayed time has been corrected to atomic accuracy.`,
  },
  {
    label: 'Good',
    severity: 'great',
    description: v => `${v.sign}${v.absOffset}ms. A 16ms offset ${v.direction} atomic time. This equals one frame on a 60Hz display. Still a very good result for any consumer clock. The displayed time is corrected.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 18ms, your device drifts about as long as a single blink reflex takes to initiate. The displayed time has been corrected and reads accurately.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms. Twenty milliseconds ${v.direction} atomic time. This is close to the lower bound of human reaction time to a visual stimulus. The displayed time is corrected automatically.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A 23ms drift is about how long it takes your retina to register a flash of light. Perfectly normal. The displayed time has been corrected.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms. Your clock is 25ms ${v.direction} atomic time. This is roughly two frames on a typical display. You would never notice without precise measurement. The displayed time is corrected.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 28ms, a hummingbird completes about one wing flap. This is a typical offset for most devices. The displayed time has been corrected.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms. Thirty milliseconds ${v.direction} atomic time. This is about the duration of a single heartbeat's electrical impulse. Normal device behavior. The displayed time is corrected.`,
  },
  {
    label: 'Good',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A 35ms offset is within the range where competitive gamers start to notice input lag, but it is invisible for timekeeping. The displayed time is corrected.`,
  },
  {
    label: 'Fine',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms. Your device is 40ms ${v.direction} atomic time. About the time it takes a nerve signal to travel from your finger to your brain. The displayed time has been corrected.`,
  },
  {
    label: 'Fine',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 45ms, this is roughly how long the shutter is open on a casual phone photo. Completely normal drift. The displayed time is corrected.`,
  },
  {
    label: 'Fine',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms. Fifty milliseconds ${v.direction} atomic time. Right at the edge of conscious human perception for visual events. The displayed time has been corrected and is accurate.`,
  },
  {
    label: 'Fine',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A 55ms drift is about three frames at 60fps. Most devices land somewhere around here. The displayed time is corrected.`,
  },
  {
    label: 'Acceptable',
    severity: 'good',
    description: v => `${v.sign}${v.absOffset}ms. At 60ms ${v.direction} atomic time, your device is right at the threshold where some people might notice audio-visual sync issues. The displayed time has been corrected.`,
  },
  {
    label: 'Acceptable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Seventy milliseconds is roughly how long a blink of an eye takes. A minor drift that is fully corrected in the displayed time.`,
  },
  {
    label: 'Acceptable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms. Your clock drifts 80ms ${v.direction} atomic time. About the time it takes to snap your fingers. The displayed time has been corrected to compensate.`,
  },
  {
    label: 'Noticeable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 90ms, this drift is getting close to a tenth of a second. You still would not notice in daily use. The displayed time is corrected.`,
  },
  {
    label: 'Noticeable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms. One tenth of a second ${v.direction} atomic time. This is the approximate threshold where lip-sync errors become noticeable on video. The displayed time has been corrected.`,
  },
  {
    label: 'Noticeable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 115ms, your device clock has a bit of drift, roughly comparable to average human reaction time. The displayed time is corrected.`,
  },
  {
    label: 'Noticeable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms. Your device drifts 130ms ${v.direction} atomic time. This is about how long it takes to press and release a key on a keyboard. The displayed time has been corrected.`,
  },
  {
    label: 'Noticeable',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A 150ms offset means your device clock is drifting about a sixth of a second. The displayed time accounts for this and is corrected.`,
  },
  {
    label: 'Drifted',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms. At 175ms ${v.direction} atomic time, your device has measurable clock drift. This is typical of devices that have not synced to a time server recently. The displayed time is corrected.`,
  },
  {
    label: 'Drifted',
    severity: 'fair',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A fifth of a second of drift. Fast enough that you would not see it on an analog clock, but measurable digitally. The displayed time has been corrected.`,
  },
  {
    label: 'Drifted',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms. Nearly a quarter second ${v.direction} atomic time. Your device's internal clock is drifting more than average. The displayed time is corrected to compensate for this.`,
  },
  {
    label: 'Drifted',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. A 250ms offset is a quarter of a second. You might notice your device seconds tick slightly out of sync with a reference. The displayed time has been corrected.`,
  },
  {
    label: 'Significant drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms. Three tenths of a second ${v.direction} atomic time. This level of drift would cause noticeable audio delay in a video call. The displayed time is corrected.`,
  },
  {
    label: 'Significant drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 350ms, your device clock is over a third of a second off. Definitely drifting, but the displayed time here has been corrected.`,
  },
  {
    label: 'Significant drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms. Nearly half a second ${v.direction} atomic time. Watching two clocks side by side, you would see the seconds change at different moments. The displayed time is corrected.`,
  },
  {
    label: 'Significant drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 450ms, your device is almost half a second adrift. This is clearly measurable. The displayed time has been corrected for accuracy.`,
  },
  {
    label: 'Large drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms. Half a second ${v.direction} atomic time. Your device clock is significantly out of sync. You would see a clear difference comparing seconds to another clock. The displayed time is corrected.`,
  },
  {
    label: 'Large drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. Over half a second of drift. Your device may benefit from a time sync in its settings. The displayed time has been corrected.`,
  },
  {
    label: 'Large drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms. Seven tenths of a second ${v.direction} atomic time. Your device clock has substantial drift. The displayed time is corrected, but your other apps rely on the uncorrected clock.`,
  },
  {
    label: 'Large drift',
    severity: 'mediocre',
    description: v => `${v.sign}${v.absOffset}ms ${v.direction} atomic time. At 800ms, your clock is nearly a full second off. Consider enabling automatic time sync in your device settings. The displayed time is corrected.`,
  },
  {
    label: 'Large drift',
    severity: 'mediocre',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. A full second of drift is visible to anyone comparing clocks. The displayed time has been corrected, but your device clock itself needs attention.`,
  },
  {
    label: 'Significant',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Over a second of drift. Your device has not synced with a time server in a while. The displayed time is corrected here.`,
  },
  {
    label: 'Significant',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. A second and a half of drift means your device seconds are visibly out of step. The displayed time has been corrected.`,
  },
  {
    label: 'Significant',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Nearly two seconds of clock drift. Your device's internal oscillator has wandered noticeably. The displayed time is corrected.`,
  },
  {
    label: 'Significant',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Two full seconds off. You would easily spot this comparing your device to a wall clock. The displayed time has been corrected.`,
  },
  {
    label: 'Significant',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Two and a half seconds of drift is quite significant. Check if automatic time sync is enabled on your device. The displayed time is corrected.`,
  },
  {
    label: 'Severe',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Three seconds off. Your device clock is drifting badly. Enable "Set time automatically" in your settings. The displayed time is corrected here.`,
  },
  {
    label: 'Severe',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Three and a half seconds of drift is well beyond normal. Your device likely has automatic time sync disabled. The displayed time has been corrected.`,
  },
  {
    label: 'Severe',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Four seconds of drift. This is far outside normal operating range. Please check your date and time settings. The displayed time is corrected.`,
  },
  {
    label: 'Severe',
    severity: 'poor',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Five seconds adrift. Something is clearly wrong with your device's time sync. The displayed time has been corrected, but your system clock needs fixing.`,
  },
  {
    label: 'Severe',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Six seconds of drift is unusual. Your device clock may be running on battery backup or has lost its time server connection. The displayed time is corrected.`,
  },
  {
    label: 'Severe',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Seven and a half seconds off. This amount of drift typically means automatic time sync is turned off or broken. The displayed time has been corrected.`,
  },
  {
    label: 'Critical',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Ten seconds of drift. Your device clock is running well outside normal bounds. Go to Settings and enable automatic date and time. The displayed time is corrected.`,
  },
  {
    label: 'Critical',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Over twelve seconds adrift. Your device is seriously out of sync. The displayed time has been corrected, but other apps on your device may have issues.`,
  },
  {
    label: 'Critical',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Fifteen seconds off. This could cause authentication token failures and certificate errors. Fix your device time settings. The displayed time is corrected.`,
  },
  {
    label: 'Critical',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Twenty seconds of drift. This is far enough to cause problems with two-factor authentication codes. Fix your device clock. The displayed time has been corrected.`,
  },
  {
    label: 'Critical',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Twenty-five seconds adrift. TOTP authentication codes will fail at this level of drift. Open your time settings immediately. The displayed time is corrected.`,
  },
  {
    label: 'Critical',
    severity: 'bad',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Half a minute of clock drift. This will break time-sensitive protocols like Kerberos authentication. Your device time settings need attention. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Forty seconds off. Your device clock is badly misconfigured. Many online services may behave unexpectedly. The displayed time is corrected, but fix your device clock.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 1000).toFixed(1)} seconds ${v.direction} atomic time. Nearly a minute of drift. Your device clock is essentially broken for any time-sensitive operation. Please fix your date and time settings. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. A full minute off. Your device clock has likely lost contact with any time server. Go to your system settings and enable automatic time. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. A minute and a half adrift. This will cause SSL certificate warnings and authentication failures. Fix your clock immediately. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Two minutes of drift. Your device is almost certainly not using network time. Open Settings, then Date and Time, and turn on automatic sync. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Three minutes adrift. At this level, many secure websites may refuse to load properly. Fix your device time settings right away. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Five minutes off. This is a common threshold where enterprise systems begin rejecting connections entirely. Fix your clock. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Ten minutes of drift. Your device is telling a completely different story about what time it is. Check your system date and time settings. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Fifteen minutes off. At this point, your device clock is unreliable for any purpose. Please enable automatic time in your settings. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Half an hour of drift. Your device may have a dead CMOS battery if it is a desktop, or a broken NTP configuration. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Your device clock is off by nearly an hour. This could be a timezone misconfiguration or a completely broken time setting. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Over an hour of drift. This is almost certainly a timezone error or a manually set wrong time. Check both your timezone and clock settings. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Three hours adrift. This is likely a timezone issue. Verify both your timezone setting and that automatic time is enabled. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Six hours of drift. Your device is half a day off from reality. Check your timezone and enable automatic time sync immediately. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Twelve hours off. Your device may have AM and PM swapped, or the timezone is set halfway around the world from your location. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full day off. Your device clock is set to the wrong date entirely. Go to your system settings and correct the date and time. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Four days off. Your device date is seriously wrong. SSL certificates may appear invalid and websites will not load correctly. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full week off. Your device is living in a completely different week. This requires immediate attention in your date and time settings. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Two weeks adrift. Your device date is set to entirely the wrong part of the month. All scheduled events and reminders will be wrong. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A month off. Your device is stuck in the wrong month. On a computer, this may indicate a dead CMOS battery. Fix your date settings. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. About half a year off. Your device is living in an entirely different season. This is likely a dead battery or a factory-reset date. Please fix your clock. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A full year adrift. Your device thinks it is a different year. This is a common sign of a dead CMOS battery on desktops or a factory-reset device. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. A decade or more off. Your device clock has reset to a factory default date, possibly January 1, 2000 or similar. Replace the CMOS battery and correct your date settings. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Two and a half minutes of drift. This will cause widespread issues with websites and apps. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Four minutes of clock drift. Automated backups, calendar events, and sync services are all affected. Please correct your device clock. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Seven and a half minutes adrift. Your device clock appears to have been manually set incorrectly or the CMOS battery may be failing. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 60000).toFixed(1)} minutes ${v.direction} atomic time. Twenty minutes adrift. File timestamps, message ordering, and calendar sync will all be wrong on your device. Fix your clock immediately. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Two hours off. Your device may be set to the wrong timezone, or the time was entered manually and is incorrect. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 3600000).toFixed(1)} hours ${v.direction} atomic time. Four hours off. Your device clock is set to a completely wrong time or timezone. Open your date and time settings to fix this. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Two days adrift. Your device is living in a different day than reality. This will break almost everything time-dependent. Fix your clock. The displayed time is corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Four days off. Your device date is seriously wrong. SSL certificates may appear invalid and websites will not load correctly. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. About two months adrift. Your device calendar is deeply wrong. This will cause problems with virtually every app and service. The displayed time has been corrected.`,
  },
  {
    label: 'Broken',
    severity: 'critical',
    description: v => `${v.sign}${(v.absOffset / 86400000).toFixed(1)} days ${v.direction} atomic time. Multiple years off. Your device clock has reset to a factory default or the CMOS battery is dead. This page cannot help until your system clock is roughly correct. The displayed time is corrected.`,
  },
];

// ─── Watch Guidance Tiers (12) ──────────────────────────────

export const WATCH_THRESHOLDS = [
  5, 15, 30, 50, 100, 250, 500, 1000, 2000, 5000, 30000, 300000,
];

export const WATCH_TIERS = [
  {
    label: 'Laboratory-grade',
    severity: 'exceptional',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. This is sub-millisecond precision approaching dedicated timing hardware. Set your second hand with absolute confidence.`,
  },
  {
    label: 'Near-perfect',
    severity: 'excellent',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. Better than most radio-controlled atomic watches achieve. The seconds on screen are rock solid. Set your watch right on the tick.`,
  },
  {
    label: 'Excellent',
    severity: 'great',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. Under 30ms of combined error, which is below the threshold of human perception. Set your watch on the tick with full confidence.`,
  },
  {
    label: 'Very good',
    severity: 'good',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. About a twentieth of a second of possible error. You can confidently set your watch on the tick. The difference is invisible to the eye.`,
  },
  {
    label: 'Good',
    severity: 'fair',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. Under a tenth of a second. The seconds on screen are a reliable reference. Feel confident setting on the tick.`,
  },
  {
    label: 'Reliable',
    severity: 'mediocre',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. About a quarter second of possible error. The seconds are close but not exact. For best results, use the minute change as your primary reference.`,
  },
  {
    label: 'Approximate',
    severity: 'mediocre',
    description: v => `Total uncertainty: ${v.uncertainty.toFixed(1)}ms. About half a second of combined error. The seconds are approximate. Set your watch using the minute change for the most accurate result.`,
  },
  {
    label: 'Rough',
    severity: 'poor',
    description: v => `Total uncertainty: ${(v.uncertainty / 1000).toFixed(1)}s. About a full second of combined error. Do not rely on the seconds for watch-setting. Use the minute display as your reference.`,
  },
  {
    label: 'Limited',
    severity: 'poor',
    description: v => `Total uncertainty: ${(v.uncertainty / 1000).toFixed(1)}s. Two seconds of possible error. The minutes are your only reliable reference. A faster connection would improve accuracy significantly.`,
  },
  {
    label: 'Poor',
    severity: 'bad',
    description: v => `Total uncertainty: ${(v.uncertainty / 1000).toFixed(1)}s. Several seconds of combined error. Only the hour and approximate minute are reliable. Try resyncing on a better connection.`,
  },
  {
    label: 'Unreliable',
    severity: 'critical',
    description: v => `Total uncertainty: ${(v.uncertainty / 1000).toFixed(0)}s. Over 5 seconds of combined error. Only the hour is dependable. The minutes may be off by one or more. Switch to a faster network and reload.`,
  },
  {
    label: 'Not usable',
    severity: 'critical',
    description: v => `Total uncertainty: ${(v.uncertainty / 60000).toFixed(1)} minutes. The combined error is too large for meaningful time display. Your device's built-in clock is more reliable. Fix your connection or device clock settings and try again.`,
  },
];
