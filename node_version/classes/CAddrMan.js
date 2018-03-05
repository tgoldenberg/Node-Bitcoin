const CCriticalSection = require('./CCriticalSection');

class CAddrMan {
  constructor() {
    this.cs = new CCriticalSection();
    this.nKey = [ ];
    this.nIdCount = 0;
    this.mapInfo = { }; // map<int, CAddrInfo>
    this.mapAddr = { }; // map<CNetAddr, int>
    this.vRandom = [ ];
    this.nTried = 0;
    htis.vvTried = [ ]; // vector<std::vector<int>>
    this.nNew = 0;
    this.vvNew = [ ]; // vector<std::vector<int>>
  }
  Find(addr, pnId = null) { }
  Create(addr, addrSource, pnId = null) { }
  SwapRandom(nRandomPos1, nRandomPos2) { }
  SelectTried(nKBucket) { }
  ShrinkNew(nUBucket) { }
  MakeTried(info, nId, nOrigin) { }
  Good_(addr, nTime) { }
  Add_(addr, source, nTimePenalty) { }
  Attempt_(addr, nTime) { }
  Select_(nUnkBias) { }
  Check_() { }
  GetAddr_(vAddr) { }
  Connected_(addr, nTime) { }
  Add(addr, source, nTimePenalty = 0) { }
  Add(vAddr, source, nTimePenalty = 0) { }
  Good(addr, nTime = GetAdjustedTime()) { }
  Attempt(addr, nTime = GetAdjustedTime()) { }
  Select(nUnkBias = 50) { }
  GetAddr() { }
  Connected() { }
};

module.exports = CAddrMan;
