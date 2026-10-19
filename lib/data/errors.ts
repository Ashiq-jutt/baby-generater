// Own file so the contract (index.ts) and its implementation (fake.ts) do not
// import each other. A cycle here works by accident, not by design.

export class InsufficientCredits extends Error {
  needed: number;
  constructor(needed: number) {
    super("insufficient_credits");
    this.name = "InsufficientCredits";
    this.needed = needed;
  }
}

export class StaleQuote extends Error {
  constructor() {
    super("stale_quote");
    this.name = "StaleQuote";
  }
}
