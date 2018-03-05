const LockedPageManagerBase = require('./LockedPageManagerBase');

class LockedPageManager extends LockedPageManagerBase { // <MemoryPageLocker>
  constructor(props) {
    super(props);
    // LockedPageManagerBase<MemoryPageLocker>(GetSystemPageSize)
  }
};

module.exports = LockedPageManager;
