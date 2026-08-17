import {
  useComponentsContext,
  useBlockNoteEditor,
  useExtensionState,
  DragHandleMenu,
  RemoveBlockItem,
  BlockColorsItem,
} from '@blocknote/react';
import { SideMenuExtension, type BlockNoteEditor } from '@blocknote/core';
import {
  Type, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Quote, Code2,
} from 'lucide-react';

/**
 * "Turn into" — change what a line *is* from the ⠿ handle beside it.
 *
 * BlockNote can already do this two other ways: retype the line behind a `/` command, or
 * select the text and use the block-type dropdown in the toolbar that pops up. Both mean
 * knowing they exist. The handle in the gutter is the affordance people actually reach for
 * when they want to restructure a line they've already written — it's the thing sitting
 * right next to it — and stock BlockNote puts only colours and delete behind it.
 *
 * Rendered as a flat list rather than a submenu: nine items is short enough to scan, and a
 * submenu costs a hover-and-wait on every use for the sake of tidiness we don't need.
 */

/** The hovered block, as the built-in menu items get it. `SideMenuController` renders the
 *  menu with no props at all, so this extension store — not a prop — is the only place the
 *  block the handle is pointing at can come from. */
function useHoveredBlock() {
  const editor = useBlockNoteEditor();
  return useExtensionState(SideMenuExtension, {
    editor,
    selector: (state) => state?.block,
  });
}

interface BlockType {
  label: string;
  icon: typeof Type;
  /** Is the line already this? Heading levels live in a prop, so matching on `type` alone
   *  would tick all three headings at once. */
  matches: (block: { type: string; props: Record<string, unknown> }) => boolean;
  /** Written as a closure rather than a `{ type, props }` pair so each call is checked
   *  against BlockNote's discriminated block union instead of needing a cast. */
  apply: (editor: BlockNoteEditor, id: string) => void;
}

const heading = (level: 1 | 2 | 3, icon: typeof Type): BlockType => ({
  label: `Heading ${level}`,
  icon,
  matches: (b) => b.type === 'heading' && b.props.level === level,
  apply: (editor, id) => editor.updateBlock(id, { type: 'heading', props: { level } }),
});

const simple = (label: string, type: 'paragraph' | 'bulletListItem' | 'numberedListItem' | 'checkListItem' | 'quote' | 'codeBlock', icon: typeof Type): BlockType => ({
  label,
  icon,
  matches: (b) => b.type === type,
  apply: (editor, id) => editor.updateBlock(id, { type }),
});

const BLOCK_TYPES: BlockType[] = [
  simple('Text', 'paragraph', Type),
  heading(1, Heading1),
  heading(2, Heading2),
  heading(3, Heading3),
  simple('Bulleted list', 'bulletListItem', List),
  simple('Numbered list', 'numberedListItem', ListOrdered),
  simple('Check list', 'checkListItem', ListChecks),
  simple('Quote', 'quote', Quote),
  simple('Code', 'codeBlock', Code2),
];

export function TurnIntoDragHandleMenu() {
  const editor = useBlockNoteEditor() as unknown as BlockNoteEditor;
  const block = useHoveredBlock();
  const Components = useComponentsContext();

  if (!Components || !block) return null;

  return (
    <DragHandleMenu>
      <Components.Generic.Menu.Label>Turn into</Components.Generic.Menu.Label>
      {BLOCK_TYPES.map(({ label, icon: Icon, matches, apply }) => (
        <Components.Generic.Menu.Item
          key={label}
          icon={<Icon size={15} />}
          checked={matches(block)}
          onClick={() => {
            apply(editor, block.id);
            // Put the caret back in the line that just changed shape — otherwise the menu
            // closes and you've lost your place in the note.
            editor.setTextCursorPosition(block.id, 'end');
            editor.focus();
          }}
        >
          {label}
        </Components.Generic.Menu.Item>
      ))}

      <Components.Generic.Menu.Divider />
      <BlockColorsItem>Colours</BlockColorsItem>
      <RemoveBlockItem>Delete</RemoveBlockItem>
    </DragHandleMenu>
  );
}
