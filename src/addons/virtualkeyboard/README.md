# VirtualKeyBoard Component

A reusable virtual keyboard component for XR environments using the XR Blocks SDK.

## Usage

### Basic Usage

```javascript
import { VirtualKeyBoard } from 'xrblocks/addons/virtualkeyboard/VirtualKeyBoard.js';

// Create a keyboard with default settings
const keyboard = new VirtualKeyBoard();
this.add(keyboard);
```

### Advanced Usage with Custom Options

```javascript
import { VirtualKeyBoard } from 'xrblocks/addons/virtualkeyboard/VirtualKeyBoard.js';

const keyboard = new VirtualKeyBoard({
  onKeyPress: (key) => {
    console.log('Key pressed:', key);
    // Handle key press (e.g., add to input field)
  },
  onBackspace: () => {
    console.log('Backspace pressed');
    // Handle backspace (e.g., remove last character)
  },
  onEnter: () => {
    console.log('Enter pressed');
    // Handle enter (e.g., submit form, send message)
  },
  position: { x: 0, y: 0.8, z: -1 },
  scale: { x: 1.5, y: 1.5, z: 1.5 },
  backgroundColor: '#222222aa',
  keyColor: '#444444',
  specialKeyColor: '#666666',
  backspaceColor: '#dc3545',
  enterColor: '#28a745',
  fontColor: '#ffffff',
  titleColor: '#4285f4',
  title: '⌨️ Virtual Keyboard',
  showTitle: true,
  visible: true
});

this.add(keyboard);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `onKeyPress` | Function | `(key) => console.log(key)` | Callback when a key is pressed |
| `onBackspace` | Function | `() => console.log('Backspace')` | Callback when backspace is pressed |
| `onEnter` | Function | `() => console.log('Enter')` | Callback when enter is pressed |
| `position` | Object | `{x: 0, y: 0.8, z: -1}` | 3D position of the keyboard |
| `scale` | Object | `{x: 1.5, y: 1.5, z: 1.5}` | 3D scale of the keyboard |
| `backgroundColor` | String | `'#222222aa'` | Background color of the keyboard panel |
| `keyColor` | String | `'#444444'` | Color of regular alphabet keys |
| `specialKeyColor` | String | `'#666666'` | Color of the space key |
| `backspaceColor` | String | `'#dc3545'` | Color of the backspace key |
| `enterColor` | String | `'#28a745'` | Color of the enter key |
| `fontColor` | String | `'#ffffff'` | Text color for key labels |
| `titleColor` | String | `'#4285f4'` | Color of the keyboard title |
| `title` | String | `'⌨️ Virtual Keyboard'` | Title text displayed above the keyboard |
| `showTitle` | Boolean | `true` | Whether to show the title |
| `visible` | Boolean | `true` | Initial visibility of the keyboard |

## Public Methods

### `show()`
Makes the keyboard visible.

### `hide()`
Hides the keyboard.

### `setPosition(x, y, z)`
Sets the position of the keyboard in 3D space.

### `setScale(x, y, z)`
Sets the scale of the keyboard.

### `updateLayouts()`
Updates the internal layout calculations (call this if needed after dynamic changes).

### `dispose()`
Cleans up the keyboard and removes it from the scene.

## Layout

The keyboard uses a standard QWERTY layout:

```
Q W E R T Y U I O P [⌫]
 A S D F G H J K L [↵]
  Z X C V B N M [SPACE]
```

- **Row 1**: QWERTYUIOP + Backspace key
- **Row 2**: ASDFGHJKL + Enter key
- **Row 3**: ZXCVBNM + Space key
