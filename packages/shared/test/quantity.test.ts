import { describe, it, expect } from "vitest";
import { gcd, fraction, mixed, wholeNumber, decimal, multiply, add } from "../src/quantity.js";
import type { Quantity } from "../src/quantity.js";

// ---------------------------------------------------------------------------
// GCD
// ---------------------------------------------------------------------------

describe("gcd", () => {
  it("computes gcd(6, 4) = 2", () => {
    expect(gcd(6, 4)).toBe(2);
  });

  it("computes gcd(12, 8) = 4", () => {
    expect(gcd(12, 8)).toBe(4);
  });

  it("computes gcd(7, 3) = 1 (coprime)", () => {
    expect(gcd(7, 3)).toBe(1);
  });

  it("computes gcd(0, 5) = 5", () => {
    expect(gcd(0, 5)).toBe(5);
  });

  it("computes gcd(5, 0) = 5", () => {
    expect(gcd(5, 0)).toBe(5);
  });

  it("handles negative inputs", () => {
    expect(gcd(-6, 4)).toBe(2);
    expect(gcd(6, -4)).toBe(2);
    expect(gcd(-6, -4)).toBe(2);
  });

  it("computes gcd(1, 1) = 1", () => {
    expect(gcd(1, 1)).toBe(1);
  });

  it("computes gcd(100, 75) = 25", () => {
    expect(gcd(100, 75)).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// Fraction simplification
// ---------------------------------------------------------------------------

describe("fraction simplification", () => {
  it("simplifies 6/4 to 3/2", () => {
    const f = fraction(6, 4);
    expect(f.numerator).toBe(3);
    expect(f.denominator).toBe(2);
  });

  it("simplifies 2/4 to 1/2", () => {
    const f = fraction(2, 4);
    expect(f.numerator).toBe(1);
    expect(f.denominator).toBe(2);
  });

  it("leaves 1/3 as is", () => {
    const f = fraction(1, 3);
    expect(f.numerator).toBe(1);
    expect(f.denominator).toBe(3);
  });

  it("simplifies 10/5 to 2/1", () => {
    const f = fraction(10, 5);
    expect(f.numerator).toBe(2);
    expect(f.denominator).toBe(1);
  });

  it("handles negative numerator", () => {
    const f = fraction(-3, 6);
    expect(f.numerator).toBe(-1);
    expect(f.denominator).toBe(2);
  });

  it("normalizes negative denominator", () => {
    const f = fraction(3, -6);
    expect(f.numerator).toBe(-1);
    expect(f.denominator).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Denominator != 0 invariant
// ---------------------------------------------------------------------------

describe("denominator != 0 invariant", () => {
  it("throws when creating a fraction with denominator 0", () => {
    expect(() => fraction(1, 0)).toThrow("Denominator must not be zero");
  });

  it("throws when creating a mixed number with denominator 0", () => {
    expect(() => mixed(1, 1, 0)).toThrow("Denominator must not be zero");
  });
});

// ---------------------------------------------------------------------------
// Lowest terms invariant
// ---------------------------------------------------------------------------

describe("lowest terms invariant", () => {
  it("fraction factory always returns lowest terms", () => {
    const cases: Array<[number, number, number, number]> = [
      [4, 8, 1, 2],
      [6, 9, 2, 3],
      [15, 25, 3, 5],
      [12, 4, 3, 1],
      [7, 7, 1, 1],
    ];
    for (const [n, d, expectN, expectD] of cases) {
      const f = fraction(n, d);
      expect(f.numerator).toBe(expectN);
      expect(f.denominator).toBe(expectD);
    }
  });

  it("mixed factory always returns lowest terms for fractional part", () => {
    const m = mixed(2, 4, 8);
    expect(m.whole).toBe(2);
    expect(m.numerator).toBe(1);
    expect(m.denominator).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Multiply WholeNumber
// ---------------------------------------------------------------------------

describe("multiply WholeNumber", () => {
  it("scales WholeNumber(3) by 2 to WholeNumber(6)", () => {
    const result = multiply(wholeNumber(3), 2);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(6);
    }
  });

  it("scales WholeNumber(4) by 0.5 to WholeNumber(2)", () => {
    const result = multiply(wholeNumber(4), 0.5);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(2);
    }
  });

  it("scales WholeNumber(1) by 3 to WholeNumber(3)", () => {
    const result = multiply(wholeNumber(1), 3);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(3);
    }
  });
});

// ---------------------------------------------------------------------------
// Multiply Fraction
// ---------------------------------------------------------------------------

describe("multiply Fraction", () => {
  it("scales 1/2 by 2 to WholeNumber(1)", () => {
    const result = multiply(fraction(1, 2), 2);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(1);
    }
  });

  it("scales 1/4 by 2 to 1/2", () => {
    const result = multiply(fraction(1, 4), 2);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(2);
    }
  });

  it("scales 3/4 by 2 yields Mixed(1, 1/2)", () => {
    const result = multiply(fraction(3, 4), 2);
    expect(result.type).toBe("Mixed");
    if (result.type === "Mixed") {
      expect(result.whole).toBe(1);
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Multiply Mixed
// ---------------------------------------------------------------------------

describe("multiply Mixed", () => {
  it("scales 1 1/2 by 2 to WholeNumber(3)", () => {
    const result = multiply(mixed(1, 1, 2), 2);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(3);
    }
  });

  it("scales 2 1/4 by 2 to 4 1/2", () => {
    const result = multiply(mixed(2, 1, 4), 2);
    expect(result.type).toBe("Mixed");
    if (result.type === "Mixed") {
      expect(result.whole).toBe(4);
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(2);
    }
  });

  it("scales 1 1/3 by 3 to WholeNumber(4)", () => {
    const result = multiply(mixed(1, 1, 3), 3);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Canonical fraction rounding
// ---------------------------------------------------------------------------

describe("canonical fraction rounding", () => {
  it("rounds 0.333... to 1/3", () => {
    // 1/3 = 0.3333...; test with a value within 2%
    const result = multiply(wholeNumber(1), 1 / 3);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(3);
    }
  });

  it("rounds 0.667 to 2/3", () => {
    // 2/3 = 0.6667; 0.667 is within 2% of 2/3
    const result = multiply(wholeNumber(1), 2 / 3);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(2);
      expect(result.denominator).toBe(3);
    }
  });

  it("rounds 0.25 to 1/4", () => {
    const result = multiply(wholeNumber(1), 0.25);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(4);
    }
  });

  it("rounds 0.5 to 1/2", () => {
    const result = multiply(wholeNumber(1), 0.5);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(2);
    }
  });

  it("rounds 0.75 to 3/4", () => {
    const result = multiply(wholeNumber(1), 0.75);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(3);
      expect(result.denominator).toBe(4);
    }
  });

  it("handles 1.333... as Mixed(1, 1/3)", () => {
    const result = multiply(wholeNumber(4), 1 / 3);
    expect(result.type).toBe("Mixed");
    if (result.type === "Mixed") {
      expect(result.whole).toBe(1);
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(3);
    }
  });

  it("returns Decimal for non-canonical fractions", () => {
    // 0.17 is not near any canonical fraction (1/4=0.25, 1/3=0.333)
    const result = multiply(wholeNumber(1), 0.17);
    expect(result.type).toBe("Decimal");
    if (result.type === "Decimal") {
      expect(result.value).toBeCloseTo(0.17);
    }
  });
});

// ---------------------------------------------------------------------------
// Add
// ---------------------------------------------------------------------------

describe("add", () => {
  it("adds WholeNumber(2) + WholeNumber(3) = WholeNumber(5)", () => {
    const result = add(wholeNumber(2), wholeNumber(3));
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(5);
    }
  });

  it("adds Fraction(1,4) + Fraction(1,4) = Fraction(1,2)", () => {
    const result = add(fraction(1, 4), fraction(1, 4));
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(2);
    }
  });

  it("adds Fraction(1,2) + Fraction(1,2) = WholeNumber(1)", () => {
    const result = add(fraction(1, 2), fraction(1, 2));
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(1);
    }
  });

  it("adds WholeNumber(1) + Fraction(1,2) = Mixed(1, 1, 2)", () => {
    const result = add(wholeNumber(1), fraction(1, 2));
    expect(result.type).toBe("Mixed");
    if (result.type === "Mixed") {
      expect(result.whole).toBe(1);
      expect(result.numerator).toBe(1);
      expect(result.denominator).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// Multiply Decimal
// ---------------------------------------------------------------------------

describe("multiply Decimal", () => {
  it("scales Decimal(0.5) by 2 to WholeNumber(1)", () => {
    const result = multiply(decimal(0.5), 2);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(1);
    }
  });

  it("scales Decimal(2.5) by 2 to WholeNumber(5)", () => {
    const result = multiply(decimal(2.5), 2);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(5);
    }
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("edge cases", () => {
  it("multiply by 0 returns WholeNumber(0)", () => {
    const result = multiply(fraction(3, 4), 0);
    expect(result.type).toBe("WholeNumber");
    if (result.type === "WholeNumber") {
      expect(result.value).toBe(0);
    }
  });

  it("multiply by 1 preserves value", () => {
    const original = fraction(3, 4);
    const result = multiply(original, 1);
    expect(result.type).toBe("Fraction");
    if (result.type === "Fraction") {
      expect(result.numerator).toBe(3);
      expect(result.denominator).toBe(4);
    }
  });

  it("type discriminant field exists on all variants", () => {
    const w: Quantity = wholeNumber(1);
    const f: Quantity = fraction(1, 2);
    const m: Quantity = mixed(1, 1, 2);
    const d: Quantity = decimal(1.5);

    expect(w.type).toBe("WholeNumber");
    expect(f.type).toBe("Fraction");
    expect(m.type).toBe("Mixed");
    expect(d.type).toBe("Decimal");
  });
});
