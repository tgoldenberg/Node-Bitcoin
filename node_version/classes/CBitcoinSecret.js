const CBase58Data = require('./CBase58Data');

class CBitcoinSecret extends CBase58Data {
  constructor(vchSecret, fCompressed) {
    this.SetSecret(vchSecret, fCompressed);
  }
  SetSecret(vchSecret, fCompressed) { }
  GetSecret(fCompressedOut) { }
  IsValid() { }
  SetString(pszSecret) { }
  SetString(strSecret) { }
};

module.exports = CBitcoinSecret;
