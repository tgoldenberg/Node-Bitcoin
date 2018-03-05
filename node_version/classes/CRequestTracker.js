class CRequestTracker {
  constructor(fnIn = null, param1In = null) {
    this.fn = fnIn;
    this.param1 = param1In;
  }
  IsNull() {
    return this.fn == null;
  }
};

module.exports = CRequestTracker;
