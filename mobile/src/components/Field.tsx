import { ComponentProps } from 'react';
import { TextInput as PaperTextInput } from 'react-native-paper';

import { useAppTheme } from '@/lib/theme';

type Props = ComponentProps<typeof PaperTextInput>;

/**
 * The app's text field — import this instead of Paper's TextInput.
 * Same props; adds the house style in one place:
 *  - 12dp outline corners (Paper's 4dp looks dated next to 20dp cards)
 *  - filled with the card colour, so the floating label's "notch" never shows as a patch on cards/sheets
 *    (pass `style={{ backgroundColor }}` for a field that sits straight on the page background)
 */
function Field({ style, outlineStyle, ...rest }: Props) {
  const t = useAppTheme();
  return (
    <PaperTextInput {...rest}
      outlineStyle={rest.mode === 'outlined' ? [{ borderRadius: 12 }, outlineStyle] : outlineStyle}
      style={rest.mode === 'outlined' ? [{ backgroundColor: t.colors.elevation.level1 }, style] : style} />
  );
}

export const TextInput = Object.assign(Field, { Icon: PaperTextInput.Icon, Affix: PaperTextInput.Affix });
