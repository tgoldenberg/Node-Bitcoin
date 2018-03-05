const CUnsignedAlert = require('./CUnsignedAlert');

class CAlert extends CUnsignedAlert {
  constructor(props) {
    super(props);
    this.vchMsg = [ ]; // vector<unsigned char>
    this.vchSig = [ ]; // vector<unsigned char>
  }
  SetNull() { }
  IsNull() { }
  GetHash() { }
  IsInEffect() { }
  Cancels(alert) { }
  AppliesTo(nVersion, strSubVerIn) { }
  AppliesToMe() { }
  RelayTo(pnode) { }
  CheckSignature() { }
  ProcessAlert() { }
  // get gopy of alert object by hash
  getAlertByHash(hash) { }
};

module.exports = CAlert;
