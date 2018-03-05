const CNetAddr = require('./CNetAddr');
const CAddress = require('./CAddress');

class CAddrInfo extends CAddress {
  constructor(props) {
    super(props);
    this.source = new CNetAddr();
    this.nLastSuccess = 0;
    this.nAttempts = 0;
    this.nRefCount = 0;
    this.fInTried = false;
    this.nRandomPos = -1;
  }
  GetTriedBucket(nKey) { }
  GetNewBucket(nKey, src) { }
  GetNewBucket(nKey) { }
  IsTerrible(nNow) { }
  GetChance(nNow) { }
};

module.exports = CAddrInfo;
