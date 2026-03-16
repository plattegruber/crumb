// ---------------------------------------------------------------------------
// Quantity — sum type with rational arithmetic (SPEC §2.5)
// ---------------------------------------------------------------------------
// Invariants (SPEC §2.20 invariant 9):
//   - Fraction and Mixed must have denominator != 0
//   - Fraction and Mixed must be in lowest terms (GCD = 1)
// ---------------------------------------------------------------------------

// -- Variants ---------------------------------------------------------------

export interface WholeNumber {
  readonly type: "WholeNumber";
  readonly value: number;
}

export interface Fraction {
  readonly type: "Fraction";
  readonly numerator: number;
  readonly denominator: number;
}

export interface Mixed {
  readonly type: "Mixed";
  readonly whole: number;
  readonly numerator: number;
  readonly denominator: number;
}

export interface Decimal {
  readonly type: "Decimal";
  readonly value: number;
}

export type Quantity = WholeNumber | Fraction | Mixed | Decimal;

// ---------------------------------------------------------------------------
// GCD — Euclidean algorithm
// ---------------------------------------------------------------------------

export function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

// ---------------------------------------------------------------------------
// Simplification — reduces a numerator/denominator pair to lowest terms
// ---------------------------------------------------------------------------

function simplifyFraction(
  numerator: number,
  denominator: number,
): { numerator: number; denominator: number } {
  if (denominator === 0) {
    throw new Error("Denominator must not be zero");
  }
  // Ensure the denominator is positive; carry sign on the numerator.
  const sign = denominator < 0 ? -1 : 1;
  const n = numerator * sign;
  const d = denominator * sign;
  const g = gcd(Math.abs(n), d);
  return { numerator: n / g, denominator: d / g };
}

// ---------------------------------------------------------------------------
// Factory helpers (enforce invariants)
// ---------------------------------------------------------------------------

export function wholeNumber(value: number): WholeNumber {
  return { type: "WholeNumber", value };
}

export function fraction(numerator: number, denominator: number): Fraction {
  if (denominator === 0) {
    throw new Error("Denominator must not be zero");
  }
  const s = simplifyFraction(numerator, denominator);
  return { type: "Fraction", numerator: s.numerator, denominator: s.denominator };
}

export function mixed(whole: number, numerator: number, denominator: number): Mixed {
  if (denominator === 0) {
    throw new Error("Denominator must not be zero");
  }
  const s = simplifyFraction(numerator, denominator);
  return {
    type: "Mixed",
    whole,
    numerator: s.numerator,
    denominator: s.denominator,
  };
}

export function decimal(value: number): Decimal {
  return { type: "Decimal", value };
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

/** Convert any Quantity to an improper fraction (numerator / denominator). */
function toImproperFraction(q: Quantity): { numerator: number; denominator: number } {
  switch (q.type) {
    case "WholeNumber":
      return { numerator: q.value, denominator: 1 };
    case "Fraction":
      return { numerator: q.numerator, denominator: q.denominator };
    case "Mixed": {
      const num = q.whole * q.denominator + q.numerator;
      return { numerator: num, denominator: q.denominator };
    }
    case "Decimal":
      return decimalToFraction(q.value);
  }
}

/**
 * Convert a decimal number to a numerator/denominator representation.
 * Uses a power-of-10 approach to avoid floating-point drift.
 */
function decimalToFraction(value: number): { numerator: number; denominator: number } {
  if (Number.isInteger(value)) {
    return { numerator: value, denominator: 1 };
  }
  // Determine the number of decimal places needed.
  const str = value.toString();
  const dotIndex = str.indexOf(".");
  const decimals = dotIndex === -1 ? 0 : str.length - dotIndex - 1;
  const denominator = Math.pow(10, decimals);
  const numerator = Math.round(value * denominator);
  const g = gcd(Math.abs(numerator), denominator);
  return { numerator: numerator / g, denominator: denominator / g };
}

/** Convert a quantity to a plain number (float). */
function toNumber(q: Quantity): number {
  switch (q.type) {
    case "WholeNumber":
      return q.value;
    case "Fraction":
      return q.numerator / q.denominator;
    case "Mixed":
      return q.whole + q.numerator / q.denominator;
    case "Decimal":
      return q.value;
  }
}

// ---------------------------------------------------------------------------
// Canonical fraction rounding (SPEC §2.5 scaling rule)
// ---------------------------------------------------------------------------

interface CanonicalFraction {
  readonly numerator: number;
  readonly denominator: number;
}

const CANONICAL_FRACTIONS: readonly CanonicalFraction[] = [
  { numerator: 1, denominator: 4 },
  { numerator: 1, denominator: 3 },
  { numerator: 1, denominator: 2 },
  { numerator: 2, denominator: 3 },
  { numerator: 3, denominator: 4 },
];

/**
 * If a fractional part is within 2% of a canonical fraction, snap to it.
 * Returns null if no canonical match is close enough.
 */
function matchCanonical(fractionalPart: number): CanonicalFraction | null {
  for (const c of CANONICAL_FRACTIONS) {
    const target = c.numerator / c.denominator;
    if (target === 0) continue;
    const diff = Math.abs(fractionalPart - target);
    // 2% of the canonical target value
    if (diff <= 0.02 * target) {
      return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Build result quantity from a numeric value
// ---------------------------------------------------------------------------

function fromNumber(value: number): Quantity {
  // If the result is close to a whole number (within machine epsilon scaled)
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 1e-9) {
    return wholeNumber(rounded);
  }

  const whole = Math.floor(value);
  const frac = value - whole;

  // Check if the fractional part is near zero
  if (Math.abs(frac) < 1e-9) {
    return wholeNumber(whole);
  }

  // Check if the fractional part is near 1
  if (Math.abs(frac - 1) < 1e-9) {
    return wholeNumber(whole + 1);
  }

  // Try canonical fractions
  const canonical = matchCanonical(frac);
  if (canonical !== null) {
    if (whole === 0) {
      return fraction(canonical.numerator, canonical.denominator);
    }
    return mixed(whole, canonical.numerator, canonical.denominator);
  }

  // No canonical match — return as Decimal
  return decimal(value);
}

// ---------------------------------------------------------------------------
// Multiply — scale a quantity by a rational factor
// ---------------------------------------------------------------------------

/**
 * Multiply a Quantity by a scale factor, returning a new Quantity.
 *
 * The result is simplified to lowest terms and rounded to the nearest
 * canonical fraction (1/4, 1/3, 1/2, 2/3, 3/4) if within 2% of that
 * value; otherwise returned as Decimal. (SPEC §2.5)
 */
export function multiply(q: Quantity, scaleFactor: number): Quantity {
  const numericResult = toNumber(q) * scaleFactor;
  return fromNumber(numericResult);
}

// ---------------------------------------------------------------------------
// Add — add two quantities together
// ---------------------------------------------------------------------------

/**
 * Add two Quantities using rational arithmetic.
 */
export function add(a: Quantity, b: Quantity): Quantity {
  const fa = toImproperFraction(a);
  const fb = toImproperFraction(b);

  const numerator = fa.numerator * fb.denominator + fb.numerator * fa.denominator;
  const denominator = fa.denominator * fb.denominator;

  const s = simplifyFraction(numerator, denominator);

  // If denominator is 1, it's a whole number
  if (s.denominator === 1) {
    return wholeNumber(s.numerator);
  }

  // Check if we can represent as a canonical-friendly form
  const value = s.numerator / s.denominator;
  return fromNumber(value);
}
