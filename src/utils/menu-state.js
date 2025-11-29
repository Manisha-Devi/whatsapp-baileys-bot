if (!global.menuState) global.menuState = {};

export function getMenuState(sender) {
  if (!global.menuState[sender]) {
    global.menuState[sender] = {
      mode: null,
      submode: null,
      selectedBus: null,
      isAuthenticated: false,
      user: null,
      availableBuses: [],
      awaitingBusSelection: false
    };
  }
  return global.menuState[sender];
}

export function setMenuMode(sender, mode) {
  const state = getMenuState(sender);
  state.mode = mode;
  state.submode = null;
}

export function setMenuSubmode(sender, submode) {
  const state = getMenuState(sender);
  state.submode = submode;
}

export function setSelectedBus(sender, busCode, busInfo = null) {
  const state = getMenuState(sender);
  state.selectedBus = busCode;
  state.awaitingBusSelection = false;
  if (busInfo) {
    state.selectedBusInfo = busInfo;
  }
}

export function setUserAuthenticated(sender, user, buses) {
  const state = getMenuState(sender);
  state.isAuthenticated = true;
  state.user = user;
  state.availableBuses = buses;
}

export function setAwaitingBusSelection(sender, awaiting) {
  const state = getMenuState(sender);
  state.awaitingBusSelection = awaiting;
}

export function getSelectedBus(sender) {
  const state = getMenuState(sender);
  return state.selectedBus;
}

export function clearMenuState(sender) {
  global.menuState[sender] = {
    mode: null,
    submode: null,
    selectedBus: null,
    isAuthenticated: false,
    user: null,
    availableBuses: [],
    awaitingBusSelection: false
  };
}

export function exitToHome(sender) {
  const state = getMenuState(sender);
  state.mode = null;
  state.submode = null;
}

export function exitToPreviousLevel(sender) {
  const state = getMenuState(sender);
  if (state.submode) {
    state.submode = null;
  } else if (state.mode) {
    state.mode = null;
  }
}

export function switchBus(sender) {
  const state = getMenuState(sender);
  state.selectedBus = null;
  state.selectedBusInfo = null;
  state.mode = null;
  state.submode = null;
  state.awaitingBusSelection = true;
  
  if (global.userData && global.userData[sender]) {
    delete global.userData[sender];
  }
  if (global.bookingData && global.bookingData[sender]) {
    delete global.bookingData[sender];
  }
}

export function fullLogout(sender) {
  clearMenuState(sender);
}
