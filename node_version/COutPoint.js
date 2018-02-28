class COutPoint {
  constructor(hashIn = 0, nIn = -1) {
    this.hash = hashIn;
    this.n = nIn;
  }
}

module.exports = COutPoint;
