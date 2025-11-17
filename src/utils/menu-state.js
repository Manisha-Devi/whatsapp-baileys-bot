if (!global.menuState) global.menuState = {};

export function getMenuState(sender) {
  if (!global.menuState[sender]) {
    global.menuState[sender] = {
      mode: null,
      submode: null
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

export function clearMenuState(sender) {
  global.menuState[sender] = {
    mode: null,
    submode: null
  };
}

export function exitToHome(sender) {
  clearMenuState(sender);
}

export function exitToPreviousLevel(sender) {
  const state = getMenuState(sender);
  if (state.submode) {
    state.submode = null;
  } else if (state.mode) {
    state.mode = null;
  }
}
