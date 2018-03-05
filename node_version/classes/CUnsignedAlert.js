class CUnsignedAlert {
  constructor() {
    this.nVersion = 0;
    this.nRelayUntil = 0;
    this.nExpiration = 0;
    this.nID = 0;
    this.nCancel = 0;
    this.setCancel = new Set(); // set<int>
    this.nMinVer = 0;
    this.nMaxVer = 0;
    this.setSubVer = new Set(); // set<std::string>
    this.nPriority = 0;
    // Actions
    this.strComment = '';
    this.strStatusBar = '';
    this.strReserved = '';
  }
  SetNull() { }
  ToString() { }
  print() { }
};

module.exports = CUnsignedAlert;
