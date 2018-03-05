class CBase58Data {
  constructor(nVersionIn = 0, pdata = [ ], nSize) {
    this.nVersion = nVersionIn;
    this.vchData = pdata;
  }
  SetData(nVersion, pdata, nSize) { }
  SetData(nVersionIn, pbegin, pend) { }
  SetString(psz) { }
  SetString(str) { }
  CompareTo(b58) { }
};

module.exports = CBase58Data;
