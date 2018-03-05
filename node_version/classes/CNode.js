const CAddress = require('./CAddress');
const CBlockLocator = require('./CBlockLocator');
const CSemaphoreGrant = require('./CSemaphoreGrant');
const CBlockIndex = require('./CBlockIndex');
const CMessageHeader = require('./CMessageHeader');
const CService = require('./CService');

class CNode {
  constructor(hSocketIn, addrIn, addrNameIn = '', fInboundIn = false) {
    this.nServices = 0;
    this.hSocket = hSocketIn;
    this.vSend = [ ];
    this.vRecv = [ ];
    this.cs_vSend = null; // CCriticalSection
    this.cs_vRecv = null; // CCriticalSection
    this.nLastSend = 0;
    this.nLastRecv = 0;
    this.nLastSendEmpty = GetTime();
    this.nTimeConnected = GetTime();
    this.nHeaderStart = -1;
    this.nMessageStart = -1;
    this.addr = addrIn;
    this.addrName = addrNameIn == '' ? this.addr.ToStringIPPort() : addrNameIn;
    this.addrLocal = new CService();
    this.nVersion = 0;
    this.strSubVer = '';
    this.fOneShot = false;
    this.fClient = false;
    this.fInbound = fInboundIn;
    this.fNetworkNode = false;
    this.fSuccessfullyConnected = false;
    this.fDisconnect = false;
    this.grantOutbound = new CSemaphoreGrant();
    this.nRefCount = 0;
    // DoS detection / prevention
    this.setBanned = { }; // map<CNetAddr, int64>
    this.cs_setBanned = null; // CCriticalSection
    this.nMisbehavior = 0;
    // public
    this.nReleaseTime = 0;
    this.mapRequests = { }; // map<uint256, CRequestTracker>
    this.cs_mapRequests = null; // CCriticalSection
    this.hashContinue = 0;
    this.pindexLastGetBlocksBegin = new CBlockIndex();
    this.hashLastGetBlocksEnd = 0;
    this.nStartingHeight = -1;

    // flood relay
    this.vAddrToSend = [ ]; // vector<CAddress>
    this.setAddrKnown = new Set(); // set<CAddress>
    this.fGetAddr = false;
    this.setKnown = new Set(); // set<uint256>

    // inventory based relay
    this.setInventoryKnown = new Set(); // mruset<Cinv>
    this.vInventoryToSend = [ ]; // vector<CInv>
    this.cs_inventory = null; // CCriticalSection
    this.mapAskFor = [ ]; // multimap<int64, CInv>

    // Be shy - don't send version until hear
    if (!this.fInbound)
      this.PushVersion();
  }
  GetRefCount() {
    return Math.max(this.nRefCount, 0) + (GetTime() < this.nReleaseTime ? 1 : 0);
  }
  AddRef(nTimeout = 0) {
    if (nTimeout != 0)
      this.nReleaseTime = Math.max(this.nReleaseTime, GetTime() + nTimeout);
    else
      this.nRefCount++;
    return this;
  }
  Release() {
    this.nRefCount--;
  }
  AddAddressKnown(addr) {
    this.setAddrKnown.add(addr);
  }
  PushAddress(addr) {
    if (addr.IsValid() && !this.setAddrKnown.hash(addr))
      this.vAddrToSend.push(addr);
  }
  AddInventoryKnown(inv) {
    // LOCK(cs_inventory)
    this.setInventoryKnown.add(inv);
  }
  PushInventory(inv) {
    // LOCK(cs_inventory)
    if (!this.setInventoryKnown.has(inv))
      this.vInventoryToSend.push(inv);
  }
  AskFor(inv) {
    let nRequestTime = this.mapAlreadyAskedFor[inv];
    if (fDebugNet)
      console.log(`askfor`);

    // Make sure not to reuse time indexes to keep things in same order
    let nNow = (Date.now() - 1) * 1000000;
    let nLastTime = 0;
    ++nLastTime;
    nNow = Math.max(nNow, nLastTime);
    nLastTime = nNow;

    // Each retry is 2 min after last
    nRequestTime = Math.max(nRequestTime + 2 * 60 * 1000000, nNow);
    mapAskFor.push({ nRequestTime, inv });
  }
  BeginMessage(pszCommand) {
    // ENTER_CRITICAL_SECTION(cs_vSend)
    if (this.nHeaderStart != -1)
      this.AbortMessage();
    this.nHeaderStart = this.vSend.length;
    vSend.push(new CMessageHeader(pszCommand, 0));
    this.nMessageStart = this.vSend.length;
    if (fDebug)
      console.log(`sending: `);
  }
  AbortMessage() {
    if (this.nHeaderStart < 0)
      return;
    this.vSend = this.vSend.slice(this.nHeaderStart);
    this.nHeaderStart = -1;
    this.nMessageStart = -1;
    // LEAVE_CRITICAL_SECTION(cs_vSend)
    if (fDebug)
      console.log(`(aborted)`);
  }
  EndMessage() {
    if (!!this.mapArgs["-dropmessagestest"] && GetRand(atoi(mapArgs["-dropmessagestest"])) == 0) {
      console.log(`dropmessages DROPPING SEND MESSAGE\n`);
      this.AbortMessage();
      return;
    }

    if (this.nHeaderStart < 0)
      return;

    // Set the size
    let nSize = this.vSend.length - this.nMessageStart;
    // memcpy((char*)&vSend[nHeaderStart] + CMessageHeader::MESSAGE_SIZE_OFFSET, &nSize, sizeof(nSize));

    // Set the checksum
    let hash = Hash(vSend.begin() + this.nMessageStart, vSend.end());
    let nChecksum = 0;
    // memcpy(&nChecksum, &hash, sizeof(nChecksum));
    // memcpy((char*)&vSend[nHeaderStart] + CMessageHeader::CHECKSUM_OFFSET, &nChecksum, sizeof(nChecksum));

    if (fDebug)
      console.log(`(bytes)`);

    this.nHeaderStart = -1;
    this.nMessageStart = -1;
    // LEAVE_CRITICAL_SECTION(cs_vSend)
  }
  EndMessageAbortIfEmpty() {
    if (this.nHeaderStart < 0)
      return;
    let nSize = this.vSend.length - this.nMessageStart;
    if (nSize > 0)
      this.EndMessage();
    else
      this.AbortMessage();
  }
  PushVersion() {

  }
  PushMessage(pszCommand) {
    this.BeginMessage(pszCommand);
    this.EndMessage();
  }
  PushMessage(pszCommand, a1) { // const T1& a1, template<typename T1>
    this.BeginMessage(pszCommand);
    this.vSend.push(a1);
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3, a4) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3, a4 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3, a4, a5) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3, a4, a5 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3, a4, a5, a6) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3, a4, a5, a6 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3, a4, a5, a6, a7) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3, a4, a5, a6, a7 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3, a4, a5, a6, a7, a8) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3, a4, a5, a6, a7, a8 ];
    this.EndMessage();
  }
  PushMessage(pszCommand, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    this.BeginMessage(pszCommand);
    this.vSend = [ ...this.vSend, a1, a2, a3, a4, a5, a6, a7, a8, a9 ];
    this.EndMessage();
  }
  PushRequest(pszCommand, fn, param1) {
    let hashReply = 0;
    // RAND_bytes((unsigned char*)&hashReply, sizeof(hashReply));
    // LOCK(cs_mapRequests);
    mapRequests[hashReply] = new CRequestTracker(fn, param1);
    this.PushMessage(pszCommand, hashReply);
  }
  PushRequest(pszCommand, a1, fn, param1) {
    let hashReply = 0;
    // RAND_bytes
    // LOCK(cs_mapRequests);
    mapRequests[hashReply] = new CRequestTracker(fn, param1);
    this.PushMessage(pszCommand, hashReply, a1);
  }
  PushRequest(pszCommand, a1, a2, fn, param1) {
    let hashReply = 0;
    // RAND_bytes
    // LOCK(cs_mapRequests);
    mapRequests[hashReply] = new CRequestTracker(fn, param1);
    this.PushMessage(pszCommand, hashReply, a1, a2);
  }
  PushGetBlocks(pindexBegin, hashEnd) {
    // Filter out duplicate requests
    if (pindexBegin == this.pindexLastGetBlocksBegin && hashEnd == this.hashLastGetBlocksEnd)
      return;
    this.pindexLastGetBlocksBegin = pindexBegin;
    this.hashLastGetBlocksEnd = hashEnd;

    this.PushMessage('getblocks', new CBlockLocator(pindexBegin), hashEnd);
  }
  IsSubscribed(nChannel) { }
  Subscribe(nChannel, nHops = 0) { }
  CancelSubscribe(nChannel) { }
  CloseSocketDisconnect() { }
  Cleanup() { }
  ClearBanned() { }
  IsBanned(ip) { }
  Misbehaving(howmuch) { }
  copyStats(stats) { }
};

module.exports = CNode;
