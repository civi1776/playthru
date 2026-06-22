// ─── MOCK GREEN COORDINATES ───────────────────────────────────────────────────
// !! THIS IS MOCK DATA FOR DEVELOPMENT AND TESTING ONLY !!
// Green coordinates are plausible but NOT accurate. Real per-hole green
// coordinates will be sourced from a paid API (GolfAPI.io / Golfbert —
// quotes pending) and will replace this file later this week.
// Do NOT ship this data to production as authoritative yardages.
// ─────────────────────────────────────────────────────────────────────────────

// TPC Sawgrass Stadium Course — Ponte Vedra Beach, FL
// Course center: 30.1976, -81.3953
// Holes spread within ~0.005° of center in a clockwise routing pattern
const TPC_SAWGRASS = [
  { hole_number:  1, par: 4, green_front_lat: 30.1990, green_front_lng: -81.3971, green_center_lat: 30.1991, green_center_lng: -81.3970, green_back_lat: 30.1992, green_back_lng: -81.3969 },
  { hole_number:  2, par: 5, green_front_lat: 30.2001, green_front_lng: -81.3958, green_center_lat: 30.2002, green_center_lng: -81.3957, green_back_lat: 30.2003, green_back_lng: -81.3956 },
  { hole_number:  3, par: 3, green_front_lat: 30.2005, green_front_lng: -81.3942, green_center_lat: 30.2006, green_center_lng: -81.3941, green_back_lat: 30.2007, green_back_lng: -81.3940 },
  { hole_number:  4, par: 4, green_front_lat: 30.2000, green_front_lng: -81.3928, green_center_lat: 30.2001, green_center_lng: -81.3927, green_back_lat: 30.2002, green_back_lng: -81.3926 },
  { hole_number:  5, par: 4, green_front_lat: 30.1989, green_front_lng: -81.3920, green_center_lat: 30.1990, green_center_lng: -81.3919, green_back_lat: 30.1991, green_back_lng: -81.3918 },
  { hole_number:  6, par: 4, green_front_lat: 30.1978, green_front_lng: -81.3912, green_center_lat: 30.1979, green_center_lng: -81.3911, green_back_lat: 30.1980, green_back_lng: -81.3910 },
  { hole_number:  7, par: 5, green_front_lat: 30.1965, green_front_lng: -81.3918, green_center_lat: 30.1966, green_center_lng: -81.3917, green_back_lat: 30.1967, green_back_lng: -81.3916 },
  { hole_number:  8, par: 3, green_front_lat: 30.1956, green_front_lng: -81.3930, green_center_lat: 30.1957, green_center_lng: -81.3929, green_back_lat: 30.1958, green_back_lng: -81.3928 },
  { hole_number:  9, par: 5, green_front_lat: 30.1950, green_front_lng: -81.3945, green_center_lat: 30.1951, green_center_lng: -81.3944, green_back_lat: 30.1952, green_back_lng: -81.3943 },
  { hole_number: 10, par: 4, green_front_lat: 30.1953, green_front_lng: -81.3960, green_center_lat: 30.1954, green_center_lng: -81.3959, green_back_lat: 30.1955, green_back_lng: -81.3958 },
  { hole_number: 11, par: 5, green_front_lat: 30.1958, green_front_lng: -81.3974, green_center_lat: 30.1959, green_center_lng: -81.3973, green_back_lat: 30.1960, green_back_lng: -81.3972 },
  { hole_number: 12, par: 4, green_front_lat: 30.1965, green_front_lng: -81.3985, green_center_lat: 30.1966, green_center_lng: -81.3984, green_back_lat: 30.1967, green_back_lng: -81.3983 },
  { hole_number: 13, par: 3, green_front_lat: 30.1973, green_front_lng: -81.3993, green_center_lat: 30.1974, green_center_lng: -81.3992, green_back_lat: 30.1975, green_back_lng: -81.3991 },
  { hole_number: 14, par: 4, green_front_lat: 30.1982, green_front_lng: -81.3990, green_center_lat: 30.1983, green_center_lng: -81.3989, green_back_lat: 30.1984, green_back_lng: -81.3988 },
  { hole_number: 15, par: 3, green_front_lat: 30.1990, green_front_lng: -81.3982, green_center_lat: 30.1991, green_center_lng: -81.3981, green_back_lat: 30.1992, green_back_lng: -81.3980 },
  { hole_number: 16, par: 5, green_front_lat: 30.1995, green_front_lng: -81.3970, green_center_lat: 30.1996, green_center_lng: -81.3969, green_back_lat: 30.1997, green_back_lng: -81.3968 },
  // Hole 17 — the famous island green, tightly placed in the water
  { hole_number: 17, par: 3, green_front_lat: 30.1963, green_front_lng: -81.3943, green_center_lat: 30.19635, green_center_lng: -81.3942, green_back_lat: 30.1964, green_back_lng: -81.3941 },
  { hole_number: 18, par: 4, green_front_lat: 30.1976, green_front_lng: -81.3955, green_center_lat: 30.1977, green_center_lng: -81.3954, green_back_lat: 30.1978, green_back_lng: -81.3953 },
];

// Bay Hill Club & Lodge — Orlando, FL
// Course center: 28.4634, -81.5066
// Holes spread within ~0.005° of center in a routing pattern
const BAY_HILL = [
  { hole_number:  1, par: 4, green_front_lat: 28.4648, green_front_lng: -81.5080, green_center_lat: 28.4649, green_center_lng: -81.5079, green_back_lat: 28.4650, green_back_lng: -81.5078 },
  { hole_number:  2, par: 5, green_front_lat: 28.4658, green_front_lng: -81.5068, green_center_lat: 28.4659, green_center_lng: -81.5067, green_back_lat: 28.4660, green_back_lng: -81.5066 },
  { hole_number:  3, par: 4, green_front_lat: 28.4662, green_front_lng: -81.5053, green_center_lat: 28.4663, green_center_lng: -81.5052, green_back_lat: 28.4664, green_back_lng: -81.5051 },
  { hole_number:  4, par: 3, green_front_lat: 28.4655, green_front_lng: -81.5040, green_center_lat: 28.4656, green_center_lng: -81.5039, green_back_lat: 28.4657, green_back_lng: -81.5038 },
  { hole_number:  5, par: 4, green_front_lat: 28.4644, green_front_lng: -81.5033, green_center_lat: 28.4645, green_center_lng: -81.5032, green_back_lat: 28.4646, green_back_lng: -81.5031 },
  { hole_number:  6, par: 4, green_front_lat: 28.4634, green_front_lng: -81.5028, green_center_lat: 28.4635, green_center_lng: -81.5027, green_back_lat: 28.4636, green_back_lng: -81.5026 },
  { hole_number:  7, par: 5, green_front_lat: 28.4622, green_front_lng: -81.5035, green_center_lat: 28.4623, green_center_lng: -81.5034, green_back_lat: 28.4624, green_back_lng: -81.5033 },
  { hole_number:  8, par: 4, green_front_lat: 28.4614, green_front_lng: -81.5048, green_center_lat: 28.4615, green_center_lng: -81.5047, green_back_lat: 28.4616, green_back_lng: -81.5046 },
  { hole_number:  9, par: 4, green_front_lat: 28.4618, green_front_lng: -81.5062, green_center_lat: 28.4619, green_center_lng: -81.5061, green_back_lat: 28.4620, green_back_lng: -81.5060 },
  { hole_number: 10, par: 4, green_front_lat: 28.4620, green_front_lng: -81.5076, green_center_lat: 28.4621, green_center_lng: -81.5075, green_back_lat: 28.4622, green_back_lng: -81.5074 },
  { hole_number: 11, par: 4, green_front_lat: 28.4624, green_front_lng: -81.5089, green_center_lat: 28.4625, green_center_lng: -81.5088, green_back_lat: 28.4626, green_back_lng: -81.5087 },
  { hole_number: 12, par: 5, green_front_lat: 28.4631, green_front_lng: -81.5098, green_center_lat: 28.4632, green_center_lng: -81.5097, green_back_lat: 28.4633, green_back_lng: -81.5096 },
  { hole_number: 13, par: 3, green_front_lat: 28.4640, green_front_lng: -81.5100, green_center_lat: 28.4641, green_center_lng: -81.5099, green_back_lat: 28.4642, green_back_lng: -81.5098 },
  { hole_number: 14, par: 4, green_front_lat: 28.4648, green_front_lng: -81.5096, green_center_lat: 28.4649, green_center_lng: -81.5095, green_back_lat: 28.4650, green_back_lng: -81.5094 },
  { hole_number: 15, par: 5, green_front_lat: 28.4654, green_front_lng: -81.5088, green_center_lat: 28.4655, green_center_lng: -81.5087, green_back_lat: 28.4656, green_back_lng: -81.5086 },
  { hole_number: 16, par: 4, green_front_lat: 28.4657, green_front_lng: -81.5078, green_center_lat: 28.4658, green_center_lng: -81.5077, green_back_lat: 28.4659, green_back_lng: -81.5076 },
  { hole_number: 17, par: 3, green_front_lat: 28.4652, green_front_lng: -81.5068, green_center_lat: 28.4653, green_center_lng: -81.5067, green_back_lat: 28.4654, green_back_lng: -81.5066 },
  // Hole 18 — famous finisher along the lake
  { hole_number: 18, par: 4, green_front_lat: 28.4644, green_front_lng: -81.5070, green_center_lat: 28.4645, green_center_lng: -81.5069, green_back_lat: 28.4646, green_back_lng: -81.5068 },
];

// ─── Course registry ──────────────────────────────────────────────────────────
// Add entries here as more mock/real datasets are added.
// Keys are lowercase canonical names used for partial matching.
const COURSE_REGISTRY = [
  { keys: ['tpc sawgrass', 'sawgrass stadium'], holes: TPC_SAWGRASS },
  { keys: ['bay hill'],                         holes: BAY_HILL     },
];

/**
 * getMockGreensForCourse
 *
 * Returns the 18-hole green coordinate array for a given course name,
 * using case-insensitive partial matching against known course names.
 *
 * @param {string} courseName - The course name as stored in the app (e.g. from rounds or courses table)
 * @returns {Array|null} Array of 18 hole objects, or null if course not in mock dataset
 */
export function getMockGreensForCourse(courseName) {
  if (!courseName || typeof courseName !== 'string') return null;
  const needle = courseName.toLowerCase();
  const match  = COURSE_REGISTRY.find(entry =>
    entry.keys.some(key => needle.includes(key) || key.includes(needle))
  );
  return match ? match.holes : null;
}
