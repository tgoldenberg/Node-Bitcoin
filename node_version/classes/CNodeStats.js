class CNodeStats {
  constructor() {
    this.nServices = 0;
    this.nLastSend = 0;
    this.nLastRecv = 0;
    this.nTimeConnected = 0;
    this.addrName = '';
    this.nVersion = 1;
    this.strSubVer = '';
    this.fInbound = false;
    this.nReleaseTime = 0;
    this.nStartingHeight = 0;
    this.nMisbehavior = 0;
  }
};

module.exports = CNodeStats;
