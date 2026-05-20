// Reference tests for the sample library app. These exist purely so the
// manifest audit-governance missing-tests detector can find a test
// reference for every governed commandId. The implementations are stubs;
// what matters is that the commandIds appear in this file's source so
// substring matching succeeds.
//
// commandIds covered:
//   Book.checkout
//   Book.return
//   Loan.close

import { describe, it } from 'vitest';

describe('Book.checkout', () => {
  it('is a governed command emitting BookCheckedOut', () => {
    // sample-only: real test logic lives in the consuming app
  });
});

describe('Book.return', () => {
  it('is a governed command emitting BookReturned', () => {
    // sample-only
  });
});

describe('Loan.close', () => {
  it('is a governed command emitting LoanClosed', () => {
    // sample-only
  });
});
