export const conversation = [
  ['STUDIO GUIDE', 'A place for ideas, without leaving your scene.', 'guide'],
  ['YOU', 'Can I scroll the conversation without moving the card?', 'you'],
  [
    'STUDIO GUIDE',
    'Yes. Drag the history or use its scrollbar. A short press still activates a button.',
    'guide',
  ],
  ['YOU', 'And write more than one line?', 'you'],
  [
    'STUDIO GUIDE',
    'Enter adds a line. Ctrl/Command+Enter sends a local message. No AI service is connected.',
    'guide',
  ],
  [
    'STUDIO GUIDE',
    'Try switching between fields, then reopen the spatial keyboard. It follows the focused field.',
    'guide',
  ],
];

export const messagePresets = [
  [
    'A quick idea',
    'What if we used this panel for a room-scale design review?',
  ],
  [
    'Multiple lines',
    "Today's plan:\n1. Explore the space.\n2. Capture a few ideas.\n3. Compare the next iteration.",
  ],
  [
    'Unicode',
    'Caf\u00e9, Stra\u00dfe, \u4f60\u597d, and \ud83d\ude80.\nA small international design studio.',
  ],
];

export const library = [
  [
    'Spatial notebook',
    'COMPOSE',
    'sticky_note_2',
    'Keep an editable notebook next to your workspace.',
    'A multiline field with a local draft, selection, and a spatial keyboard.',
  ],
  [
    'Room checklist',
    'EXPLORE',
    'checklist',
    'A compact set of prompts for exploring a room.',
    'Build the checklist from ordinary UI elements inside a scroll view. No new checkbox component is used in this demo.',
  ],
  [
    'Model inspector',
    'EXPLORE',
    'view_in_ar',
    'Put model information beside the thing you are inspecting.',
    'A searchable list can select a model while a read-only field exposes copyable details.',
  ],
  [
    'Conversation panel',
    'COMPOSE',
    'forum',
    'Read history while composing a new message.',
    'A scrollable history and multiline composer share one input pipeline. This example does not contact an AI provider.',
  ],
  [
    'Search palette',
    'EXPLORE',
    'search',
    'Narrow a collection while keeping keyboard focus.',
    'Filtering changes the result list without replacing the search field or its native editing element.',
  ],
  [
    'Session summary',
    'REVIEW',
    'summarize',
    'Review a copyable summary without editing it accidentally.',
    'Read-only fields keep selection and copying, but reject text mutations.',
  ],
  [
    'Meeting notes',
    'COMPOSE',
    'edit_note',
    'Draft an agenda, decisions, and follow-up actions.',
    'Line breaks, wrapped lines, and caret visibility use the same layout as the visible text.',
  ],
  [
    'Object labels',
    'EXPLORE',
    'label',
    'Collect short names and descriptions for scene objects.',
    'A single-line input can limit the name while a multiline field holds a longer description.',
  ],
  [
    'Feedback form',
    'REVIEW',
    'rate_review',
    'Collect feedback with a title and a longer response.',
    'Try the Inputs example to compare editable, read-only, disabled, and length-limited fields.',
  ],
  [
    'Field guide',
    'EXPLORE',
    'menu_book',
    'Keep a reference collection within reach.',
    'Finite lists stay in a retained UI tree. Large-data virtualization is a separate feature.',
  ],
  [
    'Shared workspace',
    'COMPOSE',
    'groups',
    'A familiar UI composition for collaborative applications.',
    'These are local UI examples. Networking can be supplied separately by an application.',
  ],
  [
    'Status journal',
    'REVIEW',
    'history',
    'Browse a sequence of updates and observations.',
    'Scroll bounds clamp after content changes, and offscreen rows cannot receive new pointer hits.',
  ],
];

export const notePresets = [
  [
    'Meeting notes',
    'DESIGN REVIEW\n\nWhat worked\nThe history stayed in place while I edited the message. The card still moves from its edge.\n\nNext iteration\nTry a smaller layout, a different viewing distance, and a longer note.\n\nOpen question\nWhere should this panel live in the room?',
  ],
  [
    'Checklist',
    'BEFORE THE SESSION\n\n\u2022 Choose a comfortable viewing position.\n\u2022 Enter a title and a longer description.\n\u2022 Select text across wrapped lines.\n\u2022 Move the caret to the last paragraph.\n\u2022 Open the spatial keyboard.\n\nAFTER THE SESSION\n\nThese notes remain in this page only. Nothing is saved to a server.',
  ],
  [
    'Language sampler',
    'A SMALL INTERNATIONAL STUDIO\n\nEnglish: A place for ideas.\nFran\u00e7ais: Un caf\u00e9, une id\u00e9e.\nDeutsch: Gr\u00fc\u00dfe aus der Stra\u00dfe.\n\u4e2d\u6587\uff1a\u4f60\u597d\uff0c\u4e16\u754c\u3002\n\u0627\u0644\u0639\u0631\u0628\u064a\u0629: \u0645\u0631\u062d\u0628\u0627\n\nEmoji: \ud83d\ude80 \ud83c\udf31 \ud83d\udc69\u200d\ud83d\udcbb\n\nTry copying, selecting, and editing a line. Glyph appearance depends on the available fonts.',
  ],
];
