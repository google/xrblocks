/**
 * A frozen object containing standardized string values for `event.code`.
 * Used for desktop simulation.
 */
export enum Keycodes {
  // --- Movement Keys ---
  W_CODE = 'KeyW',
  A_CODE = 'KeyA',
  S_CODE = 'KeyS',
  D_CODE = 'KeyD',
  UP = 'ArrowUp',
  DOWN = 'ArrowDown',
  LEFT = 'ArrowLeft',
  RIGHT = 'ArrowRight',

  // --- Vertical Movement / Elevation ---
  Q_CODE = 'KeyQ',  // Often used for 'down' or 'strafe left'
  E_CODE = 'KeyE',  // Often used for 'up' or 'strafe right'
  PAGE_UP = 'PageUp',
  PAGE_DOWN = 'PageDown',

  // --- Action & Interaction Keys ---
  SPACE_CODE = 'Space',
  ENTER_CODE = 'Enter',
  T_CODE = 'KeyT',  // General purpose 'toggle' or 'tool' key

  // --- Modifier Keys ---
  LEFT_SHIFT_CODE = 'ShiftLeft',
  RIGHT_SHIFT_CODE = 'ShiftRight',
  LEFT_CTRL_CODE = 'ControlLeft',
  RIGHT_CTRL_CODE = 'ControlRight',
  LEFT_ALT_CODE = 'AltLeft',
  RIGHT_ALT_CODE = 'AltRight',
  CAPS_LOCK_CODE = 'CapsLock',

  // --- UI & System Keys ---
  ESCAPE_CODE = 'Escape',
  TAB_CODE = 'Tab',

  // --- Alphabet Keys ---
  B_CODE = 'KeyB',
  C_CODE = 'KeyC',
  F_CODE = 'KeyF',
  G_CODE = 'KeyG',
  H_CODE = 'KeyH',
  I_CODE = 'KeyI',
  J_CODE = 'KeyJ',
  K_CODE = 'KeyK',
  L_CODE = 'KeyL',
  M_CODE = 'KeyM',
  N_CODE = 'KeyN',
  O_CODE = 'KeyO',
  P_CODE = 'KeyP',
  R_CODE = 'KeyR',
  U_CODE = 'KeyU',
  V_CODE = 'KeyV',
  X_CODE = 'KeyX',
  Y_CODE = 'KeyY',
  Z_CODE = 'KeyZ',

  // --- Number Keys ---
  DIGIT_0 = 'Digit0',
  DIGIT_1 = 'Digit1',
  DIGIT_2 = 'Digit2',
  DIGIT_3 = 'Digit3',
  DIGIT_4 = 'Digit4',
  DIGIT_5 = 'Digit5',
  DIGIT_6 = 'Digit6',
  DIGIT_7 = 'Digit7',
  DIGIT_8 = 'Digit8',
  DIGIT_9 = 'Digit9',

  BACKQUOTE = 'Backquote',
}
