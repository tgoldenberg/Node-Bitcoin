const CRequestTracker = require('./classes/CRequestTracker');
const CAddrMan = require('./classes/CAddrMan');
const CNodeStats = require('./classes/CNodeStats');
const CNode = require('./classes/CNode');

const MAX_OUTBOUND_CONNECTIONS = 0;

function ThreadMessageHandler2(parg) { };
function ThreadSocketHandler2(parg) { };
function ThreadOpenConnections2(parg) { };
function ThreadOpenAddedConnections2(parg) { };
function ThreadMapPort2(parg) { };
function ThreadDNSAddressSeed2(parg) { }
function OpenNetworkConnection(addrConnect, grantOutbound = null, strDest = null, fOneShot = false) { };

let vNodes = [ ]; // vector<CNode*>
let cs_vNodes; // CCriticalSection
let mapRelay = { }; // map<Cinv, CDataStream>
let vRelayExpiration = [ ]; // deque<std::pair<int64, CInv> >
let mapAlreadyAskedFor = { }; // map<CInv, int64>


function ReceiveBufferSize() {
  return 1000 * GetArg("-maxreceivebuffer", 5*1000);
}

function SendBufferSize() {
  return 1000 * GetArg("-maxsendbuffer", 1*1000);
}

let LOCAL_ENUM = [
  'LOCAL_NONE',
  'LOCAL_IF',
  'LOCAL_BIND',
  'LOCAL_UPNP',
  'LOCAL_IRC',
  'LOCAL_HTTP',
  'LOCAL_MANUAL',
  'LOCAL_MAX'
];

let MSG_ENUM = [
  'MSG_TX',
  'MSG_BLOCK'
];

let threadId = [
  'THREAD_SOCKETHANDLER',
  'THREAD_OPENCONNECTIONS',
  'THREAD_MESSAGEHANDLER',
  'THREAD_MINER',
  'THREAD_RPCLISTENER',
  'THREAD_UPNP',
  'THREAD_DNSSEED',
  'THREAD_ADDEDCONNECTIONS',
  'THREAD_DUMPADDRESS',
  'THREAD_RPCHANDLER',
  'THREAD_MAX'
];

let fClient = false;
let fDiscover = true;
let fUseUPnP = false;
let nLocalServices = fClient ? 0 : NODE_NETWORK;
let mapLocalHost = { }; // map<CNetAddr, LocalServiceInfo>
let vfReachable = false;
let vfLimited = false;
let pnodeLocalHost = null;
let nLocalHostNonce = 0;
let vnThreadsRunning = [ ]; // boost:array<int, THREAD_MAX>
let vhListenSocket = [ ]; // vector<SOCKET>
let addrman = new CAddrMan();

let vNodes = [ ]; // vector<CNode*>
let cs_vNodes; // CCriticalSection
let mapRelay = { }; // map<Cinv, CDataStream>
let vRelayExpiration = [ ]; // deque<std::pair<int64, CInv> >
let cs_mapRelay; // CCriticalSection
let mapAlreadyAskedFor = { }; // map<CInv, int64>


let vOneShots = [ ]; // deque<string>
let cs_vOneShots = null; // CCriticalSection

let setservAddNodeAddresses = new Set(); // set<CNetAddr>
let cs_setservAddNodeAddresses = null; // CCriticalSection

let semOutbound = null; // CSemaphore

function AddOneShot(strDest) {
  // LOCK(cs_vOneShots);
  vOneShots.push(strDest);
};

function GetListenPort() {
  return (GetArg("-port", GetDefaultPort()));
}

function GetLocal(addr, paddrPeer = null) {
  if (fNoListen)
    return false;
  let nBestScore = -1;
  let nBestReachability = -1;
  // LOCK(cs_mapLocalHost);
  for (let i = 0; i < Object.keys(mapLocalHost).length; i++) {
    let key = Object.keys(mapLocalHost)[i];
    let item = mapLocalHost[Object.keys(mapLocalHost)[i]];
    let nScore = item.nScore;
    let nReachability = item.GetReachabilityFrom(paddrPeer);
    if (nReachability > nBestReachability || (nReachability == nBestReachability && nScore > nBestScore)) {
      addr = new CService(key, item.nPort);
      nBestReachability = nReachability;
      nBestScore = nScore;
    }
  }
  return nBestScore >= 0;
};

function GetLocalAddress(paddrPeer = null) {
  let ret = new CAddress(new CService("0.0.0.0', 0"));
  let addr = new CService();
  if (GetLocal(addr, paddrPeer)) {
    ret = new CAddress(addr);
    ret.nServices = nLocalServices;
    ret.nTime = GetAdjustedTime();
  }
  return ret;
};

function RecvLine(hSocket, strLine) {
  strLine = '';
  let c = '';
  let nBytes = recv(hSocket, c, 1, 0)
  if (nBytes > 0) {
    if (c == '\n')
      continue;
    if (c == '\r')
      return true;
    strLine += c;
    if (strLine.length >= 9000)
      return true;
  }
  else if (nBytes <= 0) {
    if (fShutdown)
      return false;
    if (nBytes < 0) {
      let nErr = WSAGetLastError();
      if (nErr == WSAEMSGSIZE)
        continue;
      if (nErr == WSAEWOULDBLOCK || nErr == WSAEINTR || nErr = WSAEINPROGRESS) {
        Sleep(10);
        continue;
      }
    }
    if (!!strLine.length)
      return true;
    if (nBytes == 0) {
      // socket closed
      console.log(`socket closed\n`);
      return false;
    } else {
      // socket error
      let nErr = WSAGetLastError();
      console.log(`recv failed: `);
      return false;
    }
  }
}

// used when scores of local addresses may have changed
// pushes better local address to peers

function AdvertizeLocal() {
  // LOCK(cs_vNodes)
  vNodes.forEach(function(pnode) {
    if (pnode.fSuccessfullyConnected) {
      let addrLocal = GetLocalAddress(pnode.addr);
      if (addrLocal.IsRoutable() && addrLocal != pnode.addrLocal) {
        pnode.PushAddress(addrLocal);
        pnode.addrLocal = addrLocal;
      }
    }
  })
}

function SetReachable(net, fFlag) {
  // LOCK(cs_mapLocalHost);
  vfReachable[net] = fFlag;
  if (net == NET_IPV6 && fFlag)
    vfReachable[NET_IPV4] = true;
}

// learn a new local address
function AddLocal(addr, nScore = 'LOCAL_NONE') {  // CService& addr
  if (!addr.IsRoutable())
    return false;

  if (!fDiscover && nScore < LOCAL_MANUAL)
    return false;

  if (IsLimited(addr))
    return false;

  console.log(`AddLocal`);
  // LOCK(cs_mapLocalHost)
  let fAlready = !!mapLocalHost[addr];
  let info = mapLocalHost[addr];
  if (!fAlready || nScore >= info.nScore) {
    info.nScore = nScore + (fAlready ? 1 : 0);
    info.nPort = addr.GetPort();
  }
  SetReachable(addr.GetNetwork());

  AdvertizeLocal();

  return true;
};

function AddLocal(addr, nScore = 'LOCAL_NONE') { // CNetAdrr& addr
  return AddLocal(new CService(addr, GetListenPort()), nScore);
};

// Make a particular network entirely off-limits (no automatic connects to it)
function SetLimited(net, fLimited = true) {
  if (net == NET_UNROUTABLE)
    return;
  // LOCK(cs_mapLocalHost)
  vfLimited[net] = fLimited;
};

function IsLimited(net) {
  // LOCK(cs_mapLocalHost)
  return vfLimited[net];
};
function IsLimited(addr) {
  return IsLimited(addr.GetNetwork());
};

// Vote for a local address
function SeenLocal(addr) {
  // LOCK(cs_mapLocalHost);
  if (!mapLocalHost[addr])
    return false;
  mapLocalHost[addr].nScore++;

  AdvertizeLocal();

  return true;
};

// Check whether a given address is potentially local
function IsLocal(addr) {
  // LOCK(cs_mapLocalHost)
  return !!mapLocalHost[addr];
};

// Check whether a given address is in a network we can probably connect to
function IsReachable(addr) { };
function SetReachable(addr) { };
function RecvLine(hSocket, strLine);
function GetMyExternalIP(ipRet) { };
function AddressCurrentlyConnected(addr) { };
function FindNode(ip) { }; // const CNetAddr& ip
function FindNode(ip) { }; // const CService ip
function ConnectNode(addrConnect, strDest = null, nTimeout = 0) { };
function MapPort() { };
function BoolListenPort(bindAddr, strError='') { };
function StartNode(parg) { };
function StopNode() { };
