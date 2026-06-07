# Virtual Keyboard (`Keyboard.ts`)

A 3D on-screen virtual keyboard component for **xrblocks**. It allows users to type text using a customizable spatial interface in virtual or augmented reality.

---

## Overview

The `Keyboard` component is a spatial UI panel that displays a full virtual QWERTY keyboard. It supports standard typing, shifted characters, caps lock, and special operations like backspace, tab, and enter.

---

## Keyboard Layout

The keyboard has **6 rows** structured using a grid layout:

- **Row 1:** Symbols (`~!@#$%^&*()_+`)
- **Row 2:** Numbers and brackets (`` `1234567890<> ``)
- **Row 3:** Top letter row (`qwertyuiop`) with a **Tab** key on the left and a **Backspace** key on the right.
- **Row 4:** Middle letter row (`asdfghjkl`) with a **Caps Lock** key on the left and an **Enter** key on the right.
- **Row 5:** Bottom letter row (`zxcvbnm,.`) with **Shift** keys on both the left and right.
- **Row 6:** A centered **Space** bar.

---

## How It Works

### 1. UI Structure

- **Root Panel:** The entire keyboard is contained within a `SpatialPanel` (called `subspace`), which has a dark background and optional borders.
- **Grid Layout:** The keys are organized using a `Grid` component. Columns and rows are sized dynamically using relative layout weights.
- **Buttons:**
  - **Regular keys** are created as `KeyboardButton` (a custom class extending `TextButton`).
  - **Special keys** (like Tab, Enter, Space, Backspace, Caps Lock, Shift) use `IconButton` to display descriptive icons.

### 2. Typing and State Management

- **Transient Shift:** Pressing a **Shift** key toggles a temporary shifted state. After you type any character, the shifted state automatically turns off.
- **Caps Lock:** Pressing the **Caps Lock** key toggles permanent uppercase.
- **Upper/Lower Case Logic:** Letter buttons automatically switch between uppercase and lowercase based on an XOR logic: they display uppercase when `Shift` is active **or** `Caps Lock` is active, but not both.
- **Buffer Updates:** Every key press updates an internal text buffer (`keyText`).

---

## Public API

### Properties & Callbacks

| Property         | Type                               | Description                                                                                                                     |
| :--------------- | :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| `onTextChanged`  | `((text: string) => void) \| null` | Triggered every time the typed text changes (e.g., on character addition, backspace, space, or tab). Passes the updated string. |
| `onEnterPressed` | `((text: string) => void) \| null` | Triggered when the user presses the **Enter** key. Passes the current typed text buffer.                                        |

### Methods

#### `setText(text: string): void`

Manually updates the internal text buffer and triggers the `onTextChanged` callback.

#### `init(): void`

Positions the keyboard in the 3D scene (by default, placed at `(0, 1.2, -1)`).

---

## Visual Options & Constants

Below are the default sizes and colors defined in the component:

- **Dimensions:**
  - `KEY_WIDTH` = `0.07`
  - `KEY_HEIGHT` = `0.08`
  - `TOTAL_KEYBOARD_WIDTH` = `1.0`
  - `TOTAL_KEYBOARD_HEIGHT` = `0.555` (calculated dynamically)
- **Colors:**
  - Keyboard Panel Background: Dark Charcoal (`#1a1a1b`)
  - Regular Keys: Dark Gray (`#333334`)
  - Special Keys: Slate Gray (`#3e4a59`)
  - Action Key (Enter): Blue-Teal (`#449eb9`)
- **Typography:**
  - `FONT_SIZE` = `0.45`
